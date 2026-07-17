import { randomUUID } from 'node:crypto';

import mongoose, { Types, type ClientSession, type PipelineStage } from 'mongoose';

import type {
  CreateReturnRequest,
  Issue,
  IssuePeriod,
  ReturnEvent,
  UserRole,
} from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import { appendAuditEvent } from '../audit/audit.service.js';
import { AssetUnitModel, type AssetUnitDocument } from '../inventory/asset-unit.model.js';
import { MaterialModel, type MaterialDocument } from '../inventory/material.model.js';
import { idempotencyConflict } from '../issues/idempotency.js';
import { istDayRange } from '../issues/issue-date.js';
import { toIssue, toReturnEvent } from '../issues/issue.mapper.js';
import {
  IssueModel,
  type IssueActorSnapshotRecord,
  type IssueAssetRecord,
  type IssueDocument,
  type IssueLineRecord,
  type ReturnEventItemRecord,
  type ReturnEventRecord,
} from '../issues/issue.model.js';
import { UserModel } from '../users/user.model.js';
import { enqueueReturnNotifications } from '../notifications/notification.service.js';
import {
  assertNoDuplicateReturnItems,
  assertReturnHistoryCapacity,
  assetAvailabilityIncrement,
  deriveIssueStatusAfterReturn,
  isDamagedOutcome,
} from './return-domain.js';

const RETURNABLE_ISSUE_STATUSES = new Set(['ISSUED', 'PARTIALLY_RETURNED']);
const RETURN_INTERNAL_FIELDS = '+returnEvents.idempotencyKeyHash +returnEvents.requestFingerprint';

interface DuplicateKeyError {
  code?: unknown;
}

export interface ReturnActorContext {
  userId: string;
  workerId: string;
  role: UserRole;
  requestId: string;
}

export interface ReturnIdempotencyInput {
  keyHash: string;
  requestFingerprint: string;
}

export interface RecordReturnResult {
  issue: Issue;
  returnEvent: ReturnEvent;
  idempotentReplay: boolean;
}

export interface ReturnEventListInput {
  page: number;
  pageSize: number;
  role: UserRole;
  actorUserId: string;
  search?: string;
  period?: IssuePeriod;
}

export interface ReturnEventListResult {
  events: ReturnEvent[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function isDuplicateKey(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && (error as DuplicateKeyError).code === 11_000,
  );
}

function objectId(value: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) throw new TypeError('Invalid authenticated user ID.');
  return new Types.ObjectId(value);
}

function issueNotFound(): AppError {
  return new AppError(404, 'ISSUE_NOT_FOUND', 'This Issue Record was not found.');
}

function returnEventNotFound(): AppError {
  return new AppError(404, 'RETURN_EVENT_NOT_FOUND', 'This Return event was not found.');
}

function escapeSearchRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findLine(issue: IssueDocument, lineId: string): IssueLineRecord {
  const line = issue.lines.find((candidate) => candidate.lineId === lineId);
  if (!line) {
    throw new AppError(
      409,
      'RETURN_LINE_NOT_FOUND',
      'A requested line does not belong to this Issue Record.',
    );
  }
  return line;
}

export function assertLineKind(
  line: IssueLineRecord,
  trackingMode: 'QUANTITY' | 'SERIALIZED',
): void {
  if (line.material.trackingMode !== trackingMode) {
    throw new AppError(
      409,
      'RETURN_LINE_KIND_MISMATCH',
      'The requested return type does not match the issued material line.',
    );
  }
  if (line.material.returnPolicy === 'CONSUMABLE') {
    throw new AppError(409, 'CONSUMABLE_NOT_RETURNABLE', 'Consumable material cannot be returned.');
  }
}

export function assertIssueOutstandingInvariant(issue: IssueDocument): void {
  const calculated = issue.lines.reduce((total, line) => total + line.outstandingQuantity, 0);
  if (calculated !== issue.totalOutstandingQuantity) {
    throw new AppError(
      409,
      'ISSUE_OUTSTANDING_STATE_CONFLICT',
      'The Issue Record outstanding balance is inconsistent. Try again or contact an Admin.',
    );
  }
  for (const line of issue.lines) {
    if (line.material.trackingMode !== 'SERIALIZED') continue;
    const outstandingAssets = line.assets.filter((asset) => asset.outstanding).length;
    if (outstandingAssets !== line.outstandingQuantity) {
      throw new AppError(
        409,
        'ISSUE_ASSET_STATE_CONFLICT',
        'The Issue Record asset balance is inconsistent. Try again or contact an Admin.',
      );
    }
  }
}

async function actorSnapshot(
  context: ReturnActorContext,
  session: ClientSession,
): Promise<IssueActorSnapshotRecord> {
  const user = await UserModel.findById(context.userId).session(session);
  if (
    !user ||
    user.workerId !== context.workerId ||
    user.role !== context.role ||
    user.status !== 'ACTIVE'
  ) {
    throw new AppError(401, 'SESSION_REVOKED', 'Your account is no longer authorized.');
  }
  return {
    userId: user._id,
    workerId: user.workerId,
    name: user.name,
    role: user.role,
  };
}

async function materialForLine(
  line: IssueLineRecord,
  cache: Map<string, MaterialDocument>,
  session: ClientSession,
): Promise<MaterialDocument> {
  const key = line.material.materialId.toString();
  const existing = cache.get(key);
  if (existing) return existing;

  const material = await MaterialModel.findOne({
    _id: line.material.materialId,
    materialCode: line.material.materialCode,
    trackingMode: line.material.trackingMode,
  }).session(session);
  if (!material || material.returnPolicy !== line.material.returnPolicy) {
    throw new AppError(
      409,
      'RETURN_MATERIAL_STATE_CONFLICT',
      'The current material record does not match the issued snapshot.',
    );
  }
  cache.set(key, material);
  return material;
}

export function applyMaterialReturn(
  material: MaterialDocument,
  issuedReduction: number,
  availableIncrease: number,
): void {
  const nextIssued = material.issuedQuantity - issuedReduction;
  const nextAvailable = material.availableQuantity + availableIncrease;
  if (
    nextIssued < 0 ||
    nextAvailable < 0 ||
    nextAvailable > material.totalQuantity ||
    nextAvailable + nextIssued > material.totalQuantity
  ) {
    throw new AppError(
      409,
      'RETURN_INVENTORY_STATE_CONFLICT',
      'Inventory changed while this Return was being processed. Try again.',
    );
  }
  material.issuedQuantity = nextIssued;
  material.availableQuantity = nextAvailable;
}

export function assertQuantityWithinOutstanding(
  line: Pick<IssueLineRecord, 'outstandingQuantity'>,
  quantity: number,
): void {
  if (quantity > line.outstandingQuantity) {
    throw new AppError(
      409,
      'RETURN_QUANTITY_EXCEEDS_OUTSTANDING',
      'Returned quantity cannot exceed the outstanding quantity.',
    );
  }
}

export function findOutstandingIssueAsset(
  line: Pick<IssueLineRecord, 'assets'>,
  assetTag: string,
): IssueAssetRecord {
  const issueAsset = line.assets.find((candidate) => candidate.assetTag === assetTag);
  if (!issueAsset) {
    throw new AppError(
      409,
      'RETURN_ASSET_NOT_ON_LINE',
      'The selected asset does not belong to the requested Issue line.',
    );
  }
  if (!issueAsset.outstanding) {
    throw new AppError(
      409,
      'RETURN_ASSET_ALREADY_PROCESSED',
      'This asset has already been returned or resolved.',
    );
  }
  return issueAsset;
}

async function resolveReplay(
  keyHash: string,
  requestFingerprint: string,
  session?: ClientSession,
): Promise<RecordReturnResult | null> {
  let query = IssueModel.findOne({ 'returnEvents.idempotencyKeyHash': keyHash }).select(
    RETURN_INTERNAL_FIELDS,
  );
  if (session) query = query.session(session);
  const issue = await query;
  if (!issue) return null;

  const event = issue.returnEvents.find((candidate) => candidate.idempotencyKeyHash === keyHash);
  if (!event) {
    throw new AppError(
      500,
      'RETURN_IDEMPOTENCY_STATE_INVALID',
      'The saved Return could not be replayed.',
    );
  }
  if (event.requestFingerprint !== requestFingerprint) throw idempotencyConflict();
  return {
    issue: toIssue(issue),
    returnEvent: toReturnEvent(event),
    idempotentReplay: true,
  };
}

async function applyQuantityItem(
  item: Extract<CreateReturnRequest['items'][number], { trackingMode: 'QUANTITY' }>,
  line: IssueLineRecord,
  material: MaterialDocument,
): Promise<ReturnEventItemRecord> {
  assertQuantityWithinOutstanding(line, item.quantity);
  applyMaterialReturn(material, item.quantity, item.quantity);
  line.outstandingQuantity -= item.quantity;
  return {
    trackingMode: 'QUANTITY',
    lineId: line.lineId,
    materialCode: line.material.materialCode,
    materialName: line.material.name,
    quantity: item.quantity,
  };
}

async function applySerializedItem(
  item: Extract<CreateReturnRequest['items'][number], { trackingMode: 'SERIALIZED' }>,
  line: IssueLineRecord,
  material: MaterialDocument,
  returnedAt: Date,
  session: ClientSession,
): Promise<{ eventItem: ReturnEventItemRecord; assetUnit: AssetUnitDocument }> {
  const issueAsset = findOutstandingIssueAsset(line, item.assetTag);

  const assetUnit = await AssetUnitModel.findOne({
    _id: issueAsset.assetUnitId,
    assetTag: issueAsset.assetTag,
    materialId: line.material.materialId,
    materialCode: line.material.materialCode,
    status: 'ISSUED',
  }).session(session);
  if (!assetUnit) {
    throw new AppError(
      409,
      'RETURN_ASSET_STATE_CONFLICT',
      'The selected asset is no longer in the issued state.',
    );
  }

  assetUnit.status = item.disposition;
  assetUnit.condition = item.condition;
  issueAsset.outstanding = false;
  issueAsset.returnDisposition = item.disposition;
  issueAsset.returnedAt = returnedAt;
  line.outstandingQuantity -= 1;
  if (line.outstandingQuantity < 0) {
    throw new AppError(
      409,
      'ISSUE_ASSET_STATE_CONFLICT',
      'The Issue Record asset balance is inconsistent. Try again or contact an Admin.',
    );
  }
  applyMaterialReturn(material, 1, assetAvailabilityIncrement(item.disposition));

  return {
    assetUnit,
    eventItem: {
      trackingMode: 'SERIALIZED',
      lineId: line.lineId,
      materialCode: line.material.materialCode,
      materialName: line.material.name,
      assetTag: issueAsset.assetTag,
      ...(issueAsset.serialNumber ? { serialNumber: issueAsset.serialNumber } : {}),
      disposition: item.disposition,
      condition: item.condition,
    },
  };
}

export async function recordReturn(
  issueId: string,
  input: CreateReturnRequest,
  actor: ReturnActorContext,
  idempotency: ReturnIdempotencyInput,
): Promise<RecordReturnResult> {
  assertNoDuplicateReturnItems(input.items);
  const existing = await resolveReplay(idempotency.keyHash, idempotency.requestFingerprint);
  if (existing) return existing;

  const session = await mongoose.startSession();
  const returnedAt = new Date();
  const returnEventId = randomUUID();
  let result: RecordReturnResult | undefined;

  try {
    await session.withTransaction(async () => {
      const replay = await resolveReplay(
        idempotency.keyHash,
        idempotency.requestFingerprint,
        session,
      );
      if (replay) {
        result = replay;
        return;
      }

      const issue = await IssueModel.findOne({ issueId })
        .select(RETURN_INTERNAL_FIELDS)
        .session(session);
      if (!issue) throw issueNotFound();
      if (!RETURNABLE_ISSUE_STATUSES.has(issue.status) || issue.totalOutstandingQuantity <= 0) {
        throw new AppError(
          409,
          'ISSUE_NOT_RETURNABLE',
          'This Issue Record has no material available to return.',
        );
      }
      assertIssueOutstandingInvariant(issue);

      const performedBy = await actorSnapshot(actor, session);
      const materials = new Map<string, MaterialDocument>();
      const assetUnits: AssetUnitDocument[] = [];
      const eventItems: ReturnEventItemRecord[] = [];
      let damagedInEvent = false;
      let lostInEvent = false;

      for (const item of input.items) {
        const line = findLine(issue, item.lineId);
        assertLineKind(line, item.trackingMode);
        const material = await materialForLine(line, materials, session);

        if (item.trackingMode === 'QUANTITY') {
          eventItems.push(await applyQuantityItem(item, line, material));
          continue;
        }

        const applied = await applySerializedItem(item, line, material, returnedAt, session);
        assetUnits.push(applied.assetUnit);
        eventItems.push(applied.eventItem);
        if (item.disposition === 'LOST') lostInEvent = true;
        if (isDamagedOutcome(item.disposition)) damagedInEvent = true;
      }

      const remainingOutstandingQuantity = issue.lines.reduce(
        (total, line) => total + line.outstandingQuantity,
        0,
      );
      issue.totalOutstandingQuantity = remainingOutstandingQuantity;
      issue.hasLostOutcome ||= lostInEvent;
      issue.hasDamagedOutcome ||= damagedInEvent;
      issue.status = deriveIssueStatusAfterReturn(
        remainingOutstandingQuantity,
        issue.hasLostOutcome,
        issue.hasDamagedOutcome,
      );
      assertReturnHistoryCapacity(
        issue.returnEvents.length,
        issue.lines.map((line) => ({
          trackingMode: line.material.trackingMode,
          outstandingQuantity: line.outstandingQuantity,
        })),
      );

      const event: ReturnEventRecord = {
        returnEventId,
        issueId: issue.issueId,
        returnedAt,
        performedBy,
        items: eventItems,
        ...(input.notes ? { notes: input.notes } : {}),
        remainingOutstandingQuantity,
        resultingIssueStatus: issue.status,
        completedIssue: remainingOutstandingQuantity === 0,
        idempotencyKeyHash: idempotency.keyHash,
        requestFingerprint: idempotency.requestFingerprint,
      };
      issue.returnEvents.push(event);

      for (const material of materials.values()) await material.save({ session });
      for (const assetUnit of assetUnits) await assetUnit.save({ session });
      await issue.save({ session });
      await appendAuditEvent(
        {
          requestId: actor.requestId,
          actorUserId: actor.userId,
          actorWorkerId: actor.workerId,
          actorRole: actor.role,
          action: 'RETURN_RECORDED',
          targetType: 'ISSUE',
          targetId: issue.issueId,
          result: 'SUCCESS',
          metadata: {
            issueId: issue.issueId,
            returnEventId,
            returnedLineCount: new Set(eventItems.map((item) => item.lineId)).size,
            remainingOutstandingQuantity,
            resultingIssueStatus: issue.status,
          },
        },
        { session },
      );
      await enqueueReturnNotifications(issue, event, session);

      result = {
        issue: toIssue(issue),
        returnEvent: toReturnEvent(event),
        idempotentReplay: false,
      };
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      const replay = await resolveReplay(idempotency.keyHash, idempotency.requestFingerprint);
      if (replay) return replay;
    }
    throw error;
  } finally {
    await session.endSession();
  }

  if (!result) {
    throw new AppError(500, 'RETURN_RECORDING_FAILED', 'The Return could not be recorded.');
  }
  return result;
}

export async function listReturnEvents(
  input: ReturnEventListInput,
): Promise<ReturnEventListResult> {
  const match: Record<string, unknown> = {};
  if (input.role === 'WORKER') {
    match['returnEvents.performedBy.userId'] = objectId(input.actorUserId);
  }
  if (input.search) {
    const search = new RegExp(escapeSearchRegex(input.search), 'i');
    match.$or = [
      { issueId: search },
      { 'receiver.receiverCode': search },
      { 'receiver.fullName': search },
      { 'receiver.universityId': search },
      { 'receiver.email': search },
      { 'receiver.contact': search },
      { 'returnEvents.items.materialCode': search },
      { 'returnEvents.items.materialName': search },
      { 'returnEvents.items.assetTag': search },
      { 'returnEvents.items.serialNumber': search },
    ];
  }
  if (input.period === 'TODAY') {
    const today = istDayRange(new Date());
    match['returnEvents.returnedAt'] = { $gte: today.start, $lt: today.end };
  }

  const skip = (input.page - 1) * input.pageSize;
  const pipeline: PipelineStage[] = [
    { $project: { issueId: 1, receiver: 1, returnEvents: 1 } },
    { $unwind: '$returnEvents' },
    { $match: match },
    { $sort: { 'returnEvents.returnedAt': -1, 'returnEvents.returnEventId': -1 } },
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: input.pageSize }, { $replaceWith: '$returnEvents' }],
        count: [{ $count: 'total' }],
      },
    },
  ];
  const [faceted] = await IssueModel.aggregate<{
    data: ReturnEventRecord[];
    count: Array<{ total: number }>;
  }>(pipeline);
  const events = faceted?.data ?? [];
  const total = faceted?.count[0]?.total ?? 0;
  return {
    events: events.map((event) => toReturnEvent(event)),
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
}

export async function getReturnEvent(
  returnEventId: string,
  role: UserRole,
  actorUserId: string,
): Promise<ReturnEvent> {
  const eventMatch: Record<string, unknown> = { returnEventId };
  if (role === 'WORKER') eventMatch['performedBy.userId'] = objectId(actorUserId);
  const issue = await IssueModel.findOne({ returnEvents: { $elemMatch: eventMatch } });
  if (!issue) throw returnEventNotFound();
  const event = issue.returnEvents.find((candidate) => candidate.returnEventId === returnEventId);
  if (!event || (role === 'WORKER' && event.performedBy.userId.toString() !== actorUserId)) {
    throw returnEventNotFound();
  }
  return toReturnEvent(event);
}
