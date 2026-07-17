import type { ClientSession } from 'mongoose';

import { AppError } from '../../middleware/error-handler.js';
import { IssueSequenceModel } from './issue-sequence.model.js';

export function formatIssueId(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2_000 || year > 9_999) {
    throw new TypeError('Invalid Issue year.');
  }
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 999_999) {
    throw new AppError(
      503,
      'ISSUE_ID_SEQUENCE_EXHAUSTED',
      'No more Issue IDs are available for this year.',
    );
  }
  return `GEU-ISS-${year}-${String(sequence).padStart(6, '0')}`;
}

export async function allocateIssueId(year: number, session: ClientSession): Promise<string> {
  const counter = await IssueSequenceModel.findOneAndUpdate(
    { _id: year },
    { $inc: { sequence: 1 } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, session },
  );
  if (!counter) {
    throw new AppError(
      503,
      'ISSUE_ID_UNAVAILABLE',
      'An Issue ID could not be allocated. Try again.',
    );
  }
  return formatIssueId(year, counter.sequence);
}
