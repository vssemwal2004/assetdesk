import { describe, expect, it } from 'vitest';

import { toIssueSummary } from './issue.mapper.js';

describe('issue mapper', () => {
  it('keeps dashboard summaries readable for legacy issue rows with missing arrays', () => {
    const summary = toIssueSummary({
      _id: { toString: () => 'issue-object-id' },
      issueId: 'GEU-ISS-2026-000004',
      receiver: {
        receiverCode: 'GEU-RCV-000001',
        fullName: 'Asha Sharma',
        type: 'STAFF',
        contact: '9999999999',
        email: 'asha@example.edu',
      },
      issuedBy: {
        userId: { toString: () => 'user-object-id' },
        workerId: 'GEU-WRK-ADM2',
        name: 'AssetDesk Admin',
        role: 'ADMIN',
      },
      issuedAt: new Date('2026-07-23T06:30:00.000Z'),
      status: 'ISSUED',
      totalIssuedQuantity: 1,
      totalOutstandingQuantity: 1,
      hasDamagedOutcome: false,
      hasLostOutcome: false,
      createdAt: new Date('2026-07-23T06:30:00.000Z'),
      updatedAt: new Date('2026-07-23T06:30:00.000Z'),
    } as never);

    expect(summary).toMatchObject({
      issueId: 'GEU-ISS-2026-000004',
      materialNames: [],
      latestReturnEventId: null,
    });
  });
});
