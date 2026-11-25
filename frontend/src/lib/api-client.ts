import { ApiProblemSchema, AuthResponseSchema, type ApiProblem } from '@assetdesk/contracts';

const SESSION_EXPIRED_EVENT = 'assetdesk:session-expired';
const REFRESH_LOCK_NAME = 'assetdesk:session-refresh';
const REFRESH_ALREADY_ROTATED = 'REFRESH_ALREADY_ROTATED';
const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let csrfToken: string | null = null;
let refreshRequest: Promise<void> | null = null;
let lastActivityPing = 0;

export interface ApiRequestOptions extends Omit<RequestInit, 'body' | 'credentials'> {
  body?: BodyInit;
  json?: unknown;
  retryOnUnauthorized?: boolean;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly fields: Record<string, string>;

  constructor(problem: Partial<ApiProblem> & Pick<ApiProblem, 'detail' | 'status'>) {
    super(problem.detail);
    this.name = 'ApiError';
    this.status = problem.status;
    this.code = problem.code ?? 'REQUEST_FAILED';
    this.requestId = problem.requestId ?? null;
    this.fields = problem.fields ?? {};
  }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;

  const prefix = `${encodeURIComponent(name)}=`;
  const part = document.cookie
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));

  return part ? decodeURIComponent(part.slice(prefix.length)) : null;
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

/**
 * The CSRF cookie is shared by every tab and is rotated on each session refresh, so it is the
 * source of truth. The in-memory copy is only a fallback for browsers that hide the cookie.
 * Reading a stale in-memory token after another tab refreshed caused "security token invalid"
 * failures and forced sign-outs.
 */
export function getCsrfToken(): string | null {
  const cookieToken = readCookie('ad_csrf');
  if (cookieToken) csrfToken = cookieToken;
  return csrfToken;
}

function isAuthFailure(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Waits briefly for another tab's refresh response to update the shared CSRF cookie. */
async function waitForCsrfRotation(previous: string | null, timeoutMs = 3_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = readCookie('ad_csrf');
    if (current && current !== previous) return true;
    await delay(100);
  }
  return false;
}

/** Runs the callback while holding a lock shared by every AssetDesk tab in this browser. */
async function withRefreshLock<T>(callback: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks?.request) return callback();
  return locks.request(REFRESH_LOCK_NAME, callback);
}

function announceSessionExpired(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
}

export function onSessionExpired(listener: () => void): () => void {
  window.addEventListener(SESSION_EXPIRED_EVENT, listener);
  return () => window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
}

function buildRequest(path: string, options: ApiRequestOptions): [string, RequestInit] {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  let body = options.body;
  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.json);
  }

  if (unsafeMethods.has(method)) {
    const token = getCsrfToken();
    if (token) headers.set('X-CSRF-Token', token);
  }

  const requestOptions = { ...options };
  delete requestOptions.json;
  delete requestOptions.retryOnUnauthorized;
  return [
    path,
    {
      ...requestOptions,
      method,
      headers,
      credentials: 'include',
      ...(body !== undefined ? { body } : {}),
    },
  ];
}

async function problemFromResponse(response: Response): Promise<ApiError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const parsed = ApiProblemSchema.safeParse(payload);
  if (parsed.success) return new ApiError(parsed.data);

  return new ApiError({
    status: response.status || 500,
    detail:
      response.status === 0
        ? 'AssetDesk could not reach the server.'
        : 'AssetDesk could not complete this request.',
    code: 'REQUEST_FAILED',
    ...(response.headers.get('X-Request-ID')
      ? { requestId: response.headers.get('X-Request-ID') ?? '' }
      : {}),
  });
}

async function performRefresh(): Promise<void> {
  // Remember the token this tab last used. If it changes while we wait for the lock,
  // another tab already refreshed the shared cookies and a second rotation is unnecessary
  // (and would look like a refresh-token replay to the server).
  const tokenBeforeLock = readCookie('ad_csrf');

  await withRefreshLock(async () => {
    const tokenInLock = readCookie('ad_csrf');
    if (tokenInLock && tokenBeforeLock && tokenInLock !== tokenBeforeLock) {
      setCsrfToken(tokenInLock);
      return;
    }

    const token = getCsrfToken();
    const headers = new Headers({ Accept: 'application/json' });
    if (token) headers.set('X-CSRF-Token', token);

    let response: Response;
    try {
      response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers,
      });
    } catch {
      throw new ApiError({
        status: 503,
        detail: 'AssetDesk could not reach the server. Check your connection and try again.',
        code: 'NETWORK_ERROR',
      });
    }

    if (!response.ok) {
      const problem = await problemFromResponse(response);
      // Another tab (or a parallel request) rotated the session a moment ago. Its response
      // carries the new cookies, so wait for them instead of treating this as a sign-out.
      if (problem.code === REFRESH_ALREADY_ROTATED && (await waitForCsrfRotation(token))) {
        setCsrfToken(readCookie('ad_csrf'));
        return;
      }
      throw problem;
    }

    const result = AuthResponseSchema.parse(await response.json());
    setCsrfToken(result.data.csrfToken);
  });
}

async function refreshSession(): Promise<void> {
  if (refreshRequest) return refreshRequest;

  refreshRequest = performRefresh();

  try {
    await refreshRequest;
  } catch (error) {
    // Only a rejected session means the user is signed out. A network error or a
    // temporarily unavailable server must not end the session.
    if (isAuthFailure(error)) {
      setCsrfToken(null);
      announceSessionExpired();
    }
    throw error;
  } finally {
    refreshRequest = null;
  }
}

/**
 * The server extends the idle timeout only when the session is refreshed. Someone filling a
 * long form makes no API calls, so ping the session at most every few minutes while the
 * person is active. An idle user still times out on schedule.
 */
export async function keepSessionAlive(minIntervalMs = 4 * 60 * 1000): Promise<void> {
  const now = Date.now();
  if (now - lastActivityPing < minIntervalMs) return;
  lastActivityPing = now;
  try {
    await apiRequest<unknown>('/api/v1/auth/me');
  } catch {
    // Expiry is announced by apiRequest; other failures are retried after the interval.
  }
}

/**
 * True when a write request failed in a way that does not tell us whether the server saved it:
 * the connection dropped, a proxy timed out, or the server failed after doing the work.
 * Callers with an idempotency key can safely resend the same request to learn the outcome.
 */
export function isUncertainWriteFailure(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.code === 'NETWORK_ERROR' || error.code === 'REQUEST_FAILED') return true;
  return [500, 502, 503, 504].includes(error.status) && error.code === 'INTERNAL_SERVER_ERROR';
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const request = buildRequest(path, options);
  let response: Response;

  try {
    response = await fetch(...request);
  } catch {
    throw new ApiError({
      status: 503,
      detail: 'AssetDesk could not reach the server. Check your connection and try again.',
      code: 'NETWORK_ERROR',
    });
  }

  const shouldRefresh = options.retryOnUnauthorized !== false && response.status === 401;
  if (shouldRefresh) {
    await refreshSession();
    try {
      response = await fetch(...buildRequest(path, options));
    } catch {
      throw new ApiError({
        status: 503,
        detail: 'AssetDesk could not reach the server. Check your connection and try again.',
        code: 'NETWORK_ERROR',
      });
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      setCsrfToken(null);
      announceSessionExpired();
    }
    throw await problemFromResponse(response);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiBlobRequest(path: string, options: ApiRequestOptions = {}): Promise<Blob> {
  const requestOptions: ApiRequestOptions = {
    ...options,
    headers: { ...Object.fromEntries(new Headers(options.headers)), Accept: 'text/csv' },
  };
  const request = buildRequest(path, requestOptions);
  let response: Response;
  try {
    response = await fetch(...request);
  } catch {
    throw new ApiError({
      status: 503,
      detail: 'AssetDesk could not reach the server. Check your connection and try again.',
      code: 'NETWORK_ERROR',
    });
  }
  if (requestOptions.retryOnUnauthorized !== false && response.status === 401) {
    await refreshSession();
    try {
      response = await fetch(...buildRequest(path, requestOptions));
    } catch {
      throw new ApiError({
        status: 503,
        detail: 'AssetDesk could not reach the server. Check your connection and try again.',
        code: 'NETWORK_ERROR',
      });
    }
  }
  if (!response.ok) throw await problemFromResponse(response);
  return response.blob();
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function resetApiClientState(): void {
  csrfToken = null;
  refreshRequest = null;
  lastActivityPing = 0;
}
