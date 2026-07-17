import { describe, expect, it } from 'vitest';

import { AppError } from '../../middleware/error-handler.js';
import { buildReceiverListFilter, conflictFromReceiverDuplicate } from './receiver.service.js';

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
