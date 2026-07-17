import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';

import type { UserRole } from '@assetdesk/contracts';

import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../middleware/error-handler.js';

export type AccessPurpose = 'FULL_ACCESS' | 'PASSWORD_CHANGE';

export interface AccessClaims {
  sub: string;
  sid: string;
  role: UserRole;
  authVersion: number;
  purpose: AccessPurpose;
}

const runtimeSecret = env.JWT_ACCESS_SECRET ?? randomBytes(64).toString('base64url');
const signingKey = new TextEncoder().encode(runtimeSecret);
const ISSUER = 'assetdesk-api';
const AUDIENCE = 'assetdesk-web';
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const UUID_V4_PATTERN = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const REFRESH_SECRET_PATTERN = /^[A-Za-z\d_-]{43}$/;

if (!env.JWT_ACCESS_SECRET) {
  logger.warn('JWT_ACCESS_SECRET is not configured; using an ephemeral development key');
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  if (
    !OBJECT_ID_PATTERN.test(claims.sub) ||
    !UUID_V4_PATTERN.test(claims.sid) ||
    !Number.isSafeInteger(claims.authVersion) ||
    claims.authVersion < 1
  ) {
    throw new TypeError('Invalid access-token claims.');
  }

  return new SignJWT({
    sid: claims.sid,
    role: claims.role,
    authVersion: claims.authVersion,
    purpose: claims.purpose,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(claims.sub)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_MINUTES}m`)
    .sign(signingKey);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  try {
    const { payload, protectedHeader } = await jwtVerify(token, signingKey, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
      clockTolerance: 5,
    });

    if (protectedHeader.typ !== 'at+jwt') throw new Error('Unexpected JWT type');
    if (
      typeof payload.sub !== 'string' ||
      !OBJECT_ID_PATTERN.test(payload.sub) ||
      typeof payload.sid !== 'string' ||
      !UUID_V4_PATTERN.test(payload.sid) ||
      (payload.role !== 'ADMIN' && payload.role !== 'WORKER') ||
      typeof payload.authVersion !== 'number' ||
      !Number.isSafeInteger(payload.authVersion) ||
      payload.authVersion < 1 ||
      (payload.purpose !== 'FULL_ACCESS' && payload.purpose !== 'PASSWORD_CHANGE') ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number' ||
      typeof payload.jti !== 'string' ||
      !UUID_V4_PATTERN.test(payload.jti)
    ) {
      throw new Error('Invalid access-token claims');
    }

    return {
      sub: payload.sub,
      sid: payload.sid,
      role: payload.role,
      authVersion: payload.authVersion,
      purpose: payload.purpose,
    };
  } catch {
    throw new AppError(401, 'INVALID_ACCESS_TOKEN', 'Your session is no longer valid.');
  }
}

export function createSessionId(): string {
  return randomUUID();
}

export function createFamilyId(): string {
  return randomUUID();
}

export function createRefreshToken(sid: string): string {
  if (!UUID_V4_PATTERN.test(sid)) {
    throw new TypeError('Invalid refresh-session ID.');
  }
  return `${sid}.${randomBytes(32).toString('base64url')}`;
}

export function getRefreshSessionId(token: string): string | null {
  if (token.length > 100) return null;
  const segments = token.split('.');
  if (segments.length !== 2) return null;
  const [sid, secret] = segments;
  if (!sid || !secret || !UUID_V4_PATTERN.test(sid) || !REFRESH_SECRET_PATTERN.test(secret)) {
    return null;
  }
  return sid;
}

export function createCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashIp(ip: string | undefined): string | undefined {
  return ip ? createHmac('sha256', runtimeSecret).update(ip).digest('hex') : undefined;
}
