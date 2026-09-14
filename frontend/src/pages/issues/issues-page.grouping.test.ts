import { describe, expect, it } from 'vitest';

import type { IssueSummary } from '@assetdesk/contracts';

import { groupIssues, scopedMaterialDetails } from './issue-grouping';

const mixedIssue = {
  issueId: 'ISS-20260911-0001',
  materialDetails: [
    {
      name: 'HP Elite Tower 800 G9',
      category: 'CPU',
      model: 'HP Elite Tower 800 G9',
      trackingMode: 'SERIALIZED',
      issuedQuantity: 2,
      outstandingQuantity: 2,
      assets: [],
    },
    {
      name: 'LaserJet Pro',
      category: 'Printer',
      model: 'LaserJet Pro',
      trackingMode: 'SERIALIZED',
      issuedQuantity: 1,
      outstandingQuantity: 1,
      assets: [],
    },
    {
      name: 'A4 Paper',
      category: 'Paper',
      model: 'A4 Paper',
      trackingMode: 'QUANTITY',
      issuedQuantity: 10,
      outstandingQuantity: 0,
      assets: [],
    },
  ],
  materialGroups: [
    { category: 'CPU', trackingMode: 'SERIALIZED', outstandingQuantity: 2 },
    { category: 'Printer', trackingMode: 'SERIALIZED', outstandingQuantity: 1 },
    { category: 'Paper', trackingMode: 'QUANTITY', outstandingQuantity: 0 },
  ],
} as unknown as IssueSummary;

describe('Issue category grouping', () => {
  it('shows only the selected category and tracking mode from a mixed issue', () => {
    const groups = groupIssues([mixedIssue], {
      trackingMode: 'SERIALIZED',
      category: 'cpu',
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      category: 'CPU',
      trackingMode: 'SERIALIZED',
      issueQuantity: 2,
      outstanding: 2,
    });
  });

  it('scopes row material/model/serial data to its category folder', () => {
    const materials = scopedMaterialDetails(mixedIssue, {
      category: 'CPU',
      trackingMode: 'SERIALIZED',
    });

    expect(materials.map((material) => material.name)).toEqual(['HP Elite Tower 800 G9']);
  });
});
