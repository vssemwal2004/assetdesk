import pino from 'pino';

import { env } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: 'assetdesk-api',
    environment: env.NODE_ENV,
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      '*.currentPassword',
      '*.newPassword',
      '*.passwordHash',
      '*.temporaryPassword',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.refreshTokenHash',
      '*.csrfToken',
      '*.csrfTokenHash',
      '*.apiKey',
      'req.body.password',
      'req.body.currentPassword',
      'req.body.newPassword',
    ],
    censor: '[REDACTED]',
  },
});
