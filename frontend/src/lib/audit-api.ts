import {
  AuditEventsResponseSchema,
  type AuditEventsResponse,
  type AuditResult,
  type UserRole,
} from '@assetdesk/contracts';

import { apiRequest } from './api-client';

export interface AuditFilters {
  page: number;
  pageSize?: number;
  from: string;
  to: string;
  search?: string;
  action?: string;
  result?: AuditResult;
  actorRole?: UserRole;
  actorWorkerId?: string;
}

export async function getAuditEvents(
  filters: AuditFilters,
  signal?: AbortSignal,
): Promise<AuditEventsResponse> {
  const query = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize ?? 20),
    from: filters.from,
    to: filters.to,
  });
  if (filters.search) query.set('search', filters.search);
  if (filters.action) query.set('action', filters.action);
  if (filters.result) query.set('result', filters.result);
  if (filters.actorRole) query.set('actorRole', filters.actorRole);
  if (filters.actorWorkerId) query.set('actorWorkerId', filters.actorWorkerId);
  return AuditEventsResponseSchema.parse(
    await apiRequest<unknown>(`/api/v1/audit-events?${query.toString()}`, {
      ...(signal ? { signal } : {}),
    }),
  );
}
