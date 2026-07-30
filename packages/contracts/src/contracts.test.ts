import { describe, expect, it } from 'vitest';

import {
  CreateWorkerRequestSchema,
  HealthResponseSchema,
  IssueIdSchema,
  PasswordSchema,
  UserRoleSchema,
  WorkerIdSchema,
} from './index.js';

describe('shared contracts', () => {
  it('accepts public identifier formats', () => {
    expect(WorkerIdSchema.parse('GEU-WRK-A7K4')).toBe('GEU-WRK-A7K4');
    expect(WorkerIdSchema.parse('GEU-CC-ANITASHARMA')).toBe('GEU-CC-ANITASHARMA');
    expect(WorkerIdSchema.parse('GEU-CC-ANITASHARMA-02')).toBe('GEU-CC-ANITASHARMA-02');
    expect(IssueIdSchema.parse('GEU-ISS-2026-000123')).toBe('GEU-ISS-2026-000123');
  });

  it('rejects ambiguous Worker ID characters', () => {
    expect(() => WorkerIdSchema.parse('GEU-WRK-A1O0')).toThrow();
  });

  it('accepts only known roles', () => {
    expect(UserRoleSchema.parse('ADMIN')).toBe('ADMIN');
    expect(() => UserRoleSchema.parse('RECEIVER')).toThrow();
  });

  it('validates a live health response', () => {
    expect(
      HealthResponseSchema.parse({
        data: {
          status: 'ok',
          service: 'assetdesk-api',
          version: '0.1.0',
          timestamp: new Date().toISOString(),
        },
      }).data.status,
    ).toBe('ok');
  });

  it('validates Worker input and password length', () => {
    expect(
      CreateWorkerRequestSchema.parse({
        name: 'Anita Sharma',
        email: 'ANITA@EXAMPLE.EDU',
        permissions: ['ASSIGNMENTS_CREATE'],
      }).email,
    ).toBe('anita@example.edu');
    expect(() => PasswordSchema.parse('abc!')).toThrow();
    expect(() => PasswordSchema.parse(' '.repeat(15))).toThrow();
    expect(() => PasswordSchema.parse(`valid passphrase\u0000`)).toThrow();
  });
});
