import { describe, expect, it } from 'vitest';

import { CreateMaterialRequestSchema } from '@assetdesk/contracts';

import {
  buildCreateMaterialDraft,
  serialFieldsForQuantity,
  type MaterialForm,
} from './create-material-page';

describe('IT Asset serial number fields', () => {
  it('creates one required field slot for every selected quantity', () => {
    expect(serialFieldsForQuantity([''], '10')).toHaveLength(10);
  });

  it('preserves entered serial numbers when quantity increases or decreases', () => {
    const increased = serialFieldsForQuantity(['SER-001', 'SER-002'], '4');
    expect(increased).toEqual(['SER-001', 'SER-002', '', '']);
    expect(serialFieldsForQuantity(increased, '1')).toEqual(['SER-001']);
  });

  it('does not allocate fields for invalid or excessive quantities', () => {
    const current = ['SER-001'];
    expect(serialFieldsForQuantity(current, '0')).toBe(current);
    expect(serialFieldsForQuantity(current, '1001')).toBe(current);
  });
});

describe('Add Inventory request payload', () => {
  it('builds the quantity-tracked payload expected by the shared contract', () => {
    const form: MaterialForm = {
      name: '',
      category: 'Consumable',
      typeModelName: 'Marker Pen',
      configuration: '',
      store: 'Main Store',
      department: '   ',
      vendorName: ' Campus Supplier ',
      description: ' Blue marker ',
      trackingMode: 'QUANTITY',
      returnPolicy: 'CONSUMABLE',
      status: 'ACTIVE',
      totalQuantity: '25',
      unitLabel: 'pieces',
      serialNumbers: ['ignored'],
    };

    const parsed = CreateMaterialRequestSchema.parse(buildCreateMaterialDraft(form));

    expect(parsed).toEqual({
      name: 'Consumable Marker Pen',
      category: 'Consumable',
      typeModelName: 'Marker Pen',
      store: 'Main Store',
      vendorName: 'Campus Supplier',
      description: 'Blue marker',
      status: 'ACTIVE',
      assignmentTypes: ['SHORT_TERM'],
      trackingMode: 'QUANTITY',
      returnPolicy: 'CONSUMABLE',
      totalQuantity: 25,
      unitLabel: 'pieces',
    });
  });

  it('keeps long category/model combinations within the required name field limit', () => {
    const modelName = `Model ${'B'.repeat(105)}`;
    const form: MaterialForm = {
      name: '',
      category: `Category ${'A'.repeat(70)}`,
      typeModelName: modelName,
      configuration: '',
      store: 'Main Store',
      department: '',
      vendorName: '',
      description: '',
      trackingMode: 'QUANTITY',
      returnPolicy: 'CONSUMABLE',
      status: 'ACTIVE',
      totalQuantity: '0',
      unitLabel: 'units',
      serialNumbers: [],
    };

    const parsed = CreateMaterialRequestSchema.safeParse(buildCreateMaterialDraft(form));

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.name).toBe(modelName);
  });
});
