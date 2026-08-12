import { randomBytes, randomInt, randomUUID } from 'node:crypto';

import { WorkerIdSchema, type AuthUser } from '@assetdesk/contracts';
import mongoose from 'mongoose';

import { env } from '../../config/env.js';
import { AppError } from '../../middleware/error-handler.js';
import { toAuthUser } from '../users/user.mapper.js';
import { UserModel, type UserDocument, type UserRecord } from '../users/user.model.js';
import { enqueuePasswordChanged } from '../notifications/notification.service.js';
import { enforcePasswordPolicy, hashPassword, verifyPassword } from './password.js';
import { PasswordResetModel } from './password-reset.model.js';
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

export interface PasswordResetStartResult {
  resetId: string;
  expiresAt: Date;
}

const dummyHashPromise = hashPassword('AssetDesk dummy verification value 2026');
const OTP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PASSWORD_RESET_TTL_MINUTES = 10;

function normalizedIdentifier(identifier: string): { workerId?: string; emailNormalized?: string } {
  const value = identifier.trim();
  const workerId = value.toUpperCase();
  return WorkerIdSchema.safeParse(workerId).success
    ? { workerId }
    : { emailNormalized: value.toLowerCase() };
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function formatIst(value: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(value);
}

function generateOtp(): string {
  return Array.from(
    { length: 5 },
    () => OTP_ALPHABET[randomInt(0, OTP_ALPHABET.length)] ?? 'A',
  ).join('');
}

function resetExpired(): AppError {
  return new AppError(
    400,
    'PASSWORD_RESET_EXPIRED',
    'The verification code has expired. Request a new code.',
  );
}

function resetInvalid(): AppError {
  return new AppError(
    400,
    'PASSWORD_RESET_INVALID',
    'The verification code is incorrect. Check the code and try again.',
    { otp: 'Enter the 5-character code sent to your email.' },
  );
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

export async function startForgotPassword(email: string): Promise<PasswordResetStartResult> {
  const emailNormalized = normalizeEmail(email);
  const user = await UserModel.findOne({
    emailNormalized,
    status: { $in: ['ACTIVE', 'INVITED'] },
  });
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
  const publicResetId = `rst_${randomBytes(18).toString('base64url')}`;

  if (!user) {
    return { resetId: publicResetId, expiresAt };
  }

  const otp = generateOtp();
  const otpHash = await hashPassword(otp);
  const reset = await PasswordResetModel.create({
    resetId: publicResetId,
    userId: user._id,
    emailNormalized,
    otpHash,
    expiresAt,
    attemptCount: 0,
  });

  const { EmailJobModel } = await import('../notifications/email-job.model.js');
  await EmailJobModel.create({
    eventKey: `password-reset:${reset.resetId}:${user.authVersion}`,
    eventType: 'PASSWORD_RESET_OTP',
    recipientRole: 'ACCOUNT_OWNER',
    recipientId: user._id.toString(),
    recipientEmailNormalized: user.emailNormalized,
    recipientName: user.name,
    templateKey: 'PASSWORD_RESET_OTP',
    templateVersion: 1,
    templateParams: {
      name: user.name,
      workerId: user.workerId,
      otp,
      expiresAt: formatIst(expiresAt),
    },
    status: 'QUEUED',
    attemptCount: 0,
    nextAttemptAt: new Date(),
    idempotencyKey: `password-reset:${reset.resetId}`,
  });

  return { resetId: reset.resetId, expiresAt };
}

export async function verifyForgotPasswordOtp(resetId: string, otp: string): Promise<void> {
  const reset = await PasswordResetModel.findOne({
    resetId,
    consumedAt: { $exists: false },
  }).select('+otpHash');
  if (!reset || reset.expiresAt <= new Date()) throw resetExpired();
  if (reset.attemptCount >= 5) throw resetInvalid();
  const valid = await verifyPassword(reset.otpHash, otp.toUpperCase());
  if (!valid) {
    reset.attemptCount += 1;
    await reset.save();
    throw resetInvalid();
  }
  if (!reset.verifiedAt) {
    reset.verifiedAt = new Date();
    await reset.save();
  }
}

export async function completeForgotPassword(
  resetId: string,
  otp: string,
  newPassword: string,
  context: RequestContext,
): Promise<AuthResult> {
  const reset = await PasswordResetModel.findOne({
    resetId,
    consumedAt: { $exists: false },
  }).select('+otpHash');
  if (!reset || reset.expiresAt <= new Date()) throw resetExpired();
  if (reset.attemptCount >= 5) throw resetInvalid();
  if (!(await verifyPassword(reset.otpHash, otp.toUpperCase()))) {
    reset.attemptCount += 1;
    await reset.save();
    throw resetInvalid();
  }
  const user = await UserModel.findById(reset.userId).select('+passwordHash');
  if (!user || user.status === 'DISABLED') {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This account is not available.');
  }
  const result = await replacePasswordAndSession(user, newPassword, context, 'PASSWORD_RESET');
  reset.verifiedAt = reset.verifiedAt ?? new Date();
  reset.consumedAt = new Date();
  await reset.save();
  return result;
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
