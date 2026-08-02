import { describe, expect, it } from 'vitest';
import { CreateCartridgesRequestSchema, CreateGatePassRequestSchema } from './cartridges.js';

describe('cartridge contracts', () => {
  it('accepts matching quantity and unique serial numbers', () => {
    expect(
      CreateCartridgesRequestSchema.parse({
        model: 'HP 12A',
        colour: 'BLACK',
        location: 'Store',
        department: 'Computer Centre',
        quantity: 2,
        serialNumbers: ['CRT-1', 'CRT-2'],
      }).quantity,
    ).toBe(2);
  });
  it('rejects quantity and serial-number mismatch', () => {
    expect(
      CreateCartridgesRequestSchema.safeParse({
        model: 'HP 12A',
        colour: 'BLACK',
        location: 'Store',
        department: 'Computer Centre',
        quantity: 2,
        serialNumbers: ['CRT-1'],
      }).success,
    ).toBe(false);
  });
  it('rejects case-insensitive duplicate serial numbers', () => {
    expect(
      CreateCartridgesRequestSchema.safeParse({
        model: 'HP 12A',
        colour: 'BLACK',
        location: 'Store',
        department: 'Computer Centre',
        quantity: 2,
        serialNumbers: ['crt-1', 'CRT-1'],
      }).success,
    ).toBe(false);
  });
  it('requires at least one serialized cartridge on a Gate Pass', () => {
    expect(
      CreateGatePassRequestSchema.safeParse({
        vendorName: 'Vendor',
        personTakingMaterial: 'Person',
        cartridgeSerialNumbers: [],
      }).success,
    ).toBe(false);
  });
});
