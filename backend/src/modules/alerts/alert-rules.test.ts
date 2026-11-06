import { describe, expect, it } from 'vitest';

import { assembleAlerts, lowStockLimit, type AlertSection } from './alert-rules.js';

const NOW = new Date('2026-11-05T06:00:00.000Z');

function section(overrides: Partial<AlertSection> & Pick<AlertSection, 'category'>): AlertSection {
  return { total: 0, href: '/', items: [], ...overrides };
}

describe('alert rules', () => {
  it('matches the inventory low-stock badge threshold', () => {
    expect(lowStockLimit(1)).toBe(1);
    expect(lowStockLimit(4)).toBe(1);
    expect(lowStockLimit(10)).toBe(2);
    expect(lowStockLimit(11)).toBe(3);
  });

  it('orders critical unread alerts first and counts read receipts', () => {
    const result = assembleAlerts(
      [
        section({
          category: 'LOW_STOCK',
          total: 1,
          href: '/inventory/low-stock',
          items: [
            {
              key: 'LOW_STOCK:A:1',
              category: 'LOW_STOCK',
              severity: 'WARNING',
              title: 'Low stock · A',
              message: '',
              href: '/inventory/A',
              occurredAt: null,
            },
          ],
        }),
        section({
          category: 'ISSUE_OVERDUE',
          total: 7,
          href: '/overdue',
          items: [
            {
              key: 'ISSUE_OVERDUE:1:0',
              category: 'ISSUE_OVERDUE',
              severity: 'CRITICAL',
              title: 'Overdue',
              message: '',
              href: '/issues/1',
              occurredAt: '2026-11-01T00:00:00.000Z',
            },
            {
              key: 'ISSUE_OVERDUE:2:0',
              category: 'ISSUE_OVERDUE',
              severity: 'CRITICAL',
              title: 'Overdue',
              message: '',
              href: '/issues/2',
              occurredAt: '2026-10-01T00:00:00.000Z',
            },
          ],
        }),
        section({ category: 'GATE_PASS_OVERDUE' }),
      ],
      new Set(['ISSUE_OVERDUE:2:0']),
      NOW,
    );

    expect(result.items.map((item) => item.key)).toEqual([
      'ISSUE_OVERDUE:1:0',
      'ISSUE_OVERDUE:2:0',
      'LOW_STOCK:A:1',
    ]);
    expect(result.unreadCount).toBe(2);
    expect(result.totalCount).toBe(8);
    expect(result.groups).toEqual([
      expect.objectContaining({ category: 'ISSUE_OVERDUE', total: 7, unread: 1 }),
      expect.objectContaining({ category: 'LOW_STOCK', total: 1, unread: 1 }),
    ]);
    expect(result.generatedAt).toBe(NOW.toISOString());
  });
});
