import type { Response } from 'express';

import { env } from '../../config/env.js';
import type { SessionBundle } from './session.service.js';

export const AUTH_COOKIE = 'ad_access';
export const REFRESH_COOKIE = 'ad_refresh';
export const CSRF_COOKIE = 'ad_csrf';

const secure = env.NODE_ENV === 'production' || env.APP_ORIGIN.startsWith('https://');
const ACCESS_COOKIE_PATH = '/api/v1';
const REFRESH_COOKIE_PATH = '/api/v1/auth/refresh';
const CSRF_COOKIE_PATH = '/';

export function setSessionCookies(response: Response, bundle: SessionBundle): void {
  const base = {
    secure,
    sameSite: 'strict' as const,
  };

  response.cookie(AUTH_COOKIE, bundle.accessToken, {
    ...base,
    httpOnly: true,
    path: ACCESS_COOKIE_PATH,
  });
  response.cookie(REFRESH_COOKIE, bundle.refreshToken, {
    ...base,
    httpOnly: true,
    path: REFRESH_COOKIE_PATH,
  });
  response.cookie(CSRF_COOKIE, bundle.csrfToken, {
    ...base,
    httpOnly: false,
    path: CSRF_COOKIE_PATH,
  });
}

export function clearSessionCookies(response: Response): void {
  const base = { secure, sameSite: 'strict' as const };
  response.clearCookie(AUTH_COOKIE, {
    ...base,
    httpOnly: true,
    path: ACCESS_COOKIE_PATH,
  });
  response.clearCookie(REFRESH_COOKIE, {
    ...base,
    httpOnly: true,
    path: REFRESH_COOKIE_PATH,
  });
  response.clearCookie(CSRF_COOKIE, {
    ...base,
    httpOnly: false,
    path: CSRF_COOKIE_PATH,
  });
}
