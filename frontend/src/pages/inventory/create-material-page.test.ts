import { describe, expect, it } from 'vitest';

import { serialFieldsForQuantity } from './create-material-page';

describe('IT Asset serial number fields', () => {
  it('creates one required field slot for every selected quantity', () => {
    expect(serialFieldsForQuantity([''], '10')).toHaveLength(10);
  });

  it('preserves entered serial numbers when quantity increases or decreases', () => {
    const increased = serialFieldsForQuantity(['SER-001', 'SER-002'], '4');
    expect(increased).toEqual(['SER-001', 'SER-002', '', '']);
    expect(serialFieldsForQuantity(increased, '1')).toEqual(['SER-001']);
  });

  it('does not allocate fields for invalid or excessive quantities', () => {
    const current = ['SER-001'];
    expect(serialFieldsForQuantity(current, '0')).toBe(current);
    expect(serialFieldsForQuantity(current, '1001')).toBe(current);
  });
});
