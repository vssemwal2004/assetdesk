import type {
  AccountStatus,
  CreateWorkerRequest,
  TemporaryCredential,
  UpdateWorkerRequest,
  Worker,
} from '@assetdesk/contracts';
import mongoose from 'mongoose';

import { AppError } from '../../middleware/error-handler.js';
import { temporaryPasswordExpiry } from '../auth/auth.service.js';
import { generateTemporaryPassword, hashPassword } from '../auth/password.js';
import { revokeAllUserSessions } from '../auth/session.service.js';
import { toWorker } from '../users/user.mapper.js';
import { UserModel, type UserDocument } from '../users/user.model.js';
import { enqueueWorkerInvitation } from '../notifications/notification.service.js';
import { generateWorkerIdCandidate } from './worker-id.js';

const MAX_WORKER_ID_ATTEMPTS = 32;

interface DuplicateKeyError {
  code?: unknown;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
}

export interface WorkerCredentialResult {
  worker: Worker;
  credential: TemporaryCredential;
}

export interface WorkerListInput {
  page: number;
  pageSize: number;
  search?: string;
  status?: AccountStatus;
}

export interface WorkerListResult {
  workers: Worker[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function duplicateKey(error: unknown): DuplicateKeyError | null {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as DuplicateKeyError;
  return candidate.code === 11_000 ? candidate : null;
}

function duplicateField(error: unknown): string | undefined {
  const duplicate = duplicateKey(error);
  if (!duplicate) return undefined;
  return Object.keys(duplicate.keyPattern ?? duplicate.keyValue ?? {})[0];
}

function emailConflict(): AppError {
  return new AppError(409, 'WORKER_EMAIL_EXISTS', 'A user with this email already exists.', {
    email: 'Use a different email address.',
  });
}

function credential(
  workerId: string,
  temporaryPassword: string,
  expiresAt: Date,
): TemporaryCredential {
  return {
    workerId,
    temporaryPassword,
    expiresAt: expiresAt.toISOString(),
    deliveryStatus: 'QUEUED',
  };
}

function escapeSearchRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findWorkerRecord(workerId: string) {
  const worker = await UserModel.findOne({ workerId, role: 'WORKER' });
  if (!worker) throw new AppError(404, 'WORKER_NOT_FOUND', 'This Worker was not found.');
  return worker;
}

export async function createWorker(
  input: CreateWorkerRequest,
  createdByUserId: string,
): Promise<WorkerCredentialResult> {
  const existingEmail = await UserModel.exists({ emailNormalized: input.email });
  if (existingEmail) throw emailConflict();

  const temporaryPassword = generateTemporaryPassword();
  const [passwordHash, expiresAt] = await Promise.all([
    hashPassword(temporaryPassword),
    Promise.resolve(temporaryPasswordExpiry()),
  ]);

  for (let attempt = 0; attempt < MAX_WORKER_ID_ATTEMPTS; attempt += 1) {
    const workerId = generateWorkerIdCandidate();
    const session = await mongoose.startSession();
    try {
      let worker: UserDocument | undefined;
      await session.withTransaction(async () => {
        const created = await UserModel.create(
          [
            {
              workerId,
              name: input.name,
              email: input.email,
              emailNormalized: input.email,
              ...(input.contact ? { contact: input.contact } : {}),
              ...(input.department ? { department: input.department } : {}),
              role: 'WORKER',
              permissions: input.permissions,
              status: 'INVITED',
              invitationStatus: 'PENDING',
              passwordHash,
              mustChangePassword: true,
              temporaryPasswordExpiresAt: expiresAt,
              authVersion: 1,
              failedLoginCount: 0,
              createdBy: createdByUserId,
            },
          ],
          { session },
        );
        worker = created[0];
        if (!worker) throw new Error('Worker insert returned no document.');
        await enqueueWorkerInvitation({
          userId: worker._id,
          workerId,
          name: worker.name,
          email: worker.email,
          temporaryPassword,
          expiresAt,
          credentialVersion: worker.authVersion,
          session,
        });
      });
      const committedWorker = worker as UserDocument | undefined;
      if (!committedWorker) throw new Error('Worker transaction returned no document.');

      return {
        worker: toWorker(committedWorker),
        credential: credential(workerId, temporaryPassword, expiresAt),
      };
    } catch (error) {
      const field = duplicateField(error);
      if (field === 'emailNormalized') throw emailConflict();
      if (field === 'workerId') continue;
      throw error;
    } finally {
      await session.endSession();
    }
  }

  throw new AppError(
    503,
    'WORKER_ID_UNAVAILABLE',
    'A unique Worker ID could not be allocated. Try again.',
  );
}

export async function listWorkers(input: WorkerListInput): Promise<WorkerListResult> {
  const filter: Record<string, unknown> = { role: 'WORKER' };
  if (input.status) filter.status = input.status;
  if (input.search) {
    const search = new RegExp(escapeSearchRegex(input.search), 'i');
    filter.$or = [
      { workerId: search },
      { name: search },
      { email: search },
      { department: search },
      { contact: search },
    ];
  }

  const skip = (input.page - 1) * input.pageSize;
  const [records, total] = await Promise.all([
    UserModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(input.pageSize),
    UserModel.countDocuments(filter),
  ]);

  return {
    workers: records.map((record) => toWorker(record)),
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
}

export async function getWorker(workerId: string): Promise<Worker> {
  return toWorker(await findWorkerRecord(workerId));
}

export async function updateWorker(workerId: string, input: UpdateWorkerRequest): Promise<Worker> {
  const worker = await findWorkerRecord(workerId);

  if (input.name !== undefined) worker.name = input.name;
  if (input.email !== undefined) {
    worker.email = input.email;
    worker.emailNormalized = input.email;
  }
  if (Object.hasOwn(input, 'contact')) worker.set('contact', input.contact);
  if (Object.hasOwn(input, 'department')) worker.set('department', input.department);
  if (input.permissions !== undefined) worker.permissions = input.permissions;

  try {
    await worker.save();
  } catch (error) {
    if (duplicateField(error) === 'emailNormalized') throw emailConflict();
    throw error;
  }

  return toWorker(worker);
}

export async function updateWorkerStatus(
  workerId: string,
  requestedStatus: 'ACTIVE' | 'DISABLED',
): Promise<{ worker: Worker; previousStatus: AccountStatus }> {
  const worker = await findWorkerRecord(workerId);
  const previousStatus = worker.status;
  const nextStatus: AccountStatus =
    requestedStatus === 'DISABLED' ? 'DISABLED' : worker.mustChangePassword ? 'INVITED' : 'ACTIVE';

  if (worker.status !== nextStatus) {
    worker.status = nextStatus;
    worker.authVersion += 1;
    await worker.save();
    await revokeAllUserSessions(worker._id.toString(), `WORKER_STATUS_${nextStatus}`);
  }

  return { worker: toWorker(worker), previousStatus };
}

export async function deleteWorker(workerId: string): Promise<void> {
  const worker = await findWorkerRecord(workerId);
  await UserModel.deleteOne({ _id: worker._id, role: 'WORKER' });
  await revokeAllUserSessions(worker._id.toString(), 'WORKER_DELETED');
}

export async function regenerateWorkerCredential(
  workerId: string,
): Promise<WorkerCredentialResult> {
  const temporaryPassword = generateTemporaryPassword();
  const expiresAt = temporaryPasswordExpiry();
  const passwordHash = await hashPassword(temporaryPassword);
  const session = await mongoose.startSession();
  let worker: UserDocument | null | undefined;
  try {
    await session.withTransaction(async () => {
      worker = await UserModel.findOne({ workerId, role: 'WORKER' }).session(session);
      if (!worker) throw new AppError(404, 'WORKER_NOT_FOUND', 'This Worker was not found.');
      worker.passwordHash = passwordHash;
      worker.mustChangePassword = true;
      worker.temporaryPasswordExpiresAt = expiresAt;
      worker.status = 'INVITED';
      worker.invitationStatus = 'PENDING';
      worker.failedLoginCount = 0;
      worker.set('lockedUntil', undefined);
      worker.authVersion += 1;
      await worker.save({ session });
      await enqueueWorkerInvitation({
        userId: worker._id,
        workerId: worker.workerId,
        name: worker.name,
        email: worker.email,
        temporaryPassword,
        expiresAt,
        credentialVersion: worker.authVersion,
        session,
      });
    });
  } finally {
    await session.endSession();
  }
  const committedWorker = worker as UserDocument | undefined;
  if (!committedWorker) throw new Error('Worker credential transaction returned no document.');
  await revokeAllUserSessions(committedWorker._id.toString(), 'WORKER_CREDENTIAL_REGENERATED');

  return {
    worker: toWorker(committedWorker),
    credential: credential(committedWorker.workerId, temporaryPassword, expiresAt),
  };
}
