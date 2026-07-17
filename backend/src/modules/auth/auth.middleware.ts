import type { Request, RequestHandler } from 'express';

import type { UserRole, WorkerPermission } from '@assetdesk/contracts';

import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../middleware/error-handler.js';
import { appendAuditEvent } from '../audit/audit.service.js';
import { UserModel } from '../users/user.model.js';
import { AUTH_COOKIE, CSRF_COOKIE } from './cookies.js';
import { getActiveSession, validateCsrfToken } from './session.service.js';
import { verifyAccessToken } from './tokens.js';

const trustedOrigin = new URL(env.APP_ORIGIN).origin;

function cookieValue(request: Request, name: string): string | undefined {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[name];
  return typeof value === 'string' ? value : undefined;
}

export const requireTrustedOrigin: RequestHandler = (request, _response, next) => {
  const origin = request.header('origin');
  if (!origin || origin !== trustedOrigin) {
    next(new AppError(403, 'UNTRUSTED_ORIGIN', 'The request origin is not allowed.'));
    return;
  }
  next();
};

export const requireAuth: RequestHandler = async (request, _response, next) => {
  try {
    const accessToken = cookieValue(request, AUTH_COOKIE);
    if (!accessToken) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');

    const claims = await verifyAccessToken(accessToken);
    const [session, user] = await Promise.all([
      getActiveSession(claims.sid),
      UserModel.findById(claims.sub),
    ]);

    if (!session || !user) throw new AppError(401, 'SESSION_EXPIRED', 'Your session has expired.');
    if (session.userId.toString() !== user._id.toString()) {
      throw new AppError(401, 'SESSION_REVOKED', 'Your session is no longer valid.');
    }
    if (user.status === 'DISABLED') {
      throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled.');
    }
    if (user.authVersion !== claims.authVersion || user.role !== claims.role) {
      throw new AppError(401, 'SESSION_REVOKED', 'Your account security settings changed.');
    }
    if (user.mustChangePassword !== (claims.purpose === 'PASSWORD_CHANGE')) {
      throw new AppError(401, 'SESSION_REVOKED', 'Your account security settings changed.');
    }

    request.auth = {
      userId: user._id.toString(),
      workerId: user.workerId,
      role: user.role,
      permissions: user.role === 'ADMIN' ? [] : (user.permissions ?? []),
      sid: session.sid,
      authVersion: user.authVersion,
      mustChangePassword: user.mustChangePassword,
      purpose: claims.purpose,
      csrfTokenHash: session.csrfTokenHash,
    };
    next();
  } catch (error) {
    next(error);
  }
};

export function requirePermission(permission: WorkerPermission): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth) {
      next(new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.'));
      return;
    }
    if (request.auth.role === 'ADMIN' || request.auth.permissions.includes(permission)) {
      next();
      return;
    }
    next(new AppError(403, 'PERMISSION_DENIED', 'You do not have access to this feature.'));
  };
}

export const requireFullAccess: RequestHandler = (request, _response, next) => {
  if (!request.auth) {
    next(new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.'));
    return;
  }
  if (request.auth.mustChangePassword || request.auth.purpose !== 'FULL_ACCESS') {
    next(
      new AppError(
        403,
        'PASSWORD_CHANGE_REQUIRED',
        'Create a new password before using AssetDesk.',
      ),
    );
    return;
  }
  next();
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return async (request, _response, next) => {
    if (!request.auth || !roles.includes(request.auth.role)) {
      if (request.auth) {
        const routePath =
          typeof request.route?.path === 'string' ? request.route.path : request.path;
        try {
          await appendAuditEvent({
            requestId: request.requestId,
            actorUserId: request.auth.userId,
            actorWorkerId: request.auth.workerId,
            actorRole: request.auth.role,
            action: 'AUTH_PERMISSION_DENIED',
            targetType: 'ROUTE',
            targetId: `${request.method} ${request.baseUrl}${routePath}`,
            result: 'DENIED',
            reasonCode: 'PERMISSION_DENIED',
            metadata: {
              actualRole: request.auth.role,
              allowedRoles: roles,
            },
          });
        } catch (error) {
          logger.error(
            {
              error,
              requestId: request.requestId,
              actorWorkerId: request.auth.workerId,
            },
            'Permission denial audit event could not be persisted',
          );
        }
      }
      next(new AppError(403, 'PERMISSION_DENIED', 'You do not have permission for this action.'));
      return;
    }
    next();
  };
}

export const requireCsrf: RequestHandler = (request, _response, next) => {
  if (!request.auth) {
    next(new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.'));
    return;
  }
  const csrfHeader = request.header('x-csrf-token');
  const csrfCookie = cookieValue(request, CSRF_COOKIE);
  if (!validateCsrfToken(csrfHeader, csrfCookie, request.auth.csrfTokenHash)) {
    next(new AppError(403, 'CSRF_VALIDATION_FAILED', 'The security token is invalid.'));
    return;
  }
  next();
};
