import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from './app.js';

describe('AssetDesk API foundation', () => {
  it('returns a live health response and request ID', async () => {
    const response = await request(createApp()).get('/api/v1/health/live').expect(200);

    expect(response.headers['x-request-id']).toBeTypeOf('string');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.body).toMatchObject({
      data: {
        status: 'ok',
        service: 'assetdesk-api',
        version: '0.1.0',
      },
    });
  });

  it('returns an RFC-style problem for an unknown endpoint', async () => {
    const response = await request(createApp()).get('/api/v1/unknown').expect(404);

    expect(response.type).toBe('application/problem+json');
    expect(response.body).toMatchObject({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
    });
  });

  it('reports readiness separately when the database is disconnected in tests', async () => {
    const response = await request(createApp()).get('/api/v1/health/ready').expect(503);

    expect(response.body.data.dependencies.database.status).toBe('down');
  });
});
