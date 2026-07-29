import { describe, expect, it } from 'vitest';

import { AdminDashboardResponseSchema } from './dashboard.js';

function response() {
  return {
    data: {
      stats: {
        todayIssued: 4,
        totalIssues: 81,
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
        breakdown: [
          {
            trackingMode: 'SERIALIZED',
            status: 'ACTIVE',
            materialCount: 12,
            totalQuantity: 104,
            availableQuantity: 85,
            issuedQuantity: 19,
          },
        ],
      },
      attentionIssues: [],
      recentIssues: [],
      generatedAt: '2026-07-16T09:30:00.000Z',
    },
  };
}

describe('Admin dashboard contract', () => {
  it('accepts non-negative operational counts', () => {
    expect(AdminDashboardResponseSchema.parse(response()).data.stats.overdueReturns).toBe(3);
  });

  it('rejects negative or fractional counts', () => {
    const negative = response();
    negative.data.stats.pendingReturns = -1;
    expect(AdminDashboardResponseSchema.safeParse(negative).success).toBe(false);

    const fractional = response();
    fractional.data.stats.returnedToday = 1.5;
    expect(AdminDashboardResponseSchema.safeParse(fractional).success).toBe(false);
  });
});
