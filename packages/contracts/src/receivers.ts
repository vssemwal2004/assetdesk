import { z } from 'zod';

import { ReceiverTypeSchema } from './domain.js';
import { ReceiverCodeSchema } from './identifiers.js';

export const ReceiverStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

const FullNameSchema = z.string().trim().min(2).max(120);
const UniversityIdSchema = z.string().trim().min(1).max(64);
const DepartmentSchema = z.string().trim().min(1).max(120);
const ContactSchema = z
  .string()
  .trim()
  .min(5)
  .max(40)
  .refine((value) => (value.match(/\d/g) ?? []).length >= 5, {
    message: 'Contact must contain at least 5 digits',
  });
const EmailSchema = z.string().trim().toLowerCase().email().max(254);

export const CreateReceiverRequestSchema = z
  .object({
    fullName: FullNameSchema,
    universityId: UniversityIdSchema.optional(),
    type: ReceiverTypeSchema,
    department: DepartmentSchema.optional(),
    contact: ContactSchema,
    email: EmailSchema,
  })
  .strict();

export const UpdateReceiverRequestSchema = z
  .object({
    fullName: FullNameSchema.optional(),
    universityId: UniversityIdSchema.nullable().optional(),
    type: ReceiverTypeSchema.optional(),
    department: DepartmentSchema.nullable().optional(),
    contact: ContactSchema.optional(),
    email: EmailSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

export const UpdateReceiverStatusRequestSchema = z
  .object({
    status: ReceiverStatusSchema,
  })
  .strict();

export const ReceiverSchema = z
  .object({
    id: z.string().min(1),
    receiverCode: ReceiverCodeSchema,
    fullName: z.string().min(1),
    universityId: z.string().nullable(),
    type: ReceiverTypeSchema,
    department: z.string().nullable(),
    contact: z.string().nullable(),
    email: z.string().email().nullable(),
    status: ReceiverStatusSchema,
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const ReceiverResponseSchema = z
  .object({
    data: z
      .object({
        receiver: ReceiverSchema,
      })
      .strict(),
  })
  .strict();

export const ReceiversListResponseSchema = z
  .object({
    data: z.array(ReceiverSchema),
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

export type ReceiverStatus = z.infer<typeof ReceiverStatusSchema>;
export type CreateReceiverRequest = z.infer<typeof CreateReceiverRequestSchema>;
export type UpdateReceiverRequest = z.infer<typeof UpdateReceiverRequestSchema>;
export type UpdateReceiverStatusRequest = z.infer<typeof UpdateReceiverStatusRequestSchema>;
export type Receiver = z.infer<typeof ReceiverSchema>;
export type ReceiverResponse = z.infer<typeof ReceiverResponseSchema>;
export type ReceiversListResponse = z.infer<typeof ReceiversListResponseSchema>;
