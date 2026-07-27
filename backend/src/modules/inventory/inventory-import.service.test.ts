import { describe, expect, it } from 'vitest';

import { AppError } from '../../middleware/error-handler.js';
import {
  importInputToCreateMaterialRequest,
  parseInventoryImportTable,
} from './inventory-import.service.js';

describe('inventory import parsing', () => {
  it('accepts case-insensitive asset headers and preserves one serial per row', () => {
    const rows = parseInventoryImportTable(
      [
        ['MATERIAL_NAME', 'material-group', 'SERIAL NUMBER', 'Location', 'Block', 'Department'],
        ['Dell Latitude', 'Laptops', 'dl-001', 'Computer Centre', 'A Block', 'IT'],
        ['Dell Latitude', 'Laptops', 'DL-002', 'Computer Centre', 'A Block', 'IT'],
      ],
      'SERIALIZED',
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      values: {
        name: 'Dell Latitude',
        category: 'Laptops',
        serialNumber: 'dl-001',
        location: 'Computer Centre',
        block: 'A Block',
        department: 'IT',
      },
    });
  });

  it('accepts the IT Consumable template columns', () => {
    const rows = parseInventoryImportTable(
      [
        ['Material Name', 'Group', 'QTY', 'Unit', 'Location', 'Block', 'Department'],
        ['USB-C Cable', 'Cables', 50, 'pieces', 'Store Room', 'B Block', 'IT'],
      ],
      'QUANTITY',
    );

    expect(rows[0]?.values).toMatchObject({
      name: 'USB-C Cable',
      category: 'Cables',
      quantity: '50',
      unitLabel: 'pieces',
      location: 'Store Room',
      block: 'B Block',
      department: 'IT',
    });
  });

  it('accepts common misspellings of the IT Consumable category column', () => {
    const rows = parseInventoryImportTable(
      [
        ['Material Name', 'IT CONSUBABLE', 'QTY', 'Unit', 'Location', 'Block', 'Dept'],
        ['USB-C Cable', 'Cable', 50, 'pieces', 'Store Room', 'B Block', 'IT'],
      ],
      'QUANTITY',
    );

    expect(rows[0]?.values).toMatchObject({
      category: 'Cable',
      quantity: '50',
      unitLabel: 'pieces',
      department: 'IT',
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

  it('cleans quantity import inputs before strict material creation parsing', () => {
    const input = importInputToCreateMaterialRequest({
      name: 'Consumable USB-C Cable',
      category: 'Consumable',
      typeModelName: 'USB-C Cable',
      location: 'Store Room',
      block: 'B Block',
      department: 'IT',
      locationBlock: 'Store Room / B Block',
      assignmentTypes: ['SHORT_TERM'],
      trackingMode: 'QUANTITY',
      returnPolicy: 'CONSUMABLE',
      serialNumbers: [],
      totalQuantity: 50,
      unitLabel: 'pieces',
      status: 'ACTIVE',
    });

    expect(input).toMatchObject({
      name: 'Consumable USB-C Cable',
      trackingMode: 'QUANTITY',
      location: 'Store Room',
      block: 'B Block',
      department: 'IT',
      totalQuantity: 50,
      unitLabel: 'pieces',
    });
    expect('serialNumbers' in input).toBe(false);
  });
});
