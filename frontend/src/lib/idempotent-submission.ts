const submissionVersion = 1;
const idempotencyKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;

export interface PendingSubmission<T> {
  version: typeof submissionVersion;
  key: string;
  fingerprint: string;
  input: T;
  savedAt: string;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(',')}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(',')}}`;
}

function hashCanonicalValue(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `v1-${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
}

export function requestFingerprint(input: unknown): string {
  return hashCanonicalValue(canonicalize(input));
}

export function hasSameSubmissionInput<T>(pending: PendingSubmission<T>, input: unknown): boolean {
  return (
    pending.fingerprint === requestFingerprint(input) &&
    canonicalize(pending.input) === canonicalize(input)
  );
}

export function createPendingSubmission<T>(
  input: T,
  key: string = crypto.randomUUID(),
): PendingSubmission<T> {
  return {
    version: submissionVersion,
    key,
    fingerprint: requestFingerprint(input),
    input,
    savedAt: new Date().toISOString(),
  };
}

export function savePendingSubmission<T>(storageKey: string, pending: PendingSubmission<T>): void {
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(pending));
  } catch {
    // A storage-denied browser can still retry while the component remains mounted.
  }
}

export function readPendingSubmission(storageKey: string): PendingSubmission<unknown> | null {
  try {
    const value = window.sessionStorage.getItem(storageKey);
    if (!value) return null;
    const candidate = JSON.parse(value) as Partial<PendingSubmission<unknown>>;
    if (
      candidate.version !== submissionVersion ||
      typeof candidate.key !== 'string' ||
      !idempotencyKeyPattern.test(candidate.key) ||
      typeof candidate.fingerprint !== 'string' ||
      typeof candidate.savedAt !== 'string' ||
      !Object.hasOwn(candidate, 'input') ||
      candidate.fingerprint !== requestFingerprint(candidate.input)
    ) {
      window.sessionStorage.removeItem(storageKey);
      return null;
    }
    return candidate as PendingSubmission<unknown>;
  } catch {
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Ignore storage cleanup failures.
    }
    return null;
  }
}

export function clearPendingSubmission(storageKey: string): void {
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore storage cleanup failures.
  }
}
