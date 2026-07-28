import { describe, expect, it } from 'vitest';

import {
  CreateMaterialRequestSchema,
  MaterialSchema,
  UpdateAssetUnitRequestSchema,
} from './inventory.js';

const materialBase = {
  id: '507f1f77bcf86cd799439011',
  materialCode: 'GEU-MAT-000001',
  name: 'Core switch',
  category: 'Networking',
  typeModelName: null,
  location: null,
  block: null,
  locationBlock: null,
  description: null,
  returnPolicy: 'REUSABLE' as const,
  status: 'ACTIVE' as const,
  totalQuantity: 4,
  availableQuantity: 1,
  issuedQuantity: 1,
  unitLabel: null,
  assignmentTypes: ['LONG_TERM', 'SHORT_TERM'] as const,
  createdAt: '2026-07-15T10:00:00.000Z',
  updatedAt: '2026-07-15T10:00:00.000Z',
};

describe('inventory contracts', () => {
  it('creates material without an inventory department', () => {
    expect(
      CreateMaterialRequestSchema.safeParse({
        name: 'Core switch 48-port',
        category: 'Networking',
        typeModelName: '48-port',
        location: 'Computer Centre',
        block: 'A Block',
        trackingMode: 'SERIALIZED',
        returnPolicy: 'REUSABLE',
        serialNumbers: ['SW-001'],
        assignmentTypes: ['LONG_TERM'],
      }).success,
    ).toBe(true);
  });

  it('requires serialized materials to be reusable', () => {
    expect(
      CreateMaterialRequestSchema.safeParse({
        name: 'Core switch',
        category: 'Networking',
        trackingMode: 'SERIALIZED',
        returnPolicy: 'CONSUMABLE',
        serialNumbers: ['SW-001'],
      }).success,
    ).toBe(false);
  });

  it('allows serialized stock that is unavailable for non-issued states', () => {
    expect(MaterialSchema.safeParse({ ...materialBase, trackingMode: 'SERIALIZED' }).success).toBe(
      true,
    );
  });

  it('requires quantity issued count to equal total minus available', () => {
    expect(
      MaterialSchema.safeParse({
        ...materialBase,
        trackingMode: 'QUANTITY',
        unitLabel: 'pieces',
      }).success,
    ).toBe(false);
  });

  it('does not accept ISSUED as an Admin-managed asset status', () => {
    expect(UpdateAssetUnitRequestSchema.safeParse({ status: 'ISSUED' }).success).toBe(false);
  });
});
