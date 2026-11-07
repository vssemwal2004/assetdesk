import { describe, expect, it } from 'vitest';

import type { IssueSummary } from '@assetdesk/contracts';

import { issueSearchHits } from './issue-search-hits';

function issue(overrides: Partial<IssueSummary> = {}): IssueSummary {
  return {
    issueId: 'GEU-ISS-2026-000101',
    receiver: {
      receiverCode: 'RCV-001',
      fullName: 'Anita Sharma',
      universityId: null,
      type: 'FACULTY',
      department: 'CSE',
      contact: null,
      email: null,
    },
    issuedBy: { name: 'Store Admin', workerId: 'GEU-W-0001' },
    destinationLocation: 'CSIT Lab 3',
    destinationBlock: 'Block A',
    purpose: null,
    materialDetails: [
      {
        name: 'Cable HDMI',
        category: 'Cable',
        model: 'HDMI',
        trackingMode: 'QUANTITY',
        issuedQuantity: 2,
        outstandingQuantity: 2,
        assets: [],
      },
      {
        name: 'CPU Dell OptiPlex 3080',
        category: 'CPU',
        model: 'Dell OptiPlex 3080',
        trackingMode: 'SERIALIZED',
        issuedQuantity: 1,
        outstandingQuantity: 1,
        assets: [{ assetTag: 'GEU-2026-000045', serialNumber: '5CG1234XYZ', outstanding: true }],
      },
    ],
    ...overrides,
  } as IssueSummary;
}

describe('issueSearchHits', () => {
  it('locates a serial number inside its category folder path', () => {
    const [hit] = issueSearchHits([issue()], '1234xy');
    expect(hit).toMatchObject({
      field: 'Serial number',
      value: '5CG1234XYZ',
      groupKey: 'SERIALIZED:CPU',
      path: [
        'IT Asset',
        'CPU',
        'Dell OptiPlex 3080',
        'GEU-ISS-2026-000101',
        'Serial number 5CG1234XYZ',
      ],
    });
  });

  it('keeps the hit inside the active material scope', () => {
    const [hit] = issueSearchHits([issue()], 'Anita', { trackingMode: 'QUANTITY' });
    expect(hit).toMatchObject({ field: 'Receiver', groupKey: 'QUANTITY:CABLE' });
  });

  it('reports configuration matches the summary cannot show', () => {
    const [hit] = issueSearchHits([issue()], 'i7 16GB');
    expect(hit?.field).toBe('Material configuration');
    expect(hit?.value).toBeNull();
  });
});
