import { AppError } from '../../middleware/error-handler.js';
import type { ClientSession } from 'mongoose';
import { ReceiverSequenceModel } from './receiver-sequence.model.js';

const RECEIVER_SEQUENCE_KEY = 'RECEIVER';
const MAX_RECEIVER_SEQUENCE = 999_999;

export function formatReceiverCode(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_RECEIVER_SEQUENCE) {
    throw new RangeError('Receiver sequence must be an integer from 1 to 999999.');
  }
  return `GEU-RCV-${sequence.toString().padStart(6, '0')}`;
}

export async function allocateReceiverCode(session?: ClientSession): Promise<string> {
  let query = ReceiverSequenceModel.findOneAndUpdate(
    { _id: RECEIVER_SEQUENCE_KEY },
    { $inc: { sequence: 1 } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  if (session) query = query.session(session);
  const counter = await query;

  if (!counter || counter.sequence > MAX_RECEIVER_SEQUENCE) {
    throw new AppError(
      503,
      'RECEIVER_CODE_EXHAUSTED',
      'No more Receiver codes are available. Contact the system administrator.',
    );
  }

  return formatReceiverCode(counter.sequence);
}
