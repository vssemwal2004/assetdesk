import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { errorHandler } from './error-handler.js';

describe('error handler persistence validation', () => {
  it('returns an actionable 422 problem for Mongoose validation errors', async () => {
    const validationError = new mongoose.Error.ValidationError();
    validationError.addError(
      'dataAccess.inventory',
      new mongoose.Error.ValidatorError({
        path: 'dataAccess.inventory',
        value: 'UNIVERSITY',
        message: 'Inventory access must be OWN or ALL.',
      }),
    );

    const app = express();
    app.use((request, _response, next) => {
      request.requestId = 'validation-request';
      next(validationError);
    });
    app.use(errorHandler);

    const response = await request(app).get('/access').expect(422);

    expect(response.type).toBe('application/problem+json');
    expect(response.body).toMatchObject({
      title: 'Unable to save changes',
      status: 422,
      code: 'PERSISTENCE_VALIDATION_FAILED',
      requestId: 'validation-request',
      fields: { 'dataAccess.inventory': 'Inventory access must be OWN or ALL.' },
    });
  });
});
