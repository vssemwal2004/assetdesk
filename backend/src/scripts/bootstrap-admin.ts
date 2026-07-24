import {
  CreateWorkerRequestSchema,
  DEFAULT_WORKER_PERMISSIONS,
  WorkerIdSchema,
} from '@assetdesk/contracts';

import { logger } from '../config/logger.js';
import { connectDatabase, disconnectDatabase } from '../db/mongoose.js';
import { hashPassword } from '../modules/auth/password.js';
import { UserModel } from '../modules/users/user.model.js';

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredSecret(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function bootstrapAdmin(): Promise<void> {
  const workerId = WorkerIdSchema.parse(requiredEnvironment('ASSETDESK_ADMIN_ID').toUpperCase());
  const input = CreateWorkerRequestSchema.parse({
    name: requiredEnvironment('ASSETDESK_ADMIN_NAME'),
    email: requiredEnvironment('ASSETDESK_ADMIN_EMAIL'),
    contact: process.env.ASSETDESK_ADMIN_CONTACT,
    department: process.env.ASSETDESK_ADMIN_DEPARTMENT,
    permissions: DEFAULT_WORKER_PERMISSIONS,
    dataAccess: { inventory: 'ALL', issues: 'ALL' },
  });
  // Do not trim passwords: leading/trailing spaces may be intentional and are
  // valid password characters.
  const password = requiredSecret('ASSETDESK_ADMIN_PASSWORD');

  await connectDatabase();
  try {
    const existingAdmin = await UserModel.findOne({
      workerId,
      emailNormalized: input.email,
      role: 'ADMIN',
    }).select('+passwordHash');
    if (existingAdmin) {
      existingAdmin.name = input.name;
      existingAdmin.email = input.email;
      existingAdmin.emailNormalized = input.email;
      if (input.contact) existingAdmin.contact = input.contact;
      if (input.department) existingAdmin.department = input.department;
      existingAdmin.passwordHash = await hashPassword(password);
      existingAdmin.mustChangePassword = false;
      existingAdmin.status = 'ACTIVE';
      existingAdmin.failedLoginCount = 0;
      existingAdmin.set('lockedUntil', undefined);
      existingAdmin.authVersion += 1;
      existingAdmin.passwordChangedAt = new Date();
      await existingAdmin.save();
      logger.info(
        { workerId: existingAdmin.workerId, email: existingAdmin.email },
        'Bootstrap Admin password synced from environment',
      );
      return;
    }

    const emailOwner = await UserModel.findOne({ emailNormalized: input.email });
    if (emailOwner) {
      throw new Error(
        `The bootstrap email already belongs to ${emailOwner.role} ${emailOwner.workerId}.`,
      );
    }

    const workerIdOwner = await UserModel.findOne({ workerId });
    if (workerIdOwner) {
      throw new Error(
        `The configured bootstrap Admin ID already belongs to ${workerIdOwner.role} ${workerIdOwner.email}.`,
      );
    }

    const admin = await UserModel.create({
      workerId,
      name: input.name,
      email: input.email,
      emailNormalized: input.email,
      ...(input.contact ? { contact: input.contact } : {}),
      ...(input.department ? { department: input.department } : {}),
      role: 'ADMIN',
      permissions: [],
      dataAccess: { inventory: 'ALL', issues: 'ALL' },
      status: 'ACTIVE',
      invitationStatus: 'SENT',
      passwordHash: await hashPassword(password),
      mustChangePassword: false,
      authVersion: 1,
      failedLoginCount: 0,
      passwordChangedAt: new Date(),
    });
    logger.info({ workerId: admin.workerId, email: admin.email }, 'Bootstrap Admin created');
  } finally {
    await disconnectDatabase();
  }
}

bootstrapAdmin().catch((error: unknown) => {
  logger.fatal({ error }, 'Bootstrap Admin creation failed');
  process.exitCode = 1;
});
