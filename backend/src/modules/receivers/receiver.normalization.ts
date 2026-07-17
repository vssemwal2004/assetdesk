const WHITESPACE_PATTERN = /\s+/gu;
const NON_SEARCHABLE_CONTACT_PATTERN = /[^\p{L}\p{N}]+/gu;

export function normalizeDisplayText(value: string): string {
  return value.normalize('NFKC').trim().replace(WHITESPACE_PATTERN, ' ');
}

export function normalizeSearchText(value: string): string {
  return normalizeDisplayText(value).toLocaleLowerCase('en-US');
}

export function normalizeEmail(value: string): string {
  return normalizeDisplayText(value).toLocaleLowerCase('en-US');
}

export function normalizeUniversityId(value: string): string {
  return normalizeSearchText(value);
}

export function normalizeContactSearch(value: string): string {
  return normalizeSearchText(value).replace(NON_SEARCHABLE_CONTACT_PATTERN, '');
}

export function escapeSearchRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
