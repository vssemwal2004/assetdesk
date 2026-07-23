import {
  AdjustQuantityResponseSchema,
  AssetUnitMutationResponseSchema,
  AssetUnitsListResponseSchema,
  MaterialResponseSchema,
  MaterialsListResponseSchema,
  type AdjustQuantityRequest,
  type AssetUnitMutationResponse,
  type AssetUnitsListResponse,
  type CreateAssetUnitRequest,
  type CreateMaterialRequest,
  type Material,
  type MaterialStatus,
  type MaterialsListResponse,
  type ReturnPolicy,
  type TrackingMode,
  type UpdateAssetUnitRequest,
  type UpdateMaterialRequest,
} from '@assetdesk/contracts';

import { apiRequest } from './api-client';

export interface InventoryFilters {
  page: number;
  pageSize?: number;
  search?: string;
  status?: MaterialStatus;
  trackingMode?: TrackingMode;
  returnPolicy?: ReturnPolicy;
  stockState?: 'AVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'ISSUED' | 'FULLY_ISSUED';
  category?: string;
}

export async function getInventory(
  filters: InventoryFilters,
  signal?: AbortSignal,
): Promise<MaterialsListResponse> {
  const parameters = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize ?? 20),
  });
  if (filters.search) parameters.set('search', filters.search);
  if (filters.status) parameters.set('status', filters.status);
  if (filters.trackingMode) parameters.set('trackingMode', filters.trackingMode);
  if (filters.returnPolicy) parameters.set('returnPolicy', filters.returnPolicy);
  if (filters.stockState) parameters.set('stockState', filters.stockState);
  if (filters.category) parameters.set('category', filters.category);

  const payload = await apiRequest<unknown>(`/api/v1/inventory?${parameters.toString()}`, {
    ...(signal ? { signal } : {}),
  });
  return MaterialsListResponseSchema.parse(payload);
}

export async function getMaterial(materialCode: string, signal?: AbortSignal): Promise<Material> {
  const payload = await apiRequest<unknown>(
    `/api/v1/inventory/${encodeURIComponent(materialCode)}`,
    { ...(signal ? { signal } : {}) },
  );
  return MaterialResponseSchema.parse(payload).data.material;
}

export async function createMaterial(input: CreateMaterialRequest): Promise<Material> {
  const payload = await apiRequest<unknown>('/api/v1/inventory', {
    method: 'POST',
    json: input,
  });
  return MaterialResponseSchema.parse(payload).data.material;
}

export interface InventoryImportResult {
  created: Array<{ materialCode: string; name: string; quantity: number }>;
  failed: Array<{ rowNumber: number; name: string; reason: string }>;
}

export interface InventoryImportPreview {
  importId: string;
  fileName: string;
  mode: TrackingMode;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: Array<{
    rowNumber: number;
    name: string;
    category: string;
    serialNumber?: string;
    quantity?: number;
    unitLabel?: string;
    valid: boolean;
    errors: string[];
  }>;
  expiresAt: string;
}

export async function previewInventoryImport(
  file: File,
  mode: TrackingMode,
): Promise<InventoryImportPreview> {
  const form = new FormData();
  form.set('file', file);
  form.set('mode', mode);
  const payload = await apiRequest<{ data: InventoryImportPreview }>(
    '/api/v1/inventory/imports/preview',
    { method: 'POST', body: form },
  );
  return payload.data;
}

export async function commitInventoryImport(importId: string): Promise<InventoryImportResult> {
  const payload = await apiRequest<{ data: InventoryImportResult }>(
    `/api/v1/inventory/imports/${encodeURIComponent(importId)}/commit`,
    { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, json: {} },
  );
  return payload.data;
}

export async function updateMaterial(
  materialCode: string,
  input: UpdateMaterialRequest,
): Promise<Material> {
  const payload = await apiRequest<unknown>(
    `/api/v1/inventory/${encodeURIComponent(materialCode)}`,
    { method: 'PATCH', json: input },
  );
  return MaterialResponseSchema.parse(payload).data.material;
}

export async function setMaterialStatus(
  materialCode: string,
  status: MaterialStatus,
): Promise<Material> {
  const payload = await apiRequest<unknown>(
    `/api/v1/inventory/${encodeURIComponent(materialCode)}/status`,
    { method: 'PATCH', json: { status } },
  );
  return MaterialResponseSchema.parse(payload).data.material;
}

export async function deleteMaterial(materialCode: string): Promise<void> {
  await apiRequest<unknown>(`/api/v1/inventory/${encodeURIComponent(materialCode)}`, {
    method: 'DELETE',
  });
}

export async function adjustMaterialQuantity(
  materialCode: string,
  input: AdjustQuantityRequest,
): Promise<Material> {
  const payload = await apiRequest<unknown>(
    `/api/v1/inventory/${encodeURIComponent(materialCode)}/adjust-quantity`,
    { method: 'POST', json: input },
  );
  return AdjustQuantityResponseSchema.parse(payload).data.material;
}

export async function getAssetUnits(
  materialCode: string,
  page: number,
  filters: { status?: string; pageSize?: number } = {},
  signal?: AbortSignal,
): Promise<AssetUnitsListResponse> {
  const parameters = new URLSearchParams({
    page: String(page),
    pageSize: String(filters.pageSize ?? 20),
  });
  if (filters.status) parameters.set('status', filters.status);
  const payload = await apiRequest<unknown>(
    `/api/v1/inventory/${encodeURIComponent(materialCode)}/units?${parameters.toString()}`,
    { ...(signal ? { signal } : {}) },
  );
  return AssetUnitsListResponseSchema.parse(payload);
}

export async function getAvailableAssetUnits(
  materialCode: string,
  search: string,
  signal?: AbortSignal,
): Promise<AssetUnitsListResponse> {
  const parameters = new URLSearchParams({
    page: '1',
    pageSize: '100',
    status: 'AVAILABLE',
  });
  if (search) parameters.set('search', search);
  const payload = await apiRequest<unknown>(
    `/api/v1/inventory/${encodeURIComponent(materialCode)}/units?${parameters.toString()}`,
    { ...(signal ? { signal } : {}) },
  );
  return AssetUnitsListResponseSchema.parse(payload);
}

export async function addAssetUnit(
  materialCode: string,
  input: CreateAssetUnitRequest,
): Promise<AssetUnitMutationResponse['data']> {
  const payload = await apiRequest<unknown>(
    `/api/v1/inventory/${encodeURIComponent(materialCode)}/units`,
    { method: 'POST', json: input },
  );
  return AssetUnitMutationResponseSchema.parse(payload).data;
}

export async function updateAssetUnit(
  materialCode: string,
  assetTag: string,
  input: UpdateAssetUnitRequest,
): Promise<AssetUnitMutationResponse['data']> {
  const payload = await apiRequest<unknown>(
    `/api/v1/inventory/${encodeURIComponent(materialCode)}/units/${encodeURIComponent(assetTag)}`,
    { method: 'PATCH', json: input },
  );
  return AssetUnitMutationResponseSchema.parse(payload).data;
}

export async function deleteAssetUnit(
  materialCode: string,
  assetTag: string,
): Promise<AssetUnitMutationResponse['data']> {
  const payload = await apiRequest<unknown>(
    `/api/v1/inventory/${encodeURIComponent(materialCode)}/units/${encodeURIComponent(assetTag)}`,
    { method: 'DELETE' },
  );
  return AssetUnitMutationResponseSchema.parse(payload).data;
}
