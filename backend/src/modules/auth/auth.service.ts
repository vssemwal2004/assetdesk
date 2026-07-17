import { WorkerIdSchema, type AuthUser } from '@assetdesk/contracts';
import mongoose from 'mongoose';

import { env } from '../../config/env.js';
import { AppError } from '../../middleware/error-handler.js';
import { toAuthUser } from '../users/user.mapper.js';
import { UserModel, type UserDocument, type UserRecord } from '../users/user.model.js';
import { enqueuePasswordChanged } from '../notifications/notification.service.js';
import { enforcePasswordPolicy, hashPassword, verifyPassword } from './password.js';
import {
  createSession,
  revokeAllUserSessions,
  revokeSession,
  rotateSession,
  type SessionBundle,
} from './session.service.js';

interface RequestContext {
  userAgent?: string;
  ip?: string;
}

interface AuthResult {
  user: AuthUser;
  bundle: SessionBundle;
}

const dummyHashPromise = hashPassword('AssetDesk dummy verification value 2026');

function normalizedIdentifier(identifier: string): { workerId?: string; emailNormalized?: string } {
  const value = identifier.trim();
  const workerId = value.toUpperCase();
  return WorkerIdSchema.safeParse(workerId).success
    ? { workerId }
    : { emailNormalized: value.toLowerCase() };
}

async function recordFailedLogin(user: Pick<UserRecord, '_id'>): Promise<void> {
  const now = new Date();
  const unlocked = {
    $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lte: now } }],
  };
  const incremented = await UserModel.findOneAndUpdate(
    { _id: user._id, failedLoginCount: { $lt: 4 }, ...unlocked },
    { $inc: { failedLoginCount: 1 } },
    { returnDocument: 'after', projection: { _id: 1 } },
  );

  if (incremented) return;

  await UserModel.updateOne(
    { _id: user._id, failedLoginCount: { $gte: 4 }, ...unlocked },
    {
      $set: {
        failedLoginCount: 0,
        lockedUntil: new Date(now.getTime() + 15 * 60 * 1000),
      },
    },
  );
}

export async function login(
  identifier: string,
  password: string,
  context: RequestContext,
): Promise<AuthResult> {
  const user = await UserModel.findOne(normalizedIdentifier(identifier)).select('+passwordHash');

  if (!user) {
    await verifyPassword(await dummyHashPromise, password);
    throw new AppError(401, 'INVALID_CREDENTIALS', 'The Worker ID/email or password is incorrect.');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await verifyPassword(user.passwordHash, password);
    throw new AppError(401, 'INVALID_CREDENTIALS', 'The Worker ID/email or password is incorrect.');
  }

  const passwordValid = await verifyPassword(user.passwordHash, password);
  if (!passwordValid) {
    await recordFailedLogin(user);
    throw new AppError(401, 'INVALID_CREDENTIALS', 'The Worker ID/email or password is incorrect.');
  }

  if (user.status === 'DISABLED') {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled.');
  }

  if (
    user.mustChangePassword &&
    (!user.temporaryPasswordExpiresAt || user.temporaryPasswordExpiresAt <= new Date())
  ) {
    throw new AppError(
      403,
      'TEMPORARY_PASSWORD_EXPIRED',
      'The temporary password has expired. Ask an Admin to regenerate it.',
    );
  }

  user.failedLoginCount = 0;
  user.set('lockedUntil', undefined);
  user.lastLoginAt = new Date();
  await user.save();

  const bundle = await createSession(user, context);
  return { user: toAuthUser(user), bundle };
}

async function replacePasswordAndSession(
  user: UserDocument,
  newPassword: string,
  context: RequestContext,
  reason: string,
): Promise<AuthResult> {
  enforcePasswordPolicy(newPassword, { workerId: user.workerId, email: user.email });
  if (await verifyPassword(user.passwordHash, newPassword)) {
    throw new AppError(
      400,
      'PASSWORD_REUSE_NOT_ALLOWED',
      'The new password must be different from the current password.',
      { newPassword: 'Choose a different password.' },
    );
  }

  const passwordHash = await hashPassword(newPassword);
  const changedAt = new Date();
  const session = await mongoose.startSession();
  let updatedUser: UserDocument | null | undefined;
  try {
    await session.withTransaction(async () => {
      updatedUser = await UserModel.findOneAndUpdate(
        {
          _id: user._id,
          authVersion: user.authVersion,
          passwordHash: user.passwordHash,
          status: { $ne: 'DISABLED' },
        },
        {
          $set: {
            passwordHash,
            mustChangePassword: false,
            status: 'ACTIVE',
            passwordChangedAt: changedAt,
          },
          $unset: { temporaryPasswordExpiresAt: 1 },
          $inc: { authVersion: 1 },
        },
        { returnDocument: 'after', runValidators: true, session },
      ).select('+passwordHash');
      if (!updatedUser) return;
      await enqueuePasswordChanged({
        userId: updatedUser._id,
        workerId: updatedUser.workerId,
        name: updatedUser.name,
        email: updatedUser.email,
        changedAt,
        authVersion: updatedUser.authVersion,
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  const committedUser = updatedUser as UserDocument | undefined;
  if (!committedUser) {
    throw new AppError(
      409,
      'CREDENTIALS_CHANGED',
      'Your account credentials changed while this request was being processed. Sign in again.',
    );
  }

  await revokeAllUserSessions(committedUser._id.toString(), reason);
  const bundle = await createSession(committedUser, context);
  return { user: toAuthUser(committedUser), bundle };
}

export async function changeInitialPassword(
  userId: string,
  newPassword: string,
  context: RequestContext,
): Promise<AuthResult> {
  const user = await UserModel.findById(userId).select('+passwordHash');
  if (!user) throw new AppError(401, 'AUTH_REQUIRED', 'Your account is unavailable.');
  if (user.status === 'DISABLED') {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled.');
  }
  if (!user.mustChangePassword) {
    throw new AppError(
      409,
      'INITIAL_PASSWORD_ALREADY_CHANGED',
      'The initial password was already changed.',
    );
  }
  if (!user.temporaryPasswordExpiresAt || user.temporaryPasswordExpiresAt <= new Date()) {
    throw new AppError(
      403,
      'TEMPORARY_PASSWORD_EXPIRED',
      'The temporary password has expired. Ask an Admin to regenerate it.',
    );
  }
  return replacePasswordAndSession(user, newPassword, context, 'INITIAL_PASSWORD_CHANGED');
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  context: RequestContext,
): Promise<AuthResult> {
  const user = await UserModel.findById(userId).select('+passwordHash');
  if (!user) throw new AppError(401, 'AUTH_REQUIRED', 'Your account is unavailable.');
  if (user.status === 'DISABLED') {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled.');
  }
  if (user.mustChangePassword) {
    throw new AppError(
      403,
      'PASSWORD_CHANGE_REQUIRED',
      'Create a new password before using AssetDesk.',
    );
  }
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new AppError(400, 'CURRENT_PASSWORD_INCORRECT', 'The current password is incorrect.', {
      currentPassword: 'Enter the current password for this account.',
    });
  }
  return replacePasswordAndSession(user, newPassword, context, 'PASSWORD_CHANGED');
}

export async function refresh(
  refreshToken: string,
  csrfHeader: string | undefined,
  csrfCookie: string | undefined,
): Promise<AuthResult> {
  const result = await rotateSession(refreshToken, csrfHeader, csrfCookie);
  return { user: toAuthUser(result.user), bundle: result.bundle };
}

export async function logout(sid: string): Promise<void> {
  await revokeSession(sid, 'USER_LOGOUT');
}

export async function getCurrentUser(userId: string): Promise<AuthUser> {
  const user = await UserModel.findById(userId);
  if (!user || user.status === 'DISABLED') {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This account is not available.');
  }
  return toAuthUser(user);
}

export function temporaryPasswordExpiry(): Date {
  return new Date(Date.now() + env.TEMP_PASSWORD_TTL_HOURS * 60 * 60 * 1000);
}
