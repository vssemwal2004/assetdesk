import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export const requestIdMiddleware: RequestHandler = (request, response, next) => {
  const suppliedId = request.header('x-request-id');
  request.requestId = suppliedId && SAFE_REQUEST_ID.test(suppliedId) ? suppliedId : randomUUID();
  response.setHeader('x-request-id', request.requestId);
  next();
};
