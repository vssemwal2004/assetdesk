import {
  CreateInventoryGatePassRequestSchema,
  InventoryGatePassAssetOptionsResponseSchema,
  InventoryGatePassListResponseSchema,
  InventoryGatePassMaterialOptionsResponseSchema,
  InventoryGatePassResponseSchema,
  RecordInventoryGateInRequestSchema,
  UpdateInventoryGatePassRequestSchema,
  type CreateInventoryGatePassRequest,
  type InventoryGatePass,
  type InventoryGatePassStatus,
  type RecordInventoryGateInRequest,
  type UpdateInventoryGatePassRequest,
} from '@assetdesk/contracts';
import { apiRequest } from './api-client';

export async function getInventoryGatePasses(
  filters: {
    page?: number;
    pageSize?: number;
    status?: InventoryGatePassStatus;
    statuses?: InventoryGatePassStatus[];
    purpose?: 'ISSUE_PERMANENT' | 'ISSUE_RETURNABLE' | 'REPAIR' | 'OTHER';
    trackingMode?: 'SERIALIZED' | 'QUANTITY';
    search?: string;
  } = {},
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    page: String(filters.page ?? 1),
    pageSize: String(filters.pageSize ?? 20),
  });
  if (filters.status) query.set('status', filters.status);
  if (filters.statuses?.length) query.set('statuses', filters.statuses.join(','));
  if (filters.purpose) query.set('purpose', filters.purpose);
  if (filters.trackingMode) query.set('trackingMode', filters.trackingMode);
  if (filters.search) query.set('search', filters.search);
  return InventoryGatePassListResponseSchema.parse(
    await apiRequest<unknown>(`/api/v1/inventory-gate-passes?${query}`, {
      ...(signal ? { signal } : {}),
    }),
  );
}
export async function getInventoryGatePass(
  number: string,
  signal?: AbortSignal,
): Promise<InventoryGatePass> {
  const payload = await apiRequest<unknown>(
    `/api/v1/inventory-gate-passes/${encodeURIComponent(number)}`,
    { ...(signal ? { signal } : {}) },
  );
  return InventoryGatePassResponseSchema.parse(payload).data.gatePass;
}
export async function createInventoryGatePass(
  input: CreateInventoryGatePassRequest,
): Promise<InventoryGatePass> {
  const payload = await apiRequest<unknown>('/api/v1/inventory-gate-passes', {
    method: 'POST',
    json: CreateInventoryGatePassRequestSchema.parse(input),
  });
  return InventoryGatePassResponseSchema.parse(payload).data.gatePass;
}
export async function recordInventoryGateOut(number: string): Promise<InventoryGatePass> {
  const payload = await apiRequest<unknown>(
    `/api/v1/inventory-gate-passes/${encodeURIComponent(number)}/gate-out`,
    { method: 'POST', json: {} },
  );
  return InventoryGatePassResponseSchema.parse(payload).data.gatePass;
}
export async function recordInventoryGateIn(
  number: string,
  input: RecordInventoryGateInRequest,
): Promise<InventoryGatePass> {
  const payload = await apiRequest<unknown>(
    `/api/v1/inventory-gate-passes/${encodeURIComponent(number)}/gate-in`,
    { method: 'POST', json: RecordInventoryGateInRequestSchema.parse(input) },
  );
  return InventoryGatePassResponseSchema.parse(payload).data.gatePass;
}
export async function cancelInventoryGatePass(
  number: string,
  reason: string,
): Promise<InventoryGatePass> {
  const payload = await apiRequest<unknown>(
    `/api/v1/inventory-gate-passes/${encodeURIComponent(number)}/cancel`,
    { method: 'POST', json: { reason } },
  );
  return InventoryGatePassResponseSchema.parse(payload).data.gatePass;
}

export async function updateInventoryGatePass(
  number: string,
  input: UpdateInventoryGatePassRequest,
): Promise<InventoryGatePass> {
  const payload = await apiRequest<unknown>(
    `/api/v1/inventory-gate-passes/${encodeURIComponent(number)}`,
    { method: 'PATCH', json: UpdateInventoryGatePassRequestSchema.parse(input) },
  );
  return InventoryGatePassResponseSchema.parse(payload).data.gatePass;
}

export async function getInventoryGatePassMaterialOptions(
  filters: {
    purpose: 'REPAIR' | 'OTHER';
    trackingMode: 'SERIALIZED' | 'QUANTITY';
    page?: number;
    pageSize?: number;
    category?: string;
    search?: string;
    conditionType?: 'ANY' | 'UNDER_MAINTENANCE' | 'FAULTY' | 'NOT_WORKING' | 'DAMAGED';
  },
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    purpose: filters.purpose,
    trackingMode: filters.trackingMode,
    page: String(filters.page ?? 1),
    pageSize: String(filters.pageSize ?? 20),
  });
  if (filters.category) query.set('category', filters.category);
  if (filters.search) query.set('search', filters.search);
  if (filters.conditionType) query.set('conditionType', filters.conditionType);
  const payload = await apiRequest<unknown>(
    `/api/v1/inventory-gate-passes/options/materials?${query}`,
    { ...(signal ? { signal } : {}) },
  );
  return InventoryGatePassMaterialOptionsResponseSchema.parse(payload);
}

export async function getInventoryGatePassAssetOptions(
  materialCode: string,
  filters: {
    purpose: 'REPAIR' | 'OTHER';
    search?: string;
    conditionType?: 'ANY' | 'UNDER_MAINTENANCE' | 'FAULTY' | 'NOT_WORKING' | 'DAMAGED';
  },
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ purpose: filters.purpose });
  if (filters.search) query.set('search', filters.search);
  if (filters.conditionType) query.set('conditionType', filters.conditionType);
  const payload = await apiRequest<unknown>(
    `/api/v1/inventory-gate-passes/options/materials/${encodeURIComponent(materialCode)}/assets?${query}`,
    { ...(signal ? { signal } : {}) },
  );
  return InventoryGatePassAssetOptionsResponseSchema.parse(payload);
}

export async function downloadInventoryGatePassCsv(filters: {
  status?: InventoryGatePassStatus;
  purpose?: 'ISSUE_PERMANENT' | 'ISSUE_RETURNABLE' | 'REPAIR' | 'OTHER';
  trackingMode?: 'SERIALIZED' | 'QUANTITY';
  search?: string;
}): Promise<Blob> {
  const query = new URLSearchParams();
  if (filters.status) query.set('status', filters.status);
  if (filters.purpose) query.set('purpose', filters.purpose);
  if (filters.trackingMode) query.set('trackingMode', filters.trackingMode);
  if (filters.search) query.set('search', filters.search);
  const response = await fetch(`/api/v1/inventory-gate-passes/export?${query}`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Gate Pass data could not be exported.');
  return response.blob();
}
