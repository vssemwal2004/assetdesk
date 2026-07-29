import { z } from 'zod';

import { IssueSummarySchema } from './issues.js';

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
        generatedAt: z.string().datetime({ offset: true }),
      })
      .strict(),
  })
  .strict();

export type AdminDashboardStats = z.infer<typeof AdminDashboardStatsSchema>;
export type DashboardInventory = z.infer<typeof DashboardInventorySchema>;
export type AdminDashboardResponse = z.infer<typeof AdminDashboardResponseSchema>;
