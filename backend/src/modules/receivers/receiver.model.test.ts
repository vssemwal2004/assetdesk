import { describe, expect, it } from 'vitest';

import { ReceiverModel } from './receiver.model.js';

describe('Receiver persistence constraints', () => {
  it('declares unique indexes for code, normalized email, and optional university ID', () => {
    const indexes = ReceiverModel.schema.indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([
        [{ receiverCode: 1 }, expect.objectContaining({ unique: true })],
        [{ emailNormalized: 1 }, expect.objectContaining({ unique: true })],
        [
          { universityIdNormalized: 1 },
          expect.objectContaining({
            unique: true,
            partialFilterExpression: { universityIdNormalized: { $type: 'string' } },
          }),
        ],
      ]),
    );
  });
});
