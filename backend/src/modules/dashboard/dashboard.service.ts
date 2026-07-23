import type { AdminDashboardResponse, AdminDashboardStats } from '@assetdesk/contracts';

import { istDayRange } from '../issues/issue-date.js';
import { toIssueSummary } from '../issues/issue.mapper.js';
import { IssueModel } from '../issues/issue.model.js';
import { UserModel } from '../users/user.model.js';

interface DashboardAggregationRow {
  _id: null;
  todayIssued: number;
  totalIssues: number;
  pendingReturns: number;
  overdueReturns: number;
  dueToday: number;
  returnedToday: number;
  outstandingItems: number;
}

const emptyIssueStats: Omit<AdminDashboardStats, 'activeWorkers'> = {
  todayIssued: 0,
  totalIssues: 0,
  pendingReturns: 0,
  overdueReturns: 0,
  dueToday: 0,
  returnedToday: 0,
  outstandingItems: 0,
};

const issueSummaryFields = [
  'issueId',
  'receiver',
  'issuedBy',
  'issuedAt',
  'expectedReturnAt',
  'duePreset',
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

export async function getAdminDashboard(now = new Date()): Promise<AdminDashboardResponse['data']> {
  const { start, end } = istDayRange(now);
  const hasOutstanding = {
    $and: [
      { $gt: ['$totalOutstandingQuantity', 0] },
      { $in: ['$status', ['ISSUED', 'PARTIALLY_RETURNED']] },
    ],
  };

  const [aggregation, attentionRecords, recentRecords, activeWorkers] = await Promise.all([
    IssueModel.aggregate<DashboardAggregationRow>([
      {
        $group: {
          _id: null,
          totalIssues: { $sum: 1 },
          todayIssued: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$issuedAt', start] }, { $lt: ['$issuedAt', end] }] },
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
                  input: '$returnEvents',
                  as: 'event',
                  cond: {
                    $and: [
                      { $gte: ['$$event.returnedAt', start] },
                      { $lt: ['$$event.returnedAt', end] },
                    ],
                  },
                },
              },
            },
          },
          outstandingItems: {
            $sum: { $cond: [hasOutstanding, '$totalOutstandingQuantity', 0] },
          },
        },
      },
    ]),
    IssueModel.find({
      status: { $in: ['ISSUED', 'PARTIALLY_RETURNED'] },
      totalOutstandingQuantity: { $gt: 0 },
      expectedReturnAt: { $gte: start, $lt: end },
    })
      .select(issueSummaryFields)
      .sort({ expectedReturnAt: 1, _id: 1 })
      .limit(5),
    IssueModel.find().select(issueSummaryFields).sort({ issuedAt: -1, _id: -1 }).limit(5),
    UserModel.countDocuments({ role: 'WORKER', status: 'ACTIVE' }),
  ]);

  const issueStats = aggregation[0] ?? emptyIssueStats;
  return {
    stats: {
      todayIssued: issueStats.todayIssued,
      totalIssues: issueStats.totalIssues,
      pendingReturns: issueStats.pendingReturns,
      overdueReturns: issueStats.overdueReturns,
      dueToday: issueStats.dueToday,
      returnedToday: issueStats.returnedToday,
      outstandingItems: issueStats.outstandingItems,
      activeWorkers,
    },
    attentionIssues: attentionRecords.map(toIssueSummary),
    recentIssues: recentRecords.map(toIssueSummary),
    generatedAt: now.toISOString(),
  };
}
