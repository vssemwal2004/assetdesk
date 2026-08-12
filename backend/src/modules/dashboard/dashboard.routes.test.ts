import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserRole } from '@assetdesk/contracts';

const authState = vi.hoisted(() => ({ role: 'ADMIN' as UserRole }));
const service = vi.hoisted(() => ({ getAdminDashboard: vi.fn(), getWorkerDashboard: vi.fn() }));

vi.mock('./dashboard.service.js', () => service);
vi.mock('../auth/auth.middleware.js', () => {
  const requireAuth: RequestHandler = (request, _response, next) => {
    request.auth = {
      userId: '507f1f77bcf86cd799439011',
      workerId: 'GEU-WRK-ABCD',
      role: authState.role,
      permissions: ['DASHBOARD'],
      dataAccess: { inventory: 'OWN', issues: 'OWN', cartridges: 'OWN' },
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
    requireRole:
      (...roles: UserRole[]): RequestHandler =>
      (request, response, next) => {
        if (request.auth && roles.includes(request.auth.role)) next();
        else response.status(403).json({ code: 'PERMISSION_DENIED' });
      },
  };
});

import { createDashboardRouter } from './dashboard.routes.js';

function testApp() {
  const app = express();
  app.use('/api/v1/dashboard', createDashboardRouter());
  return app;
}

describe('Admin dashboard route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = 'ADMIN';
    service.getAdminDashboard.mockResolvedValue({
      stats: {
        todayIssued: 1,
        totalIssues: 2,
        pendingReturns: 1,
        overdueReturns: 0,
        dueToday: 0,
        returnedToday: 1,
        outstandingItems: 2,
        activeWorkers: 3,
      },
      attentionIssues: [],
      recentIssues: [],
      generatedAt: '2026-07-16T09:30:00.000Z',
    });
    service.getWorkerDashboard.mockResolvedValue({
      stats: {
        todayIssued: 1,
        totalIssues: 2,
        pendingReturns: 1,
        overdueReturns: 0,
        dueToday: 0,
        returnedToday: 1,
        outstandingItems: 2,
        activeWorkers: 0,
      },
      inventory: {
        materialCount: 0,
        totalQuantity: 0,
        availableQuantity: 0,
        issuedQuantity: 0,
        breakdown: [],
      },
      attentionIssues: [],
      recentIssues: [],
      range: '7D',
      scope: 'ASSIGNED',
      trend: [],
      generatedAt: '2026-07-16T09:30:00.000Z',
    });
  });

  it('returns no-store operational data to an Admin', async () => {
    const response = await request(testApp()).get('/api/v1/dashboard/admin').expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data.stats.totalIssues).toBe(2);
    expect(service.getAdminDashboard).toHaveBeenCalledOnce();
  });

  it('does not expose university-wide counts to a Worker', async () => {
    authState.role = 'WORKER';

    await request(testApp()).get('/api/v1/dashboard/admin').expect(403);
    expect(service.getAdminDashboard).not.toHaveBeenCalled();
  });

  it('returns only the scoped employee dashboard to a Worker', async () => {
    authState.role = 'WORKER';

    const response = await request(testApp()).get('/api/v1/dashboard/worker?range=7D').expect(200);

    expect(response.body.data.scope).toBe('ASSIGNED');
    expect(service.getWorkerDashboard).toHaveBeenCalledWith(
      {
        userId: '507f1f77bcf86cd799439011',
        permissions: ['DASHBOARD'],
        dataAccess: { inventory: 'OWN', issues: 'OWN', cartridges: 'OWN' },
      },
      '7D',
    );
  });
});
