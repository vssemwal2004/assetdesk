import { beforeEach, describe, expect, it, vi } from 'vitest';

const userModel = vi.hoisted(() => ({ findOneAndUpdate: vi.fn() }));
const mapper = vi.hoisted(() => ({ toWorker: vi.fn((worker: unknown) => worker) }));

vi.mock('../users/user.model.js', () => ({ UserModel: userModel }));
vi.mock('../users/user.mapper.js', () => mapper);
vi.mock('../auth/auth.service.js', () => ({ temporaryPasswordExpiry: vi.fn() }));
vi.mock('../auth/password.js', () => ({
  generateTemporaryPassword: vi.fn(),
  hashPassword: vi.fn(),
}));
vi.mock('../auth/session.service.js', () => ({ revokeAllUserSessions: vi.fn() }));
vi.mock('../notifications/notification.service.js', () => ({
  enqueueWorkerInvitation: vi.fn(),
}));
vi.mock('./worker-id.js', () => ({ generateWorkerIdCandidate: vi.fn() }));

import { updateWorkerAccess } from './worker.service.js';

const updatedWorker = {
  id: '507f1f77bcf86cd799439012',
  workerId: 'GEU-WRK-A7K4',
  name: 'Anita Sharma',
  email: 'anita@example.edu',
  contact: null,
  department: null,
  status: 'ACTIVE',
  invitationStatus: 'SENT',
  mustChangePassword: false,
  permissions: ['DASHBOARD', 'INVENTORY_VIEW'],
  dataAccess: { inventory: 'ALL', issues: 'OWN', cartridges: 'OWN' },
  temporaryPasswordExpiresAt: null,
  lastLoginAt: null,
  createdAt: '2026-08-07T09:00:00.000Z',
};

describe('worker access updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates only access paths with update validators and the transaction session', async () => {
    const session = { id: 'worker-access-session' };
    userModel.findOneAndUpdate.mockResolvedValue(updatedWorker);

    await expect(
      updateWorkerAccess(
        'GEU-WRK-A7K4',
        {
          permissions: ['DASHBOARD', 'INVENTORY_VIEW'],
          dataAccess: { inventory: 'ALL', issues: 'OWN', cartridges: 'OWN' },
        },
        session as never,
      ),
    ).resolves.toEqual(updatedWorker);

    expect(userModel.findOneAndUpdate).toHaveBeenCalledWith(
      { workerId: 'GEU-WRK-A7K4', role: 'WORKER' },
      {
        $set: {
          permissions: ['DASHBOARD', 'INVENTORY_VIEW'],
          'dataAccess.inventory': 'ALL',
          'dataAccess.issues': 'OWN',
          'dataAccess.cartridges': 'OWN',
        },
      },
      { returnDocument: 'after', runValidators: true, session },
    );
    expect(mapper.toWorker).toHaveBeenCalledWith(updatedWorker);
  });

  it('returns the stable not-found problem when the target is missing', async () => {
    userModel.findOneAndUpdate.mockResolvedValue(null);

    await expect(
      updateWorkerAccess('GEU-WRK-A7K4', {
        permissions: ['DASHBOARD'],
        dataAccess: { inventory: 'OWN', issues: 'OWN', cartridges: 'OWN' },
      }),
    ).rejects.toMatchObject({ status: 404, code: 'WORKER_NOT_FOUND' });
  });
});
