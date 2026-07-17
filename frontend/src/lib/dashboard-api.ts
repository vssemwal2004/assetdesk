import { AdminDashboardResponseSchema, type AdminDashboardResponse } from '@assetdesk/contracts';

import { apiRequest } from './api-client';

export async function getAdminDashboard(signal?: AbortSignal): Promise<AdminDashboardResponse> {
  const payload = await apiRequest<unknown>('/api/v1/dashboard/admin', {
    ...(signal ? { signal } : {}),
  });
  return AdminDashboardResponseSchema.parse(payload);
}
