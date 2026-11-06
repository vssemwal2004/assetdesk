import { describe, expect, it, vi } from 'vitest';

vi.mock('../auth/auth.middleware.js', () => ({ hasServerPermission: () => true }));

import { cartridgeSectionsFromCounts } from './alert.service.js';

const at = new Date('2026-11-05T00:00:00.000Z');

describe('cartridge alerts', () => {
  it('flags models in rotation with one or no filled cartridge and summarises statuses', () => {
    const [lowStock, attention] = cartridgeSectionsFromCounts([
      { _id: { model: 'HP 88A', status: 'FILLED_AVAILABLE' }, count: 1, latest: at },
      { _id: { model: 'HP 88A', status: 'EMPTY' }, count: 3, latest: at },
      { _id: { model: 'Canon 325', status: 'FILLED_AVAILABLE' }, count: 5, latest: at },
      { _id: { model: 'Brother TN', status: 'SCRAPPED' }, count: 4, latest: at },
      { _id: { model: 'Brother TN', status: 'ISSUED' }, count: 1, latest: at },
      { _id: { model: 'Canon 325', status: 'QC_PENDING' }, count: 2, latest: at },
    ]);

    expect(lowStock?.items.map((item) => item.title)).toEqual(['Low cartridge stock · HP 88A']);
    expect(lowStock?.items[0]?.key).toBe('CARTRIDGE_LOW_STOCK:HP 88A:1');
    expect(attention?.items.map((item) => item.key).sort()).toEqual([
      'CARTRIDGE_ATTENTION:EMPTY:3',
      'CARTRIDGE_ATTENTION:QC_PENDING:2',
    ]);
  });
});
