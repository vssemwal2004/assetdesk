import { describe, expect, it } from 'vitest';

import { AppError } from '../../middleware/error-handler.js';
import {
  assertNoDuplicateReturnItems,
  assertReturnHistoryCapacity,
  assetAvailabilityIncrement,
  deriveIssueStatusAfterReturn,
  isDamagedOutcome,
  minimumEventsToComplete,
} from './return-domain.js';

function expectProblem(run: () => unknown, code: string): void {
  try {
    run();
    throw new Error(`Expected ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
  }
}

describe('Return request identity rules', () => {
  it('rejects duplicate quantity lines without silently aggregating them', () => {
    expectProblem(
      () =>
        assertNoDuplicateReturnItems([
          { trackingMode: 'QUANTITY', lineId: 'line-1' },
          { trackingMode: 'QUANTITY', lineId: 'line-1' },
        ]),
      'RETURN_LINE_DUPLICATED',
    );
  });

  it('rejects duplicate serialized assets even across different lines', () => {
    expectProblem(
      () =>
        assertNoDuplicateReturnItems([
          { trackingMode: 'SERIALIZED', lineId: 'line-1', assetTag: 'GEU-AST-000001' },
          { trackingMode: 'SERIALIZED', lineId: 'line-2', assetTag: 'GEU-AST-000001' },
        ]),
      'RETURN_ASSET_DUPLICATED',
    );
  });
});

describe('Return outcome rules', () => {
  it('keeps partial status while anything remains outstanding', () => {
    expect(deriveIssueStatusAfterReturn(1, true, true)).toBe('PARTIALLY_RETURNED');
  });

  it('prioritizes lost, then damaged outcomes on completion', () => {
    expect(deriveIssueStatusAfterReturn(0, true, true)).toBe('LOST');
    expect(deriveIssueStatusAfterReturn(0, false, true)).toBe('DAMAGED');
    expect(deriveIssueStatusAfterReturn(0, false, false)).toBe('RETURNED');
  });

  it('only restores availability for an available disposition', () => {
    expect(assetAvailabilityIncrement('AVAILABLE')).toBe(1);
    expect(assetAvailabilityIncrement('UNDER_REPAIR')).toBe(0);
    expect(assetAvailabilityIncrement('DAMAGED')).toBe(0);
    expect(assetAvailabilityIncrement('LOST')).toBe(0);
    expect(isDamagedOutcome('UNDER_REPAIR')).toBe(true);
    expect(isDamagedOutcome('DAMAGED')).toBe(true);
    expect(isDamagedOutcome('LOST')).toBe(false);
  });
});

describe('bounded Return history', () => {
  it('accounts for each serialized asset but only one entry per quantity line', () => {
    expect(
      minimumEventsToComplete([
        { trackingMode: 'QUANTITY', outstandingQuantity: 1_000_000 },
        { trackingMode: 'SERIALIZED', outstandingQuantity: 100 },
      ]),
    ).toBe(2);
  });

  it('reserves enough event capacity to guarantee a completion path', () => {
    expectProblem(
      () =>
        assertReturnHistoryCapacity(98, [
          { trackingMode: 'QUANTITY', outstandingQuantity: 1 },
          { trackingMode: 'SERIALIZED', outstandingQuantity: 100 },
        ]),
      'RETURN_BATCH_MUST_COMPLETE_MORE',
    );
    expect(() =>
      assertReturnHistoryCapacity(99, [
        { trackingMode: 'QUANTITY', outstandingQuantity: 0 },
        { trackingMode: 'SERIALIZED', outstandingQuantity: 0 },
      ]),
    ).not.toThrow();
  });
});
