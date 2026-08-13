import type { Receiver } from '@assetdesk/contracts';

import type { ReceiverRecord } from './receiver.model.js';

export function toReceiver(record: ReceiverRecord): Receiver {
  return {
    id: record._id.toString(),
    receiverCode: record.receiverCode,
    fullName: record.fullName,
    universityId: record.universityId ?? null,
    type: record.type,
    department: record.department ?? null,
    contact: record.contact ?? null,
    email: record.email ?? null,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
