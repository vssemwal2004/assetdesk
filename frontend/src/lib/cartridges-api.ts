import {
  CartridgeListResponseSchema,
  CartridgeSchema,
  type Cartridge,
  type CreateCartridgesRequest,
} from '@assetdesk/contracts';
import { apiRequest } from './api-client';
export async function getCartridges(
  filters: { page?: number; pageSize?: number; search?: string; status?: string } = {},
) {
  const query = new URLSearchParams();
  query.set('page', String(filters.page ?? 1));
  // Keep requests compatible with servers that enforce the original 100-row limit.
  query.set('pageSize', String(Math.min(filters.pageSize ?? 20, 100)));
  if (filters.search) query.set('search', filters.search);
  if (filters.status) query.set('status', filters.status);
  return CartridgeListResponseSchema.parse(await apiRequest(`/api/v1/cartridges?${query}`));
}
export async function getAllCartridges(filters: { search?: string; status?: string } = {}) {
  const pageSize = 100;
  const first = await getCartridges({ ...filters, page: 1, pageSize });
  if (first.meta.totalPages <= 1) return first;

  const remaining = await Promise.all(
    Array.from({ length: first.meta.totalPages - 1 }, (_, index) =>
      getCartridges({ ...filters, page: index + 2, pageSize }),
    ),
  );
  return {
    data: [first, ...remaining].flatMap((page) => page.data),
    meta: { ...first.meta, page: 1, pageSize: first.meta.total },
  };
}
export async function getCartridgeActivity(
  filters: { page?: number; pageSize?: number; search?: string; type?: string } = {},
) {
  const query = new URLSearchParams();
  query.set('page', String(filters.page ?? 1));
  query.set('pageSize', String(filters.pageSize ?? 50));
  if (filters.search) query.set('search', filters.search);
  if (filters.type) query.set('type', filters.type);
  return apiRequest<{
    data: Array<{
      id: string;
      cartridgeId: string;
      serialNumber: string;
      type: string;
      fromStatus: string | null;
      toStatus: string;
      employeeName: string | null;
      employeeId: string | null;
      department: string | null;
      defectReason: string | null;
      remarks: string | null;
      actorWorkerId: string;
      createdAt: string;
    }>;
    meta: { page: number; pageSize: number; total: number; totalPages: number };
  }>(`/api/v1/cartridges/activity?${query}`);
}
export async function addCartridges(input: CreateCartridgesRequest) {
  const result = await apiRequest<{ data: unknown[] }>('/api/v1/cartridges', {
    method: 'POST',
    json: input,
  });
  return result.data.map((x) => CartridgeSchema.parse(x));
}
export async function issueCartridge(input: Record<string, unknown>) {
  return apiRequest<{ data: unknown }>('/api/v1/cartridges/issues', {
    method: 'POST',
    json: input,
  });
}
export async function returnCartridge(input: Record<string, unknown>) {
  return apiRequest<{ data: unknown }>('/api/v1/cartridges/returns', {
    method: 'POST',
    json: input,
  });
}
export async function getCartridgeDashboard() {
  return apiRequest<{
    data: { counts: Record<string, number>; openGatePasses: number; refilled: number };
  }>(
    '/api/v1/cartridges/dashboard',
  );
}
export async function getGatePasses() {
  return apiRequest<{ data: GatePass[] }>('/api/v1/cartridges/gate-passes');
}
export async function createGatePass(input: Record<string, unknown>) {
  return apiRequest<{ data: GatePass }>('/api/v1/cartridges/gate-passes', {
    method: 'POST',
    json: input,
  });
}
export async function getGatePass(id: string) {
  return apiRequest<{ data: GatePass }>(`/api/v1/cartridges/gate-passes/${id}`);
}
export async function getCartridge(serial: string) {
  return apiRequest<{
    data: {
      cartridge: Cartridge;
      history: Array<{
        _id: string;
        type: string;
        toStatus: string;
        createdAt: string;
        actorWorkerId: string;
        remarks?: string;
      }>;
    };
  }>(`/api/v1/cartridges/${encodeURIComponent(serial)}`);
}
export async function recordCartridgeQc(input: Record<string, unknown>) {
  return apiRequest<{ data: unknown }>('/api/v1/cartridges/qc', { method: 'POST', json: input });
}
export async function gatePassAction(
  id: string,
  action: 'verify' | 'gate-out' | 'cancel',
  json?: unknown,
) {
  return apiRequest<{ data: GatePass }>(`/api/v1/cartridges/gate-passes/${id}/${action}`, {
    method: 'POST',
    json: json ?? {},
  });
}
export async function recordGateIn(
  id: string,
  serials: string[],
  remarks?: string,
  conditions?: Array<{
    serialNumber: string;
    condition: 'EMPTY' | 'DEFECTIVE' | 'FILLED_UNUSED' | 'DAMAGED' | 'WRONG_MODEL';
  }>,
) {
  return apiRequest<{ data: GatePass }>(`/api/v1/cartridges/gate-passes/${id}/gate-in`, {
    method: 'POST',
    json: {
      cartridgeSerialNumbers: serials,
      ...(remarks ? { remarks } : {}),
      ...(conditions ? { conditions } : {}),
    },
  });
}
export interface GatePass {
  _id: string;
  gatePassNumber: string;
  vendorName: string;
  personTakingMaterial: string;
  cartridgeSerialNumbers: string[];
  quantity: number;
  status: string;
  preparedByName: string;
  preparedByWorkerId: string;
  verifiedByName?: string;
  gateOutAt?: string;
  gateOutByName?: string;
  gateInEvents: Array<{
    at: string;
    byName: string;
    serialNumbers: string[];
    conditions?: Array<{
      serialNumber: string;
      condition: 'EMPTY' | 'DEFECTIVE' | 'FILLED_UNUSED' | 'DAMAGED' | 'WRONG_MODEL';
    }>;
    remarks?: string;
  }>;
  createdAt: string;
  remarks?: string;
}
