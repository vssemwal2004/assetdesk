import { describe, expect, it } from 'vitest';

import { AppError } from '../../middleware/error-handler.js';
import {
  importInputToCreateMaterialRequest,
  normalizeImportConfiguration,
  parseInventoryImportCsv,
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

  it('accepts tab-delimited data saved with a CSV extension', () => {
    const table = parseInventoryImportCsv(
      [
        'IT Asset\tType/Model Name\tConfiguration\tSerial Number\tStore\tDepartment',
        'Accesspoint\tAP21\tINSTANT ON\tVNVFM1K0CY\tParam Centre Store\tParam Computer Centre',
      ].join('\r\n'),
    );

    expect(parseInventoryImportTable(table, 'SERIALIZED')[0]?.values).toMatchObject({
      category: 'Accesspoint',
      typeModelName: 'AP21',
      configuration: 'INSTANT ON',
      serialNumber: 'VNVFM1K0CY',
      store: 'Param Centre Store',
      department: 'Param Computer Centre',
    });
  });

  it('accepts semicolon-delimited CSV exports', () => {
    const table = parseInventoryImportCsv(
      'IT Asset;Type/Model Name;Configuration;Serial Number;Store\r\nComputer;Latitude 5450;16 GB RAM;DL-001;Main Store',
    );

    expect(parseInventoryImportTable(table, 'SERIALIZED')).toHaveLength(1);
  });

  it('detects the delimiter even when none of the headings are recognized', () => {
    expect(parseInventoryImportCsv('First heading\tSecond heading\r\none\ttwo')[0]).toEqual([
      'First heading',
      'Second heading',
    ]);
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

  it('reports friendly column names and the headers that were found', () => {
    expect(() =>
      parseInventoryImportTable(
        [
          ['IT Asset', 'Type/Model Name', 'Store'],
          ['Computer', 'Latitude 5450', 'Main Store'],
        ],
        'SERIALIZED',
      ),
    ).toThrowError(
      'Missing required columns: Configuration, Serial Number. Found columns: IT Asset, Type/Model Name, Store.',
    );
  });

  it('requires a type/model column and accepts Location / Block as the store source', () => {
    expect(() =>
      parseInventoryImportTable(
        [
          ['IT Asset', 'Configuration', 'Serial Number', 'Store'],
          ['Computer', '16 GB RAM', 'DL-001', 'Main Store'],
        ],
        'SERIALIZED',
      ),
    ).toThrowError('Missing required column: Type/Model Name.');

    const rows = parseInventoryImportTable(
      [
        ['IT Asset', 'Type/Model Name', 'Configuration', 'Serial Number', 'Location / Block'],
        ['Computer', 'Latitude 5450', '16 GB RAM', 'DL-001', 'Main Store / A Block'],
      ],
      'SERIALIZED',
    );
    expect(rows[0]?.values.locationBlock).toBe('Main Store / A Block');
  });

  it('preserves blank required cells so preview can report the exact missing value', () => {
    const rows = parseInventoryImportTable(
      [
        ['IT Consumable', 'Type/Model Name', 'Quantity', 'Unit Label', 'Store'],
        ['Cartridge', 'CARTRIDGE 05A', 10, 'pieces', ''],
      ],
      'QUANTITY',
    );

    expect(rows[0]?.values).toMatchObject({
      category: 'Cartridge',
      typeModelName: 'CARTRIDGE 05A',
      store: '',
    });
  });

  it('cleans quantity import inputs before strict material creation parsing', () => {
    const input = importInputToCreateMaterialRequest({
      name: 'Consumable USB-C Cable',
      category: 'Consumable',
      typeModelName: 'USB-C Cable',
      store: 'Store Room',
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
      store: 'Store Room',
      totalQuantity: 50,
      unitLabel: 'pieces',
    });
    expect('serialNumbers' in input).toBe(false);
  });
});
