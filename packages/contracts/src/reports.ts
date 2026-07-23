import { z } from 'zod';

import { IssueStatusSchema, ReceiverTypeSchema } from './domain.js';
import { IssueReturnStateSchema } from './issues.js';

export const IssueReportFiltersSchema = z
  .object({
    issuedFrom: z.string().date(),
    issuedThrough: z.string().date(),
    status: IssueStatusSchema.optional(),
    returnState: IssueReturnStateSchema.optional(),
    receiverType: ReceiverTypeSchema.optional(),
    search: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const IssueReportRowSchema = z
  .object({
    issueId: z.string().min(1),
    status: IssueStatusSchema,
    issuedAt: z.string().datetime({ offset: true }),
    expectedReturnAt: z.string().datetime({ offset: true }).nullable(),
    receiverName: z.string().min(1),
    receiverType: ReceiverTypeSchema,
    department: z.string().nullable(),
    issuedByWorkerId: z.string().min(1),
    issuedByName: z.string().min(1),
    materials: z.array(z.string().min(1)).min(1),
    materialTypes: z.array(z.enum(['IT Asset', 'IT Consumable'])).min(1),
    serialNumbers: z.array(z.string().min(1)),
    totalIssuedQuantity: z.number().int().positive(),
    totalOutstandingQuantity: z.number().int().nonnegative(),
    returnEventCount: z.number().int().nonnegative(),
  })
  .strict();

export const IssueReportResponseSchema = z
  .object({
    data: z.array(IssueReportRowSchema),
    meta: z
      .object({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        total: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
        generatedAt: z.string().datetime({ offset: true }),
        timezone: z.literal('Asia/Kolkata'),
      })
      .strict(),
  })
  .strict();

export const ExportIssueReportRequestSchema = z
  .object({ format: z.literal('CSV'), filters: IssueReportFiltersSchema })
  .strict();

export type IssueReportFilters = z.infer<typeof IssueReportFiltersSchema>;
export type IssueReportRow = z.infer<typeof IssueReportRowSchema>;
export type IssueReportResponse = z.infer<typeof IssueReportResponseSchema>;
export type ExportIssueReportRequest = z.infer<typeof ExportIssueReportRequestSchema>;
