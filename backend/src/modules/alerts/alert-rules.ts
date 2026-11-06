import type {
  AlertCategory,
  AlertGroup,
  AlertItem,
  AlertSeverity,
  AlertsResponse,
} from '@assetdesk/contracts';

export const ALERT_LIMIT_PER_CATEGORY = 20;

/** A cartridge model in rotation (2+ live cartridges) alerts at or below this filled count. */
export const CARTRIDGE_LOW_STOCK_LEVEL = 1;
export const CARTRIDGE_ROTATION_MINIMUM = 2;

export const ALERT_CATEGORY_LABELS: Record<AlertCategory, string> = {
  ISSUE_OVERDUE: 'Overdue returns',
  ISSUE_DUE_TODAY: 'Returns due today',
  OUT_OF_STOCK: 'Out of stock',
  LOW_STOCK: 'Low stock',
  CARTRIDGE_LOW_STOCK: 'Cartridge stock',
  CARTRIDGE_ATTENTION: 'Cartridges need action',
  CARTRIDGE_GATE_PASS_PENDING: 'Gate passes to verify',
  CARTRIDGE_GATE_PASS_OVERDUE: 'Cartridges overdue from vendor',
  GATE_PASS_OVERDUE: 'Gate passes overdue',
};

export const ALERT_CATEGORY_SEVERITY: Record<AlertCategory, AlertSeverity> = {
  ISSUE_OVERDUE: 'CRITICAL',
  ISSUE_DUE_TODAY: 'WARNING',
  OUT_OF_STOCK: 'CRITICAL',
  LOW_STOCK: 'WARNING',
  CARTRIDGE_LOW_STOCK: 'WARNING',
  CARTRIDGE_ATTENTION: 'WARNING',
  CARTRIDGE_GATE_PASS_PENDING: 'INFO',
  CARTRIDGE_GATE_PASS_OVERDUE: 'CRITICAL',
  GATE_PASS_OVERDUE: 'CRITICAL',
};

const severityRank: Record<AlertSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

export type AlertDraft = Omit<AlertItem, 'read'>;

export interface AlertSection {
  category: AlertCategory;
  /** True number of matching records, which may exceed the listed items. */
  total: number;
  href: string;
  items: AlertDraft[];
}

/** Matches the inventory list's "Low stock" badge: at most 20% (minimum 1) of total available. */
export function lowStockLimit(totalQuantity: number): number {
  return Math.max(1, Math.ceil(totalQuantity * 0.2));
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function assembleAlerts(
  sections: AlertSection[],
  readKeys: ReadonlySet<string>,
  now: Date,
): AlertsResponse['data'] {
  const populated = sections.filter((section) => section.total > 0 && section.items.length > 0);
  const items: AlertItem[] = populated
    .flatMap((section) => section.items)
    .map((item) => ({ ...item, read: readKeys.has(item.key) }))
    .sort(
      (left, right) =>
        severityRank[left.severity] - severityRank[right.severity] ||
        Number(left.read) - Number(right.read) ||
        (left.occurredAt ?? '').localeCompare(right.occurredAt ?? ''),
    );
  const groups: AlertGroup[] = populated
    .map((section) => ({
      category: section.category,
      label: ALERT_CATEGORY_LABELS[section.category],
      severity: section.items.reduce<AlertSeverity>(
        (worst, item) =>
          severityRank[item.severity] < severityRank[worst] ? item.severity : worst,
        'INFO',
      ),
      total: section.total,
      unread: section.items.filter((item) => !readKeys.has(item.key)).length,
      href: section.href,
    }))
    .sort(
      (left, right) =>
        severityRank[left.severity] - severityRank[right.severity] || right.total - left.total,
    );
  return {
    items,
    groups,
    unreadCount: items.filter((item) => !item.read).length,
    totalCount: populated.reduce((total, section) => total + section.total, 0),
    generatedAt: now.toISOString(),
  };
}
