import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserRole } from '@assetdesk/contracts';

const service = vi.hoisted(() => ({
  adjustQuantity: vi.fn(),
  createAssetUnit: vi.fn(),
  createMaterial: vi.fn(),
  deleteMaterial: vi.fn(),
  getMaterial: vi.fn(),
  listAssetUnits: vi.fn(),
  listMaterials: vi.fn(),
  updateAssetUnit: vi.fn(),
  updateMaterial: vi.fn(),
  updateMaterialStatus: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  role: 'WORKER' as UserRole,
}));

vi.mock('./inventory.service.js', () => service);
vi.mock('../audit/audit.service.js', () => ({ appendAuditEvent: vi.fn() }));
vi.mock('../auth/auth.middleware.js', () => {
  const requireAuth: RequestHandler = (request, _response, next) => {
    request.auth = {
      userId: '507f1f77bcf86cd799439011',
      workerId: 'GEU-WRK-ABCD',
      role: authState.role,
      sid: 'a'.repeat(32),
      authVersion: 1,
      mustChangePassword: false,
      purpose: 'FULL_ACCESS',
      csrfTokenHash: 'hash',
    };
    next();
  };
  const pass: RequestHandler = (_request, _response, next) => next();
  return {
    requireAuth,
    requireFullAccess: pass,
    requireTrustedOrigin: pass,
    requireCsrf: pass,
    requirePermission: () => pass,
    requireRole:
      (...roles: UserRole[]): RequestHandler =>
      (request, response, next) => {
        if (request.auth && roles.includes(request.auth.role)) next();
        else response.status(403).json({ code: 'PERMISSION_DENIED' });
      },
  };
});

import { createInventoryRouter } from './inventory.routes.js';

function testApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/inventory', createInventoryRouter());
  return app;
}

describe('inventory route authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = 'WORKER';
    service.listMaterials.mockResolvedValue({
      materials: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it('allows Worker reads and passes the role into the availability filter', async () => {
    const response = await request(testApp()).get('/api/v1/inventory').expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(service.listMaterials).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'WORKER', page: 1, pageSize: 20 }),
    );
  });

  it('blocks Worker mutations before the inventory service is called', async () => {
    const response = await request(testApp())
      .post('/api/v1/inventory')
      .send({
        name: 'Network switch',
        category: 'Networking',
        trackingMode: 'SERIALIZED',
        returnPolicy: 'REUSABLE',
      })
      .expect(403);

    expect(response.body.code).toBe('PERMISSION_DENIED');
    expect(service.createMaterial).not.toHaveBeenCalled();
  });

  it('allows Admin material deletion and records the deleted material', async () => {
    authState.role = 'ADMIN';
    service.deleteMaterial.mockResolvedValue({
      id: 'material-id',
      materialCode: 'GEU-MAT-000001',
      name: 'Network switch',
      category: 'Networking',
      description: null,
      trackingMode: 'SERIALIZED',
      returnPolicy: 'REUSABLE',
      assignmentTypes: ['LONG_TERM'],
      status: 'ACTIVE',
      totalQuantity: 0,
      availableQuantity: 0,
      issuedQuantity: 0,
      unitLabel: null,
      createdAt: new Date().toISOString(),
    });

    await request(testApp()).delete('/api/v1/inventory/GEU-MAT-000001').expect(204);

    expect(service.deleteMaterial).toHaveBeenCalledWith('GEU-MAT-000001');
  });

  it('blocks Worker material deletion', async () => {
    await request(testApp()).delete('/api/v1/inventory/GEU-MAT-000001').expect(403);

    expect(service.deleteMaterial).not.toHaveBeenCalled();
  });
});
