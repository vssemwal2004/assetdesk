import {
  CreateIssueResponseSchema,
  CreateReturnResponseSchema,
  IssueDetailResponseSchema,
  IssueFilterOptionsResponseSchema,
  IssueResponseSchema,
  IssueNotificationsResponseSchema,
  IssuesListResponseSchema,
  ReturnEventsListResponseSchema,
  ReturnSearchResponseSchema,
  type CreateIssueRequest,
  type AssignmentType,
  type CreateIssueResponse,
  type CreateReturnRequest,
  type CreateReturnResponse,
  type IssueDetailResponse,
  type IssueResponse,
  type IssuesListResponse,
  type IssueFilterOptionsResponse,
  type IssueStatus,
  type IssuePeriod,
  type IssueReturnState,
  type IssueNotificationsResponse,
  RetryNotificationResponseSchema,
  type RetryNotificationResponse,
  type ReturnEventsListResponse,
  type ReturnSearchResponse,
  type UpdateIssueRequest,
} from '@assetdesk/contracts';

import { apiRequest } from './api-client';

export interface IssueFilters {
  page: number;
  pageSize?: number;
  search?: string;
  status?: IssueStatus;
  period?: IssuePeriod;
  returnState?: IssueReturnState;
  assignmentType?: AssignmentType;
  store?: string;
  block?: string;
  destinationLocation?: string;
  trackingMode?: 'SERIALIZED' | 'QUANTITY';
  category?: string;
}

export async function getIssues(
  filters: IssueFilters,
  signal?: AbortSignal,
): Promise<IssuesListResponse> {
  const parameters = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize ?? 20),
  });
  if (filters.search) parameters.set('search', filters.search);
  if (filters.status) parameters.set('status', filters.status);
  if (filters.period) parameters.set('period', filters.period);
  if (filters.returnState) parameters.set('returnState', filters.returnState);
  if (filters.assignmentType) parameters.set('assignmentType', filters.assignmentType);
  if (filters.store) parameters.set('store', filters.store);
  if (filters.block) parameters.set('destinationBlock', filters.block);
  if (filters.destinationLocation)
    parameters.set('destinationLocation', filters.destinationLocation);
  if (filters.trackingMode) parameters.set('trackingMode', filters.trackingMode);
  if (filters.category) parameters.set('category', filters.category);
  const payload = await apiRequest<unknown>(`/api/v1/issues?${parameters.toString()}`, {
    ...(signal ? { signal } : {}),
  });
  return IssuesListResponseSchema.parse(payload);
}

export async function getIssueFilterOptions(
  block?: string,
  signal?: AbortSignal,
): Promise<IssueFilterOptionsResponse['data']> {
  const parameters = new URLSearchParams();
  if (block) parameters.set('block', block);
  const payload = await apiRequest<unknown>(
    `/api/v1/issues/filter-options${parameters.size ? `?${parameters.toString()}` : ''}`,
    { ...(signal ? { signal } : {}) },
  );
  return IssueFilterOptionsResponseSchema.parse(payload).data;
}

export async function createIssue(
  input: CreateIssueRequest,
  idempotencyKey: string,
): Promise<CreateIssueResponse> {
  const payload = await apiRequest<unknown>('/api/v1/issues', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    json: input,
  });
  return CreateIssueResponseSchema.parse(payload);
}

export async function getIssue(
  issueId: string,
  signal?: AbortSignal,
): Promise<IssueDetailResponse> {
  const payload = await apiRequest<unknown>(`/api/v1/issues/${encodeURIComponent(issueId)}`, {
    ...(signal ? { signal } : {}),
  });
  return IssueDetailResponseSchema.parse(payload);
}

export async function updateIssue(
  issueId: string,
  input: Partial<UpdateIssueRequest>,
): Promise<IssueResponse> {
  const payload = await apiRequest<unknown>(`/api/v1/issues/${encodeURIComponent(issueId)}`, {
    method: 'PATCH',
    json: input,
  });
  return IssueResponseSchema.parse(payload);
}

export async function deleteIssue(issueId: string): Promise<void> {
  await apiRequest<unknown>(`/api/v1/issues/${encodeURIComponent(issueId)}`, {
    method: 'DELETE',
  });
}

export async function getIssueNotifications(
  issueId: string,
  signal?: AbortSignal,
): Promise<IssueNotificationsResponse> {
  const payload = await apiRequest<unknown>(
    `/api/v1/issues/${encodeURIComponent(issueId)}/notifications`,
    { ...(signal ? { signal } : {}) },
  );
  return IssueNotificationsResponseSchema.parse(payload);
}

export async function retryNotification(
  notificationId: string,
): Promise<RetryNotificationResponse> {
  const payload = await apiRequest<unknown>(
    `/api/v1/notifications/${encodeURIComponent(notificationId)}/retry`,
    { method: 'POST' },
  );
  return RetryNotificationResponseSchema.parse(payload);
}

export async function searchReturnableIssues(
  search: string,
  page = 1,
  signal?: AbortSignal,
): Promise<ReturnSearchResponse> {
  const parameters = new URLSearchParams({ search, page: String(page), pageSize: '20' });
  const payload = await apiRequest<unknown>(
    `/api/v1/issues/return-search?${parameters.toString()}`,
    { ...(signal ? { signal } : {}) },
  );
  return ReturnSearchResponseSchema.parse(payload);
}

export async function createReturn(
  issueId: string,
  input: CreateReturnRequest,
  idempotencyKey: string,
): Promise<CreateReturnResponse> {
  const payload = await apiRequest<unknown>(
    `/api/v1/issues/${encodeURIComponent(issueId)}/returns`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      json: input,
    },
  );
  return CreateReturnResponseSchema.parse(payload);
}

export async function getReturns(
  filters: { page: number; pageSize?: number; search?: string; period?: IssuePeriod },
  signal?: AbortSignal,
): Promise<ReturnEventsListResponse> {
  const parameters = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize ?? 20),
  });
  if (filters.search) parameters.set('search', filters.search);
  if (filters.period) parameters.set('period', filters.period);
  const payload = await apiRequest<unknown>(`/api/v1/returns?${parameters.toString()}`, {
    ...(signal ? { signal } : {}),
  });
  return ReturnEventsListResponseSchema.parse(payload);
}
