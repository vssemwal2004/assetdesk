import { createHash } from 'node:crypto';

import type { Request } from 'express';

import { AppError } from '../../middleware/error-handler.js';

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;

export function parseIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AppError(
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
      `Provide the ${IDEMPOTENCY_HEADER} header for this request.`,
    );
  }
  if (value !== value.trim() || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new AppError(
      400,
      'IDEMPOTENCY_KEY_INVALID',
      'The idempotency key must be 16–128 URL-safe ASCII characters.',
    );
  }
  return value;
}

export function idempotencyKeyFromRequest(request: Pick<Request, 'get'>): string {
  return parseIdempotencyKey(request.get(IDEMPOTENCY_HEADER));
}

export function hashIdempotencyKey(key: string): string {
  return createHash('sha256').update(parseIdempotencyKey(key), 'utf8').digest('hex');
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => stableJsonValue(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableJsonValue(entry)]),
    );
  }
  return value;
}

export function fingerprintRequest(value: unknown): string {
  const canonical = JSON.stringify(stableJsonValue(value));
  if (canonical === undefined) throw new TypeError('The request payload cannot be fingerprinted.');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function idempotencyConflict(): AppError {
  return new AppError(
    409,
    'IDEMPOTENCY_KEY_REUSED',
    'This idempotency key was already used with a different request.',
  );
}
