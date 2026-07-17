import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { env } from '../../config/env.js';

describe('auth response security headers', () => {
  it('prevents caching auth errors and rejects a missing Origin', async () => {
    const response = await request(createApp()).post('/api/v1/auth/login').send({}).expect(403);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.pragma).toBe('no-cache');
    expect(response.body.code).toBe('UNTRUSTED_ORIGIN');
  });

  it('keeps validation responses non-cacheable for the trusted web origin', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/login')
      .set('Origin', new URL(env.APP_ORIGIN).origin)
      .send({})
      .expect(400);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.pragma).toBe('no-cache');
    expect(response.body.code).toBe('VALIDATION_FAILED');
  });
});
