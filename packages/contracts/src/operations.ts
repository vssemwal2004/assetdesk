import { z } from 'zod';

import { IssueIdSchema } from './identifiers.js';
import { IssueActorSnapshotSchema, IssueSummarySchema } from './issues.js';

export const ReminderSchema = z
  .object({
    reminderId: z.string().uuid(),
    issueId: IssueIdSchema,
    sentAt: z.string().datetime({ offset: true }),
    sentBy: IssueActorSnapshotSchema,
    expectedReturnAt: z.string().datetime({ offset: true }),
    overdueMinutes: z.number().int().nonnegative(),
    notificationCount: z.number().int().positive(),
  })
  .strict();

export const OverdueIssueSchema = IssueSummarySchema.extend({
  expectedReturnAt: z.string().datetime({ offset: true }),
  overdueMinutes: z.number().int().nonnegative(),
  reminderCount: z.number().int().nonnegative(),
  lastReminderAt: z.string().datetime({ offset: true }).nullable(),
});

const PageMetaSchema = z
  .object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();

export const OverdueIssuesResponseSchema = z
  .object({ data: z.array(OverdueIssueSchema), meta: PageMetaSchema })
  .strict();

export const CreateReminderResponseSchema = z
  .object({
    data: z.object({ reminder: ReminderSchema }).strict(),
    meta: z.object({ idempotentReplay: z.boolean() }).strict(),
  })
  .strict();

export const IssueRemindersResponseSchema = z
  .object({ data: z.object({ reminders: z.array(ReminderSchema) }).strict() })
  .strict();

export type Reminder = z.infer<typeof ReminderSchema>;
export type OverdueIssue = z.infer<typeof OverdueIssueSchema>;
export type OverdueIssuesResponse = z.infer<typeof OverdueIssuesResponseSchema>;
export type CreateReminderResponse = z.infer<typeof CreateReminderResponseSchema>;
export type IssueRemindersResponse = z.infer<typeof IssueRemindersResponseSchema>;
