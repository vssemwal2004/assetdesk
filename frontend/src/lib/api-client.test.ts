import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiRequest, resetApiClientState, setCsrfToken } from './api-client';

const user = {
  id: 'admin-user-id',
  workerId: 'GEU-WRK-A7K4',
  name: 'Anita Sharma',
  email: 'anita.sharma@university.edu',
  contact: null,
  department: 'IT Services',
  role: 'ADMIN',
  status: 'ACTIVE',
  mustChangePassword: false,
} as const;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });
}

function unauthorized(): Response {
  return json(
    {
      type: 'about:blank',
      title: 'Session expired',
      status: 401,
      detail: 'Sign in to continue.',
      code: 'AUTH_REQUIRED',
      requestId: 'request-401',
    },
    401,
  );
}

describe('API client security behavior', () => {
  afterEach(() => {
    resetApiClientState();
    vi.unstubAllGlobals();
  });

  it('serializes concurrent refresh attempts and retries both requests', async () => {
    setCsrfToken('a'.repeat(32));
    let resourceCalls = 0;
    let refreshCalls = 0;
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const path = String(input);
      if (path.includes('/api/v1/auth/refresh')) {
        refreshCalls += 1;
        return Promise.resolve(json({ data: { user, csrfToken: 'b'.repeat(32) } }));
      }
      resourceCalls += 1;
      return Promise.resolve(resourceCalls <= 2 ? unauthorized() : json({ data: { ok: true } }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([
      apiRequest<{ data: { ok: boolean } }>('/api/v1/workers?page=1'),
      apiRequest<{ data: { ok: boolean } }>('/api/v1/workers?page=2'),
    ]);

    expect(first.data.ok).toBe(true);
    expect(second.data.ok).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(resourceCalls).toBe(4);
  });

  it('sends the in-memory CSRF token on unsafe requests', async () => {
    setCsrfToken('c'.repeat(32));
    const fetchMock = vi.fn().mockResolvedValue(json({ data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/api/v1/workers', { method: 'POST', json: { name: 'Ravi' } });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('c'.repeat(32));
    expect(init.credentials).toBe('include');
  });
});
