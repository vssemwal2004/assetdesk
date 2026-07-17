import { describe, expect, it } from 'vitest';

import { retryDelayAfterAttempt } from './email-worker.service.js';

describe('notification retry schedule', () => {
  it('uses the approved five-step retry backoff', () => {
    expect([1, 2, 3, 4, 5].map(retryDelayAfterAttempt)).toEqual([
      60_000, 300_000, 900_000, 1_800_000, 7_200_000,
    ]);
  });

  it('stops automatic retries after the fifth retry slot', () => {
    expect(retryDelayAfterAttempt(6)).toBeUndefined();
    expect(retryDelayAfterAttempt(0)).toBeUndefined();
  });
});
