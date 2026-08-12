import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserRole } from '@assetdesk/contracts';

const service = vi.hoisted(() => ({
  createIssue: vi.fn(),
  getIssueDetail: vi.fn(),
  listIssues: vi.fn(),
  searchReturnableIssues: vi.fn(),
  updateIssue: vi.fn(),
}));

vi.mock('./issue.service.js', () => service);
vi.mock('../auth/auth.middleware.js', () => {
  const requireAuth: RequestHandler = (request, _response, next) => {
    request.auth = {
      userId: '507f1f77bcf86cd799439011',
      workerId: 'GEU-WRK-ABCD',
      role: 'WORKER',
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

import { createIssuesRouter } from './issue.routes.js';

function testApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/issues', createIssuesRouter());
  return app;
}

describe('Issue routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.listIssues.mockResolvedValue({
      issues: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    service.searchReturnableIssues.mockResolvedValue({
      issues: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it('allows a Worker to list only through their actor-scoped service input', async () => {
    const response = await request(testApp()).get('/api/v1/issues').expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(service.listIssues).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      actorUserId: '507f1f77bcf86cd799439011',
      actorRole: 'WORKER',
      issueDataScope: 'ALL',
    });
    expect(response.body.meta).toEqual({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  });

  it('passes exact dashboard drill-down filters to the list service', async () => {
    await request(testApp())
      .get('/api/v1/issues?period=TODAY&returnState=DUE_TODAY&assignmentType=LONG_TERM')
      .expect(200);

    expect(service.listIssues).toHaveBeenCalledWith(
      expect.objectContaining({
        period: 'TODAY',
        returnState: 'DUE_TODAY',
        assignmentType: 'LONG_TERM',
      }),
    );
  });

  it('creates an Issue with hashed idempotency data and reports a new write', async () => {
    service.createIssue.mockResolvedValue({
      issue: { issueId: 'GEU-ISS-2026-000001' },
      idempotentReplay: false,
    });

    const response = await request(testApp())
      .post('/api/v1/issues')
      .set('Idempotency-Key', 'issue-test-key-0001')
      .send({
        assignmentType: 'SHORT_TERM',
        receiverCode: 'GEU-RCV-000001',
        lines: [{ trackingMode: 'QUANTITY', materialCode: 'GEU-MAT-000001', quantity: 2 }],
        due: { preset: 'ONE_WEEK' },
      })
      .expect(201);

    expect(service.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({ receiverCode: 'GEU-RCV-000001' }),
      expect.objectContaining({ role: 'WORKER', workerId: 'GEU-WRK-ABCD' }),
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(response.body.meta.idempotentReplay).toBe(false);
  });

  it('resolves return-search as the static route before the Issue ID route', async () => {
    await request(testApp())
      .get('/api/v1/issues/return-search?search=GEU-ISS-2026-000001')
      .expect(200);

    expect(service.searchReturnableIssues).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      search: 'GEU-ISS-2026-000001',
      actorRole: 'WORKER',
      issueDataScope: 'ALL',
    });
    expect(service.getIssueDetail).not.toHaveBeenCalled();
  });

  it('updates editable Issue details through the scoped service', async () => {
    service.updateIssue.mockResolvedValue({ issueId: 'GEU-ISS-2026-000001' });

    const response = await request(testApp())
      .patch('/api/v1/issues/GEU-ISS-2026-000001')
      .send({
        receiver: {
          fullName: 'Updated Receiver',
          type: 'STUDENT',
          contact: '9999999999',
          email: 'updated@example.com',
        },
        purpose: 'Lab practical',
        notes: null,
      })
      .expect(200);

    expect(service.updateIssue).toHaveBeenCalledWith(
      'GEU-ISS-2026-000001',
      expect.objectContaining({
        purpose: 'Lab practical',
        receiver: expect.objectContaining({ fullName: 'Updated Receiver' }),
      }),
      expect.objectContaining({ role: 'WORKER', workerId: 'GEU-WRK-ABCD' }),
    );
    expect(response.body.data.issue.issueId).toBe('GEU-ISS-2026-000001');
  });
});
