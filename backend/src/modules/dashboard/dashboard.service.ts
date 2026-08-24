import { Types } from 'mongoose';

import type {
  AdminDashboardResponse,
  AdminDashboardStats,
  DashboardRange,
  WorkerDataAccess,
  WorkerPermission,
} from '@assetdesk/contracts';

import { istDayRange } from '../issues/issue-date.js';
import { toIssueSummary } from '../issues/issue.mapper.js';
import { IssueModel } from '../issues/issue.model.js';
import { MaterialModel } from '../inventory/material.model.js';
import { UserModel } from '../users/user.model.js';

interface DashboardActor {
  userId: string;
  permissions: WorkerPermission[];
  dataAccess: WorkerDataAccess;
}

interface DashboardAggregationRow {
  _id: null;
  todayIssued: number;
  totalIssues: number;
  permanentIssues: number;
  pendingReturns: number;
  overdueReturns: number;
  dueToday: number;
  returnedToday: number;
  outstandingItems: number;
}

interface InventoryAggregationRow {
  _id: {
    trackingMode: 'SERIALIZED' | 'QUANTITY';
    status: 'ACTIVE' | 'UNDER_MAINTENANCE' | 'SCRAP' | 'NOT_IN_USE' | 'ARCHIVED';
  };
  materialCount: number;
  totalQuantity: number;
  availableQuantity: number;
  issuedQuantity: number;
}

interface TrendAggregationRow {
  issued: Array<{ _id: string; count: number }>;
  returned: Array<{ _id: string; count: number }>;
}

const rangeDays: Record<DashboardRange, number> = { '7D': 7, '30D': 30, '90D': 90 };

// Only these two stores are valid sources for issueable dashboard stock.
const STORE_LOCATIONS = ['Param Centre Store', 'Aryabhatt Store'] as const;

const emptyIssueStats: Omit<AdminDashboardStats, 'activeWorkers'> = {
  todayIssued: 0,
  totalIssues: 0,
  permanentIssues: 0,
  pendingReturns: 0,
  overdueReturns: 0,
  dueToday: 0,
  returnedToday: 0,
  outstandingItems: 0,
};

const emptyInventory = {
  materialCount: 0,
  totalQuantity: 0,
  availableQuantity: 0,
  issuedQuantity: 0,
  breakdown: [],
};

const issueSummaryFields = [
  'issueId',
  'receiver',
  'issuedBy',
  'issuedAt',
  'expectedReturnAt',
  'duePreset',
  'assignmentType',
  'status',
  'purpose',
  'notes',
  'totalIssuedQuantity',
  'totalOutstandingQuantity',
  'hasDamagedOutcome',
  'hasLostOutcome',
  'createdAt',
  'updatedAt',
  'lines.material.name',
].join(' ');

function hasPermission(actor: DashboardActor | undefined, permission: WorkerPermission): boolean {
  return !actor || actor.permissions.includes(permission);
}

function usesOwnIssueScope(actor: DashboardActor | undefined): actor is DashboardActor {
  return Boolean(
    actor && (actor.dataAccess.issues !== 'ALL' || !hasPermission(actor, 'ISSUES_VIEW')),
  );
}

function issueAccessFilter(actor: DashboardActor | undefined) {
  if (!usesOwnIssueScope(actor)) return {};
  const userId = new Types.ObjectId(actor.userId);
  return {
    $or: [{ createdByUserId: userId }, { 'returnEvents.performedBy.userId': userId }],
  };
}

function inventoryAccessFilter(actor: DashboardActor | undefined) {
  if (!actor || actor.dataAccess.inventory === 'ALL') return {};
  return { createdBy: new Types.ObjectId(actor.userId) };
}

function dayKey(date: Date): string {
  const istOffsetMilliseconds = 330 * 60 * 1_000;
  return new Date(date.getTime() + istOffsetMilliseconds).toISOString().slice(0, 10);
}

function trendPeriod(range: DashboardRange, now: Date) {
  const today = istDayRange(now);
  const days = rangeDays[range];
  return {
    days,
    start: new Date(today.start.getTime() - (days - 1) * 24 * 60 * 60 * 1_000),
    end: today.end,
  };
}

function fillTrend(
  row: TrendAggregationRow | undefined,
  start: Date,
  days: number,
): AdminDashboardResponse['data']['trend'] {
  const issued = new Map((row?.issued ?? []).map((item) => [item._id, item.count]));
  const returned = new Map((row?.returned ?? []).map((item) => [item._id, item.count]));
  return Array.from({ length: days }, (_, index) => {
    const date = dayKey(new Date(start.getTime() + index * 24 * 60 * 60 * 1_000));
    return { date, issued: issued.get(date) ?? 0, returned: returned.get(date) ?? 0 };
  });
}

async function dashboardTrend(actor: DashboardActor | undefined, range: DashboardRange, now: Date) {
  const { start, end, days } = trendPeriod(range, now);
  const ownScope = usesOwnIssueScope(actor);
  const userId = actor ? new Types.ObjectId(actor.userId) : undefined;
  const issuedOwnership = ownScope && userId ? { createdByUserId: userId } : {};
  const returnOwnership = ownScope && userId ? { 'returnEvents.performedBy.userId': userId } : {};
  const rows = await IssueModel.aggregate<TrendAggregationRow>([
    {
      $facet: {
        issued: [
          { $match: { ...issuedOwnership, issuedAt: { $gte: start, $lt: end } } },
          {
            $group: {
              _id: {
                $dateToString: {
                  date: '$issuedAt',
                  format: '%Y-%m-%d',
                  timezone: 'Asia/Kolkata',
                },
              },
              count: { $sum: 1 },
            },
          },
        ],
        returned: [
          { $unwind: '$returnEvents' },
          {
            $match: {
              ...returnOwnership,
              'returnEvents.returnedAt': { $gte: start, $lt: end },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  date: '$returnEvents.returnedAt',
                  format: '%Y-%m-%d',
                  timezone: 'Asia/Kolkata',
                },
              },
              count: { $sum: 1 },
            },
          },
        ],
      },
    },
  ]);
  return fillTrend(rows[0], start, days);
}

async function getDashboard(
  actor: DashboardActor | undefined,
  range: DashboardRange,
  now: Date,
): Promise<AdminDashboardResponse['data']> {
  const { start, end } = istDayRange(now);
  const hasIssueAccess =
    !actor ||
    ['ISSUES_VIEW', 'ASSIGNMENTS_CREATE', 'RETURNS_VIEW', 'RETURNS_RECORD'].some((permission) =>
      actor.permissions.includes(permission as WorkerPermission),
    );
  const hasInventoryAccess = !actor || hasPermission(actor, 'INVENTORY_VIEW');
  const accessFilter = issueAccessFilter(actor);
  const ownIssueData = usesOwnIssueScope(actor);
  const actorUserId = ownIssueData ? new Types.ObjectId(actor.userId) : undefined;
  const hasOutstanding = {
    $and: [
      { $eq: ['$assignmentType', 'SHORT_TERM'] },
      { $gt: [{ $ifNull: ['$totalOutstandingQuantity', 0] }, 0] },
      { $in: ['$status', ['ISSUED', 'PARTIALLY_RETURNED']] },
    ],
  };

  const [aggregation, attentionRecords, recentRecords, activeWorkers, inventoryRows, trend] =
    await Promise.all([
      hasIssueAccess
        ? IssueModel.aggregate<DashboardAggregationRow>([
            ...(Object.keys(accessFilter).length ? [{ $match: accessFilter }] : []),
            {
              $group: {
                _id: null,
                totalIssues: { $sum: 1 },
                permanentIssues: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ['$assignmentType', 'LONG_TERM'] },
                          { $ne: ['$status', 'CANCELLED'] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                todayIssued: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $gte: ['$issuedAt', start] },
                          { $lt: ['$issuedAt', end] },
                          ...(actorUserId ? [{ $eq: ['$createdByUserId', actorUserId] }] : []),
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                pendingReturns: { $sum: { $cond: [hasOutstanding, 1, 0] } },
                overdueReturns: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          hasOutstanding,
                          { $ne: ['$expectedReturnAt', null] },
                          { $lt: ['$expectedReturnAt', start] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                dueToday: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          hasOutstanding,
                          { $gte: ['$expectedReturnAt', start] },
                          { $lt: ['$expectedReturnAt', end] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                returnedToday: {
                  $sum: {
                    $size: {
                      $filter: {
                        input: { $ifNull: ['$returnEvents', []] },
                        as: 'event',
                        cond: {
                          $and: [
                            { $gte: ['$$event.returnedAt', start] },
                            { $lt: ['$$event.returnedAt', end] },
                            ...(actorUserId
                              ? [{ $eq: ['$$event.performedBy.userId', actorUserId] }]
                              : []),
                          ],
                        },
                      },
                    },
                  },
                },
                outstandingItems: {
                  $sum: {
                    $cond: [hasOutstanding, { $ifNull: ['$totalOutstandingQuantity', 0] }, 0],
                  },
                },
              },
            },
          ])
        : Promise.resolve([]),
      hasIssueAccess
        ? IssueModel.find({
            ...accessFilter,
            status: { $in: ['ISSUED', 'PARTIALLY_RETURNED'] },
            totalOutstandingQuantity: { $gt: 0 },
            expectedReturnAt: { $lte: end },
          })
            .select(issueSummaryFields)
            .sort({ expectedReturnAt: 1, _id: 1 })
            .limit(5)
        : Promise.resolve([]),
      hasIssueAccess
        ? IssueModel.find(accessFilter)
            .select(issueSummaryFields)
            .sort({ issuedAt: -1, _id: -1 })
            .limit(5)
        : Promise.resolve([]),
      actor ? Promise.resolve(0) : UserModel.countDocuments({ role: 'WORKER', status: 'ACTIVE' }),
      hasInventoryAccess
        ? MaterialModel.aggregate<InventoryAggregationRow>([
            ...(actor && Object.keys(inventoryAccessFilter(actor)).length
              ? [{ $match: inventoryAccessFilter(actor) }]
              : []),
            // Dashboard availability represents stock that can actually be issued.
            // Do not count faulty/scrapped, outdated/not-in-use, maintenance, or
            // archived materials as available stock.
            { $match: { status: 'ACTIVE', location: { $in: STORE_LOCATIONS } } },
            {
              $group: {
                _id: { trackingMode: '$trackingMode', status: '$status' },
                materialCount: { $sum: 1 },
                totalQuantity: { $sum: { $ifNull: ['$totalQuantity', 0] } },
                availableQuantity: { $sum: { $ifNull: ['$availableQuantity', 0] } },
                issuedQuantity: { $sum: { $ifNull: ['$issuedQuantity', 0] } },
              },
            },
            { $sort: { '_id.trackingMode': 1, '_id.status': 1 } },
          ])
        : Promise.resolve([]),
      hasIssueAccess ? dashboardTrend(actor, range, now) : Promise.resolve([]),
    ]);

  const aggregated = aggregation[0];
  const issueStats = {
    todayIssued: aggregated?.todayIssued ?? emptyIssueStats.todayIssued,
    totalIssues: aggregated?.totalIssues ?? emptyIssueStats.totalIssues,
    permanentIssues: aggregated?.permanentIssues ?? emptyIssueStats.permanentIssues,
    pendingReturns: aggregated?.pendingReturns ?? emptyIssueStats.pendingReturns,
    overdueReturns: aggregated?.overdueReturns ?? emptyIssueStats.overdueReturns,
    dueToday: aggregated?.dueToday ?? emptyIssueStats.dueToday,
    returnedToday: aggregated?.returnedToday ?? emptyIssueStats.returnedToday,
    outstandingItems: aggregated?.outstandingItems ?? emptyIssueStats.outstandingItems,
  };
  const inventoryBreakdown = inventoryRows.map((row) => ({
    trackingMode: row._id.trackingMode,
    status: row._id.status,
    materialCount: row.materialCount,
    totalQuantity: row.totalQuantity,
    availableQuantity: row.availableQuantity,
    issuedQuantity: row.issuedQuantity,
  }));
  const inventory = inventoryBreakdown.reduce(
    (total, row) => ({
      materialCount: total.materialCount + row.materialCount,
      totalQuantity: total.totalQuantity + row.totalQuantity,
      availableQuantity: total.availableQuantity + row.availableQuantity,
      issuedQuantity: total.issuedQuantity + row.issuedQuantity,
      breakdown: inventoryBreakdown,
    }),
    { ...emptyInventory, breakdown: inventoryBreakdown },
  );

  return {
    stats: { ...issueStats, activeWorkers },
    inventory,
    attentionIssues: attentionRecords.map(toIssueSummary),
    recentIssues: recentRecords.map(toIssueSummary),
    range,
    scope: actor ? 'ASSIGNED' : 'ORGANIZATION',
    trend,
    generatedAt: now.toISOString(),
  };
}

export async function getAdminDashboard(
  now = new Date(),
  range: DashboardRange = '30D',
): Promise<AdminDashboardResponse['data']> {
  return getDashboard(undefined, range, now);
}

export async function getWorkerDashboard(
  actor: DashboardActor,
  range: DashboardRange = '30D',
  now = new Date(),
): Promise<AdminDashboardResponse['data']> {
  return getDashboard(actor, range, now);
}
