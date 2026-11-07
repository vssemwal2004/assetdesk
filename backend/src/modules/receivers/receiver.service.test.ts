import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { AppError } from '../../middleware/error-handler.js';
import {
  buildReceiverListFilter,
  conflictFromReceiverDuplicate,
  createRecordInput,
  findOrCreateReceiverForIssue,
} from './receiver.service.js';

describe('Receiver service query policy', () => {
  it('forces Worker-facing searches to ACTIVE even if another status is supplied', () => {
    const filter = buildReceiverListFilter({
      activeOnly: true,
      status: 'INACTIVE',
      type: 'FACULTY',
      department: ' Computer   Science ',
    });

    expect(filter).toMatchObject({
      status: 'ACTIVE',
      type: 'FACULTY',
      departmentNormalized: 'computer science',
    });
  });

  it('builds escaped search alternatives over the permitted normalized fields', () => {
    const filter = buildReceiverListFilter({ activeOnly: false, search: 'Ada.*+91 98' });
    const alternatives = filter.$or ?? [];

    expect(alternatives).toHaveLength(5);
    const nameExpression = alternatives[2]?.fullNameNormalized;
    expect(nameExpression).toBeInstanceOf(RegExp);
    expect((nameExpression as RegExp).test('ada.*+91 98')).toBe(true);
    expect((nameExpression as RegExp).test('adaZZ+91 98')).toBe(false);
  });
});

describe('lab Receivers', () => {
  const actor = new Types.ObjectId();

  it('identifies a lab by its name and keeps the in-charge off the unique identity fields', () => {
    const values = createRecordInput(
      {
        type: 'LAB',
        fullName: ' CSIT  Lab 3 ',
        inChargeName: 'Dr. Ravi Kumar',
        inChargeContact: '+91 98765 43210',
        inChargeEmail: 'Ravi@Example.edu',
      },
      actor,
    );
    expect(values).toMatchObject({
      type: 'LAB',
      fullName: 'CSIT Lab 3',
      fullNameNormalized: 'csit lab 3',
      inChargeEmail: 'ravi@example.edu',
    });
    expect(values).not.toHaveProperty('emailNormalized');
    expect(values).not.toHaveProperty('universityIdNormalized');
  });

  it('refuses to create a lab from the inline Issue path', async () => {
    await expect(
      findOrCreateReceiverForIssue(
        {
          type: 'LAB',
          fullName: 'CSIT Lab 3',
          inChargeName: 'Dr. Ravi Kumar',
          inChargeContact: '+91 98765 43210',
          inChargeEmail: 'ravi@example.edu',
        } as never,
        actor.toString(),
      ),
    ).rejects.toMatchObject({ code: 'ISSUE_LAB_NOT_REGISTERED' });
  });
});

describe('Receiver service conflicts', () => {
  it.each([
    ['emailNormalized', 'RECEIVER_EMAIL_EXISTS'],
    ['universityIdNormalized', 'RECEIVER_UNIVERSITY_ID_EXISTS'],
  ])('maps duplicate %s to the stable 409 problem code', (field, expectedCode) => {
    const conflict = conflictFromReceiverDuplicate({
      code: 11_000,
      keyPattern: { [field]: 1 },
    });

    expect(conflict).toBeInstanceOf(AppError);
    expect(conflict).toMatchObject({ status: 409, code: expectedCode });
  });

  it('does not hide an unrelated database failure', () => {
    expect(conflictFromReceiverDuplicate(new Error('offline'))).toBeNull();
  });
});
