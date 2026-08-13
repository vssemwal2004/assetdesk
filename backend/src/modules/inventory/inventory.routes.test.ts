import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserRole, WorkerPermission } from '@assetdesk/contracts';

const service = vi.hoisted(() => ({
  adjustQuantity: vi.fn(),
  createAssetUnit: vi.fn(),
  deleteAssetUnit: vi.fn(),
  createMaterial: vi.fn(),
  listAssetDetails: vi.fn(),
  deleteMaterial: vi.fn(),
  getMaterial: vi.fn(),
  listAssetUnits: vi.fn(),
  listMaterials: vi.fn(),
  updateAssetUnit: vi.fn(),
  updateMaterial: vi.fn(),
  updateMaterialStatus: vi.fn(),
}));
const importService = vi.hoisted(() => ({
  previewInventoryImport: vi.fn(),
  commitInventoryImport: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  role: 'WORKER' as UserRole,
  permissions: ['INVENTORY_VIEW'] as WorkerPermission[],
}));

vi.mock('./inventory.service.js', () => service);
vi.mock('./inventory-import.service.js', () => importService);
vi.mock('../audit/audit.service.js', () => ({ appendAuditEvent: vi.fn() }));
vi.mock('../auth/auth.middleware.js', () => {
  const requireAuth: RequestHandler = (request, _response, next) => {
    request.auth = {
      userId: '507f1f77bcf86cd799439011',
      workerId: 'GEU-WRK-ABCD',
      role: authState.role,
      permissions: authState.role === 'ADMIN' ? [] : authState.permissions,
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
  function hasServerPermission(
    auth: NonNullable<Express.Request['auth']>,
    permission: WorkerPermission,
  ) {
    return auth.role === 'ADMIN' || auth.permissions.includes(permission);
  }
  return {
    hasServerPermission,
    requireAuth,
    requireFullAccess: pass,
    requireTrustedOrigin: pass,
    requireCsrf: pass,
    requirePermission:
      (permission: WorkerPermission): RequestHandler =>
      (request, response, next) => {
        if (request.auth && hasServerPermission(request.auth, permission)) next();
        else response.status(403).json({ code: 'PERMISSION_DENIED' });
      },
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
    authState.permissions = ['INVENTORY_VIEW'];
    service.listMaterials.mockResolvedValue({
      materials: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    service.listAssetUnits.mockResolvedValue({
      units: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    service.listAssetDetails.mockResolvedValue({
      assetDetails: [],
    });
  });

  it('allows Worker reads and passes the role into the availability filter', async () => {
    const response = await request(testApp()).get('/api/v1/inventory').expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(service.listMaterials).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'WORKER', page: 1, pageSize: 20 }),
    );
  });

  it('allows assignment creators to load only issueable inventory for the issue picker', async () => {
    authState.permissions = ['ASSIGNMENTS_CREATE'];

    await request(testApp()).get('/api/v1/inventory?issueable=true&pageSize=500').expect(200);
    await request(testApp()).get('/api/v1/inventory').expect(403);

    expect(service.listMaterials).toHaveBeenCalledWith(
      expect.objectContaining({ issueable: true, role: 'WORKER', pageSize: 500 }),
    );
  });

  it('allows assignment creators to load available serial numbers for the issue picker', async () => {
    authState.permissions = ['ASSIGNMENTS_CREATE'];

    await request(testApp())
      .get('/api/v1/inventory/GEU-MAT-000001/units?status=AVAILABLE')
      .expect(200);
    await request(testApp()).get('/api/v1/inventory/GEU-MAT-000001/units').expect(403);

    expect(service.listAssetUnits).toHaveBeenCalledWith(
      expect.objectContaining({ materialCode: 'GEU-MAT-000001', status: 'AVAILABLE' }),
    );
  });

  it('loads asset details without requiring a kind query', async () => {
    await request(testApp()).get('/api/v1/inventory/asset-details').expect(200);

    expect(service.listAssetDetails).toHaveBeenCalledWith(undefined);
  });

  it('allows inventory add workers to load asset details for add-material dropdowns', async () => {
    authState.permissions = ['INVENTORY_ADD'];

    await request(testApp()).get('/api/v1/inventory/asset-details').expect(200);

    expect(service.listAssetDetails).toHaveBeenCalledWith(undefined);
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

  it('bulk-updates selected inventory statuses for an Admin', async () => {
    authState.role = 'ADMIN';
    service.updateMaterialStatus.mockResolvedValue({
      material: {
        id: 'material-id',
        materialCode: 'GEU-MAT-000001',
        name: 'Network switch',
        category: 'Networking',
        trackingMode: 'SERIALIZED',
        returnPolicy: 'REUSABLE',
        assignmentTypes: ['LONG_TERM'],
        status: 'UNDER_MAINTENANCE',
        totalQuantity: 1,
        availableQuantity: 1,
        issuedQuantity: 0,
        unitLabel: null,
      },
      previousStatus: 'ACTIVE',
    });

    const response = await request(testApp())
      .patch('/api/v1/inventory/bulk-status')
      .send({
        materialCodes: ['GEU-MAT-000001'],
        status: 'UNDER_MAINTENANCE',
      })
      .expect(200);

    expect(response.body.data.updated).toHaveLength(1);
    expect(service.updateMaterialStatus).toHaveBeenCalledWith(
      'GEU-MAT-000001',
      'UNDER_MAINTENANCE',
    );
  });

  it('previews an Admin bulk upload without creating inventory', async () => {
    authState.role = 'ADMIN';
    importService.previewInventoryImport.mockResolvedValue({
      importId: '507f1f77bcf86cd799439012',
      fileName: 'assets.csv',
      mode: 'SERIALIZED',
      totalRows: 1,
      validRows: 1,
      invalidRows: 0,
      rows: [
        {
          rowNumber: 2,
          name: 'Laptop',
          category: 'Laptops',
          serialNumber: 'LT-001',
          valid: true,
          errors: [],
        },
      ],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const response = await request(testApp())
      .post('/api/v1/inventory/imports/preview')
      .field('mode', 'SERIALIZED')
      .attach('file', Buffer.from('Material Name,Group,Serial Number\nLaptop,Laptops,LT-001'), {
        filename: 'assets.csv',
        contentType: 'text/csv',
      })
      .expect(201);

    expect(response.body.data.validRows).toBe(1);
    expect(importService.previewInventoryImport).toHaveBeenCalledOnce();
    expect(service.createMaterial).not.toHaveBeenCalled();
  });

  it('commits only through the explicit import commit endpoint', async () => {
    authState.role = 'ADMIN';
    importService.commitInventoryImport.mockResolvedValue({ created: [], failed: [] });

    await request(testApp())
      .post('/api/v1/inventory/imports/507f1f77bcf86cd799439012/commit')
      .send({})
      .expect(200);

    expect(importService.commitInventoryImport).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012',
      '507f1f77bcf86cd799439011',
    );
  });
});
