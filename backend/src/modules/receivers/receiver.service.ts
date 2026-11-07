import { Types, type ClientSession, type QueryFilter } from 'mongoose';

import type {
  CreateIssueReceiverRequest,
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
  emailNormalized?: string,
  universityIdNormalized?: string,
  excludeId?: Types.ObjectId,
): Promise<void> {
  const excluding = excludeId ? { _id: { $ne: excludeId } } : {};
  const [emailExists, universityIdExists] = await Promise.all([
    emailNormalized ? ReceiverModel.exists({ ...excluding, emailNormalized }) : Promise.resolve(null),
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

export function createRecordInput(
  input: CreateReceiverRequest | CreateIssueReceiverRequest,
  actorUserId: Types.ObjectId,
) {
  const fullName = normalizeDisplayText(input.fullName);
  const department = input.department ? normalizeDisplayText(input.department) : undefined;
  const common = {
    fullName,
    fullNameNormalized: normalizeSearchText(fullName),
    ...(department ? { department, departmentNormalized: normalizeSearchText(department) } : {}),
    status: 'ACTIVE' as const,
    createdBy: actorUserId,
    updatedBy: actorUserId,
  };

  if (input.type === 'LAB') {
    // A lab is identified by its name; the in-charge's email and contact stay off the unique
    // identity indexes so one person can be responsible for several labs.
    return {
      ...common,
      type: 'LAB' as const,
      inChargeName: normalizeDisplayText(input.inChargeName),
      inChargeContact: normalizeDisplayText(input.inChargeContact),
      inChargeEmail: normalizeEmail(input.inChargeEmail),
    };
  }

  const universityId = input.universityId ? normalizeDisplayText(input.universityId) : undefined;
  const contact = input.contact ? normalizeDisplayText(input.contact) : undefined;
  const email = input.email ? normalizeEmail(input.email) : undefined;
  return {
    ...common,
    ...(universityId
      ? { universityId, universityIdNormalized: normalizeUniversityId(universityId) }
      : {}),
    type: input.type,
    ...(contact ? { contact, contactNormalized: normalizeContactSearch(contact) } : {}),
    ...(email ? { email, emailNormalized: email } : {}),
  };
}

async function assertUniqueLabName(fullNameNormalized: string, excludeId?: Types.ObjectId) {
  const exists = await ReceiverModel.exists({
    type: 'LAB',
    fullNameNormalized,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  });
  if (exists) {
    throw new AppError(409, 'RECEIVER_LAB_EXISTS', 'A lab with this name already exists.', {
      fullName: 'Use a different lab name.',
    });
  }
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
  if (values.type === 'LAB') await assertUniqueLabName(values.fullNameNormalized);
  else await assertUniqueIdentity(values.emailNormalized, values.universityIdNormalized);

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
  input: CreateIssueReceiverRequest,
  actorUserId: string,
  session?: ClientSession,
): Promise<ReceiverRecord> {
  const values = createRecordInput(input, objectId(actorUserId));
  if (values.type === 'LAB') {
    throw new AppError(422, 'ISSUE_LAB_NOT_REGISTERED', 'Choose a registered lab.');
  }
  const identityAlternatives: QueryFilter<ReceiverRecord>[] = [
    ...(values.emailNormalized ? [{ emailNormalized: values.emailNormalized }] : []),
    ...(values.universityIdNormalized
      ? [{ universityIdNormalized: values.universityIdNormalized }]
      : []),
  ];
  const identityFilter: QueryFilter<ReceiverRecord> | null = identityAlternatives.length
    ? { $or: identityAlternatives }
    : null;
  if (identityFilter) {
    const existing = await ReceiverModel.findOneAndUpdate(
      identityFilter,
      {
        $set: {
          status: 'ACTIVE',
          fullName: values.fullName,
          fullNameNormalized: values.fullNameNormalized,
          type: values.type,
          updatedBy: values.updatedBy,
          ...(values.contact
            ? { contact: values.contact, contactNormalized: values.contactNormalized }
            : {}),
          ...(values.email ? { email: values.email, emailNormalized: values.emailNormalized } : {}),
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
  }

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
        if (identityFilter) {
          const retry = await ReceiverModel.findOneAndUpdate(
            identityFilter,
            {
              $set: { status: 'ACTIVE', updatedBy: values.updatedBy },
              $inc: { operationalUseCount: 1 },
            },
            { returnDocument: 'after', ...(session ? { session } : {}), timestamps: false },
          );
          if (retry) return retry;
        }
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

  const isLab = receiver.type === 'LAB';
  if (input.type !== undefined && (input.type === 'LAB') !== isLab) {
    throw new AppError(
      409,
      'RECEIVER_TYPE_LOCKED',
      'A lab cannot be converted to a person or department, or the other way round. Register a new Receiver instead.',
    );
  }
  if (isLab && (input.contact !== undefined || input.email !== undefined)) {
    throw new AppError(
      422,
      'LAB_CONTACT_IS_IN_CHARGE',
      "A lab's contact details are its in-charge's. Update the in-charge fields instead.",
    );
  }
  if (!isLab && (input.inChargeName || input.inChargeContact || input.inChargeEmail)) {
    throw new AppError(422, 'IN_CHARGE_ONLY_FOR_LABS', 'In-charge details apply to labs only.');
  }

  if (input.fullName !== undefined) {
    receiver.fullName = normalizeDisplayText(input.fullName);
    receiver.fullNameNormalized = normalizeSearchText(receiver.fullName);
    if (isLab) await assertUniqueLabName(receiver.fullNameNormalized, receiver._id);
  }
  if (input.inChargeName !== undefined) receiver.inChargeName = normalizeDisplayText(input.inChargeName);
  if (input.inChargeContact !== undefined) {
    receiver.inChargeContact = normalizeDisplayText(input.inChargeContact);
  }
  if (input.inChargeEmail !== undefined) receiver.inChargeEmail = normalizeEmail(input.inChargeEmail);
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
