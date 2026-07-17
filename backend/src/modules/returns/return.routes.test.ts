import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserRole } from '@assetdesk/contracts';

const service = vi.hoisted(() => ({
  getReturnEvent: vi.fn(),
  listReturnEvents: vi.fn(),
  recordReturn: vi.fn(),
}));

vi.mock('./return.service.js', () => service);
vi.mock('../auth/auth.middleware.js', () => {
  const requireAuth: RequestHandler = (request, _response, next) => {
    request.auth = {
      userId: '507f1f77bcf86cd799439011',
      workerId: 'GEU-WRK-ABCD',
      role: 'WORKER',
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

import { createIssueReturnsRouter, createReturnsRouter } from './return.routes.js';

function testApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/issues', createIssueReturnsRouter());
  app.use('/api/v1/returns', createReturnsRouter());
  return app;
}

describe('Return routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.listReturnEvents.mockResolvedValue({
      events: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it('records a Return with actor-bound idempotency and a 201 response', async () => {
    service.recordReturn.mockResolvedValue({
      issue: { issueId: 'GEU-ISS-2026-000001' },
      returnEvent: { returnEventId: '35e246ca-8ea1-4b97-840b-6458e24923be' },
      idempotentReplay: false,
    });

    const response = await request(testApp())
      .post('/api/v1/issues/GEU-ISS-2026-000001/returns')
      .set('Idempotency-Key', 'return-test-key-001')
      .send({
        items: [
          {
            trackingMode: 'QUANTITY',
            lineId: '84f9d1ad-70ad-4dad-8d7b-32174705654a',
            quantity: 1,
          },
        ],
      })
      .expect(201);

    expect(service.recordReturn).toHaveBeenCalledWith(
      'GEU-ISS-2026-000001',
      expect.objectContaining({ items: [expect.objectContaining({ quantity: 1 })] }),
      expect.objectContaining({ role: 'WORKER', workerId: 'GEU-WRK-ABCD' }),
      {
        keyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    );
    expect(response.body.meta.idempotentReplay).toBe(false);
  });

  it('scopes a Worker Return activity list through the authenticated actor', async () => {
    const response = await request(testApp()).get('/api/v1/returns?search=Switch').expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(service.listReturnEvents).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      role: 'WORKER',
      actorUserId: '507f1f77bcf86cd799439011',
      search: 'Switch',
    });
  });

  it('passes the returned-today filter to the activity service', async () => {
    await request(testApp()).get('/api/v1/returns?period=TODAY').expect(200);

    expect(service.listReturnEvents).toHaveBeenCalledWith(
      expect.objectContaining({ period: 'TODAY' }),
    );
  });
});
