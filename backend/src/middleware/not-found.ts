import type { RequestHandler } from 'express';

export const notFoundHandler: RequestHandler = (request, response) => {
  response.status(404).type('application/problem+json').json({
    type: 'about:blank',
    title: 'Resource not found',
    status: 404,
    detail: 'The requested API resource does not exist.',
    code: 'RESOURCE_NOT_FOUND',
    instance: request.originalUrl,
    requestId: request.requestId,
  });
};
