import { describe, expect, it } from 'vitest';

import {
  CreateInventoryGatePassRequestSchema,
  GateInItemRequestSchema,
} from './inventory-gate-passes';

const base = {
  destination: { name: 'Authorized Service Centre' },
  carrier: { name: 'Amit Kumar' },
};

describe('inventory Gate Pass contracts', () => {
  it('requires a fault description for every repair item', () => {
    const result = CreateInventoryGatePassRequestSchema.safeParse({
      ...base,
      purpose: 'REPAIR',
      items: [
        {
          trackingMode: 'SERIALIZED',
          materialCode: 'GEU-MAT-2026-000001',
          assetTag: 'GEU-AST-2026-000001',
          returnRequirement: 'RETURNABLE',
          movementCondition: 'NOT_WORKING',
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['items', 0, 'faultDescription']);
  });

  it('requires an explicit material condition for every repair item', () => {
    const result = CreateInventoryGatePassRequestSchema.safeParse({
      ...base,
      purpose: 'REPAIR',
      items: [
        {
          trackingMode: 'SERIALIZED',
          materialCode: 'GEU-MAT-2026-000001',
          assetTag: 'GEU-AST-2026-000001',
          returnRequirement: 'RETURNABLE',
          faultDescription: 'Display does not turn on',
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['items', 0, 'movementCondition']);
  });

  it('accepts a complete mixed manual Gate Pass', () => {
    expect(
      CreateInventoryGatePassRequestSchema.safeParse({
        ...base,
        purpose: 'OTHER',
        items: [
          {
            trackingMode: 'SERIALIZED',
            materialCode: 'GEU-MAT-2026-000001',
            assetTag: 'GEU-AST-2026-000001',
            returnRequirement: 'RETURNABLE',
          },
          {
            trackingMode: 'QUANTITY',
            materialCode: 'GEU-MAT-2026-000002',
            quantity: 3,
            returnRequirement: 'NON_RETURNABLE',
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('requires a serial number when an asset is received as a replacement', () => {
    expect(
      GateInItemRequestSchema.safeParse({
        itemId: 'd03dfe35-0e97-4823-9c74-d68448e051ad',
        quantity: 1,
        condition: 'New replacement received',
        outcome: 'REPLACED',
      }).success,
    ).toBe(false);
  });

  it('requires every serialized asset to return through Gate Pass In', () => {
    expect(
      CreateInventoryGatePassRequestSchema.safeParse({
        ...base,
        purpose: 'OTHER',
        items: [
          {
            trackingMode: 'SERIALIZED',
            materialCode: 'GEU-MAT-2026-000001',
            assetTag: 'GEU-AST-2026-000001',
            returnRequirement: 'NON_RETURNABLE',
          },
        ],
      }).success,
    ).toBe(false);
  });
});
