import {
  AlertsResponseSchema,
  type AlertsResponse,
  type MarkAlertsReadRequest,
} from '@assetdesk/contracts';

import { apiRequest } from './api-client';

export type AlertsData = AlertsResponse['data'];

export async function getAlerts(signal?: AbortSignal): Promise<AlertsData> {
  const payload = await apiRequest<unknown>('/api/v1/alerts', { ...(signal ? { signal } : {}) });
  return AlertsResponseSchema.parse(payload).data;
}

export async function markAlertsRead(input: MarkAlertsReadRequest): Promise<number> {
  const payload = await apiRequest<{ data: { marked: number } }>('/api/v1/alerts/read', {
    method: 'POST',
    json: input,
  });
  return payload.data.marked;
}
