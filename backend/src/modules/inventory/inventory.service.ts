import mongoose, { Types } from 'mongoose';

import type {
  AdjustQuantityRequest,
  AssetUnit,
  AssetUnitStatus,
  CreateAssetUnitRequest,
  CreateMaterialRequest,
  ManualAssetUnitStatus,
  Material,
  MaterialStatus,
  ReturnPolicy,
  TrackingMode,
  UpdateAssetUnitRequest,
  UpdateMaterialRequest,
  UserRole,
} from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import { IssueModel } from '../issues/issue.model.js';
import { AssetUnitModel } from './asset-unit.model.js';
import { allocateAssetTag, allocateMaterialCode } from './inventory-id.js';
import { toAssetUnit, toMaterial } from './inventory.mapper.js';
import { MaterialModel, type MaterialDocument } from './material.model.js';

const MAX_IDENTIFIER_COLLISION_ATTEMPTS = 32;
const MAX_QUANTITY = 1_000_000_000;

interface DuplicateKeyError {
  code?: unknown;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
}

export interface MaterialListInput {
  page: number;
  pageSize: number;
  role: UserRole;
  search?: string;
  status?: MaterialStatus;
  trackingMode?: TrackingMode;
  returnPolicy?: ReturnPolicy;
  assignmentType?: 'LONG_TERM' | 'SHORT_TERM';
  stockState?: 'IN_STOCK' | 'OUT_OF_STOCK';
  category?: string;
}

export interface MaterialListResult {
  materials: Material[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AssetUnitListInput {
  materialCode: string;
  page: number;
  pageSize: number;
  role: UserRole;
  search?: string;
  status?: AssetUnitStatus;
}

export interface AssetUnitListResult {
  units: AssetUnit[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AssetUnitMutationResult {
  unit: AssetUnit;
  material: Material;
}

export interface QuantityAdjustmentResult {
  material: Material;
  adjustment: {
    quantityDelta: number;
    reason: string;
    previousTotalQuantity: number;
    previousAvailableQuantity: number;
  };
}

function duplicateKey(error: unknown): DuplicateKeyError | null {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as DuplicateKeyError;
  return candidate.code === 11_000 ? candidate : null;
}

function duplicateField(error: unknown): string | undefined {
  const duplicate = duplicateKey(error);
  if (!duplicate) return undefined;
  return Object.keys(duplicate.keyPattern ?? duplicate.keyValue ?? {})[0];
}

function escapeSearchRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactCaseInsensitive(value: string): RegExp {
  return new RegExp(`^${escapeSearchRegex(value)}$`, 'i');
}

function materialNotFound(): AppError {
  return new AppError(404, 'MATERIAL_NOT_FOUND', 'This material was not found.');
}

function assetUnitNotFound(): AppError {
  return new AppError(404, 'ASSET_UNIT_NOT_FOUND', 'This asset unit was not found.');
}

function serialConflict(): AppError {
  return new AppError(
    409,
    'ASSET_SERIAL_EXISTS',
    'An asset unit with this serial number already exists.',
    { serialNumber: 'Use a unique serial number.' },
  );
}

export function translateAssetUnitDuplicateError(error: unknown): AppError | null {
  return duplicateField(error) === 'serialNumberNormalized' ? serialConflict() : null;
}

function objectId(value: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) throw new TypeError('Invalid authenticated user ID.');
  return new Types.ObjectId(value);
}

function normalizeSerial(serialNumber: string): string {
  return serialNumber.trim().toLocaleUpperCase('en-US');
}

async function findMaterialRecord(materialCode: string): Promise<MaterialDocument> {
  const material = await MaterialModel.findOne({ materialCode });
  if (!material) throw materialNotFound();
  return material;
}

async function findActiveSerializedMaterial(materialCode: string): Promise<MaterialDocument> {
  const material = await findMaterialRecord(materialCode);
  if (material.status !== 'ACTIVE') {
    throw new AppError(409, 'MATERIAL_ARCHIVED', 'Reactivate this material before changing units.');
  }
  if (material.trackingMode !== 'SERIALIZED') {
    throw new AppError(
      409,
      'MATERIAL_NOT_SERIALIZED',
      'Asset units can only be managed for serialized material.',
    );
  }
  return material;
}

export function buildMaterialListFilter(input: MaterialListInput): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (input.role === 'WORKER') filter.status = 'ACTIVE';
  else if (input.status) filter.status = input.status;
  if (input.trackingMode) filter.trackingMode = input.trackingMode;
  if (input.returnPolicy) filter.returnPolicy = input.returnPolicy;
  if (input.assignmentType) filter.assignmentTypes = input.assignmentType;
  if (input.stockState === 'IN_STOCK') filter.availableQuantity = { $gt: 0 };
  if (input.stockState === 'OUT_OF_STOCK') filter.availableQuantity = 0;
  if (input.category) filter.category = exactCaseInsensitive(input.category);
  if (input.search) {
    const search = new RegExp(escapeSearchRegex(input.search), 'i');
    filter.$or = [
      { materialCode: search },
      { name: search },
      { category: search },
      { description: search },
    ];
  }
  return filter;
}

export function buildAssetUnitListFilter(input: {
  materialId: Types.ObjectId | string;
  role: UserRole;
  search?: string;
  status?: AssetUnitStatus;
}): Record<string, unknown> {
  const filter: Record<string, unknown> = { materialId: input.materialId };
  if (input.role === 'WORKER') filter.status = 'AVAILABLE';
  else if (input.status) filter.status = input.status;
  if (input.search) {
    const search = new RegExp(escapeSearchRegex(input.search), 'i');
    filter.$or = [{ assetTag: search }, { serialNumber: search }, { condition: search }];
  }
  return filter;
}

export function assertMaterialCanArchive(
  material: Pick<
    MaterialDocument,
    'trackingMode' | 'totalQuantity' | 'availableQuantity' | 'issuedQuantity'
  >,
  hasIssuedUnit: boolean,
): void {
  if (
    material.trackingMode === 'QUANTITY' &&
    material.totalQuantity !== material.availableQuantity
  ) {
    throw new AppError(
      409,
      'MATERIAL_HAS_ISSUED_STOCK',
      'Return all issued quantity before archiving this material.',
    );
  }
  if (material.trackingMode === 'SERIALIZED' && (material.issuedQuantity > 0 || hasIssuedUnit)) {
    throw new AppError(
      409,
      'MATERIAL_HAS_ISSUED_UNITS',
      'Return all issued asset units before archiving this material.',
    );
  }
}

export function calculateQuantityAdjustment(
  material: Pick<MaterialDocument, 'totalQuantity' | 'availableQuantity' | 'issuedQuantity'>,
  quantityDelta: number,
): { totalQuantity: number; availableQuantity: number } {
  const totalQuantity = material.totalQuantity + quantityDelta;
  const availableQuantity = material.availableQuantity + quantityDelta;
  if (totalQuantity < material.issuedQuantity || availableQuantity < 0) {
    throw new AppError(
      409,
      'QUANTITY_ADJUSTMENT_BELOW_ISSUED_STOCK',
      'This adjustment would remove stock that is currently issued.',
    );
  }
  if (totalQuantity > MAX_QUANTITY || availableQuantity > MAX_QUANTITY) {
    throw new AppError(
      409,
      'QUANTITY_LIMIT_EXCEEDED',
      'The adjusted quantity exceeds the supported inventory limit.',
    );
  }
  return { totalQuantity, availableQuantity };
}

export async function createMaterial(
  input: CreateMaterialRequest,
  createdByUserId: string,
): Promise<Material> {
  const createdBy = objectId(createdByUserId);

  for (let attempt = 0; attempt < MAX_IDENTIFIER_COLLISION_ATTEMPTS; attempt += 1) {
    const materialCode = await allocateMaterialCode();
    try {
      const initialQuantity = input.trackingMode === 'QUANTITY' ? input.totalQuantity : 0;
      const material = await MaterialModel.create({
        materialCode,
        name: input.name,
        category: input.category,
        ...(input.description ? { description: input.description } : {}),
        trackingMode: input.trackingMode,
        returnPolicy: input.returnPolicy,
        assignmentTypes: input.assignmentTypes,
        status: 'ACTIVE',
        totalQuantity: initialQuantity,
        availableQuantity: initialQuantity,
        issuedQuantity: 0,
        ...(input.trackingMode === 'QUANTITY' ? { unitLabel: input.unitLabel } : {}),
        createdBy,
      });
      return toMaterial(material);
    } catch (error) {
      if (duplicateField(error) === 'materialCode') continue;
      throw error;
    }
  }

  throw new AppError(
    503,
    'MATERIAL_CODE_UNAVAILABLE',
    'A unique material code could not be allocated. Try again.',
  );
}

export async function listMaterials(input: MaterialListInput): Promise<MaterialListResult> {
  const filter = buildMaterialListFilter(input);

  const skip = (input.page - 1) * input.pageSize;
  const [records, total] = await Promise.all([
    MaterialModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(input.pageSize),
    MaterialModel.countDocuments(filter),
  ]);

  return {
    materials: records.map((record) => toMaterial(record)),
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
}

export async function getMaterial(materialCode: string, role: UserRole): Promise<Material> {
  const filter: Record<string, unknown> = { materialCode };
  if (role === 'WORKER') filter.status = 'ACTIVE';
  const material = await MaterialModel.findOne(filter);
  if (!material) throw materialNotFound();
  return toMaterial(material);
}

export async function updateMaterial(
  materialCode: string,
  input: UpdateMaterialRequest,
): Promise<Material> {
  const session = await mongoose.startSession();
  let updatedMaterial: MaterialDocument | undefined;

  try {
    await session.withTransaction(async () => {
      const material = await MaterialModel.findOne({ materialCode }).session(session);
      if (!material) throw materialNotFound();

      if (input.returnPolicy !== undefined && input.returnPolicy !== material.returnPolicy) {
        if (material.trackingMode === 'SERIALIZED' && input.returnPolicy !== 'REUSABLE') {
          throw new AppError(
            409,
            'SERIALIZED_MATERIAL_MUST_BE_REUSABLE',
            'Serialized material must use the reusable return policy.',
          );
        }
        if (material.issuedQuantity > 0) {
          throw new AppError(
            409,
            'MATERIAL_HAS_ISSUED_STOCK',
            'The return policy cannot change while stock is issued.',
          );
        }
        material.returnPolicy = input.returnPolicy;
      }

      if (input.unitLabel !== undefined) {
        if (material.trackingMode !== 'QUANTITY') {
          throw new AppError(
            409,
            'SERIALIZED_MATERIAL_HAS_NO_UNIT_LABEL',
            'A unit label only applies to quantity-tracked material.',
          );
        }
        material.unitLabel = input.unitLabel;
      }
      if (input.name !== undefined) material.name = input.name;
      if (input.category !== undefined) material.category = input.category;
      if (input.assignmentTypes !== undefined) material.assignmentTypes = input.assignmentTypes;
      if (Object.hasOwn(input, 'description')) {
        material.set('description', input.description ?? undefined);
      }

      await material.save({ session });
      updatedMaterial = material;
    });
  } finally {
    await session.endSession();
  }

  if (!updatedMaterial) {
    throw new AppError(500, 'MATERIAL_UPDATE_FAILED', 'The material could not be updated.');
  }
  return toMaterial(updatedMaterial);
}

export async function updateMaterialStatus(
  materialCode: string,
  status: MaterialStatus,
): Promise<{ material: Material; previousStatus: MaterialStatus }> {
  const session = await mongoose.startSession();
  let updatedMaterial: MaterialDocument | undefined;
  let previousStatus: MaterialStatus | undefined;

  try {
    await session.withTransaction(async () => {
      const material = await MaterialModel.findOne({ materialCode }).session(session);
      if (!material) throw materialNotFound();
      previousStatus = material.status;

      if (status === 'ARCHIVED' && status !== material.status) {
        let hasIssuedUnit = false;
        if (material.trackingMode === 'SERIALIZED') {
          hasIssuedUnit = Boolean(
            await AssetUnitModel.exists({ materialId: material._id, status: 'ISSUED' }).session(
              session,
            ),
          );
        }
        assertMaterialCanArchive(material, hasIssuedUnit);
      }

      if (material.status !== status) {
        material.status = status;
        await material.save({ session });
      }
      updatedMaterial = material;
    });
  } finally {
    await session.endSession();
  }

  if (!updatedMaterial || previousStatus === undefined) {
    throw new AppError(
      500,
      'MATERIAL_STATUS_UPDATE_FAILED',
      'The material status could not be updated.',
    );
  }
  return { material: toMaterial(updatedMaterial), previousStatus };
}

export async function deleteMaterial(materialCode: string): Promise<Material> {
  const session = await mongoose.startSession();
  let deletedMaterial: Material | undefined;

  try {
    await session.withTransaction(async () => {
      const material = await MaterialModel.findOne({ materialCode }).session(session);
      if (!material) throw materialNotFound();

      const [hasIssueHistory, hasIssuedUnit] = await Promise.all([
        IssueModel.exists({ 'lines.material.materialCode': materialCode }).session(session),
        material.trackingMode === 'SERIALIZED'
          ? AssetUnitModel.exists({ materialId: material._id, status: 'ISSUED' }).session(session)
          : Promise.resolve(null),
      ]);

      if (hasIssueHistory) {
        throw new AppError(
          409,
          'MATERIAL_HAS_ISSUE_HISTORY',
          'This material has Issue history. Archive it instead of deleting.',
        );
      }
      if (material.issuedQuantity > 0 || hasIssuedUnit) {
        throw new AppError(
          409,
          'MATERIAL_HAS_ISSUED_STOCK',
          'Return all issued stock before deleting this material.',
        );
      }

      deletedMaterial = toMaterial(material);
      await AssetUnitModel.deleteMany({ materialId: material._id }).session(session);
      await MaterialModel.deleteOne({ _id: material._id }).session(session);
    });
  } finally {
    await session.endSession();
  }

  if (!deletedMaterial) {
    throw new AppError(500, 'MATERIAL_DELETE_FAILED', 'The material could not be deleted.');
  }
  return deletedMaterial;
}

export async function adjustQuantity(
  materialCode: string,
  input: AdjustQuantityRequest,
): Promise<QuantityAdjustmentResult> {
  const session = await mongoose.startSession();
  let updatedMaterial: MaterialDocument | undefined;
  let previousTotalQuantity = 0;
  let previousAvailableQuantity = 0;

  try {
    await session.withTransaction(async () => {
      const material = await MaterialModel.findOne({ materialCode }).session(session);
      if (!material) throw materialNotFound();
      if (material.trackingMode !== 'QUANTITY') {
        throw new AppError(
          409,
          'MATERIAL_NOT_QUANTITY_TRACKED',
          'Quantity adjustments only apply to quantity-tracked material.',
        );
      }
      if (material.status !== 'ACTIVE') {
        throw new AppError(
          409,
          'MATERIAL_ARCHIVED',
          'Reactivate this material before adjusting quantity.',
        );
      }

      const next = calculateQuantityAdjustment(material, input.quantityDelta);

      previousTotalQuantity = material.totalQuantity;
      previousAvailableQuantity = material.availableQuantity;
      material.totalQuantity = next.totalQuantity;
      material.availableQuantity = next.availableQuantity;
      await material.save({ session });
      updatedMaterial = material;
    });
  } finally {
    await session.endSession();
  }

  if (!updatedMaterial) {
    throw new AppError(500, 'QUANTITY_ADJUSTMENT_FAILED', 'The quantity could not be adjusted.');
  }
  return {
    material: toMaterial(updatedMaterial),
    adjustment: {
      quantityDelta: input.quantityDelta,
      reason: input.reason,
      previousTotalQuantity,
      previousAvailableQuantity,
    },
  };
}

export async function listAssetUnits(input: AssetUnitListInput): Promise<AssetUnitListResult> {
  const materialFilter: Record<string, unknown> = { materialCode: input.materialCode };
  if (input.role === 'WORKER') materialFilter.status = 'ACTIVE';
  const material = await MaterialModel.findOne(materialFilter);
  if (!material) throw materialNotFound();
  if (material.trackingMode !== 'SERIALIZED') {
    throw new AppError(
      409,
      'MATERIAL_NOT_SERIALIZED',
      'Asset units are only available for serialized material.',
    );
  }

  const filter = buildAssetUnitListFilter({
    materialId: material._id,
    role: input.role,
    ...(input.search ? { search: input.search } : {}),
    ...(input.status ? { status: input.status } : {}),
  });

  const skip = (input.page - 1) * input.pageSize;
  const [records, total] = await Promise.all([
    AssetUnitModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(input.pageSize),
    AssetUnitModel.countDocuments(filter),
  ]);
  return {
    units: records.map((record) => toAssetUnit(record)),
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
}

export async function createAssetUnit(
  materialCode: string,
  input: CreateAssetUnitRequest,
  createdByUserId: string,
): Promise<AssetUnitMutationResult> {
  const material = await findActiveSerializedMaterial(materialCode);
  const createdBy = objectId(createdByUserId);
  for (let attempt = 0; attempt < MAX_IDENTIFIER_COLLISION_ATTEMPTS; attempt += 1) {
    const assetTag = await allocateAssetTag();
    const session = await mongoose.startSession();
    let createdUnit: InstanceType<typeof AssetUnitModel> | undefined;
    let updatedMaterial: MaterialDocument | undefined;

    try {
      await session.withTransaction(async () => {
        const currentMaterial = await MaterialModel.findOneAndUpdate(
          { _id: material._id, status: 'ACTIVE', trackingMode: 'SERIALIZED' },
          { $inc: { totalQuantity: 1, availableQuantity: 1 } },
          { returnDocument: 'after', session },
        );
        if (!currentMaterial) {
          throw new AppError(
            409,
            'MATERIAL_NOT_ACTIVE_SERIALIZED',
            'The material is no longer active serialized inventory.',
          );
        }

        const created = await AssetUnitModel.create(
          [
            {
              assetTag,
              materialId: material._id,
              materialCode: material.materialCode,
              ...(input.serialNumber
                ? {
                    serialNumber: input.serialNumber,
                    serialNumberNormalized: normalizeSerial(input.serialNumber),
                  }
                : {}),
              condition: input.condition,
              status: 'AVAILABLE',
              createdBy,
            },
          ],
          { session },
        );
        const unit = created[0];
        if (!unit) throw new Error('Asset unit insert returned no document.');
        createdUnit = unit;
        updatedMaterial = currentMaterial;
      });

      if (!createdUnit || !updatedMaterial) {
        throw new Error('Asset unit transaction completed without a result.');
      }
      return { unit: toAssetUnit(createdUnit), material: toMaterial(updatedMaterial) };
    } catch (error) {
      const field = duplicateField(error);
      if (field === 'assetTag') continue;
      const translated = translateAssetUnitDuplicateError(error);
      if (translated) throw translated;
      throw error;
    } finally {
      await session.endSession();
    }
  }

  throw new AppError(
    503,
    'ASSET_TAG_UNAVAILABLE',
    'A unique asset tag could not be allocated. Try again.',
  );
}

const ALLOWED_MANUAL_STATUS_TRANSITIONS: Record<
  ManualAssetUnitStatus,
  ReadonlySet<ManualAssetUnitStatus>
> = {
  AVAILABLE: new Set(['UNDER_REPAIR', 'DAMAGED', 'LOST', 'SCRAPPED']),
  RETURNED: new Set(['AVAILABLE', 'UNDER_REPAIR', 'DAMAGED', 'LOST', 'SCRAPPED']),
  UNDER_REPAIR: new Set(['AVAILABLE', 'SCRAPPED']),
  DAMAGED: new Set(['AVAILABLE', 'SCRAPPED']),
  LOST: new Set(['AVAILABLE', 'SCRAPPED']),
  SCRAPPED: new Set(),
};

export function assertManualTransition(
  currentStatus: AssetUnitStatus,
  requestedStatus: ManualAssetUnitStatus,
): void {
  if (currentStatus === 'ISSUED') {
    throw new AppError(
      409,
      'ISSUED_ASSET_IS_SYSTEM_CONTROLLED',
      'An issued asset unit can only change through the issue and return workflow.',
    );
  }
  if (currentStatus === requestedStatus) return;
  if (!ALLOWED_MANUAL_STATUS_TRANSITIONS[currentStatus].has(requestedStatus)) {
    throw new AppError(
      409,
      currentStatus === 'SCRAPPED'
        ? 'SCRAPPED_ASSET_IS_TERMINAL'
        : 'ASSET_STATUS_TRANSITION_INVALID',
      currentStatus === 'SCRAPPED'
        ? 'A scrapped asset unit cannot return to service.'
        : `An asset unit cannot move from ${currentStatus} to ${requestedStatus}.`,
    );
  }
}

export function manualAvailabilityDelta(
  currentStatus: AssetUnitStatus,
  requestedStatus: ManualAssetUnitStatus,
): number {
  assertManualTransition(currentStatus, requestedStatus);
  if (currentStatus === requestedStatus) return 0;
  if (currentStatus === 'AVAILABLE') return -1;
  if (requestedStatus === 'AVAILABLE') return 1;
  return 0;
}

export async function updateAssetUnit(
  materialCode: string,
  assetTag: string,
  input: UpdateAssetUnitRequest,
): Promise<AssetUnitMutationResult> {
  const material = await findActiveSerializedMaterial(materialCode);
  const session = await mongoose.startSession();
  let updatedUnit: InstanceType<typeof AssetUnitModel> | undefined;
  let updatedMaterial: MaterialDocument | undefined;

  try {
    await session.withTransaction(async () => {
      const unit = await AssetUnitModel.findOne({
        assetTag,
        materialId: material._id,
      }).session(session);
      if (!unit) throw assetUnitNotFound();
      if (unit.status === 'ISSUED') {
        throw new AppError(
          409,
          'ISSUED_ASSET_IS_SYSTEM_CONTROLLED',
          'An issued asset unit can only change through the issue and return workflow.',
        );
      }

      let availabilityDelta = 0;
      if (input.status !== undefined) {
        availabilityDelta = manualAvailabilityDelta(unit.status, input.status);
        if (input.status !== unit.status) {
          unit.status = input.status;
        }
      }
      if (input.condition !== undefined) unit.condition = input.condition;
      if (Object.hasOwn(input, 'serialNumber')) {
        if (input.serialNumber === null) {
          unit.set('serialNumber', undefined);
          unit.set('serialNumberNormalized', undefined);
        } else if (input.serialNumber !== undefined) {
          unit.serialNumber = input.serialNumber;
          unit.serialNumberNormalized = normalizeSerial(input.serialNumber);
        }
      }

      let currentMaterial: MaterialDocument | null;
      if (availabilityDelta === 0) {
        currentMaterial = await MaterialModel.findOne({
          _id: material._id,
          status: 'ACTIVE',
          trackingMode: 'SERIALIZED',
        }).session(session);
      } else {
        const filter: Record<string, unknown> = {
          _id: material._id,
          status: 'ACTIVE',
          trackingMode: 'SERIALIZED',
        };
        if (availabilityDelta < 0) filter.availableQuantity = { $gte: 1 };
        else filter.$expr = { $lt: ['$availableQuantity', '$totalQuantity'] };
        currentMaterial = await MaterialModel.findOneAndUpdate(
          filter,
          { $inc: { availableQuantity: availabilityDelta } },
          { returnDocument: 'after', session },
        );
      }
      if (!currentMaterial) {
        throw new AppError(
          409,
          'INVENTORY_STATE_CONFLICT',
          'The asset state changed while this update was being saved. Try again.',
        );
      }

      await unit.save({ session });
      updatedUnit = unit;
      updatedMaterial = currentMaterial;
    });
  } catch (error) {
    const translated = translateAssetUnitDuplicateError(error);
    if (translated) throw translated;
    throw error;
  } finally {
    await session.endSession();
  }

  if (!updatedUnit || !updatedMaterial) {
    throw new AppError(500, 'ASSET_UNIT_UPDATE_FAILED', 'The asset unit could not be updated.');
  }
  return { unit: toAssetUnit(updatedUnit), material: toMaterial(updatedMaterial) };
}
