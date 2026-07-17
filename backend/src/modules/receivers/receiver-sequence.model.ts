import { model, Schema } from 'mongoose';

interface ReceiverSequenceRecord {
  _id: string;
  sequence: number;
}

const ReceiverSequenceSchema = new Schema<ReceiverSequenceRecord>(
  {
    _id: { type: String, required: true },
    sequence: { type: Number, required: true, min: 0, validate: Number.isInteger },
  },
  { versionKey: false },
);

export const ReceiverSequenceModel = model<ReceiverSequenceRecord>(
  'ReceiverSequence',
  ReceiverSequenceSchema,
);
