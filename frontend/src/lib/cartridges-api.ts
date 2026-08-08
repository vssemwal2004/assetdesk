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
  query.set('pageSize', String(filters.pageSize ?? 20));
  if (filters.search) query.set('search', filters.search);
  if (filters.status) query.set('status', filters.status);
  return CartridgeListResponseSchema.parse(await apiRequest(`/api/v1/cartridges?${query}`));
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
  return apiRequest<{ data: { counts: Record<string, number>; openGatePasses: number } }>(
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
export async function gatePassAction(id: string, action: 'verify' | 'gate-out', json?: unknown) {
  return apiRequest<{ data: GatePass }>(`/api/v1/cartridges/gate-passes/${id}/${action}`, {
    method: 'POST',
    json: json ?? {},
  });
}
export async function recordGateIn(id: string, serials: string[]) {
  return apiRequest<{ data: GatePass }>(`/api/v1/cartridges/gate-passes/${id}/gate-in`, {
    method: 'POST',
    json: { cartridgeSerialNumbers: serials },
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
  gateInEvents: Array<{ at: string; byName: string; serialNumbers: string[]; remarks?: string }>;
  createdAt: string;
  remarks?: string;
}
