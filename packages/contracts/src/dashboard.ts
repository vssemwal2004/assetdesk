import { z } from 'zod';

import { IssueSummarySchema } from './issues.js';

export const DashboardRangeSchema = z.enum(['7D', '30D', '90D']);

export const DashboardTrendPointSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    issued: z.number().int().nonnegative(),
    returned: z.number().int().nonnegative(),
  })
  .strict();

export const DashboardInventoryCountSchema = z
  .object({
    trackingMode: z.enum(['SERIALIZED', 'QUANTITY']),
    status: z.enum(['ACTIVE', 'UNDER_MAINTENANCE', 'SCRAP', 'NOT_IN_USE', 'ARCHIVED']),
    materialCount: z.number().int().nonnegative(),
    totalQuantity: z.number().int().nonnegative(),
    availableQuantity: z.number().int().nonnegative(),
    issuedQuantity: z.number().int().nonnegative(),
  })
  .strict();

export const DashboardInventorySchema = z
  .object({
    materialCount: z.number().int().nonnegative(),
    totalQuantity: z.number().int().nonnegative(),
    availableQuantity: z.number().int().nonnegative(),
    issuedQuantity: z.number().int().nonnegative(),
    breakdown: z.array(DashboardInventoryCountSchema),
  })
  .strict();

export const AdminDashboardStatsSchema = z
  .object({
    todayIssued: z.number().int().nonnegative(),
    totalIssues: z.number().int().nonnegative(),
    permanentIssues: z.number().int().nonnegative().default(0),
    pendingReturns: z.number().int().nonnegative(),
    overdueReturns: z.number().int().nonnegative(),
    dueToday: z.number().int().nonnegative(),
    returnedToday: z.number().int().nonnegative(),
    outstandingItems: z.number().int().nonnegative(),
    activeWorkers: z.number().int().nonnegative(),
  })
  .strict();

export const AdminDashboardResponseSchema = z
  .object({
    data: z
      .object({
        stats: AdminDashboardStatsSchema,
        inventory: DashboardInventorySchema,
        attentionIssues: z.array(IssueSummarySchema).max(5),
        recentIssues: z.array(IssueSummarySchema).max(5),
        range: DashboardRangeSchema.default('30D'),
        scope: z.enum(['ORGANIZATION', 'ASSIGNED']).default('ORGANIZATION'),
        trend: z.array(DashboardTrendPointSchema).max(90).default([]),
        generatedAt: z.string().datetime({ offset: true }),
      })
      .strict(),
  })
  .strict();

export type AdminDashboardStats = z.infer<typeof AdminDashboardStatsSchema>;
export type DashboardInventory = z.infer<typeof DashboardInventorySchema>;
export type DashboardRange = z.infer<typeof DashboardRangeSchema>;
export type DashboardTrendPoint = z.infer<typeof DashboardTrendPointSchema>;
export type AdminDashboardResponse = z.infer<typeof AdminDashboardResponseSchema>;
