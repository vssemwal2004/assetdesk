import { describe, expect, it } from 'vitest';

import { AppError } from '../../middleware/error-handler.js';
import {
  createRefreshToken,
  createSessionId,
  getRefreshSessionId,
  hashIp,
  hashToken,
  signAccessToken,
  verifyAccessToken,
} from './tokens.js';

describe('auth tokens', () => {
  it('round-trips a signed access token with constrained claims', async () => {
    const claims = {
      sub: '507f1f77bcf86cd799439011',
      sid: createSessionId(),
      role: 'WORKER' as const,
      authVersion: 3,
      purpose: 'FULL_ACCESS' as const,
    };

    const token = await signAccessToken(claims);
    await expect(verifyAccessToken(token)).resolves.toEqual(claims);
  });

  it('rejects malformed claims and tampered access tokens', async () => {
    await expect(
      signAccessToken({
        sub: 'not-an-object-id',
        sid: createSessionId(),
        role: 'WORKER',
        authVersion: 1,
        purpose: 'FULL_ACCESS',
      }),
    ).rejects.toThrow(TypeError);

    const token = await signAccessToken({
      sub: '507f1f77bcf86cd799439011',
      sid: createSessionId(),
      role: 'ADMIN',
      authVersion: 1,
      purpose: 'FULL_ACCESS',
    });
    const segments = token.split('.');
    expect(segments).toHaveLength(3);
    const signature = segments[2]!;
    const tamperedSignature = `${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
    const tampered = `${segments[0]}.${segments[1]}.${tamperedSignature}`;

    await expect(verifyAccessToken(tampered)).rejects.toBeInstanceOf(AppError);
  });

  it('accepts only the refresh-token format generated for a valid session ID', () => {
    const sid = createSessionId();
    const token = createRefreshToken(sid);

    expect(getRefreshSessionId(token)).toBe(sid);
    expect(getRefreshSessionId(`${token}.extra`)).toBeNull();
    expect(getRefreshSessionId(`invalid.${'a'.repeat(43)}`)).toBeNull();
    expect(getRefreshSessionId('x'.repeat(101))).toBeNull();
    expect(() => createRefreshToken('invalid')).toThrow(TypeError);
  });

  it('uses deterministic one-way hashes without exposing raw IP values', () => {
    const value = '192.0.2.10';
    expect(hashToken('example')).toMatch(/^[a-f\d]{64}$/);
    expect(hashIp(value)).toMatch(/^[a-f\d]{64}$/);
    expect(hashIp(value)).toBe(hashIp(value));
    expect(hashIp(value)).not.toContain(value);
  });
});
