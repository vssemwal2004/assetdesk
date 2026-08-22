import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerPermission } from '@assetdesk/contracts';

import { errorHandler } from '../../middleware/error-handler.js';

const service = vi.hoisted(() => ({
  cancelGatePass: vi.fn(),
  createInventoryGatePass: vi.fn(),
  getInventoryGatePass: vi.fn(),
  listGatePassAssetOptions: vi.fn(),
  listGatePassMaterialOptions: vi.fn(),
  listInventoryGatePasses: vi.fn(),
  recordGateIn: vi.fn(),
  recordGateOut: vi.fn(),
  updateReadyGatePass: vi.fn(),
}));
const authState = vi.hoisted(() => ({
  permissions: ['GATE_PASS_CREATE'] as WorkerPermission[],
}));

vi.mock('./inventory-gate-pass.service.js', () => service);
vi.mock('../auth/auth.middleware.js', () => {
  const requireAuth: RequestHandler = (request, _response, next) => {
    request.auth = {
      userId: '507f1f77bcf86cd799439011',
      workerId: 'GEU-WRK-ABCD',
      role: 'WORKER',
      permissions: authState.permissions,
      dataAccess: { inventory: 'ALL', issues: 'ALL' },
      sid: 'a'.repeat(32),
      authVersion: 1,
      mustChangePassword: false,
      purpose: 'FULL_ACCESS',
      csrfTokenHash: 'hash',
    };
    next();
  };
  const pass: RequestHandler = (_request, _response, next) => next();
  const hasServerPermission = (
    auth: NonNullable<Express.Request['auth']>,
    permission: WorkerPermission,
  ) => auth.role === 'ADMIN' || auth.permissions.includes(permission);
  return {
    hasServerPermission,
    requireAuth,
    requireFullAccess: pass,
    requireTrustedOrigin: pass,
    requireCsrf: pass,
    requirePermission:
      (permission: WorkerPermission): RequestHandler =>
      (request, response, next) => {
        if (request.auth?.permissions.includes(permission)) next();
        else response.status(403).json({ code: 'PERMISSION_DENIED' });
      },
  };
});

import { createInventoryGatePassRouter } from './inventory-gate-pass.routes.js';

function testApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/inventory-gate-passes', createInventoryGatePassRouter());
  app.use(errorHandler);
  return app;
}

describe('inventory Gate Pass routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.permissions = ['GATE_PASS_CREATE'];
    service.listGatePassMaterialOptions.mockResolvedValue({
      data: [],
      total: 0,
      totalPages: 0,
      categories: ['Laptop'],
    });
    service.listGatePassAssetOptions.mockResolvedValue({ data: [], total: 0 });
    service.listInventoryGatePasses.mockResolvedValue({ data: [], total: 0, totalPages: 0 });
  });

  it('provides repair-eligible material options using Gate Pass permission', async () => {
    const response = await request(testApp())
      .get('/api/v1/inventory-gate-passes/options/materials')
      .query({ purpose: 'REPAIR', trackingMode: 'SERIALIZED', search: 'Dell' })
      .expect(200);

    expect(response.body.meta.categories).toEqual(['Laptop']);
    expect(service.listGatePassMaterialOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'REPAIR',
        trackingMode: 'SERIALIZED',
        search: 'Dell',
      }),
    );
  });

  it('does not expose damaged asset options without Gate Pass create permission', async () => {
    authState.permissions = ['GATE_PASS_VIEW'];

    await request(testApp())
      .get('/api/v1/inventory-gate-passes/options/materials/GEU-MAT-2026-000001/assets')
      .query({ purpose: 'REPAIR' })
      .expect(403);

    expect(service.listGatePassAssetOptions).not.toHaveBeenCalled();
  });

  it('rejects issue-only purposes from the manual Gate Pass API', async () => {
    const response = await request(testApp())
      .post('/api/v1/inventory-gate-passes')
      .send({
        purpose: 'ISSUE_RETURNABLE',
        issueId: 'GEU-ISS-2026-000001',
        destination: { name: 'Outside university' },
        carrier: { name: 'Amit Kumar' },
        items: [
          {
            trackingMode: 'QUANTITY',
            materialCode: 'GEU-MAT-2026-000001',
            quantity: 1,
            returnRequirement: 'RETURNABLE',
          },
        ],
      })
      .expect(400);

    expect(response.body.code).toBe('MANUAL_GATE_PASS_PURPOSE_INVALID');
    expect(service.createInventoryGatePass).not.toHaveBeenCalled();
  });

  it('filters Gate Pass In records on the server using both active return statuses', async () => {
    authState.permissions = ['GATE_PASS_VIEW'];

    await request(testApp())
      .get('/api/v1/inventory-gate-passes')
      .query({ statuses: 'OUTSIDE,PARTIALLY_IN', trackingMode: 'SERIALIZED' })
      .expect(200);

    expect(service.listInventoryGatePasses).toHaveBeenCalledWith(
      expect.objectContaining({
        statuses: ['OUTSIDE', 'PARTIALLY_IN'],
        trackingMode: 'SERIALIZED',
        ownerUserId: '507f1f77bcf86cd799439011',
      }),
    );
  });

  it('removes the owner restriction only for Gate Pass View All permission', async () => {
    authState.permissions = ['GATE_PASS_VIEW', 'GATE_PASS_VIEW_ALL'];

    await request(testApp()).get('/api/v1/inventory-gate-passes').expect(200);

    expect(service.listInventoryGatePasses).toHaveBeenCalledWith(
      expect.not.objectContaining({ ownerUserId: expect.anything() }),
    );
  });

  it('allows detail edits only through the edit-ready permission', async () => {
    authState.permissions = ['GATE_PASS_EDIT_READY'];
    service.updateReadyGatePass.mockResolvedValue({ gatePassNumber: 'GEU-GP-2026-000001' });

    await request(testApp())
      .patch('/api/v1/inventory-gate-passes/GEU-GP-2026-000001')
      .send({ destination: { name: 'Revised Service Centre' } })
      .expect(200);

    expect(service.updateReadyGatePass).toHaveBeenCalledWith(
      'GEU-GP-2026-000001',
      { destination: { name: 'Revised Service Centre' } },
      expect.objectContaining({ workerId: 'GEU-WRK-ABCD' }),
    );
  });

  it('exports the permission-scoped Gate Pass register as CSV', async () => {
    authState.permissions = ['GATE_PASS_EXPORT'];

    const response = await request(testApp())
      .get('/api/v1/inventory-gate-passes/export')
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.text).toContain('Gate Pass Number');
    expect(service.listInventoryGatePasses).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: '507f1f77bcf86cd799439011' }),
    );
  });
});
