import { describe, expect, it } from 'vitest';

import { AppError } from '../../middleware/error-handler.js';
import {
  enforcePasswordPolicy,
  generateTemporaryPassword,
  hashPassword,
  verifyPassword,
} from './password.js';

describe('password security helpers', () => {
  it('generates high-entropy temporary passwords at the requested safe length', () => {
    const first = generateTemporaryPassword();
    const second = generateTemporaryPassword();

    expect(first).toHaveLength(20);
    expect(second).toHaveLength(20);
    expect(first).not.toBe(second);
  });

  it('rejects unsafe temporary-password lengths', () => {
    expect(() => generateTemporaryPassword(19)).toThrow(RangeError);
    expect(() => generateTemporaryPassword(129)).toThrow(RangeError);
    expect(() => generateTemporaryPassword(20.5)).toThrow(RangeError);
  });

  it('hashes and verifies a password without accepting wrong or malformed hashes', async () => {
    const password = 'Cedar river orbit quartz 2026!';
    const hash = await hashPassword(password);

    await expect(verifyPassword(hash, password)).resolves.toBe(true);
    await expect(verifyPassword(hash, 'different passphrase')).resolves.toBe(false);
    await expect(verifyPassword('not-an-argon2-hash', password)).resolves.toBe(false);
  });

  it('rejects common, account-related, whitespace-only, and control-character passwords', () => {
    const rejected = [
      'welcome-to-assetdesk-2026',
      'anita-safe-looking-passphrase',
      ' '.repeat(20),
      'Valid-looking phrase\u0000suffix',
    ];

    for (const password of rejected) {
      expect(() =>
        enforcePasswordPolicy(password, {
          workerId: 'GEU-WRK-A7K4',
          email: 'anita@example.edu',
        }),
      ).toThrowError(AppError);
    }
  });

  it('accepts a long account-independent passphrase', () => {
    expect(() =>
      enforcePasswordPolicy('Cedar river orbit quartz 2026!', {
        workerId: 'GEU-WRK-A7K4',
        email: 'anita@example.edu',
      }),
    ).not.toThrow();
  });
});
