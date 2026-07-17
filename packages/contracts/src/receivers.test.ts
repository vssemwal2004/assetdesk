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

  it('accepts only six-digit Receiver codes', () => {
    expect(ReceiverCodeSchema.safeParse('GEU-RCV-000001').success).toBe(true);
    expect(ReceiverCodeSchema.safeParse('GEU-RCV-1').success).toBe(false);
  });
});
