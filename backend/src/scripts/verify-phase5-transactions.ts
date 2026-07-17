import assert from 'node:assert/strict';

import mongoose from 'mongoose';

import { IssueSchema, IssueSummarySchema } from '@assetdesk/contracts';

import { env } from '../config/env.js';
import { ensureDatabaseIndexes } from '../db/mongoose.js';
import { AppError } from '../middleware/error-handler.js';
import { AuditEventModel } from '../modules/audit/audit-event.model.js';
import { listAuditEvents } from '../modules/audit/audit-read.service.js';
import { getAdminDashboard } from '../modules/dashboard/dashboard.service.js';
import { AssetUnitModel } from '../modules/inventory/asset-unit.model.js';
import { MaterialModel } from '../modules/inventory/material.model.js';
import { fingerprintRequest, hashIdempotencyKey } from '../modules/issues/idempotency.js';
import { IssueSequenceModel } from '../modules/issues/issue-sequence.model.js';
import { IssueModel } from '../modules/issues/issue.model.js';
import { EmailJobModel } from '../modules/notifications/email-job.model.js';
import {
  createIssue,
  listIssues,
  searchReturnableIssues,
} from '../modules/issues/issue.service.js';
import { ReceiverModel } from '../modules/receivers/receiver.model.js';
import { ReceiverSequenceModel } from '../modules/receivers/receiver-sequence.model.js';
import { ReminderModel } from '../modules/reminders/reminder.model.js';
import {
  createReminder,
  listIssueReminders,
  listOverdueIssues,
} from '../modules/reminders/reminder.service.js';
import { exportIssueReport, previewIssueReport } from '../modules/reports/report.service.js';
import { listReturnEvents, recordReturn } from '../modules/returns/return.service.js';
import { UserModel } from '../modules/users/user.model.js';

const databaseName = `ad_p5_${Date.now().toString(36)}`;

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await run();
    assert.fail(`Expected ${code}.`);
  } catch (error) {
    assert(error instanceof AppError);
    assert.equal(error.code, code);
  }
}

function istDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  assert(year && month && day);
  return `${year}-${month}-${day}`;
}

await mongoose.connect(env.MONGODB_URI, {
  dbName: databaseName,
  serverSelectionTimeoutMS: 15_000,
  maxPoolSize: 10,
});

try {
  await Promise.all([
    UserModel.init(),
    ReceiverModel.init(),
    MaterialModel.init(),
    AssetUnitModel.init(),
    IssueSequenceModel.init(),
    IssueModel.init(),
    AuditEventModel.init(),
    ReminderModel.init(),
  ]);
  await ensureDatabaseIndexes();

  const [admin, worker] = await UserModel.create([
    {
      workerId: 'GEU-WRK-ABCD',
      name: 'Verification Admin',
      email: 'verification.admin@example.edu',
      emailNormalized: 'verification.admin@example.edu',
      role: 'ADMIN',
      status: 'ACTIVE',
      invitationStatus: 'SENT',
      passwordHash: 'not-used-by-verification',
      mustChangePassword: false,
      authVersion: 1,
      failedLoginCount: 0,
    },
    {
      workerId: 'GEU-WRK-EFGH',
      name: 'Verification Worker',
      email: 'verification.worker@example.edu',
      emailNormalized: 'verification.worker@example.edu',
      role: 'WORKER',
      status: 'ACTIVE',
      invitationStatus: 'SENT',
      passwordHash: 'not-used-by-verification',
      mustChangePassword: false,
      authVersion: 1,
      failedLoginCount: 0,
    },
  ]);
  assert(admin && worker);

  await ReceiverModel.create({
    receiverCode: 'GEU-RCV-000001',
    fullName: 'Verification Lab',
    fullNameNormalized: 'VERIFICATION LAB',
    universityId: 'VERIFY-01',
    universityIdNormalized: 'VERIFY-01',
    type: 'DEPARTMENT',
    department: 'IT',
    departmentNormalized: 'IT',
    contact: '+91 99999 00000',
    contactNormalized: '919999900000',
    email: 'verification.lab@example.edu',
    emailNormalized: 'verification.lab@example.edu',
    status: 'ACTIVE',
    createdBy: admin._id,
    updatedBy: admin._id,
  });

  const [reusable, consumable, serialized] = await MaterialModel.create([
    {
      materialCode: 'GEU-MAT-000001',
      name: 'Reusable Cable',
      category: 'Networking',
      trackingMode: 'QUANTITY',
      returnPolicy: 'REUSABLE',
      status: 'ACTIVE',
      totalQuantity: 10,
      availableQuantity: 10,
      issuedQuantity: 0,
      unitLabel: 'piece',
      createdBy: admin._id,
    },
    {
      materialCode: 'GEU-MAT-000002',
      name: 'Cable Tie',
      category: 'Consumables',
      trackingMode: 'QUANTITY',
      returnPolicy: 'CONSUMABLE',
      status: 'ACTIVE',
      totalQuantity: 5,
      availableQuantity: 5,
      issuedQuantity: 0,
      unitLabel: 'piece',
      createdBy: admin._id,
    },
    {
      materialCode: 'GEU-MAT-000003',
      name: 'Managed Switch',
      category: 'Networking',
      trackingMode: 'SERIALIZED',
      returnPolicy: 'REUSABLE',
      status: 'ACTIVE',
      totalQuantity: 1,
      availableQuantity: 1,
      issuedQuantity: 0,
      createdBy: admin._id,
    },
  ]);
  assert(reusable && consumable && serialized);

  await AssetUnitModel.create({
    assetTag: 'GEU-AST-000001',
    materialId: serialized._id,
    materialCode: serialized.materialCode,
    serialNumber: 'VERIFY-SWITCH-1',
    serialNumberNormalized: 'VERIFY-SWITCH-1',
    condition: 'Good',
    status: 'AVAILABLE',
    createdBy: admin._id,
  });
  await ReceiverSequenceModel.create({ _id: 'RECEIVER', sequence: 1 });

  const issueInput = {
    receiverCode: 'GEU-RCV-000001' as const,
    lines: [
      {
        trackingMode: 'QUANTITY' as const,
        materialCode: 'GEU-MAT-000001' as const,
        quantity: 3,
      },
      {
        trackingMode: 'QUANTITY' as const,
        materialCode: 'GEU-MAT-000002' as const,
        quantity: 1,
      },
      {
        trackingMode: 'SERIALIZED' as const,
        materialCode: 'GEU-MAT-000003' as const,
        assetTags: ['GEU-AST-000001' as const],
      },
    ],
    due: { preset: 'ONE_WEEK' as const },
  };
  const adminActor = {
    userId: admin._id.toString(),
    workerId: admin.workerId,
    role: admin.role,
    requestId: 'phase5-verification-issue',
  };
  const issueKey = hashIdempotencyKey('phase5-verification-issue-key');
  const issueFingerprint = fingerprintRequest(issueInput);
  const created = await createIssue(issueInput, adminActor, issueKey, issueFingerprint);
  assert.equal(created.idempotentReplay, false);
  assert.equal(created.issue.totalIssuedQuantity, 5);
  assert.equal(created.issue.totalOutstandingQuantity, 4);
  IssueSchema.parse(created.issue);

  const replay = await createIssue(issueInput, adminActor, issueKey, issueFingerprint);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.issue.issueId, created.issue.issueId);
  assert.equal(await IssueModel.countDocuments(), 1);

  const issueList = await listIssues({
    page: 1,
    pageSize: 20,
    actorUserId: admin._id.toString(),
    actorRole: 'ADMIN',
  });
  assert.equal(issueList.total, 1);
  IssueSummarySchema.parse(issueList.issues[0]);

  const exactLookup = await searchReturnableIssues({
    page: 1,
    pageSize: 20,
    search: 'GEU-AST-000001',
    actorRole: 'WORKER',
  });
  assert.equal(exactLookup.total, 1);
  await expectCode(
    () =>
      searchReturnableIssues({
        page: 1,
        pageSize: 20,
        search: 'GE',
        actorRole: 'WORKER',
      }),
    'RETURN_LOOKUP_IDENTIFIER_REQUIRED',
  );

  const quantityLine = created.issue.lines.find(
    (line) => line.material.materialCode === reusable.materialCode,
  );
  const serializedLine = created.issue.lines.find(
    (line) => line.material.materialCode === serialized.materialCode,
  );
  assert(quantityLine && serializedLine);
  const workerActor = {
    userId: worker._id.toString(),
    workerId: worker.workerId,
    role: worker.role,
    requestId: 'phase5-verification-return',
  };

  await expectCode(
    () =>
      recordReturn(
        created.issue.issueId,
        { items: [{ trackingMode: 'QUANTITY', lineId: quantityLine.lineId, quantity: 4 }] },
        workerActor,
        {
          keyHash: hashIdempotencyKey('phase5-verification-overreturn'),
          requestFingerprint: fingerprintRequest({ quantity: 4 }),
        },
      ),
    'RETURN_QUANTITY_EXCEEDS_OUTSTANDING',
  );

  const partialInput = {
    items: [{ trackingMode: 'QUANTITY' as const, lineId: quantityLine.lineId, quantity: 1 }],
  };
  const partialFingerprint = fingerprintRequest(partialInput);
  const partial = await recordReturn(created.issue.issueId, partialInput, workerActor, {
    keyHash: hashIdempotencyKey('phase5-verification-return-01'),
    requestFingerprint: partialFingerprint,
  });
  assert.equal(partial.issue.status, 'PARTIALLY_RETURNED');
  assert.equal(partial.issue.totalOutstandingQuantity, 3);
  const partialReplay = await recordReturn(created.issue.issueId, partialInput, workerActor, {
    keyHash: hashIdempotencyKey('phase5-verification-return-01'),
    requestFingerprint: partialFingerprint,
  });
  assert.equal(partialReplay.idempotentReplay, true);

  const completed = await recordReturn(
    created.issue.issueId,
    {
      items: [
        { trackingMode: 'QUANTITY', lineId: quantityLine.lineId, quantity: 2 },
        {
          trackingMode: 'SERIALIZED',
          lineId: serializedLine.lineId,
          assetTag: 'GEU-AST-000001',
          disposition: 'UNDER_REPAIR',
          condition: 'Port requires inspection',
        },
      ],
    },
    workerActor,
    {
      keyHash: hashIdempotencyKey('phase5-verification-return-02'),
      requestFingerprint: fingerprintRequest({ completion: true }),
    },
  );
  assert.equal(completed.issue.status, 'DAMAGED');
  assert.equal(completed.issue.totalOutstandingQuantity, 0);
  IssueSchema.parse(completed.issue);

  const [reusableAfter, consumableAfter, serializedAfter, assetAfter] = await Promise.all([
    MaterialModel.findById(reusable._id).orFail(),
    MaterialModel.findById(consumable._id).orFail(),
    MaterialModel.findById(serialized._id).orFail(),
    AssetUnitModel.findOne({ assetTag: 'GEU-AST-000001' }).orFail(),
  ]);
  assert.deepEqual(
    [reusableAfter.totalQuantity, reusableAfter.availableQuantity, reusableAfter.issuedQuantity],
    [10, 10, 0],
  );
  assert.deepEqual(
    [
      consumableAfter.totalQuantity,
      consumableAfter.availableQuantity,
      consumableAfter.issuedQuantity,
    ],
    [4, 4, 0],
  );
  assert.deepEqual(
    [
      serializedAfter.totalQuantity,
      serializedAfter.availableQuantity,
      serializedAfter.issuedQuantity,
    ],
    [1, 0, 0],
  );
  assert.equal(assetAfter.status, 'UNDER_REPAIR');
  assert.equal(await AuditEventModel.countDocuments({ action: 'ISSUE_CREATED' }), 1);
  assert.equal(await AuditEventModel.countDocuments({ action: 'RETURN_RECORDED' }), 2);

  const concurrentInput = {
    receiverCode: 'GEU-RCV-000001' as const,
    lines: [
      {
        trackingMode: 'QUANTITY' as const,
        materialCode: 'GEU-MAT-000002' as const,
        quantity: 1,
      },
    ],
  };
  const concurrentKey = hashIdempotencyKey('phase5-verification-concurrent');
  const concurrentFingerprint = fingerprintRequest(concurrentInput);
  const concurrent = await Promise.all([
    createIssue(concurrentInput, adminActor, concurrentKey, concurrentFingerprint),
    createIssue(concurrentInput, adminActor, concurrentKey, concurrentFingerprint),
  ]);
  assert.equal(new Set(concurrent.map((result) => result.issue.issueId)).size, 1);
  assert.equal(concurrent.filter((result) => result.idempotentReplay).length, 1);
  assert.equal(await IssueModel.countDocuments(), 2);
  assert.equal(await EmailJobModel.countDocuments(), 10);
  assert.equal(await EmailJobModel.countDocuments({ status: 'QUEUED' }), 10);
  assert.equal(await EmailJobModel.countDocuments({ eventType: 'MATERIAL_ISSUED' }), 4);
  assert.equal(await EmailJobModel.countDocuments({ eventType: 'MATERIAL_RETURNED' }), 6);
  assert.equal((await EmailJobModel.distinct('eventKey')).length, 10);

  const materialCountBeforeDirectIssue = await MaterialModel.countDocuments();
  const directInput = {
    mode: 'DIRECT' as const,
    receiver: {
      fullName: 'Direct Verification Receiver',
      email: 'direct.receiver@example.edu',
      contact: '9876543210',
      type: 'STAFF' as const,
      department: 'Server Room',
    },
    lines: [
      { name: 'Temporary test device', description: 'Serial DIRECT-001', quantity: 1 },
      { name: 'Patch cable bundle', quantity: 2 },
    ],
    due: { preset: 'ONE_WEEK' as const },
  };
  const directCreated = await createIssue(
    directInput,
    adminActor,
    hashIdempotencyKey('phase-direct-verification-issue'),
    fingerprintRequest(directInput),
  );
  assert.equal(directCreated.issue.totalIssuedQuantity, 3);
  assert.equal(
    directCreated.issue.lines.every((line) => line.material.source === 'DIRECT'),
    true,
  );
  assert.equal(await MaterialModel.countDocuments(), materialCountBeforeDirectIssue);
  const directLine = directCreated.issue.lines[0];
  assert(directLine);
  const directReturnInput = {
    items: [{ trackingMode: 'QUANTITY' as const, lineId: directLine.lineId, quantity: 1 }],
  };
  const directReturn = await recordReturn(
    directCreated.issue.issueId,
    directReturnInput,
    adminActor,
    {
      keyHash: hashIdempotencyKey('phase-direct-verification-return'),
      requestFingerprint: fingerprintRequest(directReturnInput),
    },
  );
  assert.equal(directReturn.issue.totalOutstandingQuantity, 2);
  assert.equal(await MaterialModel.countDocuments(), materialCountBeforeDirectIssue);
  assert.equal(
    await ReceiverModel.countDocuments({ emailNormalized: 'direct.receiver@example.edu' }),
    1,
  );
  assert.equal(await EmailJobModel.countDocuments(), 14);

  const dashboard = await getAdminDashboard();
  assert.equal(dashboard.stats.todayIssued, 3);
  assert.equal(dashboard.stats.totalIssues, 3);
  assert.equal(dashboard.stats.pendingReturns, 1);
  assert.equal(dashboard.stats.overdueReturns, 0);
  assert.equal(dashboard.stats.dueToday, 0);
  assert.equal(dashboard.stats.returnedToday, 3);
  assert.equal(dashboard.stats.outstandingItems, 2);
  assert.equal(dashboard.stats.activeWorkers, 1);
  assert.equal(dashboard.attentionIssues.length, 0);
  assert.equal(dashboard.recentIssues.length, 3);
  const pendingIssues = await listIssues({
    page: 1,
    pageSize: 20,
    actorUserId: admin._id.toString(),
    actorRole: 'ADMIN',
    returnState: 'PENDING',
  });
  const todayIssues = await listIssues({
    page: 1,
    pageSize: 20,
    actorUserId: admin._id.toString(),
    actorRole: 'ADMIN',
    period: 'TODAY',
  });
  const todayReturns = await listReturnEvents({
    page: 1,
    pageSize: 20,
    actorUserId: admin._id.toString(),
    role: 'ADMIN',
    period: 'TODAY',
  });
  assert.equal(pendingIssues.total, 1);
  assert.equal(todayIssues.total, 3);
  assert.equal(todayReturns.total, 3);

  const overdueAt = new Date(Date.now() - 2 * 86_400_000);
  await IssueModel.collection.updateOne(
    { issueId: directCreated.issue.issueId },
    { $set: { expectedReturnAt: overdueAt } },
  );
  const overdueBeforeReminder = await listOverdueIssues({ page: 1, pageSize: 20 });
  assert.equal(overdueBeforeReminder.total, 1);
  assert.equal(overdueBeforeReminder.issues[0]?.issueId, directCreated.issue.issueId);
  assert.equal(overdueBeforeReminder.issues[0]?.reminderCount, 0);
  assert((overdueBeforeReminder.issues[0]?.overdueMinutes ?? 0) >= 2_880);

  const reminderFingerprint = fingerprintRequest({
    operation: 'RETURN_REMINDER_V1',
    issueId: directCreated.issue.issueId,
    actorUserId: admin._id.toString(),
  });
  const reminderKey = hashIdempotencyKey('phase7-verification-reminder');
  const reminder = await createReminder(
    directCreated.issue.issueId,
    { ...adminActor, requestId: 'phase7-verification-reminder' },
    reminderKey,
    reminderFingerprint,
  );
  assert.equal(reminder.idempotentReplay, false);
  assert.equal(reminder.reminder.issueId, directCreated.issue.issueId);
  assert.equal(reminder.reminder.notificationCount, 1);
  assert.equal(await ReminderModel.countDocuments(), 1);
  assert.equal(await EmailJobModel.countDocuments(), 15);
  assert.equal(await EmailJobModel.countDocuments({ eventType: 'RETURN_REMINDER' }), 1);
  assert.equal(await AuditEventModel.countDocuments({ action: 'RETURN_REMINDER_SENT' }), 1);

  const reminderReplay = await createReminder(
    directCreated.issue.issueId,
    { ...adminActor, requestId: 'phase7-verification-reminder-replay' },
    reminderKey,
    reminderFingerprint,
  );
  assert.equal(reminderReplay.idempotentReplay, true);
  assert.equal(reminderReplay.reminder.reminderId, reminder.reminder.reminderId);
  assert.equal(await ReminderModel.countDocuments(), 1);
  assert.equal(await EmailJobModel.countDocuments({ eventType: 'RETURN_REMINDER' }), 1);

  await expectCode(
    () =>
      createReminder(
        directCreated.issue.issueId,
        { ...adminActor, requestId: 'phase7-verification-reminder-cooldown' },
        hashIdempotencyKey('phase7-verification-reminder-new-request'),
        reminderFingerprint,
      ),
    'REMINDER_COOLDOWN_ACTIVE',
  );
  assert.equal((await listIssueReminders(directCreated.issue.issueId)).length, 1);

  const overdueAfterReminder = await listOverdueIssues({ page: 1, pageSize: 20 });
  assert.equal(overdueAfterReminder.issues[0]?.reminderCount, 1);
  assert(overdueAfterReminder.issues[0]?.lastReminderAt);
  const overdueDashboard = await getAdminDashboard();
  assert.equal(overdueDashboard.stats.pendingReturns, 1);
  assert.equal(overdueDashboard.stats.overdueReturns, 1);
  assert.equal(overdueDashboard.attentionIssues[0]?.issueId, directCreated.issue.issueId);

  const auditEvidence = await listAuditEvents({
    page: 1,
    pageSize: 20,
    from: new Date(Date.now() - 86_400_000),
    to: new Date(Date.now() + 86_400_000),
    action: 'RETURN_REMINDER_SENT',
  });
  assert.equal(auditEvidence.total, 1);
  assert.equal(auditEvidence.events[0]?.targetId, directCreated.issue.issueId);
  assert.equal(auditEvidence.events[0]?.metadata?.reminderId, reminder.reminder.reminderId);

  const reportDate = istDate(new Date(directCreated.issue.issuedAt));
  const reportFilters = {
    issuedFrom: reportDate,
    issuedThrough: reportDate,
    returnState: 'OVERDUE' as const,
  };
  const reportPreview = await previewIssueReport(reportFilters, 1, 20);
  assert.equal(reportPreview.total, 1);
  assert.equal(reportPreview.rows[0]?.issueId, directCreated.issue.issueId);
  assert.equal(reportPreview.rows[0]?.totalOutstandingQuantity, 2);
  const reportExport = await exportIssueReport(reportFilters);
  assert.equal(reportExport.rowCount, 1);
  assert(reportExport.csv.includes('"Issue ID","Status","Issued at (IST)"'));
  assert(reportExport.csv.includes(directCreated.issue.issueId));
  assert(!reportExport.csv.includes('direct.receiver@example.edu'));
  assert(!reportExport.csv.includes('9876543210'));

  console.log('phase5-transaction-verification-ok');
  console.log('phase6-outbox-verification-ok');
  console.log('direct-issue-verification-ok');
  console.log('admin-dashboard-verification-ok');
  console.log('phase7-operations-verification-ok');
} finally {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
