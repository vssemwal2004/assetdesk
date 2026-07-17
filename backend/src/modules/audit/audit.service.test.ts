import { describe, expect, it } from 'vitest';

import { sanitizeAuditMetadata } from './audit.service.js';

describe('audit metadata sanitization', () => {
  it('redacts sensitive values recursively and caps oversized values', () => {
    const result = sanitizeAuditMetadata({
      actionSource: 'auth',
      password: 'dummy-value',
      nested: {
        refreshToken: 'dummy-token',
        note: 'x'.repeat(1_100),
      },
    });

    expect(result).toMatchObject({
      actionSource: 'auth',
      password: '[REDACTED]',
      nested: { refreshToken: '[REDACTED]' },
    });
    expect((result.nested as { note: string }).note).toHaveLength(1_000);
  });
});
