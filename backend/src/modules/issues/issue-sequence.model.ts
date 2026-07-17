import { model, Schema } from 'mongoose';

interface IssueSequenceRecord {
  _id: number;
  sequence: number;
}

const IssueSequenceSchema = new Schema<IssueSequenceRecord>(
  {
    _id: { type: Number, required: true, min: 2_000, max: 9_999 },
    sequence: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  },
  { versionKey: false },
);

export const IssueSequenceModel = model<IssueSequenceRecord>('IssueSequence', IssueSequenceSchema);
