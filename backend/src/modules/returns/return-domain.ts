import { AppError } from '../../middleware/error-handler.js';

export type SerializedReturnDisposition =
  | 'AVAILABLE'
  | 'RETURNED'
  | 'UNDER_REPAIR'
  | 'DAMAGED'
  | 'LOST'
  | 'SCRAPPED';

export const MAX_RETURN_EVENTS_PER_ISSUE = 100;
export const MAX_RETURN_ITEMS_PER_EVENT = 100;

interface ReturnItemIdentity {
  trackingMode: 'QUANTITY' | 'SERIALIZED';
  lineId: string;
  assetTag?: string;
}

interface OutstandingReturnLine {
  trackingMode: 'QUANTITY' | 'SERIALIZED';
  outstandingQuantity: number;
}

export function minimumEventsToComplete(lines: readonly OutstandingReturnLine[]): number {
  const requiredItemEntries = lines.reduce((total, line) => {
    if (!Number.isSafeInteger(line.outstandingQuantity) || line.outstandingQuantity < 0) {
      throw new TypeError('Outstanding quantity must be a non-negative safe integer.');
    }
    if (line.trackingMode === 'SERIALIZED') return total + line.outstandingQuantity;
    return total + (line.outstandingQuantity > 0 ? 1 : 0);
  }, 0);
  return Math.ceil(requiredItemEntries / MAX_RETURN_ITEMS_PER_EVENT);
}

export function assertReturnHistoryCapacity(
  existingEventCount: number,
  remainingLines: readonly OutstandingReturnLine[],
): void {
  if (!Number.isSafeInteger(existingEventCount) || existingEventCount < 0) {
    throw new TypeError('Return event count must be a non-negative safe integer.');
  }
  const eventCountAfterCurrentReturn = existingEventCount + 1;
  const remainingEventSlots = MAX_RETURN_EVENTS_PER_ISSUE - eventCountAfterCurrentReturn;
  if (
    eventCountAfterCurrentReturn > MAX_RETURN_EVENTS_PER_ISSUE ||
    minimumEventsToComplete(remainingLines) > remainingEventSlots
  ) {
    throw new AppError(
      409,
      'RETURN_BATCH_MUST_COMPLETE_MORE',
      'Return a larger batch now so this Issue can be completed safely.',
      {
        items: 'Include more outstanding lines or assets in this Return.',
      },
    );
  }
}

export function assertNoDuplicateReturnItems(items: readonly ReturnItemIdentity[]): void {
  const quantityLines = new Set<string>();
  const assetTags = new Set<string>();

  for (const item of items) {
    if (item.trackingMode === 'QUANTITY') {
      if (quantityLines.has(item.lineId)) {
        throw new AppError(
          400,
          'RETURN_LINE_DUPLICATED',
          'A quantity line can appear only once in a return request.',
          { items: 'Remove the duplicate quantity line.' },
        );
      }
      quantityLines.add(item.lineId);
      continue;
    }

    if (!item.assetTag) {
      throw new AppError(400, 'RETURN_ASSET_REQUIRED', 'Choose an asset unit to return.');
    }
    if (assetTags.has(item.assetTag)) {
      throw new AppError(
        400,
        'RETURN_ASSET_DUPLICATED',
        'An asset unit can appear only once in a return request.',
        { items: 'Remove the duplicate asset unit.' },
      );
    }
    assetTags.add(item.assetTag);
  }
}

export function deriveIssueStatusAfterReturn(
  outstandingQuantity: number,
  hasLostOutcome: boolean,
  hasDamagedOutcome: boolean,
): 'PARTIALLY_RETURNED' | 'RETURNED' | 'DAMAGED' | 'LOST' {
  if (!Number.isSafeInteger(outstandingQuantity) || outstandingQuantity < 0) {
    throw new TypeError('Outstanding quantity must be a non-negative safe integer.');
  }
  if (outstandingQuantity > 0) return 'PARTIALLY_RETURNED';
  if (hasLostOutcome) return 'LOST';
  if (hasDamagedOutcome) return 'DAMAGED';
  return 'RETURNED';
}

export function assetAvailabilityIncrement(disposition: SerializedReturnDisposition): 0 | 1 {
  return disposition === 'AVAILABLE' ? 1 : 0;
}

export function isDamagedOutcome(disposition: SerializedReturnDisposition): boolean {
  return disposition === 'DAMAGED' || disposition === 'UNDER_REPAIR' || disposition === 'SCRAPPED';
}
