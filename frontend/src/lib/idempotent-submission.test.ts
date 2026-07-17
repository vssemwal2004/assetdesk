import { afterEach, describe, expect, it } from 'vitest';

import {
  clearPendingSubmission,
  createPendingSubmission,
  hasSameSubmissionInput,
  readPendingSubmission,
  requestFingerprint,
  savePendingSubmission,
} from './idempotent-submission';

const storageKey = 'assetdesk:test-submission';

afterEach(() => {
  window.sessionStorage.clear();
});

describe('persisted idempotent submissions', () => {
  it('creates the same fingerprint regardless of object key order', () => {
    expect(requestFingerprint({ receiverCode: 'GEU-RCV-000125', quantity: 2 })).toBe(
      requestFingerprint({ quantity: 2, receiverCode: 'GEU-RCV-000125' }),
    );
  });

  it('restores the exact key and payload after a reload boundary', () => {
    const input = {
      receiverCode: 'GEU-RCV-000125',
      lines: [{ trackingMode: 'QUANTITY', materialCode: 'GEU-MAT-000241', quantity: 2 }],
    };
    const pending = createPendingSubmission(input, 'persisted-idempotency-key-001');
    savePendingSubmission(storageKey, pending);

    const restored = readPendingSubmission(storageKey);

    expect(restored).toEqual(pending);
    expect(restored && hasSameSubmissionInput(restored, input)).toBe(true);
  });

  it('detects an edited payload instead of reusing its key', () => {
    const pending = createPendingSubmission(
      { notes: 'Original notes', quantity: 2 },
      'persisted-idempotency-key-002',
    );

    expect(hasSameSubmissionInput(pending, { notes: 'Updated notes', quantity: 2 })).toBe(false);
  });

  it('removes malformed or explicitly cleared saved state', () => {
    window.sessionStorage.setItem(storageKey, '{"version":1,"key":"too-short"}');
    expect(readPendingSubmission(storageKey)).toBeNull();

    const pending = createPendingSubmission({ quantity: 1 }, 'persisted-idempotency-key-003');
    savePendingSubmission(storageKey, pending);
    clearPendingSubmission(storageKey);
    expect(readPendingSubmission(storageKey)).toBeNull();
  });
});
