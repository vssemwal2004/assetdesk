import {
  CreateReminderResponseSchema,
  IssueRemindersResponseSchema,
  OverdueIssuesResponseSchema,
  type CreateReminderResponse,
  type IssueRemindersResponse,
  type OverdueIssuesResponse,
} from '@assetdesk/contracts';

import { apiRequest } from './api-client';

export async function getOverdueIssues(
  filters: { page: number; search?: string },
  signal?: AbortSignal,
): Promise<OverdueIssuesResponse> {
  const query = new URLSearchParams({ page: String(filters.page), pageSize: '20' });
  if (filters.search) query.set('search', filters.search);
  return OverdueIssuesResponseSchema.parse(
    await apiRequest<unknown>(`/api/v1/overdue?${query.toString()}`, {
      ...(signal ? { signal } : {}),
    }),
  );
}

export async function sendReminder(
  issueId: string,
  idempotencyKey: string,
): Promise<CreateReminderResponse> {
  return CreateReminderResponseSchema.parse(
    await apiRequest<unknown>(`/api/v1/issues/${encodeURIComponent(issueId)}/reminders`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      json: {},
    }),
  );
}

export async function getIssueReminders(
  issueId: string,
  signal?: AbortSignal,
): Promise<IssueRemindersResponse> {
  return IssueRemindersResponseSchema.parse(
    await apiRequest<unknown>(`/api/v1/issues/${encodeURIComponent(issueId)}/reminders`, {
      ...(signal ? { signal } : {}),
    }),
  );
}
