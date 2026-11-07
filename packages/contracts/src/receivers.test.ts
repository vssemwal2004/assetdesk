import { describe, expect, it } from 'vitest';

import { CreateReceiverRequestSchema, UpdateReceiverRequestSchema } from './receivers.js';
import { ReceiverCodeSchema } from './identifiers.js';

describe('Receiver contracts', () => {
  it('normalizes a valid create payload', () => {
    expect(
      CreateReceiverRequestSchema.parse({
        fullName: '  Dr. Ada Lovelace  ',
        universityId: ' GEU-1001 ',
        type: 'FACULTY',
        department: ' Computer Science ',
        contact: ' +91 98765 43210 ',
        email: ' ADA@Example.edu ',
      }),
    ).toEqual({
      fullName: 'Dr. Ada Lovelace',
      universityId: 'GEU-1001',
      type: 'FACULTY',
      department: 'Computer Science',
      contact: '+91 98765 43210',
      email: 'ada@example.edu',
    });
  });

  it('rejects unknown properties and empty updates', () => {
    expect(
      CreateReceiverRequestSchema.safeParse({
        fullName: 'Ada Lovelace',
        type: 'FACULTY',
        contact: '9876543210',
        email: 'ada@example.edu',
        password: 'not-allowed',
      }).success,
    ).toBe(false);
    expect(UpdateReceiverRequestSchema.safeParse({}).success).toBe(false);
  });

  it('allows optional fields to be explicitly cleared', () => {
    expect(UpdateReceiverRequestSchema.parse({ universityId: null, department: null })).toEqual({
      universityId: null,
      department: null,
    });
  });

  it('registers a lab only with a named in-charge and never with person identity fields', () => {
    const lab = {
      type: 'LAB',
      fullName: ' CSIT Lab 3 ',
      inChargeName: 'Dr. Ravi Kumar',
      inChargeContact: '+91 98765 43210',
      inChargeEmail: 'Ravi@Example.edu',
    };
    expect(CreateReceiverRequestSchema.parse(lab)).toMatchObject({
      fullName: 'CSIT Lab 3',
      inChargeEmail: 'ravi@example.edu',
    });
    expect(CreateReceiverRequestSchema.safeParse({ ...lab, inChargeName: undefined }).success).toBe(
      false,
    );
    expect(CreateReceiverRequestSchema.safeParse({ ...lab, universityId: 'GEU-1' }).success).toBe(
      false,
    );
    // A person cannot be registered with the LAB type through the person fields.
    expect(
      CreateReceiverRequestSchema.safeParse({
        fullName: 'Ada',
        type: 'LAB',
        contact: '9876543210',
        email: 'ada@example.edu',
      }).success,
    ).toBe(false);
  });

  it('accepts only six-digit Receiver codes', () => {
    expect(ReceiverCodeSchema.safeParse('GEU-RCV-000001').success).toBe(true);
    expect(ReceiverCodeSchema.safeParse('GEU-RCV-1').success).toBe(false);
  });
});
