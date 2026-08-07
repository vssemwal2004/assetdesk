import type { ErrorRequestHandler } from 'express';
import mongoose from 'mongoose';
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

function mongooseFields(error: mongoose.Error.ValidationError): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const [path, issue] of Object.entries(error.errors)) {
    fields[path] ??= issue.message;
  }

  return fields;
}

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  const knownError = error instanceof AppError;
  const requestValidationError = error instanceof ZodError;
  const persistenceValidationError = error instanceof mongoose.Error.ValidationError;
  const status = knownError
    ? error.status
    : requestValidationError
      ? 400
      : persistenceValidationError
        ? 422
        : 500;
  const code = knownError
    ? error.code
    : requestValidationError
      ? 'VALIDATION_FAILED'
      : persistenceValidationError
        ? 'PERSISTENCE_VALIDATION_FAILED'
        : 'INTERNAL_SERVER_ERROR';
  const detail = knownError
    ? error.message
    : requestValidationError
      ? 'One or more request fields are invalid.'
      : persistenceValidationError
        ? 'One or more fields could not be saved. Correct the highlighted values and try again.'
        : 'The server could not complete the request.';

  if (status >= 500) {
    logger.error({ err: error, requestId: request.requestId }, 'Unhandled request error');
  }

  response
    .status(status)
    .type('application/problem+json')
    .json({
      type: 'about:blank',
      title:
        status === 500
          ? 'Internal server error'
          : requestValidationError
            ? 'Invalid request'
            : persistenceValidationError
              ? 'Unable to save changes'
              : detail,
      status,
      detail,
      code,
      instance: request.originalUrl,
      requestId: request.requestId,
      ...(knownError && error.fields ? { fields: error.fields } : {}),
      ...(requestValidationError ? { fields: zodFields(error) } : {}),
      ...(persistenceValidationError ? { fields: mongooseFields(error) } : {}),
      ...(env.NODE_ENV === 'development' && status === 500 && error instanceof Error
        ? { debugMessage: error.message }
        : {}),
    });
};
