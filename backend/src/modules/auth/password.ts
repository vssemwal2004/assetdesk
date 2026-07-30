import { randomInt } from 'node:crypto';

import argon2 from 'argon2';

import { AppError } from '../../middleware/error-handler.js';

const TEMPORARY_PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

export function generateTemporaryPassword(length = 20): string {
  if (!Number.isInteger(length) || length < 20 || length > 128) {
    throw new RangeError('Temporary password length must be an integer between 20 and 128.');
  }

  return Array.from({ length }, () => {
    const index = randomInt(0, TEMPORARY_PASSWORD_ALPHABET.length);
    return TEMPORARY_PASSWORD_ALPHABET[index] ?? 'X';
  }).join('');
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function enforcePasswordPolicy(
  password: string,
  _context?: { workerId?: string; email?: string },
): void {
  const fields: Record<string, string> = {};

  if (password.length < 6 || password.length > 128) {
    fields.newPassword = 'Use a password between 6 and 128 characters.';
  }

  if (!/[^A-Za-z0-9\s]/u.test(password)) {
    fields.newPassword ??= 'Include at least one special character.';
  }

  if (!/\S/u.test(password) || containsControlCharacter(password)) {
    fields.newPassword ??= 'Use a password without control characters or only whitespace.';
  }

  if (Object.keys(fields).length > 0) {
    throw new AppError(
      400,
      'PASSWORD_POLICY_FAILED',
      'The new password is not secure enough.',
      fields,
    );
  }
}
