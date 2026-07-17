import { describe, expect, it } from 'vitest';

import { createCsv } from './csv.js';

describe('CSV report safety', () => {
  it.each(['=1+1', ' +cmd', '-10+20', '@SUM(A1:A2)', '\t=HYPERLINK("bad")'])(
    'neutralizes spreadsheet formula input %j',
    (value) => {
      const csv = createCsv(['Value'], [[value]]);
      const sanitized = value.replaceAll('\t', ' ');

      expect(csv).toContain(`"'${sanitized.replaceAll('"', '""')}"`);
    },
  );

  it('quotes every cell, escapes quotes, and replaces unsafe control characters', () => {
    const csv = createCsv(
      ['Issue ID', 'Description'],
      [['GEU-ISS-2026-000001', 'Cable "blue"\u0001 adapter\r\nwith\tlabel']],
    );

    expect(csv).toBe(
      '\uFEFF"Issue ID","Description"\r\n' +
        '"GEU-ISS-2026-000001","Cable ""blue""  adapter  with label"\r\n',
    );
  });

  it('uses a UTF-8 BOM and CRLF row endings for spreadsheet compatibility', () => {
    const csv = createCsv(['One'], [['first'], ['second']]);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toBe('\uFEFF"One"\r\n"first"\r\n"second"\r\n');
    expect(csv.replaceAll('\r\n', '')).not.toContain('\n');
  });
});
