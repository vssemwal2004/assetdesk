import { describe, expect, it } from 'vitest';

import { AppError } from '../../middleware/error-handler.js';
import { parseInventoryImportTable } from './inventory-import.service.js';

describe('inventory import parsing', () => {
  it('accepts case-insensitive asset headers and preserves one serial per row', () => {
    const rows = parseInventoryImportTable(
      [
        ['MATERIAL_NAME', 'material-group', 'SERIAL NUMBER'],
        ['Dell Latitude', 'Laptops', 'dl-001'],
        ['Dell Latitude', 'Laptops', 'DL-002'],
      ],
      'SERIALIZED',
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      values: { name: 'Dell Latitude', category: 'Laptops', serialNumber: 'dl-001' },
    });
  });

  it('accepts the IT Consumable template columns', () => {
    const rows = parseInventoryImportTable(
      [
        ['Material Name', 'Group', 'QTY', 'Unit'],
        ['USB-C Cable', 'Cables', 50, 'pieces'],
      ],
      'QUANTITY',
    );

    expect(rows[0]?.values).toMatchObject({
      name: 'USB-C Cable',
      category: 'Cables',
      quantity: '50',
      unitLabel: 'pieces',
    });
  });

  it('rejects a file before preview when required columns are missing', () => {
    expect(() =>
      parseInventoryImportTable(
        [
          ['Material Name', 'Group'],
          ['Laptop', 'Laptops'],
        ],
        'SERIALIZED',
      ),
    ).toThrowError(AppError);
  });
});
