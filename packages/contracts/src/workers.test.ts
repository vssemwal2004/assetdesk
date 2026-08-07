import { describe, expect, it } from 'vitest';

import { UpdateWorkerAccessRequestSchema } from './workers.js';

describe('worker access contracts', () => {
  it('accepts an inventory access grant and fills omitted data scopes', () => {
    expect(
      UpdateWorkerAccessRequestSchema.parse({
        permissions: ['DASHBOARD', 'INVENTORY_VIEW'],
        dataAccess: { inventory: 'ALL' },
      }),
    ).toEqual({
      permissions: ['DASHBOARD', 'INVENTORY_VIEW'],
      dataAccess: { inventory: 'ALL', issues: 'OWN', cartridges: 'OWN' },
    });
  });

  it('rejects unknown top-level and nested access fields', () => {
    const valid = {
      permissions: ['DASHBOARD'],
      dataAccess: { inventory: 'OWN', issues: 'OWN', cartridges: 'OWN' },
    };

    expect(() =>
      UpdateWorkerAccessRequestSchema.parse({ ...valid, name: 'Unexpected profile edit' }),
    ).toThrow();
    expect(() =>
      UpdateWorkerAccessRequestSchema.parse({
        ...valid,
        dataAccess: { ...valid.dataAccess, reports: 'ALL' },
      }),
    ).toThrow();
  });

  it('requires at least one known permission', () => {
    expect(() =>
      UpdateWorkerAccessRequestSchema.parse({
        permissions: [],
        dataAccess: { inventory: 'ALL', issues: 'OWN', cartridges: 'OWN' },
      }),
    ).toThrow();
  });
});
