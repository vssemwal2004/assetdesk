import { z } from 'zod';

export const AuditResultSchema = z.enum(['SUCCESS', 'DENIED', 'FAILED']);

export const AuditEventSchema = z
  .object({
    id: z.string().min(1),
    timestampUtc: z.string().datetime({ offset: true }),
    requestId: z.string().min(1),
    actorWorkerId: z.string().nullable(),
    actorRole: z.enum(['ADMIN', 'WORKER']).nullable(),
    action: z.string().min(1),
    targetType: z.string().min(1),
    targetId: z.string().nullable(),
    result: AuditResultSchema,
    reasonCode: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
  })
  .strict();

export const AuditEventsResponseSchema = z
  .object({
    data: z.array(AuditEventSchema),
    meta: z
      .object({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        total: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export type AuditResult = z.infer<typeof AuditResultSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type AuditEventsResponse = z.infer<typeof AuditEventsResponseSchema>;
