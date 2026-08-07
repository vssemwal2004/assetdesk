import { describe, expect, it } from 'vitest';

import type { AssetDetail, InventoryModel } from '@assetdesk/contracts';

import {
  inventoryCategoryOptions,
  inventoryModelOptions,
  materialGroupKey,
  materialRequestName,
  quantityAdjustmentMaximum,
  resolveCatalogOption,
  signedQuantityDelta,
} from './inventory-form-utils';

const timestamp = '2026-08-07T00:00:00.000Z';

function detail(id: string, kind: AssetDetail['kind'], name: string): AssetDetail {
  return { id, kind, name, models: [], createdAt: timestamp, updatedAt: timestamp };
}

function model(
  id: string,
  category: string,
  name: string,
  trackingMode: InventoryModel['trackingMode'],
): InventoryModel {
  return {
    id,
    category,
    name,
    trackingMode,
    aliases: [],
    materialCount: 0,
    totalQuantity: 0,
    availableQuantity: 0,
    issuedQuantity: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe('inventory form catalog options', () => {
  it('makes model-backed consumable categories available without a matching asset detail', () => {
    const options = inventoryCategoryOptions(
      [detail('asset', 'ASSET_TYPE', 'Laptop'), detail('paper', 'CONSUMABLE_TYPE', 'Paper')],
      [
        model('consumable', 'Consumable', 'Marker Pen', 'QUANTITY'),
        model('asset-model', 'Laptop', 'Latitude', 'SERIALIZED'),
      ],
      'QUANTITY',
    );

    expect(options).toEqual(['Consumable', 'Paper']);
  });

  it('deduplicates model names case-insensitively and resolves selected casing', () => {
    const options = inventoryModelOptions(
      [model('one', 'Consumable', 'Marker Pen', 'QUANTITY')],
      [' marker   pen ', 'Whiteboard Marker'],
      'MARKER PEN',
    );

    expect(options).toEqual(['Marker Pen', 'Whiteboard Marker']);
    expect(resolveCatalogOption('marker pen', options)).toBe('Marker Pen');
  });

  it('keeps the compatibility request name within the contract limit', () => {
    const category = `Category ${'A'.repeat(70)}`;
    const modelName = `Model ${'B'.repeat(105)}`;

    expect(materialRequestName(category, modelName)).toBe(modelName);
    expect(materialRequestName(category, modelName)).toHaveLength(111);
  });
});

describe('quantity adjustment helpers', () => {
  it('derives the signed API delta from an explicit direction', () => {
    expect(signedQuantityDelta('INCREASE', '7')).toBe(7);
    expect(signedQuantityDelta('DECREASE', '7')).toBe(-7);
  });

  it('limits decreases to available stock and increases to the contract ceiling', () => {
    const material = { totalQuantity: 40, availableQuantity: 13 };
    expect(quantityAdjustmentMaximum(material, 'DECREASE')).toBe(13);
    expect(quantityAdjustmentMaximum(material, 'INCREASE')).toBe(999_999_960);
  });

  it('uses tracking mode in category group identity', () => {
    expect(materialGroupKey('Consumable', 'QUANTITY')).not.toBe(
      materialGroupKey('Consumable', 'SERIALIZED'),
    );
  });
});
