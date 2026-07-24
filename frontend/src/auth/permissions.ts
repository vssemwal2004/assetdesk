import type { AuthUser, WorkerPermission } from '@assetdesk/contracts';

const permissionFallbacks: Partial<Record<WorkerPermission, WorkerPermission[]>> = {
  ISSUES_EDIT: ['ASSIGNMENTS_CREATE'],
  ISSUES_DELETE: ['ASSIGNMENTS_CREATE'],
  ISSUE_SLIPS_VIEW: ['ISSUES_VIEW'],
  RETURN_DATES_EXTEND: ['ASSIGNMENTS_CREATE'],
  RETURNS_VIEW: ['RETURNS_RECORD'],
  ASSET_TYPES_MANAGE: ['INVENTORY_MANAGE'],
  INVENTORY_IMPORT: ['INVENTORY_MANAGE'],
  INVENTORY_EXPORT: ['INVENTORY_VIEW'],
  ASSET_UNITS_MANAGE: ['INVENTORY_MANAGE'],
};

export function hasPermission(user: AuthUser | null | undefined, permission: WorkerPermission): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const accepted = [permission, ...(permissionFallbacks[permission] ?? [])];
  return accepted.some((item) => user.permissions.includes(item));
}
