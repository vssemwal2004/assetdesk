import { describe, expect, it } from 'vitest';

import { AppError } from '../../middleware/error-handler.js';
import {
  importInputToCreateMaterialRequest,
  normalizeImportConfiguration,
  parseInventoryImportTable,
} from './inventory-import.service.js';

describe('inventory import parsing', () => {
  it('treats visually identical spreadsheet configurations as the same value', () => {
    expect(normalizeImportConfiguration('  600VA\u200B ')).toBe(
      normalizeImportConfiguration('６００VA'),
    );
    expect(normalizeImportConfiguration('16  GB RAM')).toBe(
      normalizeImportConfiguration('16 GB RAM'),
    );
    expect(normalizeImportConfiguration('600 VA')).toBe(normalizeImportConfiguration('600VA'));
  });

  it('accepts the complete IT Asset template headings', () => {
    const rows = parseInventoryImportTable(
      [
        [
          'IT Asset',
          'Type/Model Name',
          'Configuration',
          'Serial Number',
          'Location',
          'Block',
          'Vendor Name',
          'Description',
          'Inventory Status',
        ],
        [
          'Computer',
          'Dell Latitude 5450',
          '16 GB RAM / 512 GB SSD',
          'DL-001',
          'Computer Centre',
          'A Block',
          'Dell',
          'Staff laptop',
          'Active / in use',
        ],
      ],
      'SERIALIZED',
    );

    expect(rows[0]?.values).toMatchObject({
      category: 'Computer',
      typeModelName: 'Dell Latitude 5450',
      configuration: '16 GB RAM / 512 GB SSD',
      serialNumber: 'DL-001',
      location: 'Computer Centre',
      block: 'A Block',
      vendorName: 'Dell',
      description: 'Staff laptop',
      status: 'Active / in use',
    });
  });

  it('accepts case-insensitive asset headers and preserves one serial per row', () => {
    const rows = parseInventoryImportTable(
      [
        ['MATERIAL_NAME', 'material-group', 'Configration', 'SERIAL NUMBER', 'Location', 'Block'],
        ['Dell Latitude', 'Laptops', '16 GB RAM', 'dl-001', 'Computer Centre', 'A Block'],
        ['Dell Latitude', 'Laptops', '16 GB RAM', 'DL-002', 'Computer Centre', 'A Block'],
      ],
      'SERIALIZED',
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      values: {
        name: 'Dell Latitude',
        category: 'Laptops',
        configuration: '16 GB RAM',
        serialNumber: 'dl-001',
        location: 'Computer Centre',
        block: 'A Block',
      },
    });
  });

  it('accepts the IT Consumable template columns', () => {
    const rows = parseInventoryImportTable(
      [
        ['Material Name', 'Group', 'QTY', 'Unit', 'Location', 'Block'],
        ['USB-C Cable', 'Cables', 50, 'pieces', 'Store Room', 'B Block'],
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
    });
  });

  it('accepts common misspellings of the IT Consumable category column', () => {
    const rows = parseInventoryImportTable(
      [
        ['Material Name', 'IT CONSUBABLE', 'QTY', 'Unit', 'Location', 'Block'],
        ['USB-C Cable', 'Cable', 50, 'pieces', 'Store Room', 'B Block'],
      ],
      'QUANTITY',
    );

    expect(rows[0]?.values).toMatchObject({
      category: 'Cable',
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

  it('preserves blank required cells so preview can report the exact missing value', () => {
    const rows = parseInventoryImportTable(
      [
        ['IT Consumable', 'Type/Model Name', 'Quantity', 'Unit Label', 'Location', 'Block'],
        ['Cartridge', 'CARTRIDGE 05A', 10, 'pieces', 'Param Centre Store', ''],
      ],
      'QUANTITY',
    );

    expect(rows[0]?.values).toMatchObject({
      category: 'Cartridge',
      typeModelName: 'CARTRIDGE 05A',
      block: '',
    });
  });

  it('cleans quantity import inputs before strict material creation parsing', () => {
    const input = importInputToCreateMaterialRequest({
      name: 'Consumable USB-C Cable',
      category: 'Consumable',
      typeModelName: 'USB-C Cable',
      location: 'Store Room',
      block: 'B Block',
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
      totalQuantity: 50,
      unitLabel: 'pieces',
    });
    expect('serialNumbers' in input).toBe(false);
  });
});
