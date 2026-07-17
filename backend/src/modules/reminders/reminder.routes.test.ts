import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserRole } from '@assetdesk/contracts';

const authState = vi.hoisted(() => ({ role: 'ADMIN' as UserRole }));
const reminderService = vi.hoisted(() => ({
  createReminder: vi.fn(),
  listIssueReminders: vi.fn(),
  listOverdueIssues: vi.fn(),
}));
const issueService = vi.hoisted(() => ({ getIssueDetail: vi.fn() }));

vi.mock('./reminder.service.js', () => reminderService);
vi.mock('../issues/issue.service.js', () => issueService);
vi.mock('../auth/auth.middleware.js', () => {
  const requireAuth: RequestHandler = (request, _response, next) => {
    request.requestId = 'request-reminder-test';
    request.auth = {
      userId: '507f1f77bcf86cd799439011',
      workerId: authState.role === 'ADMIN' ? 'GEU-WRK-ADM2' : 'GEU-WRK-ABCD',
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
    requireCsrf: pass,
    requireFullAccess: pass,
    requireTrustedOrigin: pass,
    requireRole:
      (...roles: UserRole[]): RequestHandler =>
      (request, response, next) => {
        if (request.auth && roles.includes(request.auth.role)) next();
        else response.status(403).json({ code: 'PERMISSION_DENIED' });
      },
  };
});

import { createReminderRouter } from './reminder.routes.js';

const ISSUE_ID = 'GEU-ISS-2026-000001';

function testApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createReminderRouter());
  return app;
}

describe('Reminder routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = 'ADMIN';
    reminderService.listOverdueIssues.mockResolvedValue({
      issues: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    reminderService.listIssueReminders.mockResolvedValue([]);
  });

  it('returns a no-store, paginated overdue list to an Admin', async () => {
    const response = await request(testApp())
      .get('/api/v1/overdue?page=2&pageSize=10&search=network')
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(reminderService.listOverdueIssues).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      search: 'network',
    });
    expect(response.body.meta).toEqual({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  });

  it('does not expose university-wide overdue records to a Worker', async () => {
    authState.role = 'WORKER';

    await request(testApp()).get('/api/v1/overdue').expect(403);

    expect(reminderService.listOverdueIssues).not.toHaveBeenCalled();
  });

  it('creates a reminder with hashed idempotency evidence and reports a new write', async () => {
    reminderService.createReminder.mockResolvedValue({
      reminder: { reminderId: '3516ac36-3f1c-4c22-8fc3-6707ab8a7a37', issueId: ISSUE_ID },
      idempotentReplay: false,
    });

    const response = await request(testApp())
      .post(`/api/v1/issues/${ISSUE_ID}/reminders`)
      .set('Idempotency-Key', 'reminder-test-key-0001')
      .expect(201);

    expect(reminderService.createReminder).toHaveBeenCalledWith(
      ISSUE_ID,
      {
        userId: '507f1f77bcf86cd799439011',
        workerId: 'GEU-WRK-ADM2',
        role: 'ADMIN',
        requestId: 'request-reminder-test',
      },
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(response.body.meta.idempotentReplay).toBe(false);
  });

  it('returns 200 for an idempotent reminder replay', async () => {
    reminderService.createReminder.mockResolvedValue({
      reminder: { reminderId: '3516ac36-3f1c-4c22-8fc3-6707ab8a7a37', issueId: ISSUE_ID },
      idempotentReplay: true,
    });

    const response = await request(testApp())
      .post(`/api/v1/issues/${ISSUE_ID}/reminders`)
      .set('Idempotency-Key', 'reminder-test-key-0001')
      .expect(200);

    expect(response.body.meta.idempotentReplay).toBe(true);
  });

  it('prevents a Worker from sending a reminder', async () => {
    authState.role = 'WORKER';

    await request(testApp())
      .post(`/api/v1/issues/${ISSUE_ID}/reminders`)
      .set('Idempotency-Key', 'reminder-test-key-0001')
      .expect(403);

    expect(reminderService.createReminder).not.toHaveBeenCalled();
  });

  it('checks Issue access before returning reminder history to a Worker', async () => {
    authState.role = 'WORKER';
    reminderService.listIssueReminders.mockResolvedValue([
      { reminderId: '3516ac36-3f1c-4c22-8fc3-6707ab8a7a37', issueId: ISSUE_ID },
    ]);

    const response = await request(testApp())
      .get(`/api/v1/issues/${ISSUE_ID}/reminders`)
      .expect(200);

    expect(issueService.getIssueDetail).toHaveBeenCalledWith(
      ISSUE_ID,
      '507f1f77bcf86cd799439011',
      'WORKER',
    );
    expect(reminderService.listIssueReminders).toHaveBeenCalledWith(ISSUE_ID);
    expect(response.body.data.reminders).toHaveLength(1);
  });
});
