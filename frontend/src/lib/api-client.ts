import {
  ApiProblemSchema,
  AuthResponseSchema,
  type ApiProblem,
  type AuthUser,
} from '@assetdesk/contracts';

const SESSION_EXPIRED_EVENT = 'assetdesk:session-expired';
const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let csrfToken: string | null = null;
let refreshRequest: Promise<AuthUser> | null = null;

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

export function getCsrfToken(): string | null {
  csrfToken ??= readCookie('ad_csrf');
  return csrfToken;
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

async function refreshSession(): Promise<AuthUser> {
  if (refreshRequest) return refreshRequest;

  refreshRequest = (async () => {
    const token = getCsrfToken();
    const headers = new Headers({ Accept: 'application/json' });
    if (token) headers.set('X-CSRF-Token', token);

    const response = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers,
    });

    if (!response.ok) throw await problemFromResponse(response);

    const result = AuthResponseSchema.parse(await response.json());
    setCsrfToken(result.data.csrfToken);
    return result.data.user;
  })();

  try {
    return await refreshRequest;
  } catch (error) {
    setCsrfToken(null);
    announceSessionExpired();
    throw error;
  } finally {
    refreshRequest = null;
  }
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
    response = await fetch(...buildRequest(path, requestOptions));
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
}
