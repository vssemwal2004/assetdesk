import { describe, expect, it } from 'vitest';

import type { Material, TrackingMode } from '@assetdesk/contracts';

import { groupMaterials } from './inventory-page';

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
});
