import { randomInt } from 'node:crypto';

const WORKER_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateWorkerIdCandidate(): string {
  const suffix = Array.from({ length: 4 }, () => {
    const index = randomInt(0, WORKER_ID_ALPHABET.length);
    return WORKER_ID_ALPHABET[index] ?? 'X';
  }).join('');

  return `GEU-WRK-${suffix}`;
}
