import { beforeEach, describe, expect, it, vi } from 'vitest';

const models = vi.hoisted(() => ({
  aggregate: vi.fn(),
  find: vi.fn(),
  countDocuments: vi.fn(),
}));

vi.mock('../issues/issue.model.js', () => ({
  IssueModel: {
    aggregate: models.aggregate,
    find: models.find,
  },
}));

vi.mock('../users/user.model.js', () => ({
  UserModel: {
    countDocuments: models.countDocuments,
  },
}));

vi.mock('../issues/issue.mapper.js', () => ({
  toIssueSummary: vi.fn((record: unknown) => record),
}));

import { getAdminDashboard } from './dashboard.service.js';

function findQuery(records: unknown[] = []) {
  return {
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(records),
  };
}

describe('Admin dashboard service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    models.aggregate.mockResolvedValue([
      {
        todayIssued: 1,
        totalIssues: 2,
        pendingReturns: 1,
        overdueReturns: 0,
        dueToday: 0,
        returnedToday: 1,
        outstandingItems: 3,
      },
    ]);
    models.find.mockImplementation(() => findQuery());
    models.countDocuments.mockResolvedValue(4);
  });

  it('guards dashboard aggregation against legacy issue rows with missing arrays or counts', async () => {
    await getAdminDashboard(new Date('2026-07-23T06:30:00.000Z'));

    expect(models.aggregate).toHaveBeenCalledOnce();
    const pipeline = models.aggregate.mock.calls[0]?.[0];
    expect(JSON.stringify(pipeline)).toContain('"$ifNull":["$returnEvents",[]]');
    expect(JSON.stringify(pipeline)).toContain('"$ifNull":["$totalOutstandingQuantity",0]');
  });

  it('returns empty dashboard stats when no issue documents exist', async () => {
    models.aggregate.mockResolvedValue([]);

    const dashboard = await getAdminDashboard(new Date('2026-07-23T06:30:00.000Z'));

    expect(dashboard.stats).toMatchObject({
      todayIssued: 0,
      totalIssues: 0,
      pendingReturns: 0,
      overdueReturns: 0,
      dueToday: 0,
      returnedToday: 0,
      outstandingItems: 0,
      activeWorkers: 4,
    });
  });
});
