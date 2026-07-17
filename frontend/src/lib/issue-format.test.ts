import { describe, expect, it } from 'vitest';

import { returnedUnitCount } from './issue-format';

describe('Issue and Return formatting', () => {
  it('counts quantity units and serialized assets rather than request lines', () => {
    expect(
      returnedUnitCount([
        { trackingMode: 'QUANTITY', quantity: 25 },
        { trackingMode: 'SERIALIZED' },
        { trackingMode: 'SERIALIZED' },
      ]),
    ).toBe(27);
  });
});
