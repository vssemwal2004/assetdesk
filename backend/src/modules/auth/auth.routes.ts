import { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';

import {
  ChangeInitialPasswordRequestSchema,
  ChangePasswordRequestSchema,
  ForgotPasswordCompleteRequestSchema,
  ForgotPasswordStartRequestSchema,
  ForgotPasswordVerifyRequestSchema,
  LoginRequestSchema,
} from '@assetdesk/contracts';

import { appendAuditEvent } from '../audit/audit.service.js';
import {
  changeInitialPassword,
  changePassword,
  completeForgotPassword,
  getCurrentUser,
  login,
  logout,
  refresh,
  startForgotPassword,
  verifyForgotPasswordOtp,
} from './auth.service.js';
import {
  requireAuth,
  requireCsrf,
  requireFullAccess,
  requireTrustedOrigin,
} from './auth.middleware.js';
import { clearSessionCookies, CSRF_COOKIE, REFRESH_COOKIE, setSessionCookies } from './cookies.js';

function context(request: Request): { userAgent?: string; ip?: string } {
  const userAgent = request.header('user-agent');
  return {
    ...(userAgent ? { userAgent } : {}),
    ...(request.ip ? { ip: request.ip } : {}),
  };
}

function cookieValue(request: Request, name: string): string | undefined {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[name];
  return typeof value === 'string' ? value : undefined;
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (request, response) => {
    response.status(429).type('application/problem+json').json({
      type: 'about:blank',
      title: 'Too many sign-in attempts',
      status: 429,
      detail: 'Wait before trying to sign in again.',
      code: 'LOGIN_RATE_LIMITED',
      instance: request.originalUrl,
      requestId: request.requestId,
    });
  },
});

export function createAuthRouter(): Router {
  const router = Router();

  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    next();
  });

  router.post('/login', requireTrustedOrigin, loginLimiter, async (request, response, next) => {
    try {
      const input = LoginRequestSchema.parse(request.body);
      const result = await login(input.identifier, input.password, context(request));
      setSessionCookies(response, result.bundle);
      await appendAuditEvent({
        requestId: request.requestId,
        actorUserId: result.user.id,
        actorWorkerId: result.user.workerId,
        actorRole: result.user.role,
        action: 'AUTH_LOGIN',
        targetType: 'USER',
        targetId: result.user.workerId,
        result: 'SUCCESS',
      });
      response.json({ data: { user: result.user, csrfToken: result.bundle.csrfToken } });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/forgot-password/start',
    requireTrustedOrigin,
    loginLimiter,
    async (request, response, next) => {
      try {
        const input = ForgotPasswordStartRequestSchema.parse(request.body);
        const result = await startForgotPassword(input.email);
        response.json({
          data: { resetId: result.resetId, expiresAt: result.expiresAt.toISOString() },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/forgot-password/verify',
    requireTrustedOrigin,
    loginLimiter,
    async (request, response, next) => {
      try {
        const input = ForgotPasswordVerifyRequestSchema.parse(request.body);
        await verifyForgotPasswordOtp(input.resetId, input.otp);
        response.json({ data: { verified: true } });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/forgot-password/complete',
    requireTrustedOrigin,
    loginLimiter,
    async (request, response, next) => {
      try {
        const input = ForgotPasswordCompleteRequestSchema.parse(request.body);
        const result = await completeForgotPassword(
          input.resetId,
          input.otp,
          input.newPassword,
          context(request),
        );
        setSessionCookies(response, result.bundle);
        await appendAuditEvent({
          requestId: request.requestId,
          actorUserId: result.user.id,
          actorWorkerId: result.user.workerId,
          actorRole: result.user.role,
          action: 'AUTH_PASSWORD_RESET',
          targetType: 'USER',
          targetId: result.user.workerId,
          result: 'SUCCESS',
        });
        response.json({ data: { user: result.user, csrfToken: result.bundle.csrfToken } });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post('/refresh', async (request, response, next) => {
    try {
      const refreshToken = cookieValue(request, REFRESH_COOKIE);
      if (!refreshToken) {
        clearSessionCookies(response);
        response.status(401).type('application/problem+json').json({
          type: 'about:blank',
          title: 'Session expired',
          status: 401,
          detail: 'Sign in to continue.',
          code: 'AUTH_REQUIRED',
          requestId: request.requestId,
        });
        return;
      }
      const result = await refresh(
        refreshToken,
        request.header('x-csrf-token'),
        cookieValue(request, CSRF_COOKIE),
      );
      setSessionCookies(response, result.bundle);
      response.json({ data: { user: result.user, csrfToken: result.bundle.csrfToken } });
    } catch (error) {
      clearSessionCookies(response);
      next(error);
    }
  });

  router.get('/me', requireAuth, async (request, response, next) => {
    try {
      const user = await getCurrentUser(request.auth?.userId ?? '');
      response.json({ data: { user } });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/change-initial-password',
    requireTrustedOrigin,
    requireAuth,
    requireCsrf,
    async (request, response, next) => {
      try {
        const input = ChangeInitialPasswordRequestSchema.parse(request.body);
        const result = await changeInitialPassword(
          request.auth?.userId ?? '',
          input.newPassword,
          context(request),
        );
        setSessionCookies(response, result.bundle);
        await appendAuditEvent({
          requestId: request.requestId,
          actorUserId: result.user.id,
          actorWorkerId: result.user.workerId,
          actorRole: result.user.role,
          action: 'AUTH_INITIAL_PASSWORD_CHANGED',
          targetType: 'USER',
          targetId: result.user.workerId,
          result: 'SUCCESS',
        });
        response.json({ data: { user: result.user, csrfToken: result.bundle.csrfToken } });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/change-password',
    requireTrustedOrigin,
    requireAuth,
    requireFullAccess,
    requireCsrf,
    async (request, response, next) => {
      try {
        const input = ChangePasswordRequestSchema.parse(request.body);
        const result = await changePassword(
          request.auth?.userId ?? '',
          input.currentPassword,
          input.newPassword,
          context(request),
        );
        setSessionCookies(response, result.bundle);
        await appendAuditEvent({
          requestId: request.requestId,
          actorUserId: result.user.id,
          actorWorkerId: result.user.workerId,
          actorRole: result.user.role,
          action: 'AUTH_PASSWORD_CHANGED',
          targetType: 'USER',
          targetId: result.user.workerId,
          result: 'SUCCESS',
        });
        response.json({ data: { user: result.user, csrfToken: result.bundle.csrfToken } });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/logout',
    requireTrustedOrigin,
    requireAuth,
    requireCsrf,
    async (request, response, next) => {
      try {
        await logout(request.auth?.sid ?? '');
        clearSessionCookies(response);
        await appendAuditEvent({
          requestId: request.requestId,
          ...(request.auth?.userId ? { actorUserId: request.auth.userId } : {}),
          ...(request.auth?.workerId ? { actorWorkerId: request.auth.workerId } : {}),
          ...(request.auth?.role ? { actorRole: request.auth.role } : {}),
          action: 'AUTH_LOGOUT',
          targetType: 'USER',
          ...(request.auth?.workerId ? { targetId: request.auth.workerId } : {}),
          result: 'SUCCESS',
        });
        response.status(204).send();
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
