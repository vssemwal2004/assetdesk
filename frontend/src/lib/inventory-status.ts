import type { MaterialStatus } from '@assetdesk/contracts';

function normalize(value: string): string {
  return value
    .trim()
    .replace(/[^A-Z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function normalizeInventoryStatus(value: string): MaterialStatus | undefined {
  const normalized = normalize(value);
  if (!normalized) return undefined;
  if (normalized === 'ARCHIVED') return 'ARCHIVED';
  if (
    normalized.includes('UNDER MAINTENANCE') ||
    normalized.includes('UNDER MAINTANCE') ||
    normalized === 'MAINTENANCE'
  ) {
    return 'UNDER_MAINTENANCE';
  }
  if (normalized === 'ACTIVE' || normalized.includes('ACTIVE IN USE') || normalized === 'WORKING') {
    return 'ACTIVE';
  }
  if (
    normalized.includes('SCRAP') ||
    normalized.includes('FAULTY') ||
    normalized.includes('SCRAPE')
  ) {
    return 'SCRAP';
  }
  if (
    normalized.includes('NOT IN USE') ||
    normalized.includes('NOT USED') ||
    normalized.includes('UNUSED') ||
    normalized.includes('IDLE') ||
    normalized.includes('OBSOLETE') ||
    normalized.includes('OUTDATED') ||
    normalized.includes('OUT DATED')
  ) {
    return 'NOT_IN_USE';
  }
  return undefined;
}

export function inventoryStatusLabel(value: string | undefined): string {
  const status = value ? normalizeInventoryStatus(value) : undefined;
  if (status === 'ACTIVE') return 'Active / in use';
  if (status === 'UNDER_MAINTENANCE') return 'Under maintenance';
  if (status === 'SCRAP') return 'Faulty (scrap)';
  if (status === 'NOT_IN_USE') return 'Outdated (not in use)';
  if (status === 'ARCHIVED') return 'Archived';
  return value?.trim() || 'Active / in use';
}
