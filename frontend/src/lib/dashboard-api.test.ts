import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetApiClientState } from './api-client';
import { getAdminDashboard, getWorkerDashboard } from './dashboard-api';

afterEach(() => {
  vi.unstubAllGlobals();
  resetApiClientState();
});

describe('Admin dashboard API', () => {
  it('uses one secured endpoint and parses its counts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            stats: {
              todayIssued: 4,
              totalIssues: 81,
              permanentIssues: 5,
              pendingReturns: 12,
              overdueReturns: 3,
              dueToday: 2,
              returnedToday: 5,
              outstandingItems: 19,
              activeWorkers: 7,
            },
            inventory: {
              materialCount: 12,
              totalQuantity: 104,
              availableQuantity: 85,
              issuedQuantity: 19,
              breakdown: [],
            },
            attentionIssues: [],
            recentIssues: [],
            generatedAt: '2026-07-16T09:30:00.000Z',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getAdminDashboard();

    expect(result.data.stats.pendingReturns).toBe(12);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/v1/dashboard/admin');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('range=30D');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('requests a period-filtered employee dashboard', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            stats: {
              todayIssued: 1,
              totalIssues: 3,
              permanentIssues: 0,
              pendingReturns: 1,
              overdueReturns: 0,
              dueToday: 0,
              returnedToday: 1,
              outstandingItems: 1,
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
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getWorkerDashboard('7D');

    expect(result.data.scope).toBe('ASSIGNED');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/v1/dashboard/worker?range=7D');
  });
});
