import { describe, expect, it } from 'vitest';

import { AppError } from '../../middleware/error-handler.js';
import {
  assertMaterialCanArchive,
  assertManualTransition,
  buildAssetUnitListFilter,
  buildAssetUnitMaterialFilter,
  buildMaterialListFilter,
  calculateQuantityAdjustment,
  manualAvailabilityDelta,
  translateAssetUnitDuplicateError,
  translateMaterialDuplicateError,
} from './inventory.service.js';

function expectCode(run: () => unknown, code: string): void {
  try {
    run();
    throw new Error(`Expected ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
  }
}

describe('inventory access filters', () => {
  it('forces Workers to ACTIVE materials even when another status is requested', () => {
    const filter = buildMaterialListFilter({
      page: 1,
      pageSize: 20,
      role: 'WORKER',
      status: 'ARCHIVED',
      search: 'switch.*',
    });

    expect(filter.status).toBe('ACTIVE');
    expect(filter.$text).toEqual({ $search: 'switch.*' });
  });

  it('lets the issue picker include active and outdated inventory only', () => {
    const workerFilter = buildMaterialListFilter({
      page: 1,
      pageSize: 20,
      role: 'WORKER',
      issueable: true,
    });
    const adminFilter = buildMaterialListFilter({
      page: 1,
      pageSize: 20,
      role: 'ADMIN',
      issueable: true,
    });

    expect(workerFilter.status).toEqual({ $in: ['ACTIVE', 'NOT_IN_USE'] });
    expect(adminFilter.status).toEqual({ $in: ['ACTIVE', 'NOT_IN_USE'] });
  });

  it('forces Worker unit reads to AVAILABLE while Admin filters remain selectable', () => {
    expect(
      buildAssetUnitListFilter({ materialId: 'material', role: 'WORKER', status: 'LOST' }).status,
    ).toBe('AVAILABLE');
    expect(
      buildAssetUnitListFilter({ materialId: 'material', role: 'ADMIN', status: 'LOST' }).status,
    ).toBe('LOST');
  });

  it('lets Worker serial selection read active and outdated material, but not scrap', () => {
    expect(
      buildAssetUnitMaterialFilter({
        materialCode: 'GEU-MAT-000001',
        role: 'WORKER',
        status: 'AVAILABLE',
      }).status,
    ).toEqual({ $in: ['ACTIVE', 'NOT_IN_USE'] });
    expect(
      buildAssetUnitMaterialFilter({
        materialCode: 'GEU-MAT-000001',
        role: 'WORKER',
        status: 'LOST',
      }).status,
    ).toBe('ACTIVE');
  });
});

describe('quantity safety', () => {
  it('keeps issued quantity unchanged when adjusting available stock', () => {
    expect(
      calculateQuantityAdjustment(
        { totalQuantity: 10, availableQuantity: 7, issuedQuantity: 3 },
        -2,
      ),
    ).toEqual({ totalQuantity: 8, availableQuantity: 5 });
  });

  it('rejects an adjustment that would remove issued stock', () => {
    expectCode(
      () =>
        calculateQuantityAdjustment(
          { totalQuantity: 10, availableQuantity: 2, issuedQuantity: 8 },
          -3,
        ),
      'QUANTITY_ADJUSTMENT_BELOW_ISSUED_STOCK',
    );
  });
});

describe('serialized unit state rules', () => {
  it('applies the correct available count delta for manual state changes', () => {
    expect(manualAvailabilityDelta('AVAILABLE', 'UNDER_REPAIR')).toBe(-1);
    expect(manualAvailabilityDelta('DAMAGED', 'AVAILABLE')).toBe(1);
    expect(manualAvailabilityDelta('DAMAGED', 'UNDER_REPAIR')).toBe(0);
    expect(manualAvailabilityDelta('UNDER_REPAIR', 'AVAILABLE')).toBe(1);
    expect(manualAvailabilityDelta('UNDER_REPAIR', 'SCRAPPED')).toBe(0);
  });

  it('keeps ISSUED system-controlled and SCRAPPED terminal', () => {
    expectCode(
      () => assertManualTransition('ISSUED', 'AVAILABLE'),
      'ISSUED_ASSET_IS_SYSTEM_CONTROLLED',
    );
    expectCode(() => assertManualTransition('SCRAPPED', 'AVAILABLE'), 'SCRAPPED_ASSET_IS_TERMINAL');
  });
});

describe('archive and duplicate guards', () => {
  it('rejects archive while quantity or serialized stock is issued', () => {
    expectCode(
      () =>
        assertMaterialCanArchive(
          {
            trackingMode: 'QUANTITY',
            totalQuantity: 5,
            availableQuantity: 4,
            issuedQuantity: 1,
          },
          false,
        ),
      'MATERIAL_HAS_ISSUED_STOCK',
    );
    expectCode(
      () =>
        assertMaterialCanArchive(
          {
            trackingMode: 'SERIALIZED',
            totalQuantity: 5,
            availableQuantity: 4,
            issuedQuantity: 0,
          },
          true,
        ),
      'MATERIAL_HAS_ISSUED_UNITS',
    );
  });

  it('maps a normalized serial unique-index conflict to the public API error', () => {
    const mapped = translateAssetUnitDuplicateError({
      code: 11_000,
      keyPattern: { serialNumberNormalized: 1 },
    });
    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped?.code).toBe('ASSET_SERIAL_EXISTS');
    expect(mapped?.status).toBe(409);
  });

  it('maps a normalized material identity conflict to the public API error', () => {
    const mapped = translateMaterialDuplicateError({
      code: 11_000,
      keyPattern: { identityKey: 1 },
    });
    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped?.code).toBe('MATERIAL_ALREADY_EXISTS');
    expect(mapped?.status).toBe(409);
  });
});
