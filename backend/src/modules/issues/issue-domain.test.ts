import { describe, expect, it } from 'vitest';

import { IssueAssetSchema } from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import { fingerprintRequest, hashIdempotencyKey, parseIdempotencyKey } from './idempotency.js';
import { calculateExpectedReturnAt, issueYearInIst, istDayRange } from './issue-date.js';
import { formatIssueId } from './issue-id.js';
import { buildReturnSearchFilter } from './issue.service.js';

function expectProblem(run: () => unknown, code: string): void {
  try {
    run();
    throw new Error(`Expected ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
  }
}

describe('Issue idempotency', () => {
  it('accepts a safe key and stores only a deterministic hash', () => {
    const key = 'issue-request-key-0001';

    expect(parseIdempotencyKey(key)).toBe(key);
    expect(hashIdempotencyKey(key)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashIdempotencyKey(key)).not.toContain(key);
  });

  it('rejects missing, short, whitespace-padded, and unsafe keys', () => {
    expectProblem(() => parseIdempotencyKey(undefined), 'IDEMPOTENCY_KEY_REQUIRED');
    expectProblem(() => parseIdempotencyKey('short'), 'IDEMPOTENCY_KEY_INVALID');
    expectProblem(() => parseIdempotencyKey(' issue-request-key-0001'), 'IDEMPOTENCY_KEY_INVALID');
    expectProblem(() => parseIdempotencyKey('issue/request/key/0001'), 'IDEMPOTENCY_KEY_INVALID');
  });

  it('fingerprints equivalent object key ordering identically and payload changes differently', () => {
    expect(fingerprintRequest({ beta: 2, alpha: { y: 2, x: 1 } })).toBe(
      fingerprintRequest({ alpha: { x: 1, y: 2 }, beta: 2 }),
    );
    expect(fingerprintRequest({ quantity: 1 })).not.toBe(fingerprintRequest({ quantity: 2 }));
  });
});

describe('Issue dates and identifiers', () => {
  it('caps calendar-month and calendar-year presets at the destination month end in IST', () => {
    const january31AtTenIst = new Date('2026-01-31T04:30:00.000Z');
    const leapDayAtTenIst = new Date('2024-02-29T04:30:00.000Z');

    expect(
      calculateExpectedReturnAt(january31AtTenIst, { preset: 'ONE_MONTH' }).toISOString(),
    ).toBe('2026-02-28T04:30:00.000Z');
    expect(calculateExpectedReturnAt(leapDayAtTenIst, { preset: 'ONE_YEAR' }).toISOString()).toBe(
      '2025-02-28T04:30:00.000Z',
    );
  });

  it('uses the IST year boundary for sequential Issue IDs', () => {
    expect(issueYearInIst(new Date('2026-12-31T18:29:59.999Z'))).toBe(2026);
    expect(issueYearInIst(new Date('2026-12-31T18:30:00.000Z'))).toBe(2027);
    expect(formatIssueId(2027, 42)).toBe('GEU-ISS-2027-000042');
  });

  it('uses half-open IST day boundaries for dashboard and list filters', () => {
    const beforeIstMidnight = istDayRange(new Date('2026-07-15T18:29:59.999Z'));
    const atIstMidnight = istDayRange(new Date('2026-07-15T18:30:00.000Z'));

    expect(beforeIstMidnight.start.toISOString()).toBe('2026-07-14T18:30:00.000Z');
    expect(beforeIstMidnight.end.toISOString()).toBe('2026-07-15T18:30:00.000Z');
    expect(atIstMidnight.start.toISOString()).toBe('2026-07-15T18:30:00.000Z');
    expect(atIstMidnight.end.toISOString()).toBe('2026-07-16T18:30:00.000Z');
  });

  it('rejects a custom due time that is not in the future', () => {
    const issuedAt = new Date('2026-07-16T06:30:00.000Z');
    expectProblem(
      () =>
        calculateExpectedReturnAt(issuedAt, {
          preset: 'CUSTOM',
          expectedReturnAt: issuedAt.toISOString(),
        }),
      'EXPECTED_RETURN_MUST_BE_FUTURE',
    );
  });
});

describe('cross-shift Return lookup and asset evidence', () => {
  it('requires Workers to know an exact Issue ID or asset tag', () => {
    expectProblem(
      () => buildReturnSearchFilter('GE', 'WORKER'),
      'RETURN_LOOKUP_IDENTIFIER_REQUIRED',
    );
    expect(buildReturnSearchFilter('geu-iss-2026-000001', 'WORKER')).toMatchObject({
      issueId: 'GEU-ISS-2026-000001',
      totalOutstandingQuantity: { $gt: 0 },
    });
    expect(buildReturnSearchFilter('geu-ast-000001', 'WORKER')).toMatchObject({
      lines: {
        $elemMatch: {
          outstandingQuantity: { $gt: 0 },
          assets: { $elemMatch: { assetTag: 'GEU-AST-000001', outstanding: true } },
        },
      },
    });
  });

  it('rejects partial Return evidence on an outstanding serialized asset', () => {
    const parsed = IssueAssetSchema.safeParse({
      assetTag: 'GEU-AST-000001',
      serialNumber: null,
      conditionAtIssue: 'Good',
      outstanding: true,
      returnDisposition: 'DAMAGED',
      returnedAt: null,
    });

    expect(parsed.success).toBe(false);
  });
});
