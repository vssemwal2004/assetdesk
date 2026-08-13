import { describe, expect, it } from 'vitest';

import type { Material } from '@assetdesk/contracts';

import {
  firstReceiverIssue,
  firstIssueApiMessage,
  firstStockIssue,
  isIssueableInventoryMaterial,
  matchesStoreSource,
} from './create-issue-page';

const storeNames = ['Param Centre Store', 'Aryabhatt Store / Aryabhatt Centre'];

const assetMaterial: Material = {
  id: 'material-id',
  materialCode: 'GEU-MAT-000001',
  name: 'Dell Latitude',
  category: 'Laptops',
  typeModelName: null,
  location: 'Param Centre Store',
  block: null,
  department: null,
  vendorName: null,
  locationBlock: null,
  description: null,
  trackingMode: 'SERIALIZED',
  returnPolicy: 'REUSABLE',
  status: 'ACTIVE',
  totalQuantity: 3,
  availableQuantity: 3,
  issuedQuantity: 0,
  unitLabel: null,
  assignmentTypes: ['LONG_TERM', 'SHORT_TERM'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('IT Asset issue selection', () => {
  it('allows outdated materials but excludes scrap materials from issue selection', () => {
    expect(
      isIssueableInventoryMaterial(
        {
          ...assetMaterial,
          status: 'NOT_IN_USE',
        },
        '',
        storeNames,
      ),
    ).toBe(true);
    expect(
      isIssueableInventoryMaterial(
        {
          ...assetMaterial,
          status: 'SCRAP',
        },
        '',
        storeNames,
      ),
    ).toBe(false);
    expect(
      isIssueableInventoryMaterial(
        {
          ...assetMaterial,
          location: 'Chandra Shekhar Azad Hostel',
        },
        '',
        storeNames,
      ),
    ).toBe(false);
    expect(
      isIssueableInventoryMaterial(
        {
          ...assetMaterial,
          availableQuantity: 0,
        },
        '',
        storeNames,
      ),
    ).toBe(false);
  });

  it('matches store filters against material location plus block', () => {
    expect(
      isIssueableInventoryMaterial(
        {
          ...assetMaterial,
          location: 'Aryabhatt Store',
          block: 'Aryabhatt Centre',
          locationBlock: 'Aryabhatt Store / Aryabhatt Centre',
        },
        'Aryabhatt Store / Aryabhatt Centre',
        storeNames,
      ),
    ).toBe(true);
    expect(
      isIssueableInventoryMaterial(
        {
          ...assetMaterial,
          location: 'Param Centre Store',
          block: 'Param Computer Centre',
          locationBlock: 'Param Centre Store / Param Computer Centre',
        },
        'Param Centre Store / Param  Computer Centre',
        ['Param Centre Store / Param  Computer Centre'],
      ),
    ).toBe(true);
  });

  it('matches configured stores to inventory location and block', () => {
    expect(
      matchesStoreSource('Aryabhatt Store / Aryabhatt Centre', {
        location: 'Aryabhatt Store',
        block: 'Aryabhatt Centre',
        locationBlock: null,
      }),
    ).toBe(true);
    expect(
      matchesStoreSource('Aryabhatt Store / Aryabhatt Centre', {
        location: 'Aryabhatt Store',
        block: 'Other Block',
        locationBlock: null,
      }),
    ).toBe(false);
    expect(
      matchesStoreSource('Param Centre Store / Param  Computer Centre', {
        location: 'Param Centre Store',
        block: 'Param Computer Centre',
        locationBlock: 'Param Centre Store / Param Computer Centre',
      }),
    ).toBe(true);
  });

  it('does not treat another configured store as stock for the selected store', () => {
    expect(
      isIssueableInventoryMaterial(
        {
          ...assetMaterial,
          location: 'Param Centre Store',
          block: 'Param Computer Centre',
          locationBlock: 'Param Centre Store / Param Computer Centre',
        },
        'Aryabhatt Store / Aryabhatt Centre',
        storeNames,
      ),
    ).toBe(false);
  });

  it('requires exactly one selected serial number for each requested quantity', () => {
    const materials = new Map([[assetMaterial.materialCode, assetMaterial]]);
    const line = {
      id: 'line-1',
      materialCode: assetMaterial.materialCode,
      quantity: '3',
      assetTags: ['GEU-AST-000001', 'GEU-AST-000002'],
    };

    expect(firstStockIssue([line], materials)).toBe(
      'Select exactly 3 serial numbers for Dell Latitude.',
    );
    expect(
      firstStockIssue([{ ...line, assetTags: [...line.assetTags, 'GEU-AST-000003'] }], materials),
    ).toBeNull();
  });

  it('rejects duplicate serial-numbered asset selections', () => {
    const materials = new Map([[assetMaterial.materialCode, assetMaterial]]);
    expect(
      firstStockIssue(
        [
          {
            id: 'line-1',
            materialCode: assetMaterial.materialCode,
            quantity: '2',
            assetTags: ['GEU-AST-000001', 'GEU-AST-000001'],
          },
        ],
        materials,
      ),
    ).toBe('GEU-AST-000001 is selected more than once.');
  });

  it('allows optional receiver contact and email before schema validation', () => {
    expect(firstReceiverIssue({ fullName: '', contact: '', email: '' })).toBe(
      'Enter the receiver name or department.',
    );
    expect(firstReceiverIssue({ fullName: 'Amit', contact: '', email: '' })).toBeNull();
    expect(firstReceiverIssue({ fullName: 'Amit', contact: '123', email: '' })).toBe(
      'Enter a valid receiver contact number with at least 5 digits.',
    );
    expect(firstReceiverIssue({ fullName: 'Amit', contact: '9876543210', email: 'bad' })).toBe(
      'Enter a valid receiver email address.',
    );
    expect(
      firstReceiverIssue({
        fullName: 'Amit',
        contact: '9876543210',
        email: 'amit@example.com',
      }),
    ).toBeNull();
  });

  it('translates backend validation fields into useful issue-form messages', () => {
    expect(firstIssueApiMessage({ 'receiver.fullName': 'Too small' })).toBe(
      'Enter the receiver name or department.',
    );
    expect(firstIssueApiMessage({ 'lines.0.assetTags': 'Too small' })).toBe(
      'Choose inventory material and serial numbers for item 1.',
    );
  });
});
