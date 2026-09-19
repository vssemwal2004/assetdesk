import { describe, expect, it } from 'vitest';

import { formatGatePassNumber, gatePassNumberYear } from './cartridge.service.js';

describe('gate-pass numbers', () => {
  it('uses the GEU year and three-digit sequence format', () => {
    expect(formatGatePassNumber(2026, 1)).toBe('GEU-2026-001');
    expect(formatGatePassNumber(2026, 42)).toBe('GEU-2026-042');
    expect(formatGatePassNumber(2026, 999)).toBe('GEU-2026-999');
  });

  it('derives the year in the application timezone', () => {
    expect(gatePassNumberYear(new Date('2026-12-31T18:29:59.000Z'))).toBe(2026);
    expect(gatePassNumberYear(new Date('2026-12-31T18:30:00.000Z'))).toBe(2027);
  });
});
