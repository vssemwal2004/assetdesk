import { beforeEach, describe, expect, it, vi } from 'vitest';

const models = vi.hoisted(() => ({
  aggregate: vi.fn(),
  materialAggregate: vi.fn(),
  find: vi.fn(),
  countDocuments: vi.fn(),
}));

vi.mock('../inventory/material.model.js', () => ({
  MaterialModel: {
    aggregate: models.materialAggregate,
  },
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

import { getAdminDashboard, getWorkerDashboard } from './dashboard.service.js';

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
    models.materialAggregate.mockResolvedValue([
      {
        _id: { trackingMode: 'SERIALIZED', status: 'ACTIVE' },
        materialCount: 2,
        totalQuantity: 10,
        availableQuantity: 7,
        issuedQuantity: 3,
      },
    ]);
  });

  it('returns inventory material and physical quantity totals with filterable breakdowns', async () => {
    const dashboard = await getAdminDashboard(new Date('2026-07-23T06:30:00.000Z'));

    expect(dashboard.inventory).toEqual({
      materialCount: 2,
      totalQuantity: 10,
      availableQuantity: 7,
      issuedQuantity: 3,
      breakdown: [
        {
          trackingMode: 'SERIALIZED',
          status: 'ACTIVE',
          materialCount: 2,
          totalQuantity: 10,
          availableQuantity: 7,
          issuedQuantity: 3,
        },
      ],
    });
  });

  it('guards dashboard aggregation against legacy issue rows with missing arrays or counts', async () => {
    await getAdminDashboard(new Date('2026-07-23T06:30:00.000Z'));

    expect(models.aggregate).toHaveBeenCalledTimes(2);
    const pipeline = models.aggregate.mock.calls[0]?.[0];
    expect(JSON.stringify(pipeline)).toContain('"$ifNull":["$returnEvents",[]]');
    expect(JSON.stringify(pipeline)).toContain('"$ifNull":["$totalOutstandingQuantity",0]');
    expect(JSON.stringify(models.aggregate.mock.calls[1]?.[0])).toContain('"$facet"');
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

  it('applies employee ownership to issue, return trend, and inventory aggregation', async () => {
    await getWorkerDashboard(
      {
        userId: '507f1f77bcf86cd799439011',
        permissions: ['DASHBOARD', 'ISSUES_VIEW', 'INVENTORY_VIEW'],
        dataAccess: { issues: 'OWN', inventory: 'OWN', cartridges: 'OWN' },
      },
      '7D',
      new Date('2026-07-23T06:30:00.000Z'),
    );

    const statsPipeline = JSON.stringify(models.aggregate.mock.calls[0]?.[0]);
    const trendPipeline = JSON.stringify(models.aggregate.mock.calls[1]?.[0]);
    const inventoryPipeline = JSON.stringify(models.materialAggregate.mock.calls[0]?.[0]);
    expect(statsPipeline).toContain('createdByUserId');
    expect(statsPipeline).toContain('returnEvents.performedBy.userId');
    expect(trendPipeline).toContain('returnEvents.performedBy.userId');
    expect(inventoryPipeline).toContain('createdBy');
  });
});
