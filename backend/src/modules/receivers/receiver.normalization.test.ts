import { describe, expect, it } from 'vitest';

import {
  escapeSearchRegex,
  normalizeContactSearch,
  normalizeDisplayText,
  normalizeEmail,
  normalizeSearchText,
  normalizeUniversityId,
} from './receiver.normalization.js';

describe('Receiver normalization', () => {
  it('normalizes compatibility characters and repeated whitespace', () => {
    expect(normalizeDisplayText('  Dr.\tＡｄａ   Lovelace  ')).toBe('Dr. Ada Lovelace');
    expect(normalizeSearchText('  Dr.\tＡｄａ   Lovelace  ')).toBe('dr. ada lovelace');
  });

  it('normalizes identity fields consistently', () => {
    expect(normalizeEmail(' ADA@Example.EDU ')).toBe('ada@example.edu');
    expect(normalizeUniversityId(' GEU  1001 ')).toBe('geu 1001');
    expect(normalizeContactSearch('+91 (98765) 43210')).toBe('919876543210');
  });

  it('escapes every regular-expression metacharacter in user search', () => {
    const input = 'Ada.*(test)+[1]?';
    const expression = new RegExp(escapeSearchRegex(input));
    expect(expression.test(input)).toBe(true);
    expect(expression.test('AdaZZtest1')).toBe(false);
  });
});
