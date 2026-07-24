import { randomUUID } from 'node:crypto';

import mongoose, { Types, type ClientSession, type QueryFilter } from 'mongoose';

import {
  AssetTagSchema,
  IssueIdSchema,
  type CreateCatalogIssueRequest,
  type CreateIssueRequest,
  type Issue,
  type IssuePeriod,
  type IssueReturnState,
  type IssueStatus,
  type IssueSummary,
  type ReturnableIssue,
  type UpdateIssueRequest,
  type UserRole,
} from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import { appendAuditEvent } from '../audit/audit.service.js';
import { AssetUnitModel } from '../inventory/asset-unit.model.js';
import { MaterialModel } from '../inventory/material.model.js';
import { ReceiverModel } from '../receivers/receiver.model.js';
import { findOrCreateReceiverForIssue } from '../receivers/receiver.service.js';
import { enqueueIssueNotifications } from '../notifications/notification.service.js';
import { UserModel } from '../users/user.model.js';
import { idempotencyConflict } from './idempotency.js';
import { calculateExpectedReturnAt, issueYearInIst, istDayRange } from './issue-date.js';
import { allocateIssueId } from './issue-id.js';
import { toIssue, toIssueSummary, toReturnableIssue } from './issue.mapper.js';
import {
  IssueModel,
  type IssueActorSnapshotRecord,
  type IssueDocument,
  type IssueLineRecord,
  type IssueMaterialSnapshotRecord,
} from './issue.model.js';

export interface IssueActorContext {
  userId: string;
  workerId: string;
  role: UserRole;
  requestId: string;
}

export interface CreateIssueResult {
  issue: Issue;
  idempotentReplay: boolean;
}

export interface IssueListInput {
  page: number;
  pageSize: number;
  actorUserId: string;
  actorRole: UserRole;
  issueDataScope?: 'OWN' | 'ALL';
  search?: string;
  status?: IssueStatus;
  period?: IssuePeriod;
  returnState?: IssueReturnState;
}

export interface IssueListResult {
  issues: IssueSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ReturnSearchInput {
  page: number;
  pageSize: number;
  search: string;
  actorRole: UserRole;
  issueDataScope?: 'OWN' | 'ALL';
}

export interface ReturnSearchResult {
  issues: ReturnableIssue[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type IssueDetailResult =
  { accessScope: 'FULL'; issue: Issue } | { accessScope: 'RETURN_ONLY'; issue: ReturnableIssue };

function objectId(value: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) throw new TypeError('Invalid Issue actor user ID.');
  return new Types.ObjectId(value);
}

function escapeSearchRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function issueNotFound(): AppError {
  return new AppError(404, 'ISSUE_NOT_FOUND', 'This Issue Record was not found.');
}

function inventoryUnavailable(materialCode: string): AppError {
  return new AppError(
    409,
    'ISSUE_INVENTORY_UNAVAILABLE',
    `The requested stock for ${materialCode} is no longer available.`,
    { lines: 'Review current inventory availability and try again.' },
  );
}

function materialSnapshot(material: {
  _id: Types.ObjectId;
  materialCode: string;
  name: string;
  category: string;
  trackingMode: 'SERIALIZED' | 'QUANTITY';
  returnPolicy: 'REUSABLE' | 'CONSUMABLE';
  unitLabel?: string;
}): IssueMaterialSnapshotRecord {
  return {
    materialId: material._id,
    materialCode: material.materialCode,
    name: material.name,
    category: material.category,
    source: 'CATALOG',
    trackingMode: material.trackingMode,
    returnPolicy: material.returnPolicy,
    ...(material.unitLabel ? { unitLabel: material.unitLabel } : {}),
  };
}

async function claimActor(
  actor: IssueActorContext,
  session?: ClientSession,
): Promise<IssueActorSnapshotRecord> {
  const actorId = objectId(actor.userId);
  const query = UserModel.findOne({
    _id: actorId,
    workerId: actor.workerId,
    role: actor.role,
    status: 'ACTIVE',
  });
  const user = session ? await query.session(session) : await query;
  if (!user) {
    throw new AppError(403, 'ISSUE_ACTOR_INACTIVE', 'Your account cannot issue material.');
  }
  return { userId: user._id, workerId: user.workerId, name: user.name, role: user.role };
}

async function createIssueLine(
  input: CreateCatalogIssueRequest['lines'][number],
  assignmentType: CreateCatalogIssueRequest['assignmentType'],
  session?: ClientSession,
): Promise<IssueLineRecord> {
  const materialQuery = MaterialModel.findOne({
    materialCode: input.materialCode,
    status: { $in: ['ACTIVE', 'NOT_IN_USE'] },
  });
  const material = session ? await materialQuery.session(session) : await materialQuery;
  if (!material) throw inventoryUnavailable(input.materialCode);
  if (material.trackingMode !== input.trackingMode) {
    throw new AppError(
      409,
      'ISSUE_TRACKING_MODE_CHANGED',
      `The tracking mode for ${input.materialCode} changed. Refresh inventory and try again.`,
    );
  }

  if (input.trackingMode === 'QUANTITY') {
    const quantity = input.quantity;
    const returnableQuantity =
      material.returnPolicy === 'REUSABLE' || assignmentType === 'SHORT_TERM';
    const update =
      returnableQuantity
        ? { $inc: { availableQuantity: -quantity, issuedQuantity: quantity } }
        : { $inc: { availableQuantity: -quantity, totalQuantity: -quantity } };
    const updated = await MaterialModel.findOneAndUpdate(
      {
        _id: material._id,
        status: { $in: ['ACTIVE', 'NOT_IN_USE'] },
        trackingMode: 'QUANTITY',
        returnPolicy: material.returnPolicy,
        availableQuantity: { $gte: quantity },
        ...(material.returnPolicy === 'CONSUMABLE' && assignmentType === 'LONG_TERM'
          ? { issuedQuantity: 0 }
          : {}),
      },
      update,
      { returnDocument: 'after', ...(session ? { session } : {}) },
    );
    if (!updated) throw inventoryUnavailable(input.materialCode);
    return {
      lineId: randomUUID(),
      material: materialSnapshot(material),
      issuedQuantity: quantity,
      outstandingQuantity: returnableQuantity ? quantity : 0,
      assets: [],
    };
  }

  if (material.returnPolicy !== 'REUSABLE') {
    throw new AppError(
      409,
      'SERIALIZED_MATERIAL_MUST_BE_REUSABLE',
      'Serialized material must be reusable before it can be issued.',
    );
  }

  const assetTags = input.assetTags;
  const unitsQuery = AssetUnitModel.find({
    materialId: material._id,
    assetTag: { $in: assetTags },
    status: 'AVAILABLE',
  });
  const units = session ? await unitsQuery.session(session) : await unitsQuery;
  if (units.length !== assetTags.length) throw inventoryUnavailable(input.materialCode);
  const unitByTag = new Map(units.map((unit) => [unit.assetTag, unit]));
  if (assetTags.some((assetTag) => !unitByTag.has(assetTag))) {
    throw inventoryUnavailable(input.materialCode);
  }

  const unitUpdate = await AssetUnitModel.updateMany(
    {
      materialId: material._id,
      assetTag: { $in: assetTags },
      status: 'AVAILABLE',
    },
    { $set: { status: 'ISSUED' } },
    session ? { session } : undefined,
  );
  if (unitUpdate.modifiedCount !== assetTags.length) throw inventoryUnavailable(input.materialCode);

  const updatedMaterial = await MaterialModel.findOneAndUpdate(
    {
      _id: material._id,
      status: { $in: ['ACTIVE', 'NOT_IN_USE'] },
      trackingMode: 'SERIALIZED',
      returnPolicy: 'REUSABLE',
      availableQuantity: { $gte: assetTags.length },
    },
    { $inc: { availableQuantity: -assetTags.length, issuedQuantity: assetTags.length } },
    { returnDocument: 'after', ...(session ? { session } : {}) },
  );
  if (!updatedMaterial) throw inventoryUnavailable(input.materialCode);

  return {
    lineId: randomUUID(),
    material: materialSnapshot(material),
    issuedQuantity: assetTags.length,
    outstandingQuantity: assetTags.length,
    assets: assetTags.map((assetTag) => {
      const unit = unitByTag.get(assetTag);
      if (!unit) throw inventoryUnavailable(input.materialCode);
      return {
        assetUnitId: unit._id,
        assetTag: unit.assetTag,
        ...(unit.serialNumber ? { serialNumber: unit.serialNumber } : {}),
        conditionAtIssue: unit.condition,
        outstanding: true,
      };
    }),
  };
}

async function claimReceiver(
  input: CreateIssueRequest,
  actor: IssueActorContext,
  session?: ClientSession,
) {
  if (input.receiver) {
    return findOrCreateReceiverForIssue(input.receiver, actor.userId, session);
  }
  if (!input.receiverCode) {
    throw new AppError(400, 'ISSUE_RECEIVER_REQUIRED', 'Provide issued-to details.');
  }
  const receiver = await ReceiverModel.findOneAndUpdate(
    { receiverCode: input.receiverCode, status: 'ACTIVE' },
    { $inc: { operationalUseCount: 1 } },
    { returnDocument: 'after', ...(session ? { session } : {}), timestamps: false },
  );
  if (!receiver) {
    throw new AppError(
      409,
      'ISSUE_RECEIVER_INACTIVE',
      'Select an active Receiver before issuing material.',
    );
  }
  return receiver;
}

async function restoreClaimedIssueLines(lines: IssueLineRecord[]): Promise<void> {
  for (const line of lines) {
    if (line.material.trackingMode === 'SERIALIZED') {
      const assetTags = line.assets.map((asset) => asset.assetTag);
      if (assetTags.length > 0) {
        await AssetUnitModel.updateMany(
          { assetTag: { $in: assetTags }, status: 'ISSUED' },
          { $set: { status: 'AVAILABLE' } },
        );
      }
      await MaterialModel.updateOne(
        { _id: line.material.materialId, materialCode: line.material.materialCode },
        { $inc: { availableQuantity: line.issuedQuantity, issuedQuantity: -line.issuedQuantity } },
      );
      continue;
    }

    if (line.material.returnPolicy === 'CONSUMABLE') {
      if (line.outstandingQuantity > 0) {
        await MaterialModel.updateOne(
          { _id: line.material.materialId, materialCode: line.material.materialCode },
          {
            $inc: {
              availableQuantity: line.outstandingQuantity,
              issuedQuantity: -line.outstandingQuantity,
            },
          },
        );
        continue;
      }

      await MaterialModel.updateOne(
        { _id: line.material.materialId, materialCode: line.material.materialCode },
        { $inc: { availableQuantity: line.issuedQuantity, totalQuantity: line.issuedQuantity } },
      );
      continue;
    }

    await MaterialModel.updateOne(
      { _id: line.material.materialId, materialCode: line.material.materialCode },
      { $inc: { availableQuantity: line.issuedQuantity, issuedQuantity: -line.issuedQuantity } },
    );
  }
}

export async function createIssue(
  input: CreateIssueRequest,
  actor: IssueActorContext,
  idempotencyKeyHash: string,
  requestFingerprint: string,
): Promise<CreateIssueResult> {
  const actorUserId = objectId(actor.userId);
  let result: CreateIssueResult | undefined;
  const claimedLines: IssueLineRecord[] = [];

  try {
    const existing = await IssueModel.findOne({ createdByUserId: actorUserId, idempotencyKeyHash })
      .select('+requestFingerprint')
      .exec();
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) throw idempotencyConflict();
      return { issue: toIssue(existing), idempotentReplay: true };
    }

    const issuedBy = await claimActor(actor);
    const receiver = await claimReceiver(input, actor);
    const issuedAt = new Date();
    for (const lineInput of input.lines) {
      const line = await createIssueLine(lineInput, input.assignmentType);
      claimedLines.push(line);
    }
    const hasReturnable = claimedLines.some((line) => line.outstandingQuantity > 0);
    if (input.assignmentType === 'SHORT_TERM' && hasReturnable && !input.due) {
      throw new AppError(400, 'RETURN_DUE_REQUIRED', 'Choose a return due date because this Issue contains returnable material.', {
        due: 'Choose a return preset or custom date.',
      });
    }
    if (input.assignmentType === 'LONG_TERM' && input.due) {
      throw new AppError(400, 'RETURN_DUE_NOT_APPLICABLE', 'Permanent issues do not have a fixed return date.', {
        due: 'Remove the return due selection.',
      });
    }

    const expectedReturnAt =
      input.assignmentType === 'SHORT_TERM' && input.due
        ? calculateExpectedReturnAt(issuedAt, input.due)
        : undefined;
    const issueId = await allocateIssueId(issueYearInIst(issuedAt));
    const totalIssuedQuantity = claimedLines.reduce((sum, line) => sum + line.issuedQuantity, 0);
    const totalOutstandingQuantity = claimedLines.reduce(
      (sum, line) => sum + line.outstandingQuantity,
      0,
    );
    const issue = await IssueModel.create({
      issueId,
      receiver: {
        receiverId: receiver._id,
        receiverCode: receiver.receiverCode,
        fullName: receiver.fullName,
        ...(receiver.universityId ? { universityId: receiver.universityId } : {}),
        type: receiver.type,
        ...(receiver.department ? { department: receiver.department } : {}),
        contact: receiver.contact,
        email: receiver.email,
      },
      issuedBy,
      issuedAt,
      ...(expectedReturnAt && input.due ? { expectedReturnAt, duePreset: input.due.preset } : {}),
      assignmentType: input.assignmentType,
      status: 'ISSUED',
      ...(input.purpose ? { purpose: input.purpose } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
      lines: claimedLines,
      returnEvents: [],
      totalIssuedQuantity,
      totalOutstandingQuantity,
      hasDamagedOutcome: false,
      hasLostOutcome: false,
      idempotencyKeyHash,
      requestFingerprint,
      createdByUserId: actorUserId,
    });

    await appendAuditEvent({
      requestId: actor.requestId,
      actorUserId: actor.userId,
      actorWorkerId: actor.workerId,
      actorRole: actor.role,
      action: 'ISSUE_CREATED',
      targetType: 'ISSUE',
      targetId: issueId,
      result: 'SUCCESS',
      metadata: {
        lineCount: claimedLines.length,
        itemCount: totalIssuedQuantity,
        status: 'ISSUED',
        duePreset: input.due?.preset ?? null,
        assignmentType: input.assignmentType,
      },
    });
    for (const line of claimedLines) {
      await appendAuditEvent({
        requestId: actor.requestId,
        actorUserId: actor.userId,
        actorWorkerId: actor.workerId,
        actorRole: actor.role,
        action:
          line.material.returnPolicy === 'CONSUMABLE' && line.outstandingQuantity === 0
            ? 'MATERIAL_STOCK_CONSUMED'
            : 'MATERIAL_STOCK_ISSUED',
        targetType: 'MATERIAL',
        targetId: line.material.materialCode,
        result: 'SUCCESS',
        metadata: {
          issueId,
          materialName: line.material.name,
          category: line.material.category,
          trackingMode: line.material.trackingMode,
          returnPolicy: line.material.returnPolicy,
          issuedQuantity: line.issuedQuantity,
          outstandingQuantity: line.outstandingQuantity,
          assignmentType: input.assignmentType,
        },
      });
    }
    await enqueueIssueNotifications(issue);
    result = { issue: toIssue(issue), idempotentReplay: false };
  } catch (error) {
    const duplicate =
      error && typeof error === 'object' && (error as { code?: unknown }).code === 11_000;
    if (!duplicate) throw error;

    const existing = await IssueModel.findOne({ createdByUserId: actorUserId, idempotencyKeyHash })
      .select('+requestFingerprint')
      .exec();
    if (!existing) throw error;
    if (existing.requestFingerprint !== requestFingerprint) throw idempotencyConflict();
    result = { issue: toIssue(existing), idempotentReplay: true };
    return result;
  } finally {
    if (!result && claimedLines.length > 0) {
      await restoreClaimedIssueLines(claimedLines);
    }
  }

  if (!result) throw new AppError(500, 'ISSUE_CREATE_FAILED', 'The Issue could not be created.');
  return result;
}

export function buildIssueSearchFilter(search: string): QueryFilter<unknown> {
  const normalized = search.trim().toUpperCase();
  if (IssueIdSchema.safeParse(normalized).success) return { issueId: normalized };
  if (AssetTagSchema.safeParse(normalized).success) return { 'lines.assets.assetTag': normalized };
  return { $text: { $search: search.trim() } };
}

export function buildReturnSearchFilter(search: string, actorRole: UserRole): QueryFilter<unknown> {
  const base: QueryFilter<unknown> = {
    totalOutstandingQuantity: { $gt: 0 },
    status: { $in: ['ISSUED', 'PARTIALLY_RETURNED'] },
  };
  const normalized = search.trim().toUpperCase();

  if (actorRole === 'WORKER') {
    if (IssueIdSchema.safeParse(normalized).success) return { ...base, issueId: normalized };
    if (AssetTagSchema.safeParse(normalized).success) {
      return {
        ...base,
        lines: {
          $elemMatch: {
            outstandingQuantity: { $gt: 0 },
            'material.returnPolicy': 'REUSABLE',
            assets: { $elemMatch: { assetTag: normalized, outstanding: true } },
          },
        },
      };
    }
    throw new AppError(
      400,
      'RETURN_LOOKUP_IDENTIFIER_REQUIRED',
      'Enter a complete Issue ID or asset tag to accept a cross-shift Return.',
      { search: 'Use a value such as GEU-ISS-2026-000001 or GEU-AST-000001.' },
    );
  }

  const value = new RegExp(escapeSearchRegex(search.trim()), 'i');
  return {
    ...base,
    $or: [
      { issueId: value },
      { 'receiver.receiverCode': value },
      { 'receiver.fullName': value },
      { 'receiver.universityId': value },
      {
        lines: {
          $elemMatch: {
            outstandingQuantity: { $gt: 0 },
            $or: [
              { 'material.materialCode': value },
              { 'material.name': value },
              {
                assets: {
                  $elemMatch: {
                    outstanding: true,
                    $or: [{ assetTag: value }, { serialNumber: value }],
                  },
                },
              },
            ],
          },
        },
      },
    ],
  };
}

export function isIssueReturnable(
  issue: Pick<IssueDocument, 'status' | 'totalOutstandingQuantity'>,
) {
  return issue.totalOutstandingQuantity > 0 && !['RETURNED', 'CANCELLED'].includes(issue.status);
}

export async function listIssues(input: IssueListInput): Promise<IssueListResult> {
  const filter: QueryFilter<unknown> = {};
  const accessClauses: QueryFilter<unknown>[] = [];
  const today = istDayRange(new Date());
  if (input.actorRole === 'WORKER' && input.issueDataScope !== 'ALL') {
    const actorUserId = objectId(input.actorUserId);
    accessClauses.push({
      $or: [{ createdByUserId: actorUserId }, { 'returnEvents.performedBy.userId': actorUserId }],
    });
  }
  if (input.status) filter.status = input.status;
  if (input.period === 'TODAY') {
    filter.issuedAt = { $gte: today.start, $lt: today.end };
  }
  if (input.returnState) {
    filter.totalOutstandingQuantity = { $gt: 0 };
    accessClauses.push({ status: { $in: ['ISSUED', 'PARTIALLY_RETURNED'] } });
    if (input.returnState === 'DUE_TODAY') {
      filter.expectedReturnAt = { $gte: today.start, $lt: today.end };
    }
  }
  if (input.search) accessClauses.push(buildIssueSearchFilter(input.search));
  if (accessClauses.length > 0) filter.$and = accessClauses;

  const skip = (input.page - 1) * input.pageSize;
  const [records, total] = await Promise.all([
    IssueModel.find(filter)
      .select(
        [
          'issueId',
          'receiver',
          'issuedBy',
          'issuedAt',
          'expectedReturnAt',
          'duePreset',
          'status',
          'purpose',
          'notes',
          'totalIssuedQuantity',
          'totalOutstandingQuantity',
          'hasDamagedOutcome',
          'hasLostOutcome',
          'createdAt',
          'updatedAt',
          'lines.material.name',
        ].join(' '),
      )
      .sort({ issuedAt: -1, _id: -1 })
      .skip(skip)
      .limit(input.pageSize),
    IssueModel.countDocuments(filter),
  ]);
  return {
    issues: records.map((record) => toIssueSummary(record)),
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
}

export async function searchReturnableIssues(
  input: ReturnSearchInput,
): Promise<ReturnSearchResult> {
  const filter = buildReturnSearchFilter(
    input.search,
    input.actorRole === 'WORKER' && input.issueDataScope === 'ALL' ? 'ADMIN' : input.actorRole,
  );
  const skip = (input.page - 1) * input.pageSize;
  const [records, total] = await Promise.all([
    IssueModel.find(filter)
      .select(
        [
          'issueId',
          'receiver',
          'issuedBy',
          'issuedAt',
          'expectedReturnAt',
          'duePreset',
          'status',
          'lines',
          'totalOutstandingQuantity',
        ].join(' '),
      )
      .sort({ issuedAt: -1, _id: -1 })
      .skip(skip)
      .limit(input.pageSize),
    IssueModel.countDocuments(filter),
  ]);
  return {
    issues: records.map((record) => toReturnableIssue(record)),
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
}

export async function getIssueDetail(
  issueId: string,
  actorUserId: string,
  actorRole: UserRole,
  issueDataScope: 'OWN' | 'ALL' = 'OWN',
): Promise<IssueDetailResult> {
  const issue = await IssueModel.findOne({ issueId });
  if (!issue) throw issueNotFound();
  if (actorRole === 'ADMIN' || issueDataScope === 'ALL') {
    return { accessScope: 'FULL', issue: toIssue(issue) };
  }

  const actorId = objectId(actorUserId);
  const ownsActivity =
    issue.createdByUserId.equals(actorId) ||
    issue.returnEvents.some((event) => event.performedBy.userId.equals(actorId));
  if (ownsActivity) return { accessScope: 'FULL', issue: toIssue(issue) };
  if (isIssueReturnable(issue)) {
    return { accessScope: 'RETURN_ONLY', issue: toReturnableIssue(issue) };
  }
  throw issueNotFound();
}

export async function updateIssue(
  issueId: string,
  input: UpdateIssueRequest,
  actor: IssueActorContext,
): Promise<Issue> {
  const issue = await IssueModel.findOne({ issueId });
  if (!issue) throw issueNotFound();

  const actorId = objectId(actor.userId);
  if (actor.role !== 'ADMIN' && !issue.createdByUserId.equals(actorId)) {
    throw issueNotFound();
  }

  const changedFields: string[] = [];
  if (input.receiver) {
    issue.receiver.fullName = input.receiver.fullName;
    issue.receiver.type = input.receiver.type;
    issue.receiver.contact = input.receiver.contact;
    issue.receiver.email = input.receiver.email;
    issue.set('receiver.universityId', input.receiver.universityId || undefined);
    issue.set('receiver.department', input.receiver.department || undefined);
    changedFields.push('receiver');
  }
  if (Object.hasOwn(input, 'purpose')) {
    issue.set('purpose', input.purpose || undefined);
    changedFields.push('purpose');
  }
  if (Object.hasOwn(input, 'notes')) {
    issue.set('notes', input.notes || undefined);
    changedFields.push('notes');
  }
  if (input.expectedReturnAt !== undefined) {
    const hasReturnableQuantity = issue.lines.some((line) => line.outstandingQuantity > 0);
    const nextExpectedReturnAt = new Date(input.expectedReturnAt);
    if (actor.role !== 'ADMIN') {
      throw new AppError(403, 'RETURN_DATE_ADMIN_ONLY', 'Only an Admin can extend a return date.');
    }
    if (
      issue.assignmentType !== 'SHORT_TERM' ||
      !hasReturnableQuantity ||
      issue.totalOutstandingQuantity <= 0 ||
      !['ISSUED', 'PARTIALLY_RETURNED'].includes(issue.status)
    ) {
      throw new AppError(
        409,
        'RETURN_DATE_NOT_EXTENDABLE',
        'Only active return-by-date issues with returnable material can be extended.',
      );
    }
    if (nextExpectedReturnAt <= new Date()) {
      throw new AppError(
        400,
        'RETURN_DATE_MUST_BE_FUTURE',
        'Choose a future return date and time.',
        { expectedReturnAt: 'Choose a future return date and time.' },
      );
    }
    issue.expectedReturnAt = nextExpectedReturnAt;
    issue.duePreset = 'CUSTOM';
    changedFields.push('expectedReturnAt');
  }

  await issue.save();
  await appendAuditEvent({
    requestId: actor.requestId,
    actorUserId: actor.userId,
    actorWorkerId: actor.workerId,
    actorRole: actor.role,
    action: 'ISSUE_UPDATED',
    targetType: 'ISSUE',
    targetId: issue.issueId,
    result: 'SUCCESS',
    metadata: { changedFields },
  });

  return toIssue(issue);
}

export async function deleteIssue(issueId: string, actor: IssueActorContext): Promise<Issue> {
  const session = await mongoose.startSession();
  let deletedIssue: Issue | undefined;

  try {
    await session.withTransaction(async () => {
      const issue = await IssueModel.findOne({ issueId }).session(session);
      if (!issue) throw issueNotFound();
      deletedIssue = toIssue(issue);

      for (const line of issue.lines) {
        if (line.material.returnPolicy === 'CONSUMABLE') {
          if (line.outstandingQuantity > 0) {
            await MaterialModel.updateOne(
              { _id: line.material.materialId, materialCode: line.material.materialCode },
              {
                $inc: {
                  availableQuantity: line.outstandingQuantity,
                  issuedQuantity: -line.outstandingQuantity,
                },
              },
              { session },
            );
            continue;
          }

          if (issue.assignmentType === 'SHORT_TERM') continue;

          await MaterialModel.updateOne(
            { _id: line.material.materialId, materialCode: line.material.materialCode },
            {
              $inc: { totalQuantity: line.issuedQuantity, availableQuantity: line.issuedQuantity },
            },
            { session },
          );
          continue;
        }

        if (line.outstandingQuantity <= 0) continue;
        await MaterialModel.updateOne(
          { _id: line.material.materialId, materialCode: line.material.materialCode },
          {
            $inc: {
              availableQuantity: line.outstandingQuantity,
              issuedQuantity: -line.outstandingQuantity,
            },
          },
          { session },
        );

        if (line.material.trackingMode === 'SERIALIZED') {
          const outstandingAssets = line.assets.filter((asset) => asset.outstanding);
          for (const asset of outstandingAssets) {
            await AssetUnitModel.updateOne(
              { _id: asset.assetUnitId, assetTag: asset.assetTag, status: 'ISSUED' },
              { $set: { status: 'AVAILABLE', condition: asset.conditionAtIssue } },
              { session },
            );
          }
        }
      }

      await IssueModel.deleteOne({ _id: issue._id }).session(session);
      await appendAuditEvent(
        {
          requestId: actor.requestId,
          actorUserId: actor.userId,
          actorWorkerId: actor.workerId,
          actorRole: actor.role,
          action: 'ISSUE_DELETED',
          targetType: 'ISSUE',
          targetId: issue.issueId,
          result: 'SUCCESS',
          metadata: {
            lineCount: issue.lines.length,
            totalIssuedQuantity: issue.totalIssuedQuantity,
            restoredOutstandingQuantity: issue.totalOutstandingQuantity,
          },
        },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  if (!deletedIssue)
    throw new AppError(500, 'ISSUE_DELETE_FAILED', 'The Issue could not be deleted.');
  return deletedIssue;
}

export async function getIssueRecordForReturn(
  issueId: string,
  session: ClientSession,
): Promise<IssueDocument> {
  const issue = await IssueModel.findOne({ issueId }).session(session);
  if (!issue || !isIssueReturnable(issue)) throw issueNotFound();
  return issue;
}
