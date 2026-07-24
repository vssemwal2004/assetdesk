import { describe, expect, it } from 'vitest';

import { generateWorkerIdCandidate } from './worker-id.js';

describe('Worker ID generation', () => {
  it('uses the computer-centre name based public format', () => {
    expect(generateWorkerIdCandidate('Anita Sharma')).toBe('GEU-CC-ANITASHARMA');
    expect(generateWorkerIdCandidate('Anita Sharma', 1)).toBe('GEU-CC-ANITASHARMA-02');
    expect(generateWorkerIdCandidate('  @@@  ')).toBe('GEU-CC-WORKER');
  });
});
