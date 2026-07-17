import { describe, expect, it } from 'vitest';

import { formatAssetTag, formatMaterialCode } from './inventory-id.js';

describe('inventory identifier formatting', () => {
  it('formats sequential public identifiers with fixed-width digits', () => {
    expect(formatMaterialCode(1)).toBe('GEU-MAT-000001');
    expect(formatMaterialCode(999_999)).toBe('GEU-MAT-999999');
    expect(formatAssetTag(42)).toBe('GEU-AST-000042');
  });

  it('rejects invalid or exhausted sequence values', () => {
    expect(() => formatMaterialCode(0)).toThrow('No more inventory identifiers');
    expect(() => formatAssetTag(1_000_000)).toThrow('No more inventory identifiers');
    expect(() => formatAssetTag(1.5)).toThrow('No more inventory identifiers');
  });
});
