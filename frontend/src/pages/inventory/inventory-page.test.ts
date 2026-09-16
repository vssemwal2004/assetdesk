import { describe, expect, it } from 'vitest';

import type { Material, TrackingMode } from '@assetdesk/contracts';

import { groupMaterialConfigurations, groupMaterialModels, groupMaterials } from './inventory-page';

function material(materialCode: string, trackingMode: TrackingMode): Material {
  return {
    id: materialCode,
    materialCode,
    name: 'Consumable Marker Pen',
    category: 'Consumable',
    typeModelName: 'Marker Pen',
    location: null,
    block: null,
    store: null,
    department: null,
    vendorName: null,
    locationBlock: null,
    description: null,
    trackingMode,
    returnPolicy: 'REUSABLE',
    status: 'ACTIVE',
    totalQuantity: 1,
    availableQuantity: 1,
    issuedQuantity: 0,
    unitLabel: trackingMode === 'QUANTITY' ? 'pieces' : null,
    assignmentTypes: ['SHORT_TERM'],
    createdAt: '2026-08-07T00:00:00.000Z',
    updatedAt: '2026-08-07T00:00:00.000Z',
  };
}

describe('inventory category grouping', () => {
  it('does not mix identically named serialized and consumable categories', () => {
    const groups = groupMaterials([
      material('GEU-MAT-2026-000001', 'QUANTITY'),
      material('GEU-MAT-2026-000002', 'SERIALIZED'),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.trackingMode).sort()).toEqual(['QUANTITY', 'SERIALIZED']);
    expect(groups.every((group) => group.materials.length === 1)).toBe(true);
  });

  it('keeps one model summary while separating its configurations underneath', () => {
    const firstStore = {
      ...material('GEU-MAT-2026-000003', 'SERIALIZED'),
      category: 'Laptop',
      name: 'MacBook',
      typeModelName: 'MacBook',
      configuration: '8 GB / 256 GB SSD',
      store: 'Param Centre Store',
    };
    const secondStore = {
      ...material('GEU-MAT-2026-000004', 'SERIALIZED'),
      category: 'Laptop',
      name: 'MacBook',
      typeModelName: 'MacBook',
      configuration: '8GB / 256GB SSD',
      store: 'Main Store',
    };
    const largerConfiguration = {
      ...material('GEU-MAT-2026-000005', 'SERIALIZED'),
      category: 'Laptop',
      name: 'MacBook',
      typeModelName: 'MacBook',
      configuration: '16 GB / 512 GB SSD',
      store: 'Param Centre Store',
    };

    const categoryGroups = groupMaterials([firstStore, secondStore, largerConfiguration]);
    const modelGroups = groupMaterialModels(categoryGroups[0]?.materials ?? []);
    const configurationGroups = groupMaterialConfigurations(
      modelGroups[0]?.key ?? '',
      modelGroups[0]?.materials ?? [],
    );

    expect(categoryGroups).toHaveLength(1);
    expect(modelGroups).toHaveLength(1);
    expect(modelGroups[0]?.label).toBe('MacBook');
    expect(configurationGroups).toHaveLength(2);
    expect(configurationGroups.map((group) => group.materials.length).sort()).toEqual([1, 2]);
  });
});
