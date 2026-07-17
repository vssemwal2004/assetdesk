import { z } from 'zod';

export const ServiceDependencySchema = z.object({
  status: z.enum(['up', 'down', 'not_checked']),
});

export const HealthDataSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.literal('assetdesk-api'),
  version: z.string().min(1),
  timestamp: z.string().datetime({ offset: true }),
  dependencies: z
    .object({
      database: ServiceDependencySchema,
    })
    .optional(),
});

export const HealthResponseSchema = z.object({
  data: HealthDataSchema,
});

export type HealthData = z.infer<typeof HealthDataSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const FieldErrorSchema = z.record(z.string(), z.string());

export const ApiProblemSchema = z.object({
  type: z.string().default('about:blank'),
  title: z.string().min(1),
  status: z.number().int().min(400).max(599),
  detail: z.string().min(1),
  code: z.string().min(1),
  instance: z.string().optional(),
  requestId: z.string().min(1),
  fields: FieldErrorSchema.optional(),
});

export type ApiProblem = z.infer<typeof ApiProblemSchema>;

export const PaginationMetaSchema = z.object({
  nextCursor: z.string().nullable(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative().optional(),
});

export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;
