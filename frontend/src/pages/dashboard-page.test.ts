import { describe, expect, it } from 'vitest';

import { operationalInventoryQuantity, stockAvailabilityPercentage } from './dashboard-page';

describe('dashboard stock availability', () => {
  it('ignores faulty and unusable units outside available and issued stock', () => {
    const inventory = {
      totalQuantity: 798,
      availableQuantity: 746,
      issuedQuantity: 4,
    };

    expect(operationalInventoryQuantity(inventory)).toBe(750);
    expect(stockAvailabilityPercentage(inventory)).toBe(99);
  });

  it('returns zero when no operational stock exists', () => {
    expect(stockAvailabilityPercentage({ availableQuantity: 0, issuedQuantity: 0 })).toBe(0);
  });
});
