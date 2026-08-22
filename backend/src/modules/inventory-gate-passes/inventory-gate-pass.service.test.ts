import { describe, expect, it } from 'vitest';

import {
  eligibleGatePassAssetStatuses,
  quantityGateInAdjustment,
  quantityGateOutAdjustment,
} from './inventory-gate-pass.service.js';

describe('inventory Gate Pass domain rules', () => {
  it('restricts repair Gate Passes to repair-state assets', () => {
    expect(eligibleGatePassAssetStatuses('REPAIR')).not.toContain('AVAILABLE');
    expect(eligibleGatePassAssetStatuses('REPAIR')).toContain('DAMAGED');
    expect(eligibleGatePassAssetStatuses('REPAIR')).not.toContain('ISSUED');
    expect(eligibleGatePassAssetStatuses('OTHER')).toContain('AVAILABLE');
    expect(eligibleGatePassAssetStatuses('OTHER')).not.toContain('ISSUED');
  });

  it('reserves returnable consumable stock at Gate Out and restores it at Gate In', () => {
    expect(quantityGateOutAdjustment(4, 'RETURNABLE')).toEqual({
      availableQuantity: -4,
      issuedQuantity: 4,
    });
    expect(quantityGateInAdjustment(4)).toEqual({
      availableQuantity: 4,
      issuedQuantity: -4,
    });
  });

  it('removes non-returnable consumables from physical stock at Gate Out', () => {
    expect(quantityGateOutAdjustment(3, 'NON_RETURNABLE')).toEqual({
      availableQuantity: -3,
      totalQuantity: -3,
    });
  });
});
