import { describe, expect, it } from 'vitest';

import { CreateIssueRequestSchema } from './issues.js';
import { DEFAULT_WORKER_PERMISSIONS, WorkerPermissionSchema } from './workers.js';

const line = { trackingMode: 'QUANTITY', materialCode: 'GEU-2026-000001', quantity: 2 } as const;

describe('lab Issue contract', () => {
  it('requires a registered lab (receiverCode) and allows both permanent and timed lab Issues', () => {
    const base = {
      issueTarget: 'LAB',
      lines: [line],
      destinationLocation: 'CSIT Lab 3',
    } as const;
    expect(
      CreateIssueRequestSchema.safeParse({
        ...base,
        assignmentType: 'LONG_TERM',
        receiverCode: 'GEU-RCV-000012',
      }).success,
    ).toBe(true);
    expect(
      CreateIssueRequestSchema.safeParse({
        ...base,
        assignmentType: 'SHORT_TERM',
        due: { preset: 'ONE_WEEK' },
        receiverCode: 'GEU-RCV-000012',
      }).success,
    ).toBe(true);
    expect(
      CreateIssueRequestSchema.safeParse({
        ...base,
        assignmentType: 'LONG_TERM',
        receiver: { fullName: 'CSIT Lab 3', type: 'FACULTY' },
      }).success,
    ).toBe(false);
  });

  it('does not let a typed-in Receiver be a lab', () => {
    expect(
      CreateIssueRequestSchema.safeParse({
        assignmentType: 'LONG_TERM',
        lines: [line],
        destinationLocation: 'CSIT Lab 3',
        receiver: { fullName: 'CSIT Lab 3', type: 'LAB' },
      }).success,
    ).toBe(false);
  });

  it('keeps the lab permission out of the default Worker permissions', () => {
    expect(WorkerPermissionSchema.options).toContain('LAB_ISSUE_CREATE');
    expect(DEFAULT_WORKER_PERMISSIONS).not.toContain('LAB_ISSUE_CREATE');
    expect(DEFAULT_WORKER_PERMISSIONS).toContain('ASSIGNMENTS_CREATE');
  });
});
