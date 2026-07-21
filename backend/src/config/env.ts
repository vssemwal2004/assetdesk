import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import dotenv from 'dotenv';
import { z } from 'zod';

const envCandidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../.env'),
  resolve(process.cwd(), '../../.env'),
  process.env.INIT_CWD ? resolve(process.env.INIT_CWD, '.env') : undefined,
].filter((path): path is string => Boolean(path));

const envPath = envCandidates.find((candidate) => existsSync(candidate));

if (envPath) {
  dotenv.config({ path: envPath, quiet: true, override: true });
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  ADDITIONAL_APP_ORIGINS: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean)
        : [],
    ),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//, 'MONGODB_URI must be a MongoDB URI'),
  MONGODB_DB_NAME: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]+$/, 'MONGODB_DB_NAME contains unsupported characters')
    .default('assetdesk'),
  SMTP_HOST: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  SMTP_PORT: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.coerce.number().int().min(1).max(65_535).optional(),
  ),
  SMTP_USER: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  SMTP_PASS: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  SMTP_FROM: z.string().email().optional(),
  SMTP_FROM_NAME: z.string().min(1).default('AssetDesk'),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  EMAIL_WORKER_POLL_MS: z.coerce.number().int().min(500).max(60_000).default(2_000),
  JWT_ACCESS_SECRET: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(64).optional(),
  ),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(30).default(10),
  WORKER_SESSION_IDLE_MINUTES: z.coerce.number().int().min(15).max(720).default(120),
  ADMIN_SESSION_IDLE_MINUTES: z.coerce.number().int().min(15).max(240).default(30),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(24).default(12),
  TEMP_PASSWORD_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(24),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  DATABASE_REQUIRED_ON_START: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  ),
});

const result = EnvSchema.safeParse(process.env);

if (!result.success) {
  const fields = result.error.flatten().fieldErrors;
  throw new Error(`Invalid server configuration: ${JSON.stringify(fields)}`);
}

if (result.data.NODE_ENV === 'production' && !result.data.JWT_ACCESS_SECRET) {
  throw new Error('Invalid server configuration: JWT_ACCESS_SECRET is required in production');
}

export const env = Object.freeze(result.data);
