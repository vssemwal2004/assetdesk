import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const modelMocks = vi.hoisted(() => ({
  findSession: vi.fn(),
  updateSession: vi.fn(),
  findUser: vi.fn(),
}));

vi.mock('./auth-session.model.js', () => ({
  AuthSessionModel: {
    findOne: modelMocks.findSession,
    updateOne: modelMocks.updateSession,
  },
}));

vi.mock('../users/user.model.js', () => ({
  UserModel: {
    findById: modelMocks.findUser,
  },
}));

import { REFRESH_ROTATION_GRACE_MS, rotateSession } from './session.service.js';
import {
  createCsrfToken,
  createRefreshToken,
  createSessionId,
  getRefreshSessionId,
  hashToken,
} from './tokens.js';

function fixture() {
  const sid = createSessionId();
  const refreshToken = createRefreshToken(sid);
  const csrfToken = createCsrfToken();
  const userId = new Types.ObjectId();
  const session = {
    _id: new Types.ObjectId(),
    sid,
    familyId: createSessionId(),
    userId,
    refreshTokenHash: hashToken(refreshToken),
    previousRefreshTokenHashes: [] as string[],
    csrfTokenHash: hashToken(csrfToken),
    lastUsedAt: new Date(),
    idleExpiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    absoluteExpiresAt: new Date(Date.now() + 4 * 60 * 60 * 1_000),
  };
  const user = {
    _id: userId,
    workerId: 'GEU-WRK-A7K4',
    name: 'Test Worker',
    email: 'worker@example.edu',
    role: 'WORKER',
    status: 'ACTIVE',
    authVersion: 1,
    mustChangePassword: false,
  };

  return { sid, refreshToken, csrfToken, session, user };
}

describe('refresh-token rotation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('atomically rotates a current refresh token', async () => {
    const data = fixture();
    modelMocks.findSession.mockResolvedValue(data.session);
    modelMocks.findUser.mockResolvedValue(data.user);
    modelMocks.updateSession.mockResolvedValue({ modifiedCount: 1 });

    const result = await rotateSession(data.refreshToken, data.csrfToken, data.csrfToken);

    expect(result.user).toBe(data.user);
    expect(result.bundle.refreshToken).not.toBe(data.refreshToken);
    expect(getRefreshSessionId(result.bundle.refreshToken)).toBe(data.sid);
    expect(modelMocks.updateSession).toHaveBeenCalledTimes(1);
    expect(modelMocks.updateSession.mock.calls[0]?.[0]).toMatchObject({
      _id: data.session._id,
      refreshTokenHash: hashToken(data.refreshToken),
      revokedAt: { $exists: false },
    });
  });

  it('revokes a session when an already-rotated refresh token is replayed', async () => {
    const data = fixture();
    data.session.previousRefreshTokenHashes = [hashToken(data.refreshToken)];
    data.session.refreshTokenHash = hashToken(createRefreshToken(data.sid));
    data.session.lastUsedAt = new Date(Date.now() - REFRESH_ROTATION_GRACE_MS - 1_000);
    modelMocks.findSession.mockResolvedValue(data.session);
    modelMocks.updateSession.mockResolvedValue({ modifiedCount: 1 });

    await expect(
      rotateSession(data.refreshToken, data.csrfToken, data.csrfToken),
    ).rejects.toMatchObject({ code: 'REFRESH_TOKEN_REPLAY' });

    expect(modelMocks.updateSession).toHaveBeenCalledWith(
      { sid: data.sid, revokedAt: { $exists: false } },
      expect.objectContaining({
        $set: expect.objectContaining({ revokedReason: 'REFRESH_TOKEN_REPLAY' }),
      }),
    );
  });

  it('keeps the session when a parallel tab rotated the same token moments ago', async () => {
    const data = fixture();
    data.session.previousRefreshTokenHashes = [hashToken(data.refreshToken)];
    data.session.refreshTokenHash = hashToken(createRefreshToken(data.sid));
    // The winning request also rotated the CSRF token, so the late request's CSRF is stale.
    data.session.csrfTokenHash = hashToken(createCsrfToken());
    data.session.lastUsedAt = new Date();
    modelMocks.findSession.mockResolvedValue(data.session);

    await expect(
      rotateSession(data.refreshToken, data.csrfToken, data.csrfToken),
    ).rejects.toMatchObject({ status: 409, code: 'REFRESH_ALREADY_ROTATED' });

    expect(modelMocks.updateSession).not.toHaveBeenCalled();
  });

  it('still revokes when an older replaced token is replayed inside the grace window', async () => {
    const data = fixture();
    data.session.previousRefreshTokenHashes = [
      hashToken(data.refreshToken),
      hashToken(createRefreshToken(data.sid)),
    ];
    data.session.refreshTokenHash = hashToken(createRefreshToken(data.sid));
    data.session.lastUsedAt = new Date();
    modelMocks.findSession.mockResolvedValue(data.session);
    modelMocks.updateSession.mockResolvedValue({ modifiedCount: 1 });

    await expect(
      rotateSession(data.refreshToken, data.csrfToken, data.csrfToken),
    ).rejects.toMatchObject({ code: 'REFRESH_TOKEN_REPLAY' });
  });

  it('reports a lost rotation race without revoking the session', async () => {
    const data = fixture();
    modelMocks.findSession.mockResolvedValue(data.session);
    modelMocks.findUser.mockResolvedValue(data.user);
    modelMocks.updateSession.mockResolvedValueOnce({ modifiedCount: 0 });

    await expect(
      rotateSession(data.refreshToken, data.csrfToken, data.csrfToken),
    ).rejects.toMatchObject({ status: 409, code: 'REFRESH_ALREADY_ROTATED' });

    expect(modelMocks.updateSession).toHaveBeenCalledTimes(1);
  });
});
