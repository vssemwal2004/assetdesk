function normalizeWorkerName(name: string): string {
  const normalized = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 24);
  return normalized || 'WORKER';
}

export function generateWorkerIdCandidate(name: string, attempt = 0): string {
  const base = `GEU-CC-${normalizeWorkerName(name)}`;
  return attempt === 0 ? base : `${base}-${String(attempt + 1).padStart(2, '0')}`;
}
