import { describe, expect, it } from 'vitest';

import { cartridgeSerialYear, formatCartridgeSerial } from './cartridge.service.js';

describe('cartridge serial numbers', () => {
  it('uses a four-digit sequence', () => {
    expect(formatCartridgeSerial(2026, 1)).toBe('2026-0001');
    expect(formatCartridgeSerial(2026, 42)).toBe('2026-0042');
    expect(formatCartridgeSerial(2026, 9999)).toBe('2026-9999');
  });

  it('derives the year in the application timezone', () => {
    expect(cartridgeSerialYear(new Date('2026-12-31T18:29:59.000Z'))).toBe(2026);
    expect(cartridgeSerialYear(new Date('2026-12-31T18:30:00.000Z'))).toBe(2027);
  });
});
