import { z } from 'zod';

import { AccountStatusSchema, UserRoleSchema } from './domain.js';
import { WorkerIdSchema } from './identifiers.js';
import { WorkerDataAccessSchema, WorkerPermissionSchema } from './workers.js';

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

export const PasswordSchema = z
  .string()
  .min(15, 'Password must contain at least 15 characters')
  .max(128, 'Password must contain at most 128 characters')
  .refine((value) => /\S/u.test(value), 'Password must contain a non-whitespace character')
  .refine(
    (value) => !containsControlCharacter(value),
    'Password must not contain control characters',
  );

export const LoginRequestSchema = z
  .object({
    identifier: z.string().trim().min(1).max(254),
    password: z.string().min(1).max(256),
  })
  .strict();

export const ChangeInitialPasswordRequestSchema = z
  .object({
    newPassword: PasswordSchema,
  })
  .strict();

export const ChangePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: PasswordSchema,
  })
  .strict();

export const AuthUserSchema = z.object({
  id: z.string().min(1),
  workerId: WorkerIdSchema,
  name: z.string().min(1),
  email: z.string().email(),
  contact: z.string().nullable(),
  department: z.string().nullable(),
  role: UserRoleSchema,
  status: AccountStatusSchema,
  mustChangePassword: z.boolean(),
  permissions: z.array(WorkerPermissionSchema),
  dataAccess: WorkerDataAccessSchema,
});

export const AuthResponseSchema = z.object({
  data: z.object({
    user: AuthUserSchema,
    csrfToken: z.string().min(32),
  }),
});

export const MeResponseSchema = z.object({
  data: z.object({
    user: AuthUserSchema,
  }),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type ChangeInitialPasswordRequest = z.infer<typeof ChangeInitialPasswordRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
export type AuthUser = z.infer<typeof AuthUserSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;
