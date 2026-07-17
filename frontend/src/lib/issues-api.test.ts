import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetApiClientState, setCsrfToken } from './api-client';
import { createIssue, createReturn } from './issues-api';

function conflict(): Response {
  return new Response(
    JSON.stringify({
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail: 'Test request stopped after headers were captured.',
      code: 'TEST_CONFLICT',
      requestId: 'test-request-id',
    }),
    { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetApiClientState();
});

describe('Issue and Return idempotency', () => {
  it('sends the caller-owned key when confirming an Issue Record', async () => {
    const fetchMock = vi.fn().mockResolvedValue(conflict());
    vi.stubGlobal('fetch', fetchMock);
    setCsrfToken('csrf-test-token');

    await expect(
      createIssue(
        {
          assignmentType: 'LONG_TERM',
          receiverCode: 'GEU-RCV-000125',
          lines: [
            {
              trackingMode: 'QUANTITY',
              materialCode: 'GEU-MAT-000241',
              quantity: 2,
            },
          ],
        },
        'issue-key-kept-across-retry',
      ),
    ).rejects.toMatchObject({ status: 409 });

    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(options.headers).get('Idempotency-Key')).toBe('issue-key-kept-across-retry');
  });

  it('sends the caller-owned key when confirming a Return', async () => {
    const fetchMock = vi.fn().mockResolvedValue(conflict());
    vi.stubGlobal('fetch', fetchMock);
    setCsrfToken('csrf-test-token');

    await expect(
      createReturn(
        'GEU-ISS-2026-000123',
        {
          items: [
            {
              trackingMode: 'QUANTITY',
              lineId: '0f14c7d2-cf55-4f24-b7f8-39aca4b79ac9',
              quantity: 1,
            },
          ],
        },
        'return-key-kept-across-retry',
      ),
    ).rejects.toMatchObject({ status: 409 });

    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(options.headers).get('Idempotency-Key')).toBe(
      'return-key-kept-across-retry',
    );
  });
});
