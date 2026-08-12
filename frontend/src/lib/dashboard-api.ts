import {
  AdminDashboardResponseSchema,
  type AdminDashboardResponse,
  type DashboardRange,
} from '@assetdesk/contracts';

import { apiRequest } from './api-client';

export async function getAdminDashboard(
  range: DashboardRange = '30D',
  signal?: AbortSignal,
): Promise<AdminDashboardResponse> {
  const payload = await apiRequest<unknown>(`/api/v1/dashboard/admin?range=${range}`, {
    ...(signal ? { signal } : {}),
  });
  return AdminDashboardResponseSchema.parse(payload);
}

export async function getWorkerDashboard(
  range: DashboardRange = '30D',
  signal?: AbortSignal,
): Promise<AdminDashboardResponse> {
  const payload = await apiRequest<unknown>(`/api/v1/dashboard/worker?range=${range}`, {
    ...(signal ? { signal } : {}),
  });
  return AdminDashboardResponseSchema.parse(payload);
}
