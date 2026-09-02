import {
  AdjustQuantityResponseSchema,
  AssetUnitMutationResponseSchema,
  AssetUnitsListResponseSchema,
  AssetDetailsResponseSchema,
  AssetTypeImportPreviewResponseSchema,
  AssetTypeImportResponseSchema,
  AssetTypesResponseSchema,
  MaterialResponseSchema,
  MaterialSchema,
  MaterialsListResponseSchema,
  InventoryModelsResponseSchema,
  InventoryModelResponseSchema,
  InventoryModelMutationResponseSchema,
  type AdjustQuantityRequest,
  type AssetDetail,
  type AssetDetailKind,
  type AssetUnitMutationResponse,
  type AssetUnitsListResponse,
  type AssetType,
  type AssetTypeImportPreviewResponse,
  type AssetTypeImportResponse,
  type CreateAssetUnitRequest,
  type CreateMaterialRequest,
  type Material,
  type InventoryModel,
  type MaterialStatus,
  type MaterialsListResponse,
  type ReturnPolicy,
  type TrackingMode,
  type UpdateAssetUnitRequest,
  type UpdateMaterialRequest,
} from '@assetdesk/contracts';

import { ApiError, apiRequest } from './api-client';

export type { AssetTypeImportPreviewResponse, AssetTypeImportResponse };
export type { InventoryModel };

export interface InventoryFilters {
  page: number;
  pageSize?: number;
  search?: string;
  status?: MaterialStatus;
  issueable?: boolean;
  storeOnly?: boolean;
  lowStockOnly?: boolean;
  availableMax?: number;
  trackingMode?: TrackingMode;
  returnPolicy?: ReturnPolicy;
  stockState?: 'AVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'ISSUED' | 'FULLY_ISSUED';
  category?: string;
  store?: string;
  department?: string;
  vendorName?: string;
  createdFrom?: string;
  createdTo?: string;
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
  if (filters.issueable) parameters.set('issueable', 'true');
  if (filters.storeOnly) parameters.set('storeOnly', 'true');
  if (filters.lowStockOnly) parameters.set('lowStockOnly', 'true');
  if (filters.availableMax !== undefined) parameters.set('availableMax', String(filters.availableMax));
  if (filters.trackingMode) parameters.set('trackingMode', filters.trackingMode);
  if (filters.returnPolicy) parameters.set('returnPolicy', filters.returnPolicy);
  if (filters.stockState) parameters.set('stockState', filters.stockState);
  if (filters.category) parameters.set('category', filters.category);
  if (filters.store) parameters.set('store', filters.store);
  if (filters.department) parameters.set('department', filters.department);
  if (filters.vendorName) parameters.set('vendorName', filters.vendorName);
  if (filters.createdFrom) parameters.set('createdFrom', filters.createdFrom);
  if (filters.createdTo) parameters.set('createdTo', filters.createdTo);

  const payload = await apiRequest<unknown>(`/api/v1/inventory?${parameters.toString()}`, {
    ...(signal ? { signal } : {}),
  });
  return MaterialsListResponseSchema.parse(payload);
}

export async function getInventoryModels(
  category?: string,
  trackingMode?: TrackingMode,
  signal?: AbortSignal,
  includeStock = false,
): Promise<InventoryModel[]> {
  const parameters = new URLSearchParams();
  if (category) parameters.set('category', category);
  if (trackingMode) parameters.set('trackingMode', trackingMode);
  if (includeStock) parameters.set('includeStock', 'true');
  const request = apiRequest<unknown>(
    `/api/v1/inventory/models${parameters.size ? `?${parameters.toString()}` : ''}`,
    { ...(signal ? { signal } : {}) },
  );
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(
      () =>
        reject(
          new ApiError({
            status: 504,
            code: 'INVENTORY_MODELS_LOAD_TIMEOUT',
            detail: 'Models took too long to load. The backend may still be running an old build.',
          }),
        ),
      8_000,
    );
  });
  const payload = await Promise.race([request, timeout]).finally(() => clearTimeout(timeoutId));
  return InventoryModelsResponseSchema.parse(payload).data;
}

export async function createInventoryModel(input: {
  category: string;
  name: string;
  trackingMode: TrackingMode;
}): Promise<InventoryModel> {
  const payload = await apiRequest<unknown>('/api/v1/inventory/models', {
    method: 'POST',
    json: input,
  });
  return InventoryModelResponseSchema.parse(payload).data.model;
}

export async function syncInventoryModels(): Promise<{
  discovered: number;
  added: number;
  total: number;
}> {
  const payload = await apiRequest<{
    data: { discovered: number; added: number; total: number };
  }>('/api/v1/inventory/models/sync', { method: 'POST' });
  return payload.data;
}

export async function importInventoryModels(
  file: File,
  trackingMode: TrackingMode,
): Promise<{
  created: Array<{ rowNumber: number; category: string; name: string }>;
  failed: Array<{ rowNumber: number; category: string; name: string; reason: string }>;
}> {
  const body = new FormData();
  body.append('file', file);
  body.append('trackingMode', trackingMode);
  const payload = await apiRequest<{
    data: {
      created: Array<{ rowNumber: number; category: string; name: string }>;
      failed: Array<{ rowNumber: number; category: string; name: string; reason: string }>;
    };
  }>('/api/v1/inventory/models/import', { method: 'POST', body });
  return payload.data;
}

export async function mergeInventoryModels(input: {
  modelIds: string[];
  canonicalName: string;
}): Promise<{ model: InventoryModel; mergedMaterialCount: number }> {
  const payload = await apiRequest<unknown>('/api/v1/inventory/models/merge', {
    method: 'POST',
    json: input,
  });
  return InventoryModelMutationResponseSchema.parse(payload).data;
}

export async function updateInventoryModel(modelId: string, name: string): Promise<InventoryModel> {
  const payload = await apiRequest<unknown>(
    `/api/v1/inventory/models/${encodeURIComponent(modelId)}`,
    {
      method: 'PATCH',
      json: { name },
    },
  );
  return InventoryModelResponseSchema.parse(payload).data.model;
}

export async function deleteInventoryModel(modelId: string): Promise<void> {
  await apiRequest<unknown>(`/api/v1/inventory/models/${encodeURIComponent(modelId)}`, {
    method: 'DELETE',
  });
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

export async function downloadInventoryCsv(
  filters: Omit<InventoryFilters, 'page' | 'pageSize'>,
): Promise<Blob> {
  const parameters = new URLSearchParams({ page: '1' });
  if (filters.search) parameters.set('search', filters.search);
  if (filters.status) parameters.set('status', filters.status);
  if (filters.issueable) parameters.set('issueable', 'true');
  if (filters.trackingMode) parameters.set('trackingMode', filters.trackingMode);
  if (filters.returnPolicy) parameters.set('returnPolicy', filters.returnPolicy);
  if (filters.stockState) parameters.set('stockState', filters.stockState);
  if (filters.category) parameters.set('category', filters.category);
  if (filters.store) parameters.set('store', filters.store);
  if (filters.department) parameters.set('department', filters.department);
  if (filters.vendorName) parameters.set('vendorName', filters.vendorName);
  if (filters.createdFrom) parameters.set('createdFrom', filters.createdFrom);
  if (filters.createdTo) parameters.set('createdTo', filters.createdTo);
  const response = await fetch(`/api/v1/inventory/export?${parameters.toString()}`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Inventory data could not be downloaded.');
  return response.blob();
}

export async function getAssetTypes(signal?: AbortSignal): Promise<AssetType[]> {
  const payload = await apiRequest<unknown>('/api/v1/inventory/asset-types', {
    ...(signal ? { signal } : {}),
  });
  return AssetTypesResponseSchema.parse(payload).data;
}

export async function createAssetType(name: string): Promise<AssetType> {
  const payload = await apiRequest<{ data: { assetType: AssetType } }>(
    '/api/v1/inventory/asset-types',
    { method: 'POST', json: { name } },
  );
  return payload.data.assetType;
}

export async function deleteAssetType(assetTypeId: string): Promise<void> {
  await apiRequest<unknown>(`/api/v1/inventory/asset-types/${encodeURIComponent(assetTypeId)}`, {
    method: 'DELETE',
  });
}

export async function getAssetDetails(
  kind?: AssetDetailKind,
  signal?: AbortSignal,
): Promise<AssetDetail[]> {
  const parameters = new URLSearchParams();
  if (kind) parameters.set('kind', kind);
  const payload = await apiRequest<unknown>(
    `/api/v1/inventory/asset-details${parameters.size ? `?${parameters.toString()}` : ''}`,
    { ...(signal ? { signal } : {}) },
  );
  return AssetDetailsResponseSchema.parse(payload).data;
}

export async function createAssetDetail(kind: AssetDetailKind, name: string): Promise<AssetDetail> {
  const payload = await apiRequest<{ data: { detail: AssetDetail } }>(
    '/api/v1/inventory/asset-details',
    { method: 'POST', json: { kind, name } },
  );
  return payload.data.detail;
}

export async function deleteAssetDetail(assetDetailId: string): Promise<void> {
  await apiRequest<unknown>(
    `/api/v1/inventory/asset-details/${encodeURIComponent(assetDetailId)}`,
    {
      method: 'DELETE',
    },
  );
}

export async function updateAssetDetail(assetDetailId: string, name: string): Promise<AssetDetail> {
  const payload = await apiRequest<{ data: { detail: AssetDetail } }>(
    `/api/v1/inventory/asset-details/${encodeURIComponent(assetDetailId)}`,
    { method: 'PATCH', json: { name } },
  );
  return payload.data.detail;
}

export async function previewAssetTypeImport(
  file: File,
  kind?: AssetDetailKind,
): Promise<AssetTypeImportPreviewResponse['data']> {
  const form = new FormData();
  form.set('file', file);
  if (kind) form.set('kind', kind);
  const payload = await apiRequest<unknown>('/api/v1/inventory/asset-types/imports/preview', {
    method: 'POST',
    body: form,
  });
  return AssetTypeImportPreviewResponseSchema.parse(payload).data;
}

export async function commitAssetTypeImport(
  importId: string,
): Promise<AssetTypeImportResponse['data']> {
  const payload = await apiRequest<unknown>(
    `/api/v1/inventory/asset-types/imports/${encodeURIComponent(importId)}/commit`,
    { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, json: {} },
  );
  return AssetTypeImportResponseSchema.parse(payload).data;
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
    typeModelName?: string;
    configuration?: string;
    store?: string;
    department?: string;
    vendorName?: string;
    locationBlock?: string;
    quantity?: number;
    unitLabel?: string;
    status?: string;
    valid: boolean;
    errors: string[];
    duplicates?: Array<{
      source: 'UPLOAD_FILE' | 'EXISTING_INVENTORY';
      matchedField: 'serialNumber';
      uploadedValue: string;
      otherRowNumbers?: number[];
      assetTag?: string;
      materialCode?: string;
      name?: string;
      category?: string;
      typeModelName?: string;
      configuration?: string;
      store?: string;
      location?: string;
      block?: string;
      status?: string;
    }>;
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

export async function getInventoryImportPreview(importId: string): Promise<InventoryImportPreview> {
  const payload = await apiRequest<{ data: InventoryImportPreview }>(
    `/api/v1/inventory/imports/${encodeURIComponent(importId)}`,
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

export async function setBulkMaterialStatus(
  materialCodes: string[],
  status: MaterialStatus,
): Promise<{
  updated: Material[];
  failed: Array<{ materialCode: string; reason: string }>;
}> {
  const payload = await apiRequest<{
    data: {
      updated: Material[];
      failed: Array<{ materialCode: string; reason: string }>;
    };
  }>('/api/v1/inventory/bulk-status', {
    method: 'PATCH',
    json: { materialCodes, status },
  });
  return {
    updated: payload.data.updated.map((material) => MaterialSchema.parse(material)),
    failed: payload.data.failed,
  };
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
