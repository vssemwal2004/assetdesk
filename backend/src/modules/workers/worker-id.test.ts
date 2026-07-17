import { describe, expect, it } from 'vitest';

import { generateWorkerIdCandidate } from './worker-id.js';

describe('Worker ID generation', () => {
  it('uses the public format without ambiguous characters', () => {
    for (let index = 0; index < 100; index += 1) {
      expect(generateWorkerIdCandidate()).toMatch(/^GEU-WRK-[A-HJ-NP-Z2-9]{4}$/);
    }
  });
});
