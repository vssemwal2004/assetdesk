import { env } from './env.js';

function origin(value: string): string {
  return new URL(value).origin;
}

export const allowedOrigins = Object.freeze(
  new Set([origin(env.APP_ORIGIN), ...env.ADDITIONAL_APP_ORIGINS.map(origin)]),
);

export function isAllowedOrigin(value: string | undefined): boolean {
  if (!value) return false;
  if (allowedOrigins.has(value)) return true;
  if (env.NODE_ENV !== 'production') {
    const { hostname } = new URL(value);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  }
  return false;
}
