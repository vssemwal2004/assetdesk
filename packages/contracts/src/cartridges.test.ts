import { describe, expect, it } from 'vitest';
import {
  CreateCartridgesRequestSchema,
  CreateGatePassRequestSchema,
  IssueCartridgeRequestSchema,
  ReturnCartridgeRequestSchema,
  UpdateCartridgeRequestSchema,
} from './cartridges.js';

describe('cartridge contracts', () => {
  it('requires admin-entered serial numbers', () => {
    expect(
      CreateCartridgesRequestSchema.safeParse({
        model: 'HP 12A',
        colour: 'BLACK',
        location: 'Store',
        department: 'Computer Centre',
        quantity: 2,
      }).success,
    ).toBe(false);
  });
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
  it('accepts multiple cartridges for issue and return operations', () => {
    expect(
      IssueCartridgeRequestSchema.parse({
        serialNumbers: ['2026-0001', '2026-0002'],
        employeeName: 'Employee',
      }).serialNumbers,
    ).toEqual(['2026-0001', '2026-0002']);
    expect(
      ReturnCartridgeRequestSchema.parse({
        serialNumbers: ['2026-0001', '2026-0002'],
        returnedByName: 'Employee',
        condition: 'EMPTY',
      }).serialNumbers,
    ).toEqual(['2026-0001', '2026-0002']);
  });
  it('keeps legacy single-cartridge requests compatible', () => {
    expect(
      IssueCartridgeRequestSchema.parse({
        serialNumber: '2026-0001',
        employeeName: 'Employee',
      }).serialNumbers,
    ).toEqual(['2026-0001']);
  });
  it('validates cartridge master-detail edits', () => {
    expect(
      UpdateCartridgeRequestSchema.parse({
        serialNumber: '2026-0042',
        model: '88A',
        vendorName: null,
      }),
    ).toEqual({ serialNumber: '2026-0042', model: '88A', vendorName: null });
    expect(UpdateCartridgeRequestSchema.safeParse({}).success).toBe(false);
  });
});
