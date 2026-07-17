import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auditMocks = vi.hoisted(() => ({ appendAuditEvent: vi.fn() }));

vi.mock('../audit/audit.service.js', () => auditMocks);

import { env } from '../../config/env.js';
import { AppError } from '../../middleware/error-handler.js';
import { CSRF_COOKIE } from './cookies.js';
import { requireCsrf, requireRole, requireTrustedOrigin } from './auth.middleware.js';
import { hashToken } from './tokens.js';

function invoke(
  middleware: typeof requireTrustedOrigin,
  request: Partial<Request>,
): ReturnType<typeof vi.fn> {
  const next = vi.fn<NextFunction>();
  middleware(request as Request, {} as Response, next);
  return next;
}

describe('auth security middleware', () => {
  beforeEach(() => {
    auditMocks.appendAuditEvent.mockReset().mockResolvedValue(undefined);
  });

  it('requires the exact trusted Origin on state-changing requests', () => {
    const accepted = invoke(requireTrustedOrigin, {
      header: vi.fn(() => new URL(env.APP_ORIGIN).origin),
    });
    const missing = invoke(requireTrustedOrigin, { header: vi.fn(() => undefined) });
    const foreign = invoke(requireTrustedOrigin, {
      header: vi.fn(() => 'https://untrusted.example'),
    });

    expect(accepted).toHaveBeenCalledWith();
    expect(missing.mock.calls[0]?.[0]).toBeInstanceOf(AppError);
    expect(foreign.mock.calls[0]?.[0]).toMatchObject({ code: 'UNTRUSTED_ORIGIN' });
  });

  it('accepts CSRF only when header, cookie, and session hash all match', () => {
    const csrfToken = 'csrf-value-with-sufficient-randomness';
    const request = {
      auth: { csrfTokenHash: hashToken(csrfToken) },
      header: vi.fn(() => csrfToken),
      cookies: { [CSRF_COOKIE]: csrfToken },
    } as unknown as Partial<Request>;
    const accepted = invoke(requireCsrf, request);
    const rejected = invoke(requireCsrf, {
      ...request,
      cookies: { [CSRF_COOKIE]: 'different-value' },
    } as Partial<Request>);

    expect(accepted).toHaveBeenCalledWith();
    expect(rejected.mock.calls[0]?.[0]).toMatchObject({ code: 'CSRF_VALIDATION_FAILED' });
  });

  it('audits an authenticated role denial before returning permission denied', async () => {
    const next = vi.fn<NextFunction>();
    const middleware = requireRole('ADMIN');
    const request = {
      auth: {
        userId: '507f1f77bcf86cd799439011',
        workerId: 'GEU-WRK-A7K4',
        role: 'WORKER',
      },
      requestId: 'request-123',
      method: 'POST',
      baseUrl: '/api/v1/inventory',
      path: '/',
      route: { path: '/' },
    } as unknown as Request;

    await middleware(request, {} as Response, next);

    expect(auditMocks.appendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AUTH_PERMISSION_DENIED',
        targetId: 'POST /api/v1/inventory/',
        result: 'DENIED',
        reasonCode: 'PERMISSION_DENIED',
      }),
    );
    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});
