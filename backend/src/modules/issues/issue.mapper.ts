import type {
  Issue,
  IssueActorSnapshot,
  IssueLine,
  IssueSummary,
  ReturnEvent,
  ReturnableIssue,
} from '@assetdesk/contracts';

import type {
  IssueActorSnapshotRecord,
  IssueDocument,
  IssueLineRecord,
  ReturnEventRecord,
} from './issue.model.js';

export function toIssueActor(actor: IssueActorSnapshotRecord): IssueActorSnapshot {
  return {
    userId: actor.userId.toString(),
    workerId: actor.workerId,
    name: actor.name,
    role: actor.role,
  };
}

function toIssueLine(line: IssueLineRecord, outstandingOnly = false): IssueLine {
  return {
    lineId: line.lineId,
    material: {
      materialCode: line.material.materialCode,
      name: line.material.name,
      category: line.material.category,
      description: line.material.description ?? null,
      source: line.material.source ?? 'CATALOG',
      trackingMode: line.material.trackingMode,
      returnPolicy: line.material.returnPolicy,
      unitLabel: line.material.unitLabel ?? null,
    },
    issuedQuantity: line.issuedQuantity,
    outstandingQuantity: line.outstandingQuantity,
    assets: line.assets
      .filter((asset) => !outstandingOnly || asset.outstanding)
      .map((asset) => ({
        assetTag: asset.assetTag,
        serialNumber: asset.serialNumber ?? null,
        conditionAtIssue: asset.conditionAtIssue,
        outstanding: asset.outstanding,
        returnDisposition: asset.returnDisposition ?? null,
        returnedAt: asset.returnedAt?.toISOString() ?? null,
      })),
  };
}

export function toReturnEvent(event: ReturnEventRecord): ReturnEvent {
  return {
    returnEventId: event.returnEventId,
    issueId: event.issueId,
    returnedAt: event.returnedAt.toISOString(),
    performedBy: toIssueActor(event.performedBy),
    items: event.items.map((item) =>
      item.trackingMode === 'QUANTITY'
        ? {
            trackingMode: 'QUANTITY' as const,
            lineId: item.lineId,
            materialCode: item.materialCode,
            materialName: item.materialName,
            quantity: item.quantity,
            disposition: item.disposition,
            condition: item.condition,
          }
        : {
            trackingMode: 'SERIALIZED' as const,
            lineId: item.lineId,
            materialCode: item.materialCode,
            materialName: item.materialName,
            assetTag: item.assetTag,
            serialNumber: item.serialNumber ?? null,
            disposition: item.disposition,
            condition: item.condition,
          },
    ),
    notes: event.notes ?? null,
    remainingOutstandingQuantity: event.remainingOutstandingQuantity,
    resultingIssueStatus: event.resultingIssueStatus,
    completedIssue: event.completedIssue,
  };
}

function receiver(issue: IssueDocument) {
  return {
    receiverCode: issue.receiver.receiverCode,
    fullName: issue.receiver.fullName,
    universityId: issue.receiver.universityId ?? null,
    type: issue.receiver.type,
    department: issue.receiver.department ?? null,
    contact: issue.receiver.contact,
    email: issue.receiver.email,
  };
}

export function toIssue(issue: IssueDocument): Issue {
  return {
    id: issue._id.toString(),
    issueId: issue.issueId,
    receiver: receiver(issue),
    issuedBy: toIssueActor(issue.issuedBy),
    issuedAt: issue.issuedAt.toISOString(),
    expectedReturnAt: issue.expectedReturnAt?.toISOString() ?? null,
    duePreset: issue.duePreset ?? null,
    assignmentType: issue.assignmentType ?? 'SHORT_TERM',
    status: issue.status,
    purpose: issue.purpose ?? null,
    notes: issue.notes ?? null,
    lines: issue.lines.map((line) => toIssueLine(line)),
    returnEvents: issue.returnEvents.map((event) => toReturnEvent(event)),
    totalIssuedQuantity: issue.totalIssuedQuantity,
    totalOutstandingQuantity: issue.totalOutstandingQuantity,
    hasDamagedOutcome: issue.hasDamagedOutcome,
    hasLostOutcome: issue.hasLostOutcome,
    reminderCount: issue.reminderCount ?? 0,
    lastReminderAt: issue.lastReminderAt?.toISOString() ?? null,
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
  };
}

export function toIssueSummary(issue: IssueDocument): IssueSummary {
  return {
    id: issue._id.toString(),
    issueId: issue.issueId,
    receiver: receiver(issue),
    issuedBy: toIssueActor(issue.issuedBy),
    issuedAt: issue.issuedAt.toISOString(),
    expectedReturnAt: issue.expectedReturnAt?.toISOString() ?? null,
    duePreset: issue.duePreset ?? null,
    assignmentType: issue.assignmentType ?? 'SHORT_TERM',
    status: issue.status,
    purpose: issue.purpose ?? null,
    notes: issue.notes ?? null,
    totalIssuedQuantity: issue.totalIssuedQuantity,
    totalOutstandingQuantity: issue.totalOutstandingQuantity,
    hasDamagedOutcome: issue.hasDamagedOutcome,
    hasLostOutcome: issue.hasLostOutcome,
    reminderCount: issue.reminderCount ?? 0,
    lastReminderAt: issue.lastReminderAt?.toISOString() ?? null,
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
    materialNames: [...new Set(issue.lines.map((line) => line.material.name))],
  };
}

export function toReturnableIssue(issue: IssueDocument): ReturnableIssue {
  return {
    issueId: issue.issueId,
    receiver: receiver(issue),
    issuedBy: toIssueActor(issue.issuedBy),
    issuedAt: issue.issuedAt.toISOString(),
    expectedReturnAt: issue.expectedReturnAt?.toISOString() ?? null,
    duePreset: issue.duePreset ?? null,
    assignmentType: issue.assignmentType ?? 'SHORT_TERM',
    status: issue.status,
    lines: issue.lines
      .filter((line) => line.outstandingQuantity > 0)
      .map((line) => toIssueLine(line, true)),
    totalOutstandingQuantity: issue.totalOutstandingQuantity,
  };
}
