import { describe, expect, it } from 'vitest';

import { formatReceiverCode } from './receiver-code.js';

describe('Receiver code formatting', () => {
  it('formats the atomic sequence as six digits', () => {
    expect(formatReceiverCode(1)).toBe('GEU-RCV-000001');
    expect(formatReceiverCode(999_999)).toBe('GEU-RCV-999999');
  });

  it('rejects values outside the public code range', () => {
    expect(() => formatReceiverCode(0)).toThrow(RangeError);
    expect(() => formatReceiverCode(1_000_000)).toThrow(RangeError);
    expect(() => formatReceiverCode(1.5)).toThrow(RangeError);
  });
});
