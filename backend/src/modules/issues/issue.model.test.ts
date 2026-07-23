import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { IssueModel } from './issue.model.js';

const actorId = new Types.ObjectId();
const materialId = new Types.ObjectId();
const receiverId = new Types.ObjectId();

function baseIssue() {
  return {
    issueId: 'GEU-ISS-2026-000001',
    receiver: {
      receiverId,
      receiverCode: 'GEU-RCV-000001',
      fullName: 'Network Lab',
      type: 'DEPARTMENT',
      contact: '+91 99999 00000',
      email: 'network.lab@example.edu',
    },
    issuedBy: {
      userId: actorId,
      workerId: 'GEU-WRK-ABCD',
      name: 'Admin',
      role: 'ADMIN',
    },
    issuedAt: new Date('2026-07-16T06:30:00.000Z'),
    expectedReturnAt: new Date('2026-07-23T06:30:00.000Z'),
    duePreset: 'ONE_WEEK',
    status: 'ISSUED',
    lines: [
      {
        lineId: '84f9d1ad-70ad-4dad-8d7b-32174705654a',
        material: {
          materialId,
          materialCode: 'GEU-MAT-000001',
          name: 'Managed Switch',
          category: 'Networking',
          trackingMode: 'SERIALIZED',
          returnPolicy: 'REUSABLE',
        },
        issuedQuantity: 1,
        outstandingQuantity: 1,
        assets: [
          {
            assetUnitId: new Types.ObjectId(),
            assetTag: 'GEU-AST-000001',
            conditionAtIssue: 'Good',
            outstanding: true,
          },
        ],
      },
    ],
    returnEvents: [],
    totalIssuedQuantity: 1,
    totalOutstandingQuantity: 1,
    hasDamagedOutcome: false,
    hasLostOutcome: false,
    idempotencyKeyHash: 'a'.repeat(64),
    requestFingerprint: 'b'.repeat(64),
    createdByUserId: actorId,
  } as const;
}

describe('Issue persistence invariants', () => {
  it('accepts a valid outstanding serialized Issue', async () => {
    await expect(new IssueModel(baseIssue()).validate()).resolves.toBeUndefined();
  });

  it('accepts a return-by-date consumable Issue with outstanding quantity', async () => {
    const record = baseIssue() as unknown as Record<string, unknown> & {
      lines: Array<Record<string, unknown>>;
    };
    record.lines = [
      {
        lineId: '84f9d1ad-70ad-4dad-8d7b-32174705654a',
        material: {
          materialId,
          materialCode: 'GEU-MAT-000001',
          name: 'HDMI Cable',
          category: 'Accessories',
          trackingMode: 'QUANTITY',
          returnPolicy: 'CONSUMABLE',
          unitLabel: 'units',
        },
        issuedQuantity: 3,
        outstandingQuantity: 3,
        assets: [],
      },
    ];
    record.totalIssuedQuantity = 3;
    record.totalOutstandingQuantity = 3;

    await expect(new IssueModel(record).validate()).resolves.toBeUndefined();
  });

  it('rejects a permanent Issue with a fixed return date', async () => {
    const record = baseIssue() as unknown as Record<string, unknown>;
    record.assignmentType = 'LONG_TERM';

    await expect(new IssueModel(record).validate()).rejects.toThrow(
      'Permanent Issues cannot have a Return due time.',
    );
  });

  it('rejects partial Return evidence on an outstanding asset', async () => {
    const record = baseIssue() as unknown as ReturnType<typeof baseIssue> & {
      lines: Array<{
        assets: Array<{ returnDisposition?: string; returnedAt?: Date }>;
      }>;
    };
    record.lines[0]!.assets[0]!.returnDisposition = 'DAMAGED';

    await expect(new IssueModel(record).validate()).rejects.toThrow(
      'An outstanding asset cannot contain Return disposition or time.',
    );
  });

  it('rejects a Return event whose subtype evidence is incomplete', async () => {
    const record = baseIssue() as unknown as Record<string, unknown> & {
      lines: Array<Record<string, unknown>>;
      returnEvents: Array<Record<string, unknown>>;
    };
    record.status = 'RETURNED';
    record.totalOutstandingQuantity = 0;
    record.lines[0]!.outstandingQuantity = 0;
    record.lines[0]!.assets = [
      {
        assetUnitId: new Types.ObjectId(),
        assetTag: 'GEU-AST-000001',
        conditionAtIssue: 'Good',
        outstanding: false,
        returnDisposition: 'AVAILABLE',
        returnedAt: new Date('2026-07-17T06:30:00.000Z'),
      },
    ];
    record.returnEvents = [
      {
        returnEventId: '35e246ca-8ea1-4b97-840b-6458e24923be',
        issueId: 'GEU-ISS-2026-000001',
        returnedAt: new Date('2026-07-17T06:30:00.000Z'),
        performedBy: record.issuedBy,
        items: [
          {
            trackingMode: 'SERIALIZED',
            lineId: '84f9d1ad-70ad-4dad-8d7b-32174705654a',
            materialCode: 'GEU-MAT-000001',
            materialName: 'Managed Switch',
          },
        ],
        remainingOutstandingQuantity: 0,
        resultingIssueStatus: 'RETURNED',
        completedIssue: true,
        idempotencyKeyHash: 'c'.repeat(64),
        requestFingerprint: 'd'.repeat(64),
      },
    ];

    await expect(new IssueModel(record).validate()).rejects.toThrow(
      'A serialized Return item requires asset tag, disposition, and condition.',
    );
  });
});
