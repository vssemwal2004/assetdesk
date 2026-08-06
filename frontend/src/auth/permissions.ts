import type { AuthUser, WorkerPermission } from '@assetdesk/contracts';

const permissionFallbacks: Partial<Record<WorkerPermission, WorkerPermission[]>> = {
  ASSET_TYPES_MANAGE: ['ASSET_TYPES_ADD', 'ASSET_TYPES_DELETE', 'INVENTORY_MODELS_ADD'],
};

export function hasPermission(
  user: AuthUser | null | undefined,
  permission: WorkerPermission,
): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const accepted = [permission, ...(permissionFallbacks[permission] ?? [])];
  return accepted.some((item) => user.permissions.includes(item));
}
