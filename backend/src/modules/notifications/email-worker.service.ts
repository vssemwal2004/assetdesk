import { logger } from '../../config/logger.js';
import { EmailJobModel, type EmailJobDocument } from './email-job.model.js';
import { EmailProviderError, sendWithSmtp } from './smtp.provider.js';
import { UserModel } from '../users/user.model.js';

const RETRY_DELAYS_MS = [60_000, 300_000, 900_000, 1_800_000, 7_200_000] as const;
const LEASE_MS = 60_000;

export function retryDelayAfterAttempt(attemptCount: number): number | undefined {
  return RETRY_DELAYS_MS[attemptCount - 1];
}

export async function claimNextEmailJob(now = new Date()): Promise<EmailJobDocument | null> {
  return EmailJobModel.findOneAndUpdate(
    {
      $or: [
        { status: { $in: ['QUEUED', 'RETRY_WAIT'] }, nextAttemptAt: { $lte: now } },
        { status: 'PROCESSING', leaseUntil: { $lte: now } },
      ],
    },
    {
      $set: { status: 'PROCESSING', leaseUntil: new Date(now.getTime() + LEASE_MS) },
      $inc: { attemptCount: 1 },
      $unset: { lastErrorCode: 1, lastErrorSummary: 1 },
    },
    { returnDocument: 'after', sort: { nextAttemptAt: 1, createdAt: 1 } },
  );
}

export async function processNextEmailJob(): Promise<boolean> {
  const job = await claimNextEmailJob();
  if (!job) return false;
  try {
    const providerMessageId = await sendWithSmtp(job);
    await EmailJobModel.updateOne(
      { _id: job._id, status: 'PROCESSING' },
      {
        $set: { status: 'ACCEPTED_BY_PROVIDER', providerMessageId, acceptedAt: new Date() },
        $unset: { leaseUntil: 1, failedAt: 1 },
      },
    );
    if (job.eventType === 'WORKER_INVITATION') {
      await UserModel.updateOne(
        { _id: job.recipientId, invitationStatus: 'PENDING' },
        { $set: { invitationStatus: 'SENT' } },
      );
    }
    logger.info(
      { notificationId: job._id.toString(), eventType: job.eventType },
      'Email accepted by provider',
    );
  } catch (error) {
    const providerError =
      error instanceof EmailProviderError
        ? error
        : new EmailProviderError('Unexpected email worker failure.', 'EMAIL_WORKER_ERROR', true);
    const retryDelay = retryDelayAfterAttempt(job.attemptCount);
    if (providerError.retryable && retryDelay !== undefined) {
      await EmailJobModel.updateOne(
        { _id: job._id, status: 'PROCESSING' },
        {
          $set: {
            status: 'RETRY_WAIT',
            nextAttemptAt: new Date(Date.now() + retryDelay),
            lastErrorCode: providerError.code,
            lastErrorSummary: providerError.message,
          },
          $unset: { leaseUntil: 1 },
        },
      );
      logger.warn(
        {
          notificationId: job._id.toString(),
          attemptCount: job.attemptCount,
          code: providerError.code,
        },
        'Email scheduled for retry',
      );
    } else {
      await EmailJobModel.updateOne(
        { _id: job._id, status: 'PROCESSING' },
        {
          $set: {
            status: 'FAILED',
            failedAt: new Date(),
            lastErrorCode: providerError.code,
            lastErrorSummary: providerError.message,
          },
          $unset: { leaseUntil: 1 },
        },
      );
      if (job.eventType === 'WORKER_INVITATION') {
        await UserModel.updateOne(
          { _id: job.recipientId },
          { $set: { invitationStatus: 'FAILED' } },
        );
      }
      logger.error(
        {
          notificationId: job._id.toString(),
          attemptCount: job.attemptCount,
          code: providerError.code,
        },
        'Email permanently failed',
      );
    }
  }
  return true;
}
