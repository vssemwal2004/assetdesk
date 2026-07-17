import { describe, expect, it } from 'vitest';

import { calculatePresetReturnInIst, toIstDateTimeInput } from './date-time';

describe('IST return schedule helpers', () => {
  it('caps a one-month preset at the end of the target month', () => {
    const issuedAt = new Date('2025-01-31T04:30:00.000Z'); // 31 Jan, 10:00 IST

    expect(calculatePresetReturnInIst(issuedAt, 'ONE_MONTH').toISOString()).toBe(
      '2025-02-28T04:30:00.000Z',
    );
  });

  it('caps a one-year preset from leap day', () => {
    const issuedAt = new Date('2024-02-29T12:30:00.000Z'); // 29 Feb, 18:00 IST

    expect(calculatePresetReturnInIst(issuedAt, 'ONE_YEAR').toISOString()).toBe(
      '2025-02-28T12:30:00.000Z',
    );
  });

  it('formats the current minimum as an IST wall-clock value', () => {
    expect(toIstDateTimeInput(new Date('2026-07-16T00:00:00.000Z'))).toBe('2026-07-16T05:30');
  });
});
