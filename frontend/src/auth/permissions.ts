import type { AuthUser, WorkerPermission } from '@assetdesk/contracts';

const permissionFallbacks: Partial<Record<WorkerPermission, WorkerPermission[]>> = {};

export function hasPermission(
  user: AuthUser | null | undefined,
  permission: WorkerPermission,
): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const accepted = [permission, ...(permissionFallbacks[permission] ?? [])];
  return accepted.some((item) => user.permissions.includes(item));
}
