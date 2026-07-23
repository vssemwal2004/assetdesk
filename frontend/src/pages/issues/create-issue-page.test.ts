import { describe, expect, it } from 'vitest';

import type { Material } from '@assetdesk/contracts';

import { firstStockIssue } from './create-issue-page';

const assetMaterial: Material = {
  id: 'material-id',
  materialCode: 'GEU-MAT-000001',
  name: 'Dell Latitude',
  category: 'Laptops',
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
});
