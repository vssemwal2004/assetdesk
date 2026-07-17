import type { AuthUser, Worker } from '@assetdesk/contracts';

import type { UserRecord } from './user.model.js';

function isoOrNull(value: Date | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function toAuthUser(user: UserRecord): AuthUser {
  return {
    id: user._id.toString(),
    workerId: user.workerId,
    name: user.name,
    email: user.email,
    contact: user.contact ?? null,
    department: user.department ?? null,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    permissions: user.role === 'ADMIN' ? [] : (user.permissions ?? []),
  };
}

export function toWorker(user: UserRecord): Worker {
  return {
    id: user._id.toString(),
    workerId: user.workerId,
    name: user.name,
    email: user.email,
    contact: user.contact ?? null,
    department: user.department ?? null,
    status: user.status,
    invitationStatus: user.invitationStatus,
    mustChangePassword: user.mustChangePassword,
    permissions: user.permissions ?? [],
    temporaryPasswordExpiresAt: isoOrNull(user.temporaryPasswordExpiresAt),
    lastLoginAt: isoOrNull(user.lastLoginAt),
    createdAt: user.createdAt.toISOString(),
  };
}
