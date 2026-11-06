import { describe, expect, it, vi } from 'vitest';

import { GlobalSearchQuerySchema } from '@assetdesk/contracts';

vi.mock('../auth/auth.middleware.js', () => ({
  hasServerPermission: (
    auth: { role: string; permissions: string[] },
    permission: string,
  ): boolean => auth.role === 'ADMIN' || auth.permissions.includes(permission),
}));

import {
  buildMatcher,
  detectMatch,
  permittedTypes,
  textClauses,
  typeSupportsFilters,
  type SearchActor,
} from './search.service.js';

function actor(overrides: Partial<SearchActor> = {}): SearchActor {
  return {
    userId: '507f1f77bcf86cd799439011',
    workerId: 'GEU-W-0001',
    role: 'WORKER',
    permissions: [],
    dataAccess: { inventory: 'OWN', issues: 'OWN', cartridges: 'OWN' },
    sid: 'sid',
    authVersion: 1,
    mustChangePassword: false,
    purpose: 'FULL_ACCESS',
    csrfTokenHash: 'hash',
    ...overrides,
  } as SearchActor;
}

describe('global search helpers', () => {
  it('builds one OR clause per word so every word must match', () => {
    const clauses = textClauses(['serialNumber', 'assetTag'], buildMatcher('dell  5CG123'));
    expect(clauses).toHaveLength(2);
    expect(clauses[1]).toEqual({ $or: [{ serialNumber: /5CG123/i }, { assetTag: /5CG123/i }] });
  });

  it('reports the field holding the whole phrase before partial word matches', () => {
    const match = detectMatch(
      [
        { label: 'Model', value: 'Dell OptiPlex' },
        { label: 'Serial number', value: 'XDELL-5CG' },
        { label: 'Configuration', value: 'i5 / 8GB / Dell 5CG' },
      ],
      buildMatcher('dell 5cg'),
    );
    expect(match).toEqual({ field: 'Configuration', value: 'i5 / 8GB / Dell 5CG' });
  });

  it('limits record types to the permissions a Worker holds', () => {
    expect(permittedTypes(actor({ permissions: ['ISSUES_VIEW', 'INVENTORY_VIEW'] }))).toEqual([
      'ISSUE',
      'MATERIAL',
      'ASSET_UNIT',
    ]);
    expect(permittedTypes(actor({ role: 'ADMIN' }))).toContain('EMPLOYEE');
  });

  it('hides record types that cannot honour an active filter', () => {
    const query = GlobalSearchQuerySchema.parse({ q: 'cpu', category: 'CPU' });
    expect(typeSupportsFilters('MATERIAL', query)).toBe(true);
    expect(typeSupportsFilters('CARTRIDGE', query)).toBe(false);
    const consumables = GlobalSearchQuerySchema.parse({ q: 'x1', trackingMode: 'QUANTITY' });
    expect(typeSupportsFilters('ASSET_UNIT', consumables)).toBe(false);
    const issued = GlobalSearchQuerySchema.parse({ status: 'issued' });
    expect(typeSupportsFilters('CARTRIDGE', issued)).toBe(true);
    expect(typeSupportsFilters('RECEIVER', issued)).toBe(false);
  });

  it('requires a search term or at least one filter', () => {
    expect(GlobalSearchQuerySchema.safeParse({ q: ' ' }).success).toBe(false);
    expect(GlobalSearchQuerySchema.safeParse({ location: 'CSIT Lab 3' }).success).toBe(true);
    expect(
      GlobalSearchQuerySchema.safeParse({ q: 'ab', dateFrom: '2026-11-05', dateTo: '2026-11-01' })
        .success,
    ).toBe(false);
  });
});
