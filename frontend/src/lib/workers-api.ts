import {
  CreateWorkerResponseSchema,
  RegenerateWorkerCredentialResponseSchema,
  WorkerResponseSchema,
  WorkerImportCommitResponseSchema,
  WorkerImportPreviewResponseSchema,
  WorkersListResponseSchema,
  type CreateWorkerRequest,
  type TemporaryCredential,
  type UpdateWorkerRequest,
  type Worker,
  type WorkerImportCommitResponse,
  type WorkerImportPreviewResponse,
  type WorkersListResponse,
} from '@assetdesk/contracts';

import { apiRequest } from './api-client';

interface WorkerFilters {
  page: number;
  pageSize?: number;
  search?: string;
  status?: string;
}

export interface WorkerCredentialResult {
  worker: Worker;
  credential: TemporaryCredential;
}

export async function getWorkers(
  filters: WorkerFilters,
  signal?: AbortSignal,
): Promise<WorkersListResponse> {
  const parameters = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize ?? 20),
  });
  if (filters.search) parameters.set('search', filters.search);
  if (filters.status) parameters.set('status', filters.status);

  const payload = await apiRequest<unknown>(`/api/v1/workers?${parameters.toString()}`, {
    ...(signal ? { signal } : {}),
  });
  return WorkersListResponseSchema.parse(payload);
}

export async function createWorker(
  input: CreateWorkerRequest,
  idempotencyKey: string,
): Promise<{ data: WorkerCredentialResult }> {
  const payload = await apiRequest<unknown>('/api/v1/workers', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    json: input,
  });
  return CreateWorkerResponseSchema.parse(payload);
}

export async function getWorker(workerId: string, signal?: AbortSignal): Promise<Worker> {
  const payload = await apiRequest<unknown>(`/api/v1/workers/${encodeURIComponent(workerId)}`, {
    ...(signal ? { signal } : {}),
  });
  return WorkerResponseSchema.parse(payload).data.worker;
}

export async function updateWorker(workerId: string, input: UpdateWorkerRequest): Promise<Worker> {
  const payload = await apiRequest<unknown>(`/api/v1/workers/${encodeURIComponent(workerId)}`, {
    method: 'PATCH',
    json: input,
  });
  return WorkerResponseSchema.parse(payload).data.worker;
}

export async function setWorkerStatus(
  workerId: string,
  status: 'ACTIVE' | 'DISABLED',
): Promise<Worker> {
  const payload = await apiRequest<unknown>(
    `/api/v1/workers/${encodeURIComponent(workerId)}/status`,
    { method: 'PATCH', json: { status } },
  );
  return WorkerResponseSchema.parse(payload).data.worker;
}

export async function deleteWorker(workerId: string): Promise<void> {
  await apiRequest<void>(`/api/v1/workers/${encodeURIComponent(workerId)}`, {
    method: 'DELETE',
  });
}

export async function regenerateWorkerCredentials(
  workerId: string,
): Promise<WorkerCredentialResult> {
  const payload = await apiRequest<unknown>(
    `/api/v1/workers/${encodeURIComponent(workerId)}/regenerate-credentials`,
    { method: 'POST' },
  );
  return RegenerateWorkerCredentialResponseSchema.parse(payload).data;
}

export async function previewWorkerImport(file: File): Promise<WorkerImportPreviewResponse> {
  const form = new FormData();
  form.set('file', file);
  const payload = await apiRequest<unknown>('/api/v1/worker-imports/preview', {
    method: 'POST',
    body: form,
  });
  return WorkerImportPreviewResponseSchema.parse(payload);
}

export async function commitWorkerImport(
  importId: string,
  idempotencyKey: string,
): Promise<WorkerImportCommitResponse> {
  const payload = await apiRequest<unknown>(
    `/api/v1/worker-imports/${encodeURIComponent(importId)}/commit`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      json: {},
    },
  );
  return WorkerImportCommitResponseSchema.parse(payload);
}
