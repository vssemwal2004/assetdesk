import { randomUUID } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import type {
  CreateInventoryGatePassRequest,
  InventoryGatePass,
  RecordInventoryGateInRequest,
  UpdateInventoryGatePassRequest,
  UserRole,
} from '@assetdesk/contracts';
import { AppError } from '../../middleware/error-handler.js';
import { appendAuditEvent } from '../audit/audit.service.js';
import { AssetUnitModel } from '../inventory/asset-unit.model.js';
import { MaterialModel } from '../inventory/material.model.js';
import { UserModel } from '../users/user.model.js';
import { InventoryGatePassCounterModel } from './inventory-gate-pass-counter.model.js';
import {
  InventoryGatePassModel,
  type GatePassActorSnapshot,
  type InventoryGatePassRecord,
} from './inventory-gate-pass.model.js';

export interface GatePassActor {
  userId: string;
  workerId: string;
  role: UserRole;
  requestId: string;
}
const activeStatuses: InventoryGatePassRecord['status'][] = [
  'READY_FOR_OUT',
  'OUTSIDE',
  'PARTIALLY_IN',
];
export type RepairConditionType =
  'ANY' | 'UNDER_MAINTENANCE' | 'FAULTY' | 'NOT_WORKING' | 'DAMAGED';
const repairAssetStatuses = ['UNDER_REPAIR', 'DAMAGED'] as const;
const movableAssetStatuses = ['AVAILABLE', 'RETURNED', 'UNDER_REPAIR', 'DAMAGED'] as const;

export function eligibleGatePassAssetStatuses(purpose: 'REPAIR' | 'OTHER') {
  return purpose === 'REPAIR' ? repairAssetStatuses : movableAssetStatuses;
}

function repairMaterialStatuses(conditionType: RepairConditionType): string[] {
  if (conditionType === 'UNDER_MAINTENANCE') return ['UNDER_MAINTENANCE'];
  if (conditionType === 'NOT_WORKING') return ['NOT_IN_USE'];
  if (conditionType === 'FAULTY' || conditionType === 'DAMAGED') {
    return ['SCRAP', 'NOT_IN_USE'];
  }
  return ['UNDER_MAINTENANCE', 'SCRAP', 'NOT_IN_USE'];
}

function isRepairEligibleUnit(unit: { status: string }) {
  return movableAssetStatuses.includes(unit.status as (typeof movableAssetStatuses)[number]);
}

export function quantityGateOutAdjustment(
  quantity: number,
  returnRequirement: 'RETURNABLE' | 'NON_RETURNABLE',
) {
  return returnRequirement === 'RETURNABLE'
    ? { availableQuantity: -quantity, issuedQuantity: quantity }
    : { availableQuantity: -quantity, totalQuantity: -quantity };
}

export function quantityGateInAdjustment(quantity: number) {
  return { availableQuantity: quantity, issuedQuantity: -quantity };
}

function escapedSearch(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

async function actorSnapshot(actor: GatePassActor): Promise<GatePassActorSnapshot> {
  const user = await UserModel.findById(actor.userId).select('name').lean();
  if (!user) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  return {
    userId: new Types.ObjectId(actor.userId),
    workerId: actor.workerId,
    name: user.name,
    role: actor.role,
  };
}
async function allocateNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const counter = await InventoryGatePassCounterModel.findOneAndUpdate(
    { key: `INVENTORY_GATE_PASS:${year}` },
    { $inc: { value: 1 } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
  );
  if (!counter) throw new Error('Gate Pass counter could not be allocated.');
  return `GEU-GP-${year}-${String(counter.value).padStart(6, '0')}`;
}

function toActorDto(actor: Partial<GatePassActorSnapshot> | undefined) {
  return {
    userId: actor?.userId?.toString() ?? 'legacy-system',
    workerId: actor?.workerId ?? 'LEGACY',
    name: actor?.name ?? 'Legacy record',
    role: actor?.role === 'WORKER' ? 'WORKER' : 'ADMIN',
  } as const;
}

function toDto(pass: InventoryGatePassRecord): InventoryGatePass {
  // Mongoose normally supplies these through `{ timestamps: true }`. Keep the
  // API resilient for older records and mocked documents that predate that
  // schema option, so creating a Gate Pass never fails while serializing it.
  const createdAt = pass.createdAt ?? pass.updatedAt ?? new Date();
  const updatedAt = pass.updatedAt ?? createdAt;
  const fallbackIso = updatedAt.toISOString();
  const fallbackActor = toActorDto(pass.createdBy);

  return {
    id: pass._id.toString(),
    gatePassNumber: pass.gatePassNumber,
    source: pass.source,
    purpose: pass.purpose,
    issueId: pass.issueId ?? null,
    materialComposition: pass.materialComposition,
    status: pass.status,
    destination: pass.destination,
    carrier: pass.carrier,
    items: pass.items.map((item) => ({
      itemId: item.itemId,
      materialId: item.materialId.toString(),
      materialCode: item.materialCode,
      materialName: item.materialName,
      category: item.category,
      model: item.model ?? null,
      trackingMode: item.trackingMode,
      returnRequirement: item.returnRequirement,
      assetUnitId: item.assetUnitId?.toString() ?? null,
      assetTag: item.assetTag ?? null,
      serialNumber: item.serialNumber ?? null,
      quantity: item.quantity,
      unitLabel: item.unitLabel ?? null,
      conditionOut: item.conditionOut ?? null,
      assetStatusOut: item.assetStatusOut ?? null,
      movementCondition: item.movementCondition ?? null,
      faultDescription: item.faultDescription ?? null,
      receivedQuantity: item.receivedQuantity,
      remainingOutsideQuantity: item.remainingOutsideQuantity,
    })),
    expectedGateInAt: pass.expectedGateInAt?.toISOString() ?? null,
    remarks: pass.remarks ?? null,
    createdBy: fallbackActor,
    gateOut: pass.gateOut
      ? {
          at: pass.gateOut.at?.toISOString() ?? fallbackIso,
          by: toActorDto(pass.gateOut.by ?? pass.createdBy),
        }
      : null,
    gateInEvents: (pass.gateInEvents ?? []).map((event) => ({
      eventId: event.eventId,
      receivedAt: event.receivedAt?.toISOString() ?? fallbackIso,
      receivedBy: toActorDto(event.receivedBy ?? pass.createdBy),
      personReturning: event.personReturning ?? null,
      remarks: event.remarks ?? null,
      items: event.items.map((item) => ({
        itemId: item.itemId,
        quantity: item.quantity,
        condition: item.condition,
        outcome: item.outcome as 'RECEIVED' | 'REPAIRED' | 'STILL_FAULTY' | 'DAMAGED' | 'REPLACED',
        ...(item.replacementSerialNumber
          ? { replacementSerialNumber: item.replacementSerialNumber }
          : {}),
        ...(item.remarks ? { remarks: item.remarks } : {}),
      })),
    })),
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

export async function createInventoryGatePass(
  input: CreateInventoryGatePassRequest,
  actor: GatePassActor,
): Promise<InventoryGatePass> {
  if (input.issueId) {
    const existing = await InventoryGatePassModel.findOne({ issueId: input.issueId });
    if (existing) return toDto(existing);
  }
  const snapshot = await actorSnapshot(actor);
  const items = [];
  for (const requested of input.items) {
    const material = await MaterialModel.findOne({ materialCode: requested.materialCode });
    if (!material)
      throw new AppError(
        404,
        'MATERIAL_NOT_FOUND',
        `Material ${requested.materialCode} was not found.`,
      );
    if (requested.trackingMode !== material.trackingMode)
      throw new AppError(
        409,
        'GATE_PASS_TRACKING_MODE_MISMATCH',
        'The selected material type has changed. Refresh and try again.',
      );
    if (
      input.purpose === 'REPAIR' &&
      !repairMaterialStatuses(
        requested.movementCondition === 'UNDER_REPAIR'
          ? 'UNDER_MAINTENANCE'
          : requested.movementCondition === 'OTHER' || !requested.movementCondition
            ? 'ANY'
            : requested.movementCondition,
      ).includes(material.status)
    ) {
      throw new AppError(
        409,
        'MATERIAL_NOT_REPAIR_ELIGIBLE',
        `${material.name} is not marked for repair or maintenance.`,
      );
    }
    if (requested.trackingMode === 'SERIALIZED') {
      const unit = await AssetUnitModel.findOne({
        materialId: material._id,
        assetTag: requested.assetTag,
      });
      if (!unit)
        throw new AppError(404, 'ASSET_NOT_FOUND', `Asset ${requested.assetTag} was not found.`);
      if (
        input.purpose === 'REPAIR'
          ? !isRepairEligibleUnit(unit)
          : !movableAssetStatuses.includes(unit.status as (typeof movableAssetStatuses)[number])
      )
        throw new AppError(
          409,
          'ASSET_NOT_REPAIR_ELIGIBLE',
          `${unit.assetTag} does not match the selected repair condition.`,
        );
      const duplicate = await InventoryGatePassModel.exists({
        status: { $in: activeStatuses },
        'items.assetTag': unit.assetTag,
      });
      if (duplicate)
        throw new AppError(
          409,
          'ASSET_ALREADY_ON_GATE_PASS',
          `${unit.assetTag} is already on an active Gate Pass.`,
        );
      items.push({
        itemId: randomUUID(),
        materialId: material._id,
        materialCode: material.materialCode,
        materialName: material.name,
        category: material.category,
        ...(material.typeModelName ? { model: material.typeModelName } : {}),
        trackingMode: 'SERIALIZED' as const,
        returnRequirement: requested.returnRequirement,
        assetUnitId: unit._id,
        assetTag: unit.assetTag,
        ...(unit.serialNumber ? { serialNumber: unit.serialNumber } : {}),
        quantity: 1,
        conditionOut: unit.condition,
        assetStatusOut: unit.status as 'AVAILABLE' | 'RETURNED' | 'UNDER_REPAIR' | 'DAMAGED',
        ...(requested.movementCondition ? { movementCondition: requested.movementCondition } : {}),
        ...(requested.faultDescription ? { faultDescription: requested.faultDescription } : {}),
        receivedQuantity: 0,
        remainingOutsideQuantity: 0,
      });
    } else {
      if (!input.issueId && requested.quantity > material.availableQuantity)
        throw new AppError(
          409,
          'INSUFFICIENT_AVAILABLE_QUANTITY',
          `Only ${material.availableQuantity} ${material.unitLabel ?? 'units'} are available.`,
        );
      items.push({
        itemId: randomUUID(),
        materialId: material._id,
        materialCode: material.materialCode,
        materialName: material.name,
        category: material.category,
        ...(material.typeModelName ? { model: material.typeModelName } : {}),
        trackingMode: 'QUANTITY' as const,
        returnRequirement: requested.returnRequirement,
        quantity: requested.quantity,
        ...(material.unitLabel ? { unitLabel: material.unitLabel } : {}),
        ...(requested.movementCondition ? { movementCondition: requested.movementCondition } : {}),
        ...(requested.faultDescription ? { faultDescription: requested.faultDescription } : {}),
        receivedQuantity: 0,
        remainingOutsideQuantity: 0,
      });
    }
  }
  const kinds = new Set(items.map((item) => item.trackingMode));
  const destination = {
    name: input.destination.name,
    ...(input.destination.organization ? { organization: input.destination.organization } : {}),
    ...(input.destination.address ? { address: input.destination.address } : {}),
    ...(input.destination.contact ? { contact: input.destination.contact } : {}),
  };
  const carrier = {
    name: input.carrier.name,
    ...(input.carrier.contact ? { contact: input.carrier.contact } : {}),
    ...(input.carrier.vehicleNumber ? { vehicleNumber: input.carrier.vehicleNumber } : {}),
  };
  const pass = new InventoryGatePassModel({
    gatePassNumber: await allocateNumber(),
    source: input.issueId ? 'ISSUE' : 'MANUAL',
    purpose: input.purpose,
    ...(input.issueId ? { issueId: input.issueId } : {}),
    materialComposition:
      kinds.size > 1 ? 'MIXED' : kinds.has('SERIALIZED') ? 'ASSET_ONLY' : 'CONSUMABLE_ONLY',
    status: 'READY_FOR_OUT',
    destination,
    carrier,
    items,
    ...(input.expectedGateInAt ? { expectedGateInAt: new Date(input.expectedGateInAt) } : {}),
    ...(input.remarks ? { remarks: input.remarks } : {}),
    createdBy: snapshot,
    gateInEvents: [],
  });
  await pass.save();
  await appendAuditEvent({
    requestId: actor.requestId,
    actorUserId: actor.userId,
    actorWorkerId: actor.workerId,
    actorRole: actor.role,
    action: 'INVENTORY_GATE_PASS_CREATED',
    targetType: 'INVENTORY_GATE_PASS',
    targetId: pass.gatePassNumber,
    result: 'SUCCESS',
    metadata: { purpose: pass.purpose, itemCount: pass.items.length },
  });
  return toDto(pass);
}

export async function listGatePassMaterialOptions(input: {
  page: number;
  pageSize: number;
  purpose: 'REPAIR' | 'OTHER';
  trackingMode: 'SERIALIZED' | 'QUANTITY';
  conditionType?: RepairConditionType;
  category?: string;
  search?: string;
}) {
  const baseFilter: Record<string, unknown> = {
    status:
      input.purpose === 'REPAIR'
        ? { $in: repairMaterialStatuses(input.conditionType ?? 'ANY') }
        : { $in: ['ACTIVE', 'UNDER_MAINTENANCE', 'NOT_IN_USE', 'SCRAP'] },
    trackingMode: input.trackingMode,
  };
  if (input.trackingMode === 'QUANTITY') {
    baseFilter.availableQuantity = { $gt: 0 };
  } else {
    const activeUnitIds = await InventoryGatePassModel.distinct('items.assetUnitId', {
      status: { $in: activeStatuses },
      'items.assetUnitId': { $exists: true },
    });
    const materialIds = await AssetUnitModel.distinct('materialId', {
      status: {
        $in:
          input.purpose === 'REPAIR'
            ? movableAssetStatuses
            : eligibleGatePassAssetStatuses(input.purpose),
      },
      ...(activeUnitIds.length ? { _id: { $nin: activeUnitIds } } : {}),
    });
    baseFilter._id = { $in: materialIds };
  }
  const categoryFilter = { ...baseFilter };
  if (input.category) baseFilter.category = input.category;
  if (input.search) {
    const search = escapedSearch(input.search);
    baseFilter.$or = [
      { name: search },
      { materialCode: search },
      { category: search },
      { typeModelName: search },
    ];
  }
  const [materials, total, categories] = await Promise.all([
    MaterialModel.find(baseFilter)
      .sort({ category: 1, name: 1, materialCode: 1 })
      .skip((input.page - 1) * input.pageSize)
      .limit(input.pageSize)
      .lean(),
    MaterialModel.countDocuments(baseFilter),
    MaterialModel.distinct('category', categoryFilter),
  ]);
  return {
    data: materials.map((material) => ({
      materialCode: material.materialCode,
      name: material.name,
      category: material.category,
      model: material.typeModelName ?? null,
      trackingMode: material.trackingMode,
      returnPolicy: material.returnPolicy,
      availableQuantity: material.availableQuantity,
      totalQuantity: material.totalQuantity,
      unitLabel: material.unitLabel ?? null,
    })),
    total,
    totalPages: total ? Math.ceil(total / input.pageSize) : 0,
    categories: categories.sort((left, right) => left.localeCompare(right)),
  };
}

export async function listGatePassAssetOptions(input: {
  materialCode: string;
  purpose: 'REPAIR' | 'OTHER';
  conditionType?: RepairConditionType;
  search?: string;
}) {
  const material = await MaterialModel.findOne({ materialCode: input.materialCode }).lean();
  if (!material)
    throw new AppError(404, 'MATERIAL_NOT_FOUND', 'The selected material was not found.');
  if (material.trackingMode !== 'SERIALIZED') {
    throw new AppError(
      409,
      'GATE_PASS_ASSET_OPTIONS_NOT_SERIALIZED',
      'Asset selection is available only for IT Assets.',
    );
  }
  const activeUnitIds = await InventoryGatePassModel.distinct('items.assetUnitId', {
    status: { $in: activeStatuses },
    'items.assetUnitId': { $exists: true },
  });
  const filter: Record<string, unknown> = {
    materialId: material._id,
    status: {
      $in:
        input.purpose === 'REPAIR'
          ? movableAssetStatuses
          : eligibleGatePassAssetStatuses(input.purpose),
    },
    ...(activeUnitIds.length ? { _id: { $nin: activeUnitIds } } : {}),
  };
  if (input.search) {
    const search = escapedSearch(input.search);
    filter.$or = [{ assetTag: search }, { serialNumber: search }, { condition: search }];
  }
  const [units, total] = await Promise.all([
    AssetUnitModel.find(filter).sort({ assetTag: 1 }).limit(100).lean(),
    AssetUnitModel.countDocuments(filter),
  ]);
  return {
    data: units.map((unit) => ({
      assetTag: unit.assetTag,
      serialNumber: unit.serialNumber ?? null,
      condition: unit.condition,
      status: unit.status as 'AVAILABLE' | 'RETURNED' | 'UNDER_REPAIR' | 'DAMAGED',
    })),
    total,
  };
}

export async function listInventoryGatePasses(input: {
  page: number;
  pageSize: number;
  status?: string;
  statuses?: string[];
  purpose?: string;
  trackingMode?: 'SERIALIZED' | 'QUANTITY';
  ownerUserId?: string;
  search?: string;
}) {
  const filter: Record<string, unknown> = {};
  if (input.ownerUserId) filter['createdBy.userId'] = new Types.ObjectId(input.ownerUserId);
  if (input.status) filter.status = input.status;
  else if (input.statuses?.length) filter.status = { $in: input.statuses };
  if (input.purpose) filter.purpose = input.purpose;
  if (input.trackingMode) filter['items.trackingMode'] = input.trackingMode;
  if (input.search) {
    const value = new RegExp(input.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { gatePassNumber: value },
      { issueId: value },
      { 'destination.name': value },
      { 'carrier.name': value },
      { 'items.assetTag': value },
      { 'items.serialNumber': value },
    ];
  }
  const [records, total] = await Promise.all([
    InventoryGatePassModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((input.page - 1) * input.pageSize)
      .limit(input.pageSize),
    InventoryGatePassModel.countDocuments(filter),
  ]);
  return {
    data: records.map(toDto),
    total,
    totalPages: total ? Math.ceil(total / input.pageSize) : 0,
  };
}
export async function getInventoryGatePass(
  number: string,
  ownerUserId?: string,
): Promise<InventoryGatePass> {
  const pass = await InventoryGatePassModel.findOne({
    gatePassNumber: number,
    ...(ownerUserId ? { 'createdBy.userId': new Types.ObjectId(ownerUserId) } : {}),
  });
  if (!pass) throw new AppError(404, 'GATE_PASS_NOT_FOUND', 'This Gate Pass was not found.');
  return toDto(pass);
}

export async function updateReadyGatePass(
  number: string,
  input: UpdateInventoryGatePassRequest,
  actor: GatePassActor,
): Promise<InventoryGatePass> {
  const pass = await InventoryGatePassModel.findOne({ gatePassNumber: number });
  if (!pass) throw new AppError(404, 'GATE_PASS_NOT_FOUND', 'This Gate Pass was not found.');
  if (pass.status !== 'READY_FOR_OUT')
    throw new AppError(
      409,
      'GATE_PASS_CANNOT_EDIT',
      'Only a Gate Pass waiting for Gate Out can be edited.',
    );
  if (input.destination)
    pass.destination = {
      name: input.destination.name,
      ...(input.destination.organization ? { organization: input.destination.organization } : {}),
      ...(input.destination.address ? { address: input.destination.address } : {}),
      ...(input.destination.contact ? { contact: input.destination.contact } : {}),
    };
  if (input.carrier)
    pass.carrier = {
      name: input.carrier.name,
      ...(input.carrier.contact ? { contact: input.carrier.contact } : {}),
      ...(input.carrier.vehicleNumber ? { vehicleNumber: input.carrier.vehicleNumber } : {}),
    };
  if (input.expectedGateInAt === null) pass.set('expectedGateInAt', undefined);
  else if (input.expectedGateInAt) pass.expectedGateInAt = new Date(input.expectedGateInAt);
  if (input.remarks === null) pass.set('remarks', undefined);
  else if (input.remarks !== undefined) pass.remarks = input.remarks;
  await pass.save();
  await appendAuditEvent({
    requestId: actor.requestId,
    actorUserId: actor.userId,
    actorWorkerId: actor.workerId,
    actorRole: actor.role,
    action: 'INVENTORY_GATE_PASS_UPDATED',
    targetType: 'INVENTORY_GATE_PASS',
    targetId: number,
    result: 'SUCCESS',
  });
  return toDto(pass);
}

export async function recordGateOut(
  number: string,
  actor: GatePassActor,
): Promise<InventoryGatePass> {
  const snapshot = await actorSnapshot(actor);
  const session = await mongoose.startSession();
  let savedPass: InventoryGatePassRecord | null = null;
  try {
    await session.withTransaction(async () => {
      const pass = await InventoryGatePassModel.findOne({ gatePassNumber: number }).session(
        session,
      );
      if (!pass) throw new AppError(404, 'GATE_PASS_NOT_FOUND', 'This Gate Pass was not found.');
      if (pass.status !== 'READY_FOR_OUT')
        throw new AppError(
          409,
          'GATE_PASS_NOT_READY',
          'Only a Gate Pass ready for Gate Out can leave the university.',
        );
      if (pass.source === 'MANUAL') {
        for (const item of pass.items) {
          if (item.trackingMode === 'SERIALIZED') {
            if (!item.assetUnitId || item.returnRequirement !== 'RETURNABLE')
              throw new AppError(
                409,
                'SERIALIZED_GATE_PASS_MUST_RETURN',
                `${item.materialName} must be returnable through Gate Pass In.`,
              );
            let statusOut:
              NonNullable<InventoryGatePassRecord['items'][number]['assetStatusOut']> | undefined =
              item.assetStatusOut;
            if (!statusOut) {
              const legacyUnit = await AssetUnitModel.findOne({
                _id: item.assetUnitId,
                status: { $in: movableAssetStatuses },
              })
                .session(session)
                .lean();
              if (!legacyUnit)
                throw new AppError(
                  409,
                  'ASSET_GATE_OUT_STATE_CHANGED',
                  `${item.assetTag ?? item.materialName} is no longer eligible for Gate Out.`,
                );
              const legacyStatus = legacyUnit.status as NonNullable<
                InventoryGatePassRecord['items'][number]['assetStatusOut']
              >;
              statusOut = legacyStatus;
              item.assetStatusOut = legacyStatus;
            }
            const unitUpdate = await AssetUnitModel.updateOne(
              {
                _id: item.assetUnitId,
                status: statusOut,
              },
              { $set: { status: 'OUTSIDE' } },
              { session },
            );
            if (unitUpdate.modifiedCount !== 1)
              throw new AppError(
                409,
                'ASSET_GATE_OUT_STATE_CHANGED',
                `${item.assetTag ?? item.materialName} is no longer eligible for Gate Out. Refresh and try again.`,
              );
            if (statusOut === 'AVAILABLE') {
              const materialUpdate = await MaterialModel.updateOne(
                { _id: item.materialId, availableQuantity: { $gte: 1 } },
                { $inc: { availableQuantity: -1 } },
                { session },
              );
              if (materialUpdate.modifiedCount !== 1)
                throw new AppError(
                  409,
                  'ASSET_AVAILABILITY_RECONCILIATION_FAILED',
                  `${item.materialName} availability could not be reserved.`,
                );
            }
            continue;
          }
          const update = {
            $inc: quantityGateOutAdjustment(item.quantity, item.returnRequirement),
          };
          const result = await MaterialModel.updateOne(
            { _id: item.materialId, availableQuantity: { $gte: item.quantity } },
            update,
            { session },
          );
          if (result.modifiedCount !== 1) {
            throw new AppError(
              409,
              'INSUFFICIENT_AVAILABLE_QUANTITY',
              `${item.materialName} no longer has ${item.quantity} ${item.unitLabel ?? 'units'} available. Refresh and try again.`,
            );
          }
        }
      }
      pass.gateOut = { at: new Date(), by: snapshot };
      const hasReturnable = pass.items.some((item) => item.returnRequirement === 'RETURNABLE');
      pass.status = hasReturnable ? 'OUTSIDE' : 'CLOSED_NON_RETURNABLE';
      for (const item of pass.items)
        item.remainingOutsideQuantity = item.returnRequirement === 'RETURNABLE' ? item.quantity : 0;
      await pass.save({ session });
      savedPass = pass;
    });
  } finally {
    await session.endSession();
  }
  if (!savedPass) throw new Error('Gate Out transaction completed without a Gate Pass.');
  await appendAuditEvent({
    requestId: actor.requestId,
    actorUserId: actor.userId,
    actorWorkerId: actor.workerId,
    actorRole: actor.role,
    action: 'INVENTORY_GATE_PASS_OUT_RECORDED',
    targetType: 'INVENTORY_GATE_PASS',
    targetId: number,
    result: 'SUCCESS',
  });
  return toDto(savedPass);
}

export async function recordGateIn(
  number: string,
  input: RecordInventoryGateInRequest,
  actor: GatePassActor,
): Promise<InventoryGatePass> {
  const snapshot = await actorSnapshot(actor);
  const session = await mongoose.startSession();
  let savedPass: InventoryGatePassRecord | null = null;
  let pending = false;
  try {
    await session.withTransaction(async () => {
      const pass = await InventoryGatePassModel.findOne({ gatePassNumber: number }).session(
        session,
      );
      if (!pass) throw new AppError(404, 'GATE_PASS_NOT_FOUND', 'This Gate Pass was not found.');
      if (!['OUTSIDE', 'PARTIALLY_IN'].includes(pass.status))
        throw new AppError(
          409,
          'GATE_PASS_NOT_OUTSIDE',
          'Gate In is available only for material recorded outside the university.',
        );
      for (const received of input.items) {
        const item = pass.items.find((entry) => entry.itemId === received.itemId);
        if (!item || item.returnRequirement !== 'RETURNABLE')
          throw new AppError(
            400,
            'GATE_IN_ITEM_INVALID',
            'One selected item is not pending Gate In.',
          );
        if (received.quantity > item.remainingOutsideQuantity)
          throw new AppError(
            409,
            'GATE_IN_QUANTITY_EXCEEDED',
            `${item.materialName} has only ${item.remainingOutsideQuantity} pending.`,
          );
        item.receivedQuantity += received.quantity;
        item.remainingOutsideQuantity -= received.quantity;
        if (pass.source === 'MANUAL' && item.trackingMode === 'QUANTITY') {
          const result = await MaterialModel.updateOne(
            { _id: item.materialId, issuedQuantity: { $gte: received.quantity } },
            { $inc: quantityGateInAdjustment(received.quantity) },
            { session },
          );
          if (result.modifiedCount !== 1)
            throw new AppError(
              409,
              'GATE_IN_STOCK_RECONCILIATION_FAILED',
              `${item.materialName} stock could not be reconciled. No Gate In was recorded.`,
            );
        }
        if (item.assetUnitId && pass.source === 'MANUAL') {
          const status =
            received.outcome === 'DAMAGED'
              ? 'DAMAGED'
              : received.outcome === 'STILL_FAULTY'
                ? 'UNDER_REPAIR'
                : 'AVAILABLE';
          if (received.outcome === 'REPLACED' && received.replacementSerialNumber) {
            const normalizedSerial = received.replacementSerialNumber
              .trim()
              .toLocaleUpperCase('en-US');
            const duplicateSerial = await AssetUnitModel.exists({
              _id: { $ne: item.assetUnitId },
              serialNumberNormalized: normalizedSerial,
            }).session(session);
            if (duplicateSerial)
              throw new AppError(
                409,
                'SERIAL_NUMBER_ALREADY_EXISTS',
                'The replacement serial number already belongs to another asset.',
              );
          }
          const unitUpdate = await AssetUnitModel.updateOne(
            { _id: item.assetUnitId, status: 'OUTSIDE' },
            {
              $set: {
                status,
                condition: received.condition,
                ...(received.outcome === 'REPLACED' && received.replacementSerialNumber
                  ? {
                      serialNumber: received.replacementSerialNumber,
                      serialNumberNormalized: received.replacementSerialNumber
                        .trim()
                        .toLocaleUpperCase('en-US'),
                    }
                  : {}),
              },
            },
            { session },
          );
          if (unitUpdate.modifiedCount !== 1)
            throw new AppError(
              409,
              'ASSET_GATE_IN_STATE_CHANGED',
              `${item.assetTag ?? item.materialName} is no longer marked outside. No Gate In was recorded.`,
            );
          if (status === 'AVAILABLE') {
            const materialUpdate = await MaterialModel.updateOne(
              { _id: item.materialId },
              { $inc: { availableQuantity: 1 } },
              { session },
            );
            if (materialUpdate.modifiedCount !== 1)
              throw new AppError(
                409,
                'ASSET_AVAILABILITY_RECONCILIATION_FAILED',
                `${item.materialName} availability could not be restored. No Gate In was recorded.`,
              );
          }
        }
      }
      const eventItems = input.items.map((item) => ({
        itemId: item.itemId,
        quantity: item.quantity,
        condition: item.condition,
        outcome: item.outcome,
        ...(item.replacementSerialNumber
          ? { replacementSerialNumber: item.replacementSerialNumber }
          : {}),
        ...(item.remarks ? { remarks: item.remarks } : {}),
      }));
      pass.gateInEvents.push({
        eventId: randomUUID(),
        receivedAt: new Date(),
        receivedBy: snapshot,
        ...(input.personReturning ? { personReturning: input.personReturning } : {}),
        ...(input.remarks ? { remarks: input.remarks } : {}),
        items: eventItems,
      });
      pending = pass.items.some((item) => item.remainingOutsideQuantity > 0);
      pass.status = pending ? 'PARTIALLY_IN' : 'GATE_IN_COMPLETED';
      await pass.save({ session });
      savedPass = pass;
    });
  } finally {
    await session.endSession();
  }
  if (!savedPass) throw new Error('Gate In transaction completed without a Gate Pass.');
  await appendAuditEvent({
    requestId: actor.requestId,
    actorUserId: actor.userId,
    actorWorkerId: actor.workerId,
    actorRole: actor.role,
    action: pending
      ? 'INVENTORY_GATE_PASS_PARTIAL_IN_RECORDED'
      : 'INVENTORY_GATE_PASS_IN_COMPLETED',
    targetType: 'INVENTORY_GATE_PASS',
    targetId: number,
    result: 'SUCCESS',
  });
  return toDto(savedPass);
}

export async function cancelGatePass(
  number: string,
  reason: string,
  actor: GatePassActor,
): Promise<InventoryGatePass> {
  const pass = await InventoryGatePassModel.findOne({ gatePassNumber: number });
  if (!pass) throw new AppError(404, 'GATE_PASS_NOT_FOUND', 'This Gate Pass was not found.');
  if (pass.status !== 'READY_FOR_OUT')
    throw new AppError(
      409,
      'GATE_PASS_CANNOT_CANCEL',
      'Only a Gate Pass waiting for Gate Out can be cancelled.',
    );
  pass.status = 'CANCELLED';
  pass.remarks = [pass.remarks, `Cancellation: ${reason}`].filter(Boolean).join('\n');
  await pass.save();
  await appendAuditEvent({
    requestId: actor.requestId,
    actorUserId: actor.userId,
    actorWorkerId: actor.workerId,
    actorRole: actor.role,
    action: 'INVENTORY_GATE_PASS_CANCELLED',
    targetType: 'INVENTORY_GATE_PASS',
    targetId: number,
    result: 'SUCCESS',
    metadata: { reason },
  });
  return toDto(pass);
}

export async function findOutsideGatePassForAssets(assetTags: string[]): Promise<string | null> {
  const pass = await InventoryGatePassModel.findOne({
    status: { $in: ['OUTSIDE', 'PARTIALLY_IN'] },
    items: { $elemMatch: { assetTag: { $in: assetTags }, remainingOutsideQuantity: { $gt: 0 } } },
  })
    .select('gatePassNumber')
    .lean();
  return pass?.gatePassNumber ?? null;
}
export async function findOutsideGatePassForIssueReturn(
  issueId: string,
  assetTags: string[],
  materialCodes: string[],
): Promise<string | null> {
  const itemClauses: Array<Record<string, unknown>> = [];
  if (assetTags.length)
    itemClauses.push({ assetTag: { $in: assetTags }, remainingOutsideQuantity: { $gt: 0 } });
  if (materialCodes.length)
    itemClauses.push({
      trackingMode: 'QUANTITY',
      materialCode: { $in: materialCodes },
      remainingOutsideQuantity: { $gt: 0 },
    });
  if (!itemClauses.length) return null;
  const pass = await InventoryGatePassModel.findOne({
    issueId,
    status: { $in: ['OUTSIDE', 'PARTIALLY_IN'] },
    items: { $elemMatch: { $or: itemClauses } },
  })
    .select('gatePassNumber')
    .lean();
  return pass?.gatePassNumber ?? null;
}
