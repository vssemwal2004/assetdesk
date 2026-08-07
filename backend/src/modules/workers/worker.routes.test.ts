import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import request from 'supertest';
import { ZodError } from 'zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserRole } from '@assetdesk/contracts';

const service = vi.hoisted(() => ({
  commitWorkerImport: vi.fn(),
  createWorker: vi.fn(),
  deleteWorker: vi.fn(),
  getWorker: vi.fn(),
  listWorkers: vi.fn(),
  previewWorkerImport: vi.fn(),
  regenerateWorkerCredential: vi.fn(),
  updateWorker: vi.fn(),
  updateWorkerAccess: vi.fn(),
  updateWorkerStatus: vi.fn(),
}));
const auditService = vi.hoisted(() => ({ appendAuditEvent: vi.fn() }));
const database = vi.hoisted(() => ({
  startSession: vi.fn(),
  session: {
    withTransaction: vi.fn(),
    endSession: vi.fn(),
  },
}));

vi.mock('mongoose', () => ({ default: { startSession: database.startSession } }));
vi.mock('./worker.service.js', () => ({
  createWorker: service.createWorker,
  deleteWorker: service.deleteWorker,
  getWorker: service.getWorker,
  listWorkers: service.listWorkers,
  regenerateWorkerCredential: service.regenerateWorkerCredential,
  updateWorker: service.updateWorker,
  updateWorkerAccess: service.updateWorkerAccess,
  updateWorkerStatus: service.updateWorkerStatus,
}));
vi.mock('./worker-import.service.js', () => ({
  commitWorkerImport: service.commitWorkerImport,
  previewWorkerImport: service.previewWorkerImport,
}));
vi.mock('../audit/audit.service.js', () => auditService);
vi.mock('../auth/auth.middleware.js', () => {
  const requireAuth: RequestHandler = (request, _response, next) => {
    request.auth = {
      userId: '507f1f77bcf86cd799439011',
      workerId: 'GEU-WRK-ABCD',
      role: 'ADMIN',
      permissions: [],
      dataAccess: { inventory: 'ALL', issues: 'ALL', cartridges: 'ALL' },
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
    requireRole:
      (...roles: UserRole[]): RequestHandler =>
      (request, response, next) => {
        if (request.auth && roles.includes(request.auth.role)) next();
        else response.status(403).json({ code: 'PERMISSION_DENIED' });
      },
  };
});

import { createWorkersRouter } from './worker.routes.js';

const worker = {
  id: '507f1f77bcf86cd799439012',
  workerId: 'GEU-WRK-A7K4',
  name: 'Anita Sharma',
  email: 'anita@example.edu',
  contact: null,
  department: null,
  status: 'ACTIVE',
  invitationStatus: 'SENT',
  mustChangePassword: false,
  permissions: ['DASHBOARD', 'INVENTORY_VIEW'],
  dataAccess: { inventory: 'ALL', issues: 'OWN', cartridges: 'OWN' },
  temporaryPasswordExpiresAt: null,
  lastLoginAt: null,
  createdAt: '2026-08-07T09:00:00.000Z',
};

function testApp() {
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.requestId = 'worker-access-request';
    next();
  });
  app.use('/api/v1/workers', createWorkersRouter());
  const testErrorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    response.status(error instanceof ZodError ? 400 : 500).json({ message: error.message });
  };
  app.use(testErrorHandler);
  return app;
}

describe('worker access route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.startSession.mockResolvedValue(database.session);
    database.session.withTransaction.mockImplementation(async (callback: () => Promise<unknown>) =>
      callback(),
    );
    database.session.endSession.mockResolvedValue(undefined);
    service.updateWorkerAccess.mockResolvedValue(worker);
    auditService.appendAuditEvent.mockResolvedValue(undefined);
  });

  it('updates access and records its audit event in one transaction', async () => {
    const input = {
      permissions: ['DASHBOARD', 'INVENTORY_VIEW'],
      dataAccess: { inventory: 'ALL', issues: 'OWN', cartridges: 'OWN' },
    };

    const response = await request(testApp())
      .patch('/api/v1/workers/GEU-WRK-A7K4/access')
      .send(input)
      .expect(200);

    expect(response.body.data.worker).toEqual(worker);
    expect(database.session.withTransaction).toHaveBeenCalledOnce();
    expect(service.updateWorkerAccess).toHaveBeenCalledWith(
      'GEU-WRK-A7K4',
      input,
      database.session,
    );
    expect(auditService.appendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'worker-access-request',
        action: 'WORKER_ACCESS_UPDATED',
        targetId: 'GEU-WRK-A7K4',
        metadata: { fields: ['permissions', 'dataAccess'] },
      }),
      { session: database.session },
    );
    expect(database.session.endSession).toHaveBeenCalledOnce();
  });

  it('ends the transaction session and fails the request when audit persistence fails', async () => {
    auditService.appendAuditEvent.mockRejectedValue(new Error('audit unavailable'));

    await request(testApp())
      .patch('/api/v1/workers/GEU-WRK-A7K4/access')
      .send({
        permissions: ['DASHBOARD', 'INVENTORY_VIEW'],
        dataAccess: { inventory: 'ALL', issues: 'OWN', cartridges: 'OWN' },
      })
      .expect(500);

    expect(database.session.endSession).toHaveBeenCalledOnce();
  });

  it('rejects profile fields before opening a database transaction', async () => {
    await request(testApp())
      .patch('/api/v1/workers/GEU-WRK-A7K4/access')
      .send({
        name: 'Unexpected profile edit',
        permissions: ['DASHBOARD'],
        dataAccess: { inventory: 'OWN', issues: 'OWN', cartridges: 'OWN' },
      })
      .expect(400);

    expect(database.startSession).not.toHaveBeenCalled();
    expect(service.updateWorkerAccess).not.toHaveBeenCalled();
  });
});
