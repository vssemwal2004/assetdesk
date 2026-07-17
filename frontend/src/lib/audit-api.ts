import {
  AuditEventsResponseSchema,
  type AuditEventsResponse,
  type AuditResult,
  type UserRole,
} from '@assetdesk/contracts';

import { apiRequest } from './api-client';

export interface AuditFilters {
  page: number;
  from: string;
  to: string;
  search?: string;
  action?: string;
  result?: AuditResult;
  actorRole?: UserRole;
}

export async function getAuditEvents(
  filters: AuditFilters,
  signal?: AbortSignal,
): Promise<AuditEventsResponse> {
  const query = new URLSearchParams({
    page: String(filters.page),
    pageSize: '20',
    from: filters.from,
    to: filters.to,
  });
  if (filters.search) query.set('search', filters.search);
  if (filters.action) query.set('action', filters.action);
  if (filters.result) query.set('result', filters.result);
  if (filters.actorRole) query.set('actorRole', filters.actorRole);
  return AuditEventsResponseSchema.parse(
    await apiRequest<unknown>(`/api/v1/audit-events?${query.toString()}`, {
      ...(signal ? { signal } : {}),
    }),
  );
}
