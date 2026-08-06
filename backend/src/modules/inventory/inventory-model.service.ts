import { Types } from 'mongoose';

import type { InventoryModel, TrackingMode } from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import { InventoryModelModel, type InventoryModelRecord } from './inventory-model.model.js';
import { InventoryImportModel } from './inventory-import.model.js';
import { MaterialModel } from './material.model.js';

function normalized(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('en-US');
}

function exactCaseInsensitive(value: string): RegExp {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
}

async function totals(category: string, names: string[], trackingMode: TrackingMode) {
  const rows = await MaterialModel.aggregate<{
    materialCount: number;
    totalQuantity: number;
    availableQuantity: number;
    issuedQuantity: number;
  }>([
    {
      $match: {
        category: { $regex: `^${category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
        typeModelName: {
          $in: names.map(
            (name) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          ),
        },
        trackingMode,
      },
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
  return rows[0] ?? { materialCount: 0, totalQuantity: 0, availableQuantity: 0, issuedQuantity: 0 };
}

async function publicModel(record: InventoryModelRecord): Promise<InventoryModel> {
  const stock = await totals(
    record.category,
    [record.name, ...record.aliases],
    record.trackingMode,
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
}

async function updatePendingImports(
  category: string,
  trackingMode: TrackingMode,
  previousNames: string[],
  canonical: string,
): Promise<void> {
  const importRecords = await InventoryImportModel.find({
    status: 'PREVIEWED',
    mode: trackingMode,
  });
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
    if (changed) await importRecord.save();
  }
}

async function syncExistingModels(category?: string, trackingMode?: TrackingMode): Promise<void> {
  const rows = await MaterialModel.aggregate<{
    category: string;
    name: string;
    trackingMode: TrackingMode;
    createdBy: Types.ObjectId;
  }>([
    {
      $match: {
        typeModelName: { $type: 'string', $ne: '' },
        ...(category ? { category: exactCaseInsensitive(category) } : {}),
        ...(trackingMode ? { trackingMode } : {}),
      },
    },
    {
      $group: {
        _id: { category: '$category', name: '$typeModelName', trackingMode: '$trackingMode' },
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
  if (uniqueRows.size === 0) return;
  try {
    await InventoryModelModel.bulkWrite(
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
  } catch (error) {
    // Concurrent requests can discover and insert the same legacy model. The unique
    // model-master index makes that race harmless.
    if ((error as { code?: number }).code !== 11000) throw error;
  }
}

export async function listInventoryModels(
  category?: string,
  trackingMode?: TrackingMode,
): Promise<InventoryModel[]> {
  await syncExistingModels(category, trackingMode);
  const records = await InventoryModelModel.find({
    ...(category ? { categoryNormalized: normalized(category) } : {}),
    ...(trackingMode ? { trackingMode } : {}),
  })
    .sort({ category: 1, name: 1 })
    .lean();
  if (records.length === 0) return [];

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
      },
    },
    {
      $group: {
        _id: { category: '$category', name: '$typeModelName', trackingMode: '$trackingMode' },
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
  const stockByKey = new Map(
    stockRows.map((row) => [
      `${normalized(row.category)}|${normalized(row.name)}|${row.trackingMode}`,
      row,
    ]),
  );
  return records.map((record) => {
    const stock = [record.name, ...record.aliases]
      .map((name) =>
        stockByKey.get(`${record.categoryNormalized}|${normalized(name)}|${record.trackingMode}`),
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
): Promise<InventoryModel> {
  const categoryNormalized = normalized(category);
  const nameNormalized = normalized(name);
  const existing = await InventoryModelModel.findOne({
    categoryNormalized,
    nameNormalized,
    trackingMode,
  }).lean();
  if (existing)
    throw new AppError(
      409,
      'INVENTORY_MODEL_EXISTS',
      'This model already exists in the selected category.',
    );
  try {
    const record = await InventoryModelModel.create({
      category: category.trim(),
      categoryNormalized,
      name: name.trim().replace(/\s+/g, ' '),
      nameNormalized,
      trackingMode,
      aliases: [],
      createdBy: new Types.ObjectId(userId),
    });
    return publicModel(record.toObject());
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
): Promise<{ model: InventoryModel; mergedMaterialCount: number }> {
  if (modelIds.some((id) => !Types.ObjectId.isValid(id)))
    throw new AppError(400, 'INVENTORY_MODEL_ID_INVALID', 'Choose valid models to merge.');
  const records = await InventoryModelModel.find({
    _id: { $in: modelIds.map((id) => new Types.ObjectId(id)) },
  }).lean();
  if (records.length !== new Set(modelIds).size)
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
  const names = [...new Set(records.flatMap((record) => [record.name, ...record.aliases]))];
  const canonical = canonicalName.trim().replace(/\s+/g, ' ');
  const materialName = canonical
    .toLocaleLowerCase('en-US')
    .startsWith(first.category.toLocaleLowerCase('en-US'))
    ? canonical
    : `${first.category} ${canonical}`;
  const update = await MaterialModel.updateMany(
    {
      category: {
        $regex: `^${first.category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
        $options: 'i',
      },
      trackingMode: first.trackingMode,
      typeModelName: {
        $in: names.map(
          (name) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        ),
      },
    },
    { $set: { typeModelName: canonical, name: materialName } },
  );
  await updatePendingImports(first.category, first.trackingMode, names, canonical);
  await InventoryModelModel.deleteMany({ _id: { $in: records.map((record) => record._id) } });
  const model = await createInventoryModel(
    first.category,
    canonical,
    first.trackingMode,
    userId,
  ).catch(async (error) => {
    if (error instanceof AppError && error.code === 'INVENTORY_MODEL_EXISTS') {
      const found = await InventoryModelModel.findOne({
        categoryNormalized: first.categoryNormalized,
        nameNormalized: normalized(canonical),
        trackingMode: first.trackingMode,
      }).lean();
      if (found) return publicModel(found);
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
  );
  const refreshed = await InventoryModelModel.findById(model.id).lean();
  if (!refreshed)
    throw new AppError(
      500,
      'INVENTORY_MODEL_MERGE_FAILED',
      'The model merge could not be completed.',
    );
  return { model: await publicModel(refreshed), mergedMaterialCount: update.modifiedCount };
}

export async function updateInventoryModel(modelId: string, name: string): Promise<InventoryModel> {
  if (!Types.ObjectId.isValid(modelId))
    throw new AppError(404, 'INVENTORY_MODEL_NOT_FOUND', 'This model was not found.');
  const record = await InventoryModelModel.findById(modelId);
  if (!record) throw new AppError(404, 'INVENTORY_MODEL_NOT_FOUND', 'This model was not found.');
  const canonical = name.trim().replace(/\s+/g, ' ');
  const nameNormalized = normalized(canonical);
  const duplicate = await InventoryModelModel.exists({
    _id: { $ne: record._id },
    categoryNormalized: record.categoryNormalized,
    nameNormalized,
    trackingMode: record.trackingMode,
  });
  if (duplicate)
    throw new AppError(
      409,
      'INVENTORY_MODEL_EXISTS',
      'Another model already uses this name. Use Merge Models instead.',
    );
  const previousNames = [record.name, ...record.aliases];
  const materialName = canonical
    .toLocaleLowerCase('en-US')
    .startsWith(record.category.toLocaleLowerCase('en-US'))
    ? canonical
    : `${record.category} ${canonical}`;
  await MaterialModel.updateMany(
    {
      category: {
        $regex: `^${record.category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
        $options: 'i',
      },
      trackingMode: record.trackingMode,
      typeModelName: {
        $in: previousNames.map(
          (value) => new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        ),
      },
    },
    { $set: { typeModelName: canonical, name: materialName } },
  );
  await updatePendingImports(record.category, record.trackingMode, previousNames, canonical);
  if (normalized(record.name) !== nameNormalized)
    record.aliases = [...new Set([...record.aliases, record.name])];
  record.name = canonical;
  record.nameNormalized = nameNormalized;
  await record.save();
  return publicModel(record.toObject());
}

export async function deleteInventoryModel(modelId: string): Promise<void> {
  if (!Types.ObjectId.isValid(modelId))
    throw new AppError(404, 'INVENTORY_MODEL_NOT_FOUND', 'This model was not found.');
  const record = await InventoryModelModel.findById(modelId).lean();
  if (!record) throw new AppError(404, 'INVENTORY_MODEL_NOT_FOUND', 'This model was not found.');
  const linked = await MaterialModel.exists({
    category: {
      $regex: `^${record.category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      $options: 'i',
    },
    trackingMode: record.trackingMode,
    typeModelName: {
      $in: [record.name, ...record.aliases].map(
        (value) => new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      ),
    },
  });
  if (linked)
    throw new AppError(
      409,
      'INVENTORY_MODEL_IN_USE',
      'This model has inventory stock. Merge it or remove its inventory records first.',
    );
  await InventoryModelModel.deleteOne({ _id: record._id });
}
