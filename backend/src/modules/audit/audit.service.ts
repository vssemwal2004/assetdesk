import { Types, type ClientSession } from 'mongoose';

import type { UserRole } from '@assetdesk/contracts';

import { AuditEventModel } from './audit-event.model.js';

const SENSITIVE_METADATA_KEY =
  /(?:password|passphrase|secret|token|cookie|authorization|api[_-]?key|credential)/i;
const DANGEROUS_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_METADATA_DEPTH = 4;
const MAX_METADATA_ENTRIES = 50;
const MAX_METADATA_STRING_LENGTH = 1_000;

export interface AuditInput {
  requestId: string;
  actorUserId?: string;
  actorWorkerId?: string;
  actorRole?: UserRole;
  action: string;
  targetType: string;
  targetId?: string;
  result: 'SUCCESS' | 'DENIED' | 'FAILED';
  reasonCode?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditWriteOptions {
  session?: ClientSession;
}

function sanitizeMetadataValue(value: unknown, depth: number): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, MAX_METADATA_STRING_LENGTH);
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_METADATA_DEPTH) return '[TRUNCATED]';

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_METADATA_ENTRIES)
      .map((entry) => sanitizeMetadataValue(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value).slice(0, MAX_METADATA_ENTRIES)) {
      if (DANGEROUS_OBJECT_KEYS.has(key)) continue;
      output[key] = SENSITIVE_METADATA_KEY.test(key)
        ? '[REDACTED]'
        : sanitizeMetadataValue(entry, depth + 1);
    }
    return output;
  }

  return String(value).slice(0, MAX_METADATA_STRING_LENGTH);
}

export function sanitizeAuditMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return sanitizeMetadataValue(metadata, 0) as Record<string, unknown>;
}

export async function appendAuditEvent(
  input: AuditInput,
  options: AuditWriteOptions = {},
): Promise<void> {
  const actorUserId = input.actorUserId
    ? /^[a-f\d]{24}$/i.test(input.actorUserId)
      ? new Types.ObjectId(input.actorUserId)
      : undefined
    : undefined;

  if (input.actorUserId && !actorUserId) {
    throw new TypeError('Invalid audit actor user ID.');
  }

  const event = new AuditEventModel({
    timestampUtc: new Date(),
    requestId: input.requestId,
    ...(actorUserId ? { actorUserId } : {}),
    ...(input.actorWorkerId ? { actorWorkerId: input.actorWorkerId } : {}),
    ...(input.actorRole ? { actorRole: input.actorRole } : {}),
    action: input.action,
    targetType: input.targetType,
    ...(input.targetId ? { targetId: input.targetId } : {}),
    result: input.result,
    ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
    ...(input.metadata ? { metadata: sanitizeAuditMetadata(input.metadata) } : {}),
  });
  await event.save(options.session ? { session: options.session } : undefined);
}
