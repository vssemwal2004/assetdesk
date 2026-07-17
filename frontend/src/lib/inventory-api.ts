import {
  AdjustQuantityResponseSchema,
  AssetUnitMutationResponseSchema,
  AssetUnitsListResponseSchema,
  MaterialResponseSchema,
  MaterialsListResponseSchema,
  type AdjustQuantityRequest,
  type AssetUnitMutationResponse,
  type AssetUnitsListResponse,
  type AssignmentType,
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
  assignmentType?: AssignmentType;
  stockState?: 'IN_STOCK' | 'OUT_OF_STOCK';
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
  if (filters.assignmentType) parameters.set('assignmentType', filters.assignmentType);
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
  signal?: AbortSignal,
): Promise<AssetUnitsListResponse> {
  const parameters = new URLSearchParams({ page: String(page), pageSize: '20' });
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
