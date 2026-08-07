import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  assetDetails: { updateOne: vi.fn() },
  inventoryModels: {
    find: vi.fn(),
    findOne: vi.fn(),
  },
  inventoryImports: { find: vi.fn() },
  materials: {
    aggregate: vi.fn(),
    exists: vi.fn(),
    find: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock('./asset-detail.model.js', () => ({ AssetDetailModel: database.assetDetails }));
vi.mock('./inventory-model.model.js', () => ({ InventoryModelModel: database.inventoryModels }));
vi.mock('./inventory-import.model.js', () => ({ InventoryImportModel: database.inventoryImports }));
vi.mock('./material.model.js', () => ({ MaterialModel: database.materials }));

import {
  buildInventoryModelMaterialFilter,
  inventoryModelMatchKey,
  reconcileInventoryCategory,
} from './inventory-model.service.js';

function queryResult<T>(value: T) {
  return {
    lean: vi.fn().mockResolvedValue(value),
    select: vi.fn().mockReturnThis(),
    session: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
  };
}

describe('inventory model integrity helpers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the same compact matching key for visually equivalent model names', () => {
    expect(inventoryModelMatchKey('Think Pad')).toBe(inventoryModelMatchKey('think\u200bpad'));
  });

  it('links legacy materials without typeModelName as well as current materials', () => {
    const filter = buildInventoryModelMaterialFilter('Laptop', ['Latitude 5450'], 'SERIALIZED');
    expect(filter).toMatchObject({
      category: /^Laptop$/i,
      trackingMode: 'SERIALIZED',
      $or: expect.arrayContaining([
        { typeModelName: { $in: [/^Latitude 5450$/i] } },
        {
          typeModelName: { $exists: false },
          name: { $in: [/^Latitude 5450$/i] },
        },
      ]),
    });
  });

  it('upserts a missing consumable category registry from Model Master', async () => {
    const createdBy = { toString: () => '507f1f77bcf86cd799439011' };
    database.inventoryModels.findOne.mockReturnValue(
      queryResult({ category: 'Consumable', createdBy }),
    );
    database.inventoryModels.find.mockReturnValue(
      queryResult([
        { name: 'A4 Paper', createdBy },
        { name: 'Toner', createdBy },
      ]),
    );
    database.assetDetails.updateOne.mockResolvedValue({ matchedCount: 0, upsertedCount: 1 });

    await expect(reconcileInventoryCategory('Consumable', 'QUANTITY')).resolves.toBe('Consumable');
    expect(database.assetDetails.updateOne).toHaveBeenCalledWith(
      { kind: 'CONSUMABLE_TYPE', normalizedName: 'CONSUMABLE' },
      expect.objectContaining({
        $set: { name: 'Consumable', models: ['A4 Paper', 'Toner'] },
        $setOnInsert: { createdBy },
      }),
      expect.objectContaining({ upsert: true, setDefaultsOnInsert: true }),
    );
  });
});
