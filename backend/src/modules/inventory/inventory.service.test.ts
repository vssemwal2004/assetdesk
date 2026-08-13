import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../../middleware/error-handler.js';
import { buildMaterialIdentity, materialDisplayName } from './inventory-identity.js';
import {
  assertMaterialCanArchive,
  assertManualTransition,
  buildAssetUnitListFilter,
  buildAssetUnitMaterialFilter,
  buildMaterialListFilter,
  buildMaterialListFilterAsync,
  calculateQuantityAdjustment,
  manualAvailabilityDelta,
  translateAssetUnitDuplicateError,
  translateMaterialDuplicateError,
} from './inventory.service.js';

vi.mock('./asset-detail.model.js', () => ({
  AssetDetailModel: {
    find: vi.fn(() => ({
      select: vi.fn(() => ({
        lean: vi.fn(() =>
          Promise.resolve([
            { name: 'Param Centre Store / Param  Computer Centre' },
            { name: 'Aryabhatt Store / Aryabhatt Centre' },
          ]),
        ),
      })),
      sort: vi.fn(() => Promise.resolve([])),
    })),
    findOne: vi.fn(),
    exists: vi.fn(),
  },
}));

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
    expect(filter.$or).toHaveLength(11);
    expect(filter.$or).toEqual(
      expect.arrayContaining([
        { typeModelName: /switch\.\*/i },
        { configuration: /switch\.\*/i },
        { location: /switch\.\*/i },
        { block: /switch\.\*/i },
        { vendorName: /switch\.\*/i },
      ]),
    );
  });

  it('combines all exact inventory filters without dropping search or date criteria', () => {
    const createdFrom = new Date('2026-08-01T00:00:00.000Z');
    const createdTo = new Date('2026-08-05T23:59:59.999Z');
    const filter = buildMaterialListFilter({
      page: 1,
      pageSize: 100,
      role: 'ADMIN',
      search: 'civil lab',
      trackingMode: 'SERIALIZED',
      returnPolicy: 'REUSABLE',
      stockState: 'AVAILABLE',
      status: 'ACTIVE',
      category: 'CPU',
      location: 'Civil Lab',
      block: 'Civil Block',
      department: 'CSIT',
      vendorName: 'HP',
      createdFrom,
      createdTo,
    });

    expect(filter).toMatchObject({
      status: 'ACTIVE',
      trackingMode: 'SERIALIZED',
      returnPolicy: 'REUSABLE',
      availableQuantity: { $gt: 0 },
      createdAt: { $gte: createdFrom, $lte: createdTo },
    });
    expect(filter.$or).toHaveLength(11);
    expect(filter.category).toEqual(/^CPU$/i);
    expect(filter.location).toEqual(/^Civil Lab$/i);
    expect(filter.block).toEqual(/^Civil Block$/i);
    expect(filter.department).toEqual(/^CSIT$/i);
    expect(filter.vendorName).toEqual(/^HP$/i);
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
    expect(workerFilter.availableQuantity).toEqual({ $gt: 0 });
  });

  it('keeps issue picker location locked to configured store stock', async () => {
    const filter = await buildMaterialListFilterAsync({
      page: 1,
      pageSize: 20,
      role: 'ADMIN',
      issueable: true,
      location: 'Aryabhatt Store / Aryabhatt Centre',
    });

    expect(filter.status).toEqual({ $in: ['ACTIVE', 'NOT_IN_USE'] });
    expect(filter.availableQuantity).toEqual({ $gt: 0 });
    expect(filter.$and).toEqual([
      {
        $or: [
          { location: /^Aryabhatt\s+Store$/i, block: /^Aryabhatt\s+Centre$/i },
          { locationBlock: /^Aryabhatt\s+Store\s+\/\s+Aryabhatt\s+Centre$/i },
        ],
      },
    ]);
  });

  it('matches store location and block when master data contains extra spaces', async () => {
    const filter = await buildMaterialListFilterAsync({
      page: 1,
      pageSize: 20,
      role: 'ADMIN',
      issueable: true,
      location: 'Param Centre Store / Param Computer Centre',
    });

    const storeFilter = (filter.$and as Array<{ $or: Array<Record<string, RegExp>> }>)[0];
    expect(storeFilter?.$or[0]?.location?.test('Param Centre Store')).toBe(true);
    expect(storeFilter?.$or[0]?.block?.test('Param Computer Centre')).toBe(true);
    expect(storeFilter?.$or[1]?.locationBlock?.test('Param Centre Store / Param Computer Centre')).toBe(
      true,
    );
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

describe('material identity', () => {
  it('keeps valid derived names and long configurations within indexed identity limits', () => {
    const category = 'C'.repeat(120);
    const model = 'M'.repeat(120);
    const name = materialDisplayName(category, model);
    const identity = buildMaterialIdentity(
      'SERIALIZED',
      name,
      category,
      'L'.repeat(120),
      'B'.repeat(120),
      'configuration '.repeat(80),
    );

    expect(name).toHaveLength(241);
    expect(identity).toMatch(/^SHA256:[A-F0-9]{64}$/);
    expect(identity.length).toBeLessThanOrEqual(300);
  });

  it('preserves the legacy plain identity format when it fits the database field', () => {
    expect(buildMaterialIdentity('QUANTITY', 'Paper A4', 'Paper', 'Store', 'A', undefined)).toBe(
      'QUANTITY|PAPERA4|PAPER|STORE|A',
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
