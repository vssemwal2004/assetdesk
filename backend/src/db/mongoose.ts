import mongoose from 'mongoose';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AuditEventModel } from '../modules/audit/audit-event.model.js';
import { AuthSessionModel } from '../modules/auth/auth-session.model.js';
import { AssetUnitModel } from '../modules/inventory/asset-unit.model.js';
import { AssetTypeImportModel } from '../modules/inventory/asset-type-import.model.js';
import { AssetDetailModel } from '../modules/inventory/asset-detail.model.js';
import { AssetTypeModel } from '../modules/inventory/asset-type.model.js';
import { InventoryCounterModel } from '../modules/inventory/inventory-counter.model.js';
import { InventoryImportModel } from '../modules/inventory/inventory-import.model.js';
import { MaterialModel } from '../modules/inventory/material.model.js';
import { IssueSequenceModel } from '../modules/issues/issue-sequence.model.js';
import { IssueModel } from '../modules/issues/issue.model.js';
import { EmailJobModel } from '../modules/notifications/email-job.model.js';
import { ReceiverSequenceModel } from '../modules/receivers/receiver-sequence.model.js';
import { ReceiverModel } from '../modules/receivers/receiver.model.js';
import { ReminderModel } from '../modules/reminders/reminder.model.js';
import { UserModel } from '../modules/users/user.model.js';
import { WorkerImportModel } from '../modules/workers/worker-import.model.js';

const indexedModels: Array<{
  modelName: string;
  createIndexes: () => Promise<unknown>;
}> = [
  UserModel,
  AuthSessionModel,
  AuditEventModel,
  WorkerImportModel,
  InventoryCounterModel,
  AssetTypeModel,
  AssetDetailModel,
  AssetTypeImportModel,
  InventoryImportModel,
  MaterialModel,
  AssetUnitModel,
  ReceiverSequenceModel,
  ReceiverModel,
  ReminderModel,
  IssueSequenceModel,
  IssueModel,
  EmailJobModel,
];

export async function ensureDatabaseIndexes(): Promise<void> {
  for (const indexedModel of indexedModels) {
    await indexedModel.createIndexes();
  }
  logger.info({ modelCount: indexedModels.length }, 'MongoDB indexes verified');
}

export async function connectDatabase(): Promise<void> {
  mongoose.set('strictQuery', true);
  mongoose.set('autoIndex', env.NODE_ENV !== 'production');
  mongoose.set('bufferCommands', false);

  await mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB_NAME,
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
    minPoolSize: env.NODE_ENV === 'production' ? 2 : 0,
  });

  if (env.NODE_ENV === 'production') {
    await ensureDatabaseIndexes();
  }

  logger.info('MongoDB connection established');
}

export function isDatabaseReady(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('MongoDB connection closed');
  }
}
