import { describe, expect, it } from 'vitest';

import { parseWorkerImportTable } from './worker-import.service.js';

describe('Worker import parsing', () => {
  it('accepts supported column aliases and normalizes values', () => {
    const rows = parseWorkerImportTable([
      ['Worker Name', 'Email ID', 'Contact Number', 'Dept'],
      [' Anita Sharma ', 'ANITA@EXAMPLE.EDU ', 9876543210, ' IT '],
    ]);

    expect(rows).toEqual([
      {
        rowNumber: 2,
        name: 'Anita Sharma',
        email: 'anita@example.edu',
        emailNormalized: 'anita@example.edu',
        contact: '9876543210',
        department: 'IT',
        valid: true,
        errors: [],
      },
    ]);
  });

  it('marks every in-file duplicate and keeps other invalid rows for preview', () => {
    const rows = parseWorkerImportTable([
      ['Name', 'Email'],
      ['Anita Sharma', 'same@example.edu'],
      ['Arun Kumar', 'SAME@example.edu'],
      ['', 'not-an-email'],
    ]);

    expect(rows[0]).toMatchObject({ valid: false });
    expect(rows[1]).toMatchObject({ valid: false });
    expect(rows[0]?.errors).toContain('Duplicate email in this import file.');
    expect(rows[1]?.errors).toContain('Duplicate email in this import file.');
    expect(rows[2]?.valid).toBe(false);
    expect(rows[2]?.errors.length).toBeGreaterThan(0);
  });

  it('rejects files without the required columns', () => {
    expect(() =>
      parseWorkerImportTable([
        ['Name', 'Department'],
        ['A Worker', 'IT'],
      ]),
    ).toThrow('The import file must contain Name and Email columns.');
  });
});
