import { timingSafeEqual } from 'node:crypto';

import { Types } from 'mongoose';

import type { UserRole } from '@assetdesk/contracts';

import { env } from '../../config/env.js';
import { AppError } from '../../middleware/error-handler.js';
import { UserModel, type UserRecord } from '../users/user.model.js';
import { AuthSessionModel } from './auth-session.model.js';
import {
  createCsrfToken,
  createFamilyId,
  createRefreshToken,
  createSessionId,
  getRefreshSessionId,
  hashIp,
  hashToken,
  signAccessToken,
  type AccessPurpose,
} from './tokens.js';

export interface SessionBundle {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  absoluteExpiresAt: Date;
}

interface SessionContext {
  userAgent?: string;
  ip?: string;
}

export interface ActiveSessionRecord {
  sid: string;
  userId: Types.ObjectId;
  csrfTokenHash: string;
}

function idleMinutes(role: UserRole): number {
  return role === 'ADMIN' ? env.ADMIN_SESSION_IDLE_MINUTES : env.WORKER_SESSION_IDLE_MINUTES;
}

function sessionPurpose(user: Pick<UserRecord, 'mustChangePassword'>): AccessPurpose {
  return user.mustChangePassword ? 'PASSWORD_CHANGE' : 'FULL_ACCESS';
}

function valuesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function validateCsrfToken(
  csrfHeader: string | undefined,
  csrfCookie: string | undefined,
  expectedHash: string,
): boolean {
  return Boolean(
    csrfHeader &&
    csrfCookie &&
    valuesMatch(csrfHeader, csrfCookie) &&
    valuesMatch(hashToken(csrfHeader), expectedHash),
  );
}

export async function createSession(
  user: Pick<UserRecord, '_id' | 'role' | 'authVersion' | 'mustChangePassword'>,
  context: SessionContext,
): Promise<SessionBundle> {
  const now = new Date();
  const absoluteExpiresAt = new Date(now.getTime() + env.SESSION_ABSOLUTE_HOURS * 60 * 60 * 1000);
  const proposedIdleExpiry = new Date(now.getTime() + idleMinutes(user.role) * 60 * 1000);
  const idleExpiresAt = new Date(
    Math.min(proposedIdleExpiry.getTime(), absoluteExpiresAt.getTime()),
  );
  const sid = createSessionId();
  const refreshToken = createRefreshToken(sid);
  const csrfToken = createCsrfToken();
  const ipHash = hashIp(context.ip);

  await AuthSessionModel.create({
    sid,
    familyId: createFamilyId(),
    userId: user._id,
    refreshTokenHash: hashToken(refreshToken),
    previousRefreshTokenHashes: [],
    csrfTokenHash: hashToken(csrfToken),
    ...(context.userAgent ? { userAgentSummary: context.userAgent.slice(0, 240) } : {}),
    ...(ipHash ? { ipHash } : {}),
    lastUsedAt: now,
    idleExpiresAt,
    absoluteExpiresAt,
  });

  const accessToken = await signAccessToken({
    sub: user._id.toString(),
    sid,
    role: user.role,
    authVersion: user.authVersion,
    purpose: sessionPurpose(user),
  });

  return { accessToken, refreshToken, csrfToken, absoluteExpiresAt };
}

export async function rotateSession(
  refreshToken: string,
  csrfHeader: string | undefined,
  csrfCookie: string | undefined,
): Promise<{ bundle: SessionBundle; user: UserRecord }> {
  const sid = getRefreshSessionId(refreshToken);
  if (!sid) throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Your session has expired.');

  const session = await AuthSessionModel.findOne({ sid });
  if (!session || session.revokedAt) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Your session has expired.');
  }

  const now = new Date();
  if (session.idleExpiresAt <= now || session.absoluteExpiresAt <= now) {
    await revokeSession(session.sid, 'SESSION_EXPIRED');
    throw new AppError(401, 'SESSION_EXPIRED', 'Your session has expired.');
  }

  if (!csrfHeader || !csrfCookie || !valuesMatch(csrfHeader, csrfCookie)) {
    throw new AppError(403, 'CSRF_VALIDATION_FAILED', 'The security token is invalid.');
  }
  if (!valuesMatch(hashToken(csrfHeader), session.csrfTokenHash)) {
    throw new AppError(403, 'CSRF_VALIDATION_FAILED', 'The security token is invalid.');
  }

  const incomingHash = hashToken(refreshToken);
  if (!valuesMatch(incomingHash, session.refreshTokenHash)) {
    if (session.previousRefreshTokenHashes.some((hash) => valuesMatch(hash, incomingHash))) {
      await revokeSession(session.sid, 'REFRESH_TOKEN_REPLAY');
      throw new AppError(401, 'REFRESH_TOKEN_REPLAY', 'Your session was revoked for security.');
    }
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Your session has expired.');
  }

  const user = await UserModel.findById(session.userId);
  if (!user || user.status === 'DISABLED') {
    await revokeSession(session.sid, 'ACCOUNT_UNAVAILABLE');
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This account is not available.');
  }

  const nextRefreshToken = createRefreshToken(session.sid);
  const nextCsrfToken = createCsrfToken();
  const proposedIdleExpiry = new Date(now.getTime() + idleMinutes(user.role) * 60 * 1000);
  const nextIdleExpiry = new Date(
    Math.min(proposedIdleExpiry.getTime(), session.absoluteExpiresAt.getTime()),
  );
  const previousHashes = [...session.previousRefreshTokenHashes, session.refreshTokenHash].slice(
    -128,
  );

  const rotation = await AuthSessionModel.updateOne(
    {
      _id: session._id,
      refreshTokenHash: incomingHash,
      revokedAt: { $exists: false },
      idleExpiresAt: { $gt: now },
      absoluteExpiresAt: { $gt: now },
    },
    {
      $set: {
        refreshTokenHash: hashToken(nextRefreshToken),
        previousRefreshTokenHashes: previousHashes,
        csrfTokenHash: hashToken(nextCsrfToken),
        lastUsedAt: now,
        idleExpiresAt: nextIdleExpiry,
      },
    },
  );

  if (rotation.modifiedCount !== 1) {
    await revokeSession(session.sid, 'REFRESH_TOKEN_REPLAY');
    throw new AppError(
      401,
      'REFRESH_TOKEN_REPLAY',
      'Your session was revoked because the refresh token was reused.',
    );
  }

  const accessToken = await signAccessToken({
    sub: user._id.toString(),
    sid: session.sid,
    role: user.role,
    authVersion: user.authVersion,
    purpose: sessionPurpose(user),
  });

  return {
    user,
    bundle: {
      accessToken,
      refreshToken: nextRefreshToken,
      csrfToken: nextCsrfToken,
      absoluteExpiresAt: session.absoluteExpiresAt,
    },
  };
}

export async function getActiveSession(sid: string): Promise<ActiveSessionRecord | null> {
  const now = new Date();
  return AuthSessionModel.findOne(
    {
      sid,
      revokedAt: { $exists: false },
      idleExpiresAt: { $gt: now },
      absoluteExpiresAt: { $gt: now },
    },
    { sid: 1, userId: 1, csrfTokenHash: 1 },
  ).lean<ActiveSessionRecord>();
}

export async function revokeSession(sid: string, reason: string): Promise<void> {
  await AuthSessionModel.updateOne(
    { sid, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
}

export async function revokeAllUserSessions(userId: string, reason: string): Promise<void> {
  await AuthSessionModel.updateMany(
    { userId: new Types.ObjectId(userId), revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
}
