import { Types, type ClientSession, type QueryFilter } from 'mongoose';

import type {
  CreateReceiverRequest,
  Receiver,
  ReceiverStatus,
  ReceiverType,
  UpdateReceiverRequest,
} from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import { IssueModel } from '../issues/issue.model.js';
import { allocateReceiverCode } from './receiver-code.js';
import { toReceiver } from './receiver.mapper.js';
import { ReceiverModel, type ReceiverRecord } from './receiver.model.js';
import {
  escapeSearchRegex,
  normalizeContactSearch,
  normalizeDisplayText,
  normalizeEmail,
  normalizeSearchText,
  normalizeUniversityId,
} from './receiver.normalization.js';

const MAX_CODE_ALLOCATION_ATTEMPTS = 32;

interface DuplicateKeyError {
  code?: unknown;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
}

export interface ReceiverListInput {
  page: number;
  pageSize: number;
  activeOnly: boolean;
  search?: string;
  status?: ReceiverStatus;
  type?: ReceiverType;
  department?: string;
}

export interface ReceiverListResult {
  receivers: Receiver[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function duplicateField(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const duplicate = error as DuplicateKeyError;
  if (duplicate.code !== 11_000) return undefined;
  return Object.keys(duplicate.keyPattern ?? duplicate.keyValue ?? {})[0];
}

function emailConflict(): AppError {
  return new AppError(409, 'RECEIVER_EMAIL_EXISTS', 'A Receiver with this email already exists.', {
    email: 'Use a different email address.',
  });
}

function universityIdConflict(): AppError {
  return new AppError(
    409,
    'RECEIVER_UNIVERSITY_ID_EXISTS',
    'A Receiver with this university ID already exists.',
    { universityId: 'Use a different university ID.' },
  );
}

export function conflictFromReceiverDuplicate(error: unknown): AppError | null {
  const field = duplicateField(error);
  if (field === 'emailNormalized') return emailConflict();
  if (field === 'universityIdNormalized') return universityIdConflict();
  return null;
}

async function assertUniqueIdentity(
  emailNormalized: string,
  universityIdNormalized?: string,
  excludeId?: Types.ObjectId,
): Promise<void> {
  const excluding = excludeId ? { _id: { $ne: excludeId } } : {};
  const [emailExists, universityIdExists] = await Promise.all([
    ReceiverModel.exists({ ...excluding, emailNormalized }),
    universityIdNormalized
      ? ReceiverModel.exists({ ...excluding, universityIdNormalized })
      : Promise.resolve(null),
  ]);

  if (emailExists) throw emailConflict();
  if (universityIdExists) throw universityIdConflict();
}

function objectId(value: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) {
    throw new TypeError('Invalid Receiver actor user ID.');
  }
  return new Types.ObjectId(value);
}

export function createRecordInput(input: CreateReceiverRequest, actorUserId: Types.ObjectId) {
  const fullName = normalizeDisplayText(input.fullName);
  const universityId = input.universityId ? normalizeDisplayText(input.universityId) : undefined;
  const department = input.department ? normalizeDisplayText(input.department) : undefined;
  const contact = normalizeDisplayText(input.contact);
  const email = normalizeEmail(input.email);

  return {
    fullName,
    fullNameNormalized: normalizeSearchText(fullName),
    ...(universityId
      ? { universityId, universityIdNormalized: normalizeUniversityId(universityId) }
      : {}),
    type: input.type,
    ...(department ? { department, departmentNormalized: normalizeSearchText(department) } : {}),
    contact,
    contactNormalized: normalizeContactSearch(contact),
    email,
    emailNormalized: email,
    status: 'ACTIVE' as const,
    createdBy: actorUserId,
    updatedBy: actorUserId,
  };
}

export function buildReceiverListFilter(
  input: Pick<ReceiverListInput, 'activeOnly' | 'search' | 'status' | 'type' | 'department'>,
): QueryFilter<ReceiverRecord> {
  const filter: QueryFilter<ReceiverRecord> = {};
  if (input.activeOnly) filter.status = 'ACTIVE';
  else if (input.status) filter.status = input.status;
  if (input.type) filter.type = input.type;
  if (input.department) filter.departmentNormalized = normalizeSearchText(input.department);

  if (input.search) {
    const normalized = normalizeSearchText(input.search);
    const textSearch = new RegExp(escapeSearchRegex(normalized), 'i');
    const contact = normalizeContactSearch(input.search);
    const alternatives: QueryFilter<ReceiverRecord>[] = [
      { receiverCode: textSearch },
      { universityIdNormalized: textSearch },
      { fullNameNormalized: textSearch },
      { emailNormalized: textSearch },
    ];
    if (contact) alternatives.push({ contactNormalized: new RegExp(escapeSearchRegex(contact)) });
    filter.$or = alternatives;
  }

  return filter;
}

async function findReceiverRecord(receiverCode: string, activeOnly = false) {
  const receiver = await ReceiverModel.findOne({
    receiverCode,
    ...(activeOnly ? { status: 'ACTIVE' } : {}),
  });
  if (!receiver) throw new AppError(404, 'RECEIVER_NOT_FOUND', 'This Receiver was not found.');
  return receiver;
}

export async function createReceiver(
  input: CreateReceiverRequest,
  createdByUserId: string,
): Promise<Receiver> {
  const values = createRecordInput(input, objectId(createdByUserId));
  await assertUniqueIdentity(values.emailNormalized, values.universityIdNormalized);

  for (let attempt = 0; attempt < MAX_CODE_ALLOCATION_ATTEMPTS; attempt += 1) {
    const receiverCode = await allocateReceiverCode();
    try {
      return toReceiver(await ReceiverModel.create({ receiverCode, ...values }));
    } catch (error) {
      const conflict = conflictFromReceiverDuplicate(error);
      if (conflict) throw conflict;
      if (duplicateField(error) === 'receiverCode') continue;
      throw error;
    }
  }

  throw new AppError(
    503,
    'RECEIVER_CODE_UNAVAILABLE',
    'A unique Receiver code could not be allocated. Try again.',
  );
}

export async function findOrCreateReceiverForIssue(
  input: CreateReceiverRequest,
  actorUserId: string,
  session?: ClientSession,
): Promise<ReceiverRecord> {
  const values = createRecordInput(input, objectId(actorUserId));
  const identityFilter: QueryFilter<ReceiverRecord> = {
    $or: [
      { emailNormalized: values.emailNormalized },
      ...(values.universityIdNormalized
        ? [{ universityIdNormalized: values.universityIdNormalized }]
        : []),
    ],
  };
  const existing = await ReceiverModel.findOneAndUpdate(
    identityFilter,
    {
      $set: {
        status: 'ACTIVE',
        fullName: values.fullName,
        fullNameNormalized: values.fullNameNormalized,
        type: values.type,
        contact: values.contact,
        contactNormalized: values.contactNormalized,
        email: values.email,
        emailNormalized: values.emailNormalized,
        updatedBy: values.updatedBy,
        ...(values.universityId
          ? {
              universityId: values.universityId,
              universityIdNormalized: values.universityIdNormalized,
            }
          : {}),
        ...(values.department
          ? {
              department: values.department,
              departmentNormalized: values.departmentNormalized,
            }
          : {}),
      },
      $inc: { operationalUseCount: 1 },
    },
    { returnDocument: 'after', ...(session ? { session } : {}), timestamps: false },
  );
  if (existing) return existing;

  for (let attempt = 0; attempt < MAX_CODE_ALLOCATION_ATTEMPTS; attempt += 1) {
    const receiverCode = await allocateReceiverCode();
    try {
      const created = await ReceiverModel.create(
        [{ receiverCode, ...values, operationalUseCount: 1 }],
        session ? { session } : undefined,
      );
      const receiver = created[0];
      if (!receiver) throw new Error('Receiver insert returned no document.');
      return receiver;
    } catch (error) {
      const conflict = conflictFromReceiverDuplicate(error);
      if (conflict) {
        const retry = await ReceiverModel.findOneAndUpdate(
          identityFilter,
          { $set: { status: 'ACTIVE', updatedBy: values.updatedBy }, $inc: { operationalUseCount: 1 } },
          { returnDocument: 'after', ...(session ? { session } : {}), timestamps: false },
        );
        if (retry) return retry;
        throw conflict;
      }
      if (duplicateField(error) === 'receiverCode') continue;
      throw error;
    }
  }

  throw new AppError(
    503,
    'RECEIVER_CODE_UNAVAILABLE',
    'A unique Receiver code could not be allocated. Try again.',
  );
}

export async function listReceivers(input: ReceiverListInput): Promise<ReceiverListResult> {
  const filter = buildReceiverListFilter(input);
  const skip = (input.page - 1) * input.pageSize;
  const [records, total] = await Promise.all([
    ReceiverModel.find(filter)
      .sort({ fullNameNormalized: 1, receiverCode: 1 })
      .skip(skip)
      .limit(input.pageSize),
    ReceiverModel.countDocuments(filter),
  ]);

  return {
    receivers: records.map((record) => toReceiver(record)),
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
}

export async function getReceiver(receiverCode: string, activeOnly = false): Promise<Receiver> {
  return toReceiver(await findReceiverRecord(receiverCode, activeOnly));
}

export async function updateReceiver(
  receiverCode: string,
  input: UpdateReceiverRequest,
  updatedByUserId: string,
): Promise<Receiver> {
  const receiver = await findReceiverRecord(receiverCode);

  if (input.fullName !== undefined) {
    receiver.fullName = normalizeDisplayText(input.fullName);
    receiver.fullNameNormalized = normalizeSearchText(receiver.fullName);
  }
  if (Object.hasOwn(input, 'universityId')) {
    if (input.universityId) {
      receiver.universityId = normalizeDisplayText(input.universityId);
      receiver.universityIdNormalized = normalizeUniversityId(receiver.universityId);
    } else {
      receiver.set('universityId', undefined);
      receiver.set('universityIdNormalized', undefined);
    }
  }
  if (input.type !== undefined) receiver.type = input.type;
  if (Object.hasOwn(input, 'department')) {
    if (input.department) {
      receiver.department = normalizeDisplayText(input.department);
      receiver.departmentNormalized = normalizeSearchText(receiver.department);
    } else {
      receiver.set('department', undefined);
      receiver.set('departmentNormalized', undefined);
    }
  }
  if (input.contact !== undefined) {
    receiver.contact = normalizeDisplayText(input.contact);
    receiver.contactNormalized = normalizeContactSearch(receiver.contact);
  }
  if (input.email !== undefined) {
    receiver.email = normalizeEmail(input.email);
    receiver.emailNormalized = receiver.email;
  }
  receiver.updatedBy = objectId(updatedByUserId);

  await assertUniqueIdentity(
    receiver.emailNormalized,
    receiver.universityIdNormalized,
    receiver._id,
  );

  try {
    await receiver.save();
  } catch (error) {
    const conflict = conflictFromReceiverDuplicate(error);
    if (conflict) throw conflict;
    throw error;
  }

  return toReceiver(receiver);
}

export async function updateReceiverStatus(
  receiverCode: string,
  status: ReceiverStatus,
  updatedByUserId: string,
): Promise<{ receiver: Receiver; previousStatus: ReceiverStatus }> {
  const receiver = await findReceiverRecord(receiverCode);
  const previousStatus = receiver.status;
  if (status !== previousStatus) {
    receiver.status = status;
    receiver.updatedBy = objectId(updatedByUserId);
    await receiver.save();
  }
  return { receiver: toReceiver(receiver), previousStatus };
}

export async function deleteReceiver(receiverCode: string): Promise<Receiver> {
  const receiver = await findReceiverRecord(receiverCode);
  const hasIssueHistory = await IssueModel.exists({
    'receiver.receiverCode': receiver.receiverCode,
  });
  if (hasIssueHistory) {
    throw new AppError(
      409,
      'RECEIVER_HAS_ISSUE_HISTORY',
      'This Receiver has Issue history. Mark it inactive instead of deleting it.',
    );
  }
  const deleted = toReceiver(receiver);
  await ReceiverModel.deleteOne({ _id: receiver._id });
  return deleted;
}
