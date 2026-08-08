import { createHash } from 'node:crypto';

import type { TrackingMode } from '@assetdesk/contracts';

const MAX_STORED_IDENTITY_LENGTH = 300;

function normalizeIdentityPart(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, '')
    .toLocaleUpperCase('en-US');
}

export function materialDisplayName(category: string, typeModelName: string): string {
  const cleanCategory = category.trim().replace(/\s+/g, ' ');
  const cleanModel = typeModelName.trim().replace(/\s+/g, ' ');
  return cleanModel.toLocaleLowerCase('en-US').startsWith(cleanCategory.toLocaleLowerCase('en-US'))
    ? cleanModel
    : `${cleanCategory} ${cleanModel}`;
}

export function buildMaterialIdentity(
  trackingMode: TrackingMode,
  name: string,
  category: string,
  location: string,
  block: string,
  configuration?: string,
): string {
  const parts = [trackingMode, name, category, location, block];
  if (trackingMode === 'SERIALIZED') parts.push(configuration ?? '');
  const identity = parts.map(normalizeIdentityPart).join('|');
  if (identity.length <= MAX_STORED_IDENTITY_LENGTH) return identity;
  return `SHA256:${createHash('sha256').update(identity).digest('hex').toLocaleUpperCase('en-US')}`;
}
