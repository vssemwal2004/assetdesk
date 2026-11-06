import { z } from 'zod';

export const AlertCategorySchema = z.enum([
  'ISSUE_OVERDUE',
  'ISSUE_DUE_TODAY',
  'OUT_OF_STOCK',
  'LOW_STOCK',
  'CARTRIDGE_LOW_STOCK',
  'CARTRIDGE_ATTENTION',
  'CARTRIDGE_GATE_PASS_PENDING',
  'CARTRIDGE_GATE_PASS_OVERDUE',
  'GATE_PASS_OVERDUE',
]);

export const AlertSeveritySchema = z.enum(['CRITICAL', 'WARNING', 'INFO']);

const AlertKeySchema = z.string().trim().min(1).max(200);
const InternalPathSchema = z.string().regex(/^\/(?!\/)/, 'Use an internal application path.');

export const AlertItemSchema = z
  .object({
    key: AlertKeySchema,
    category: AlertCategorySchema,
    severity: AlertSeveritySchema,
    title: z.string().min(1),
    message: z.string(),
    href: InternalPathSchema,
    occurredAt: z.string().datetime({ offset: true }).nullable(),
    read: z.boolean(),
  })
  .strict();

export const AlertGroupSchema = z
  .object({
    category: AlertCategorySchema,
    label: z.string().min(1),
    severity: AlertSeveritySchema,
    total: z.number().int().nonnegative(),
    unread: z.number().int().nonnegative(),
    href: InternalPathSchema,
  })
  .strict();

export const AlertsResponseSchema = z
  .object({
    data: z
      .object({
        items: z.array(AlertItemSchema),
        groups: z.array(AlertGroupSchema),
        unreadCount: z.number().int().nonnegative(),
        totalCount: z.number().int().nonnegative(),
        generatedAt: z.string().datetime({ offset: true }),
      })
      .strict(),
  })
  .strict();

export const MarkAlertsReadRequestSchema = z.union([
  z.object({ keys: z.array(AlertKeySchema).min(1).max(500) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);

export type AlertCategory = z.infer<typeof AlertCategorySchema>;
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;
export type AlertItem = z.infer<typeof AlertItemSchema>;
export type AlertGroup = z.infer<typeof AlertGroupSchema>;
export type AlertsResponse = z.infer<typeof AlertsResponseSchema>;
export type MarkAlertsReadRequest = z.infer<typeof MarkAlertsReadRequestSchema>;
