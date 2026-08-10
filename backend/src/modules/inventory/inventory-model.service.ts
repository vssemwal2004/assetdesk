import { Types, type ClientSession } from 'mongoose';

import type { InventoryModel, TrackingMode } from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import { AssetDetailModel } from './asset-detail.model.js';
import { InventoryModelModel, type InventoryModelRecord } from './inventory-model.model.js';
import { InventoryImportModel } from './inventory-import.model.js';
import {
  buildMaterialIdentity,
  buildMaterialScopedIdentity,
  materialDisplayName,
} from './inventory-identity.js';
import { MaterialModel } from './material.model.js';

function normalized(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('en-US');
}

export function inventoryModelMatchKey(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .toLocaleUpperCase('en-US');
}

function detailNormalized(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, '').toLocaleUpperCase('en-US');
}

function recordAliases(record: Pick<InventoryModelRecord, 'aliases'>): string[] {
  return record.aliases ?? [];
}

function exactCaseInsensitive(value: string): RegExp {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
}

function modelNamePatterns(names: string[]): RegExp[] {
  return names.map(exactCaseInsensitive);
}

export function buildInventoryModelMaterialFilter(
  category: string,
  names: string[],
  trackingMode: TrackingMode,
): Record<string, unknown> {
  const patterns = modelNamePatterns(names);
  return {
    category: exactCaseInsensitive(category),
    trackingMode,
    $or: [
      { typeModelName: { $in: patterns } },
      { typeModelName: { $exists: false }, name: { $in: patterns } },
      { typeModelName: null, name: { $in: patterns } },
    ],
  };
}

async function findModelNameConflict(
  categoryNormalized: string,
  trackingMode: TrackingMode,
  candidateName: string,
  excludedIds: Types.ObjectId[] = [],
  session?: ClientSession,
): Promise<InventoryModelRecord | null> {
  const records = await InventoryModelModel.find({
    categoryNormalized,
    trackingMode,
    ...(excludedIds.length > 0 ? { _id: { $nin: excludedIds } } : {}),
  })
    .session(session ?? null)
    .lean();
  const candidateKey = inventoryModelMatchKey(candidateName);
  return (
    records.find((record) =>
      [record.name, ...recordAliases(record)].some(
        (value) => inventoryModelMatchKey(value) === candidateKey,
      ),
    ) ?? null
  );
}

async function refreshCategoryModelCache(
  category: string,
  trackingMode: TrackingMode,
  createdBy?: Types.ObjectId,
  session?: ClientSession,
): Promise<void> {
  const models = await InventoryModelModel.find({
    categoryNormalized: normalized(category),
    trackingMode,
  })
    .sort({ name: 1 })
    .select({ name: 1, createdBy: 1 })
    .session(session ?? null)
    .lean();
  const registryCreator = createdBy ?? models[0]?.createdBy;
  const filter = {
    kind: trackingMode === 'SERIALIZED' ? ('ASSET_TYPE' as const) : ('CONSUMABLE_TYPE' as const),
    normalizedName: detailNormalized(category),
  };
  const update = {
    $set: { name: category.trim().replace(/\s+/g, ' '), models: models.map((model) => model.name) },
    ...(registryCreator ? { $setOnInsert: { createdBy: registryCreator } } : {}),
  };
  await AssetDetailModel.updateOne(
    filter,
    update,
    {
      ...(registryCreator ? { upsert: true, setDefaultsOnInsert: true } : {}),
      ...(session ? { session } : {}),
    },
  );
}

export async function reconcileInventoryCategory(
  category: string,
  trackingMode: TrackingMode,
  session?: ClientSession,
): Promise<string | null> {
  const model = await InventoryModelModel.findOne({
    categoryNormalized: normalized(category),
    trackingMode,
  })
    .select({ category: 1, createdBy: 1 })
    .session(session ?? null)
    .lean();
  if (!model) return null;
  await refreshCategoryModelCache(model.category, trackingMode, model.createdBy, session);
  return model.category;
}

async function totals(
  category: string,
  names: string[],
  trackingMode: TrackingMode,
  session?: ClientSession,
) {
  const aggregate = MaterialModel.aggregate<{
    materialCount: number;
    totalQuantity: number;
    availableQuantity: number;
    issuedQuantity: number;
  }>([
    {
      $match: buildInventoryModelMaterialFilter(category, names, trackingMode),
    },
    {
      $group: {
        _id: null,
        materialCount: { $sum: 1 },
        totalQuantity: { $sum: '$totalQuantity' },
        availableQuantity: { $sum: '$availableQuantity' },
        issuedQuantity: { $sum: '$issuedQuantity' },
      },
    },
  ]);
  if (session) aggregate.session(session);
  const rows = await aggregate;
  return rows[0] ?? { materialCount: 0, totalQuantity: 0, availableQuantity: 0, issuedQuantity: 0 };
}

async function relinkModelMaterials(
  category: string,
  trackingMode: TrackingMode,
  previousNames: string[],
  canonical: string,
  session?: ClientSession,
): Promise<number> {
  const materials = await MaterialModel.find(
    buildInventoryModelMaterialFilter(category, previousNames, trackingMode),
  )
    .session(session ?? null)
    .lean();
  if (materials.length === 0) return 0;

  const name = materialDisplayName(category, canonical);
  const updates = materials.map((material) => ({
    id: material._id,
    materialCode: material.materialCode,
    identityKey: buildMaterialIdentity(
      material.trackingMode,
      name,
      material.category,
      material.location ?? '',
      material.block ?? '',
      material.configuration,
    ),
  }));
  const conflictingExistingMaterials = await MaterialModel.find({
    _id: { $nin: updates.map((update) => update.id) },
    identityKey: { $in: updates.map((update) => update.identityKey) },
  })
    .select({ identityKey: 1 })
    .session(session ?? null)
    .lean();
  const existingIdentityKeys = new Set(
    conflictingExistingMaterials
      .map((material) => material.identityKey)
      .filter((identityKey): identityKey is string => Boolean(identityKey)),
  );

  const usedIdentityKeys = new Set(existingIdentityKeys);
  const resolvedUpdates = updates.map((update) => {
    if (!usedIdentityKeys.has(update.identityKey)) {
      usedIdentityKeys.add(update.identityKey);
      return update;
    }
    const scopedIdentityKey = buildMaterialScopedIdentity(update.identityKey, update.materialCode);
    usedIdentityKeys.add(scopedIdentityKey);
    return { ...update, identityKey: scopedIdentityKey };
  });
  if (resolvedUpdates.length !== new Set(resolvedUpdates.map((update) => update.identityKey)).size) {
    throw new AppError(
      409,
      'INVENTORY_MODEL_MERGE_MATERIAL_CONFLICT',
      'The renamed model would duplicate an existing inventory record. Try the merge again.',
    );
  }

  let modifiedCount = 0;
  for (const update of resolvedUpdates) {
    const result = await MaterialModel.updateOne(
      { _id: update.id },
      { $set: { typeModelName: canonical, name, identityKey: update.identityKey } },
      { runValidators: true, ...(session ? { session } : {}) },
    );
    modifiedCount += result.modifiedCount;
  }
  return modifiedCount;
}

async function publicModel(
  record: InventoryModelRecord,
  session?: ClientSession,
): Promise<InventoryModel> {
  const stock = await totals(
    record.category,
    [record.name, ...recordAliases(record)],
    record.trackingMode,
    session,
  );
  return {
    id: record._id.toString(),
    category: record.category,
    name: record.name,
    trackingMode: record.trackingMode,
    aliases: recordAliases(record),
    ...stock,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function updatePendingImports(
  category: string,
  trackingMode: TrackingMode,
  previousNames: string[],
  canonical: string,
  session?: ClientSession,
): Promise<void> {
  const importRecords = await InventoryImportModel.find({
    status: 'PREVIEWED',
    mode: trackingMode,
  }).session(session ?? null);
  const categoryKey = normalized(category);
  const previousKeys = new Set(previousNames.map(normalized));
  for (const importRecord of importRecords) {
    let changed = false;
    for (const row of importRecord.rows) {
      const rowModel = row.typeModelName ?? row.name;
      if (normalized(row.category) === categoryKey && previousKeys.has(normalized(rowModel))) {
        row.name = canonical;
        row.typeModelName = canonical;
        changed = true;
      }
    }
    for (const input of importRecord.inputs) {
      const inputModel = input.typeModelName ?? input.name;
      if (normalized(input.category) === categoryKey && previousKeys.has(normalized(inputModel))) {
        input.typeModelName = canonical;
        input.name = canonical
          .toLocaleLowerCase('en-US')
          .startsWith(category.toLocaleLowerCase('en-US'))
          ? canonical
          : `${category} ${canonical}`;
        changed = true;
      }
    }
    if (changed) await importRecord.save(session ? { session } : undefined);
  }
}

async function syncExistingModels(
  category?: string,
  trackingMode?: TrackingMode,
): Promise<{ discovered: number; added: number }> {
  const rows = await MaterialModel.aggregate<{
    category: string;
    name: string;
    trackingMode: TrackingMode;
    createdBy: Types.ObjectId;
  }>([
    {
      $match: {
        ...(category ? { category: exactCaseInsensitive(category) } : {}),
        ...(trackingMode ? { trackingMode } : {}),
      },
    },
    {
      $group: {
        _id: {
          category: '$category',
          name: { $ifNull: ['$typeModelName', '$name'] },
          trackingMode: '$trackingMode',
        },
        createdBy: { $first: '$createdBy' },
      },
    },
    {
      $project: {
        _id: 0,
        category: '$_id.category',
        name: '$_id.name',
        trackingMode: '$_id.trackingMode',
        createdBy: 1,
      },
    },
  ]);
  const uniqueRows = new Map(
    rows.map((row) => [
      `${normalized(row.category)}|${normalized(row.name)}|${row.trackingMode}`,
      row,
    ]),
  );
  if (uniqueRows.size === 0) return { discovered: 0, added: 0 };
  try {
    const result = await InventoryModelModel.bulkWrite(
      [...uniqueRows.values()].map((row) => ({
        updateOne: {
          filter: {
            categoryNormalized: normalized(row.category),
            nameNormalized: normalized(row.name),
            trackingMode: row.trackingMode,
          },
          update: {
            $setOnInsert: {
              category: row.category,
              name: row.name,
              aliases: [],
              createdBy: row.createdBy,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    return { discovered: uniqueRows.size, added: result.upsertedCount };
  } catch (error) {
    // Concurrent requests can discover and insert the same legacy model. The unique
    // model-master index makes that race harmless.
    if ((error as { code?: number }).code !== 11000) throw error;
    return { discovered: uniqueRows.size, added: 0 };
  }
}

export async function syncAllInventoryModels(): Promise<{
  discovered: number;
  added: number;
  total: number;
}> {
  const result = await syncExistingModels();
  const categories = await InventoryModelModel.aggregate<{
    category: string;
    trackingMode: TrackingMode;
    createdBy: Types.ObjectId;
  }>([
    {
      $group: {
        _id: { category: '$category', trackingMode: '$trackingMode' },
        createdBy: { $first: '$createdBy' },
      },
    },
    {
      $project: {
        _id: 0,
        category: '$_id.category',
        trackingMode: '$_id.trackingMode',
        createdBy: 1,
      },
    },
  ]);
  await Promise.all(
    categories.map(({ category, trackingMode, createdBy }) =>
      refreshCategoryModelCache(category, trackingMode, createdBy),
    ),
  );
  return { ...result, total: await InventoryModelModel.countDocuments() };
}

export async function listInventoryModels(
  category?: string,
  trackingMode?: TrackingMode,
  includeStock = false,
  access?: {
    role: 'ADMIN' | 'WORKER';
    actorUserId: string;
    dataScope: 'OWN' | 'ALL';
  },
): Promise<InventoryModel[]> {
  let records: InventoryModelRecord[];
  try {
    records = await InventoryModelModel.find({
      ...(category ? { categoryNormalized: normalized(category) } : {}),
      ...(trackingMode ? { trackingMode } : {}),
    })
      .sort({ name: 1 })
      .maxTimeMS(5_000)
      .lean();
  } catch (error) {
    if ((error as { code?: number }).code === 50) {
      throw new AppError(
        503,
        'INVENTORY_MODELS_QUERY_TIMEOUT',
        'Model Master database query timed out. Verify the InventoryModel index and try again.',
      );
    }
    throw error;
  }
  if (records.length === 0) return [];

  if (!includeStock) {
    return records.map((record) => ({
      id: record._id.toString(),
      category: record.category,
      name: record.name,
      trackingMode: record.trackingMode,
      aliases: recordAliases(record),
      materialCount: 0,
      totalQuantity: 0,
      availableQuantity: 0,
      issuedQuantity: 0,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    }));
  }

  // Load stock once for the complete result set. The former implementation ran one
  // aggregation per model, which became noticeably slow for large categories.
  const stockRows = await MaterialModel.aggregate<{
    category: string;
    name: string;
    trackingMode: TrackingMode;
    materialCount: number;
    totalQuantity: number;
    availableQuantity: number;
    issuedQuantity: number;
  }>([
    {
      $match: {
        ...(category ? { category: exactCaseInsensitive(category) } : {}),
        ...(trackingMode ? { trackingMode } : {}),
        ...(access?.role === 'WORKER' && access.dataScope !== 'ALL'
          ? { createdBy: new Types.ObjectId(access.actorUserId) }
          : {}),
      },
    },
    {
      $group: {
        _id: {
          category: '$category',
          name: { $ifNull: ['$typeModelName', '$name'] },
          trackingMode: '$trackingMode',
        },
        materialCount: { $sum: 1 },
        totalQuantity: { $sum: '$totalQuantity' },
        availableQuantity: { $sum: '$availableQuantity' },
        issuedQuantity: { $sum: '$issuedQuantity' },
      },
    },
    {
      $project: {
        _id: 0,
        category: '$_id.category',
        name: '$_id.name',
        trackingMode: '$_id.trackingMode',
        materialCount: 1,
        totalQuantity: 1,
        availableQuantity: 1,
        issuedQuantity: 1,
      },
    },
  ]);
  const stockByKey = new Map<
    string,
    Pick<
      (typeof stockRows)[number],
      'materialCount' | 'totalQuantity' | 'availableQuantity' | 'issuedQuantity'
    >
  >();
  for (const row of stockRows) {
    const key = `${normalized(row.category)}|${inventoryModelMatchKey(row.name)}|${row.trackingMode}`;
    const previous = stockByKey.get(key) ?? {
      materialCount: 0,
      totalQuantity: 0,
      availableQuantity: 0,
      issuedQuantity: 0,
    };
    stockByKey.set(key, {
      materialCount: previous.materialCount + row.materialCount,
      totalQuantity: previous.totalQuantity + row.totalQuantity,
      availableQuantity: previous.availableQuantity + row.availableQuantity,
      issuedQuantity: previous.issuedQuantity + row.issuedQuantity,
    });
  }
  return records.map((record) => {
    const stock = [...new Set([record.name, ...recordAliases(record)].map(inventoryModelMatchKey))]
      .map((name) =>
        stockByKey.get(`${record.categoryNormalized}|${name}|${record.trackingMode}`),
      )
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .reduce(
        (result, row) => ({
          materialCount: result.materialCount + row.materialCount,
          totalQuantity: result.totalQuantity + row.totalQuantity,
          availableQuantity: result.availableQuantity + row.availableQuantity,
          issuedQuantity: result.issuedQuantity + row.issuedQuantity,
        }),
        { materialCount: 0, totalQuantity: 0, availableQuantity: 0, issuedQuantity: 0 },
      );
    return {
      id: record._id.toString(),
      category: record.category,
      name: record.name,
      trackingMode: record.trackingMode,
      aliases: record.aliases,
      ...stock,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  });
}

export async function createInventoryModel(
  category: string,
  name: string,
  trackingMode: TrackingMode,
  userId: string,
  session?: ClientSession,
): Promise<InventoryModel> {
  const categoryNormalized = normalized(category);
  const nameNormalized = normalized(name);
  const existing = await InventoryModelModel.findOne({
    categoryNormalized,
    nameNormalized,
    trackingMode,
  })
    .session(session ?? null)
    .lean();
  const aliasConflict = await findModelNameConflict(
    categoryNormalized,
    trackingMode,
    name,
    [],
    session,
  );
  if (existing || aliasConflict)
    throw new AppError(
      409,
      'INVENTORY_MODEL_EXISTS',
      'This model already exists in the selected category.',
    );
  try {
    const record = new InventoryModelModel({
      category: category.trim(),
      categoryNormalized,
      name: name.trim().replace(/\s+/g, ' '),
      nameNormalized,
      trackingMode,
      aliases: [],
      createdBy: new Types.ObjectId(userId),
    });
    await record.save(session ? { session } : undefined);
    await refreshCategoryModelCache(record.category, record.trackingMode, record.createdBy, session);
    return publicModel(record.toObject(), session);
  } catch (error) {
    if ((error as { code?: number }).code === 11000)
      throw new AppError(
        409,
        'INVENTORY_MODEL_EXISTS',
        'This model already exists in the selected category.',
      );
    throw error;
  }
}

export async function mergeInventoryModels(
  modelIds: string[],
  canonicalName: string,
  userId: string,
  session?: ClientSession,
): Promise<{ model: InventoryModel; mergedMaterialCount: number }> {
  const uniqueModelIds = [...new Set(modelIds)];
  if (uniqueModelIds.length < 2 || uniqueModelIds.some((id) => !Types.ObjectId.isValid(id)))
    throw new AppError(400, 'INVENTORY_MODEL_ID_INVALID', 'Choose valid models to merge.');
  const records = await InventoryModelModel.find({
    _id: { $in: uniqueModelIds.map((id) => new Types.ObjectId(id)) },
  })
    .session(session ?? null)
    .lean();
  if (records.length !== uniqueModelIds.length)
    throw new AppError(
      404,
      'INVENTORY_MODEL_NOT_FOUND',
      'One or more selected models no longer exist.',
    );
  const first = records[0];
  if (
    !first ||
    records.some(
      (record) =>
        record.categoryNormalized !== first.categoryNormalized ||
        record.trackingMode !== first.trackingMode,
    )
  )
    throw new AppError(
      409,
      'INVENTORY_MODEL_CATEGORY_MISMATCH',
      'Merge models only within the same category and material type.',
    );
  const names = [...new Set(records.flatMap((record) => [record.name, ...recordAliases(record)]))];
  const canonical = canonicalName.trim().replace(/\s+/g, ' ');
  const mergedMaterialCount = await relinkModelMaterials(
    first.category,
    first.trackingMode,
    names,
    canonical,
    session,
  );
  await updatePendingImports(first.category, first.trackingMode, names, canonical, session);
  await InventoryModelModel.deleteMany(
    { _id: { $in: records.map((record) => record._id) } },
    session ? { session } : undefined,
  );
  const model = await createInventoryModel(
    first.category,
    canonical,
    first.trackingMode,
    userId,
    session,
  ).catch(async (error) => {
    if (error instanceof AppError && error.code === 'INVENTORY_MODEL_EXISTS') {
      const found = await InventoryModelModel.findOne({
        categoryNormalized: first.categoryNormalized,
        nameNormalized: normalized(canonical),
        trackingMode: first.trackingMode,
      })
        .session(session ?? null)
        .lean();
      if (found) return publicModel(found, session);
    }
    throw error;
  });
  await InventoryModelModel.updateOne(
    { _id: model.id },
    {
      $addToSet: {
        aliases: { $each: names.filter((name) => normalized(name) !== normalized(canonical)) },
      },
    },
    session ? { session } : undefined,
  );
  const refreshed = await InventoryModelModel.findById(model.id)
    .session(session ?? null)
    .lean();
  if (!refreshed)
    throw new AppError(
      500,
      'INVENTORY_MODEL_MERGE_FAILED',
      'The model merge could not be completed.',
    );
  await refreshCategoryModelCache(first.category, first.trackingMode, first.createdBy, session);
  return { model: await publicModel(refreshed, session), mergedMaterialCount };
}

export async function updateInventoryModel(
  modelId: string,
  name: string,
  session?: ClientSession,
): Promise<InventoryModel> {
  if (!Types.ObjectId.isValid(modelId))
    throw new AppError(404, 'INVENTORY_MODEL_NOT_FOUND', 'This model was not found.');
  const record = await InventoryModelModel.findById(modelId).session(session ?? null);
  if (!record) throw new AppError(404, 'INVENTORY_MODEL_NOT_FOUND', 'This model was not found.');
  const canonical = name.trim().replace(/\s+/g, ' ');
  const nameNormalized = normalized(canonical);
  const duplicate = await findModelNameConflict(
    record.categoryNormalized,
    record.trackingMode,
    canonical,
    [record._id],
    session,
  );
  if (duplicate)
    throw new AppError(
      409,
      'INVENTORY_MODEL_EXISTS',
      'Another model already uses this name. Use Merge Models instead.',
    );
  const previousNames = [record.name, ...recordAliases(record)];
  await relinkModelMaterials(
    record.category,
    record.trackingMode,
    previousNames,
    canonical,
    session,
  );
  await updatePendingImports(record.category, record.trackingMode, previousNames, canonical, session);
  const aliasCandidates =
    normalized(record.name) === nameNormalized
      ? recordAliases(record)
      : [...recordAliases(record), record.name];
  const aliasesByKey = new Map(aliasCandidates.map((alias) => [inventoryModelMatchKey(alias), alias]));
  aliasesByKey.delete(inventoryModelMatchKey(canonical));
  record.aliases = [...aliasesByKey.values()];
  record.name = canonical;
  record.nameNormalized = nameNormalized;
  await record.save(session ? { session } : undefined);
  await refreshCategoryModelCache(record.category, record.trackingMode, record.createdBy, session);
  return publicModel(record.toObject(), session);
}

export async function deleteInventoryModel(
  modelId: string,
  session?: ClientSession,
): Promise<void> {
  if (!Types.ObjectId.isValid(modelId))
    throw new AppError(404, 'INVENTORY_MODEL_NOT_FOUND', 'This model was not found.');
  const record = await InventoryModelModel.findById(modelId)
    .session(session ?? null)
    .lean();
  if (!record) throw new AppError(404, 'INVENTORY_MODEL_NOT_FOUND', 'This model was not found.');
  const linked = await MaterialModel.exists(
    buildInventoryModelMaterialFilter(
      record.category,
      [record.name, ...recordAliases(record)],
      record.trackingMode,
    ),
  ).session(session ?? null);
  if (linked)
    throw new AppError(
      409,
      'INVENTORY_MODEL_IN_USE',
      'This model has inventory stock. Merge it or remove its inventory records first.',
    );
  await InventoryModelModel.deleteOne(
    { _id: record._id },
    session ? { session } : undefined,
  );
  await refreshCategoryModelCache(record.category, record.trackingMode, undefined, session);
}
