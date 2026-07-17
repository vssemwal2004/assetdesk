import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

function zodFields(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'request';
    fields[key] ??= issue.message;
  }

  return fields;
}

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  const knownError = error instanceof AppError;
  const validationError = error instanceof ZodError;
  const status = knownError ? error.status : validationError ? 400 : 500;
  const code = knownError
    ? error.code
    : validationError
      ? 'VALIDATION_FAILED'
      : 'INTERNAL_SERVER_ERROR';
  const detail = knownError
    ? error.message
    : validationError
      ? 'One or more request fields are invalid.'
      : 'The server could not complete the request.';

  if (status >= 500) {
    logger.error({ error, requestId: request.requestId }, 'Unhandled request error');
  }

  response
    .status(status)
    .type('application/problem+json')
    .json({
      type: 'about:blank',
      title:
        status === 500 ? 'Internal server error' : validationError ? 'Invalid request' : detail,
      status,
      detail,
      code,
      instance: request.originalUrl,
      requestId: request.requestId,
      ...(knownError && error.fields ? { fields: error.fields } : {}),
      ...(validationError ? { fields: zodFields(error) } : {}),
      ...(env.NODE_ENV === 'development' && status === 500 && error instanceof Error
        ? { debugMessage: error.message }
        : {}),
    });
};
