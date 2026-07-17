import {
  ReceiverResponseSchema,
  ReceiversListResponseSchema,
  type CreateReceiverRequest,
  type Receiver,
  type ReceiverStatus,
  type ReceiverType,
  type ReceiversListResponse,
  type UpdateReceiverRequest,
} from '@assetdesk/contracts';

import { apiRequest } from './api-client';

export interface ReceiverFilters {
  page: number;
  pageSize?: number;
  search?: string;
  status?: ReceiverStatus;
  type?: ReceiverType;
  department?: string;
}

export async function getReceivers(
  filters: ReceiverFilters,
  signal?: AbortSignal,
): Promise<ReceiversListResponse> {
  const parameters = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize ?? 20),
  });
  if (filters.search) parameters.set('search', filters.search);
  if (filters.status) parameters.set('status', filters.status);
  if (filters.type) parameters.set('type', filters.type);
  if (filters.department) parameters.set('department', filters.department);

  const payload = await apiRequest<unknown>(`/api/v1/receivers?${parameters.toString()}`, {
    ...(signal ? { signal } : {}),
  });
  return ReceiversListResponseSchema.parse(payload);
}

export async function getReceiver(receiverCode: string, signal?: AbortSignal): Promise<Receiver> {
  const payload = await apiRequest<unknown>(
    `/api/v1/receivers/${encodeURIComponent(receiverCode)}`,
    { ...(signal ? { signal } : {}) },
  );
  return ReceiverResponseSchema.parse(payload).data.receiver;
}

export async function createReceiver(input: CreateReceiverRequest): Promise<Receiver> {
  const payload = await apiRequest<unknown>('/api/v1/receivers', {
    method: 'POST',
    json: input,
  });
  return ReceiverResponseSchema.parse(payload).data.receiver;
}

export async function updateReceiver(
  receiverCode: string,
  input: UpdateReceiverRequest,
): Promise<Receiver> {
  const payload = await apiRequest<unknown>(
    `/api/v1/receivers/${encodeURIComponent(receiverCode)}`,
    { method: 'PATCH', json: input },
  );
  return ReceiverResponseSchema.parse(payload).data.receiver;
}

export async function setReceiverStatus(
  receiverCode: string,
  status: ReceiverStatus,
): Promise<Receiver> {
  const payload = await apiRequest<unknown>(
    `/api/v1/receivers/${encodeURIComponent(receiverCode)}/status`,
    { method: 'PATCH', json: { status } },
  );
  return ReceiverResponseSchema.parse(payload).data.receiver;
}
