import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  Info,
  RefreshCw,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import type { AlertCategory, AlertItem, AlertSeverity } from '@assetdesk/contracts';

import { getAlerts, markAlertsRead, type AlertsData } from '../lib/alerts-api';
import { cn } from './ui';

type AlertTab = 'ALL' | 'UNREAD' | 'ISSUES' | 'STOCK' | 'CARTRIDGES' | 'GATE_PASSES';

const tabCategories: Record<Exclude<AlertTab, 'ALL' | 'UNREAD'>, AlertCategory[]> = {
  ISSUES: ['ISSUE_OVERDUE', 'ISSUE_DUE_TODAY'],
  STOCK: ['OUT_OF_STOCK', 'LOW_STOCK'],
  CARTRIDGES: ['CARTRIDGE_LOW_STOCK', 'CARTRIDGE_ATTENTION'],
  GATE_PASSES: ['CARTRIDGE_GATE_PASS_PENDING', 'CARTRIDGE_GATE_PASS_OVERDUE', 'GATE_PASS_OVERDUE'],
};

const tabLabels: Record<AlertTab, string> = {
  ALL: 'All',
  UNREAD: 'Unread',
  ISSUES: 'Issues',
  STOCK: 'Stock',
  CARTRIDGES: 'Cartridges',
  GATE_PASSES: 'Gate passes',
};

const severityStyles: Record<AlertSeverity, { icon: typeof Info; className: string }> = {
  CRITICAL: {
    icon: AlertTriangle,
    className: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
  },
  WARNING: {
    icon: AlertCircle,
    className: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
  },
  INFO: { icon: Info, className: 'bg-[var(--color-info-soft)] text-[var(--color-info)]' },
};

const relativeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function relativeTime(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

const dueCategories = new Set<AlertCategory>([
  'ISSUE_OVERDUE',
  'ISSUE_DUE_TODAY',
  'CARTRIDGE_GATE_PASS_OVERDUE',
  'GATE_PASS_OVERDUE',
]);

function timeLabel(item: AlertItem): string | null {
  const relative = relativeTime(item.occurredAt);
  if (!relative) return null;
  if (dueCategories.has(item.category)) return `Due ${relative}`;
  if (item.category === 'CARTRIDGE_GATE_PASS_PENDING') return `Created ${relative}`;
  return `Updated ${relative}`;
}

function markCachedRead(data: AlertsData | undefined, keys: Set<string> | 'ALL') {
  if (!data) return data;
  const items = data.items.map((item) =>
    keys === 'ALL' || keys.has(item.key) ? { ...item, read: true } : item,
  );
  return {
    ...data,
    items,
    unreadCount: items.filter((item) => !item.read).length,
    groups: data.groups.map((group) => ({
      ...group,
      unread: items.filter((item) => item.category === group.category && !item.read).length,
    })),
  };
}

export function NotificationCenter() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<AlertTab>('ALL');
  const containerRef = useRef<HTMLDivElement>(null);

  const query = useQuery({
    queryKey: ['alerts'],
    queryFn: ({ signal }) => getAlerts(signal),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });

  const markRead = useMutation({
    mutationFn: markAlertsRead,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['alerts'] });
      const previous = queryClient.getQueryData<AlertsData>(['alerts']);
      queryClient.setQueryData<AlertsData | undefined>(['alerts'], (data) =>
        markCachedRead(data, 'all' in input ? 'ALL' : new Set(input.keys)),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(['alerts'], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const data = query.data;
  const unread = data?.unreadCount ?? 0;
  const tabCounts = useMemo(() => {
    const counts: Partial<Record<AlertTab, number>> = {
      ALL: data?.items.length ?? 0,
      UNREAD: unread,
    };
    for (const [key, categories] of Object.entries(tabCategories)) {
      counts[key as AlertTab] = (data?.items ?? []).filter((item) =>
        categories.includes(item.category),
      ).length;
    }
    return counts;
  }, [data?.items, unread]);
  const visibleGroups = useMemo(() => {
    if (!data) return [];
    return data.groups
      .filter((group) =>
        tab === 'ALL' || tab === 'UNREAD' ? true : tabCategories[tab].includes(group.category),
      )
      .map((group) => ({
        group,
        items: data.items.filter(
          (item) => item.category === group.category && (tab !== 'UNREAD' || !item.read),
        ),
      }))
      .filter((entry) => entry.items.length > 0);
  }, [data, tab]);

  function openAlert(item: AlertItem) {
    if (!item.read) markRead.mutate({ keys: [item.key] });
    setOpen(false);
    navigate(item.href);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-controls="notification-panel"
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className="icon-button relative"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Bell aria-hidden="true" size={20} />
        {unread > 0 ? (
          <span className="notification-badge" aria-hidden="true">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          aria-label="Notifications"
          className="notification-panel"
          id="notification-panel"
          role="dialog"
        >
          <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 pb-3 pt-4">
            <div>
              <h2 className="text-base font-extrabold text-[var(--color-primary-strong)]">
                Notifications
              </h2>
              <p className="mt-0.5 text-xs font-semibold text-[var(--color-text-muted)]">
                {data
                  ? `${unread} unread · ${data.totalCount} open item${data.totalCount === 1 ? '' : 's'}`
                  : 'Checking stock, returns, cartridges and gate passes'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                aria-label="Refresh notifications"
                className="icon-button size-9 min-h-9"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
                title="Refresh"
                type="button"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={query.isFetching ? 'animate-spin' : undefined}
                  size={16}
                />
              </button>
              <button
                className="button-quiet min-h-9 px-2 text-xs"
                disabled={!unread || markRead.isPending}
                onClick={() => markRead.mutate({ all: true })}
                type="button"
              >
                <CheckCheck aria-hidden="true" size={16} />
                Mark all read
              </button>
              <button
                aria-label="Close notifications"
                className="icon-button size-9 min-h-9 min-[600px]:hidden"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
          </div>

          <div
            aria-label="Notification categories"
            className="notification-tabs flex gap-1.5 overflow-x-auto px-4 py-2.5"
            role="tablist"
          >
            {(Object.keys(tabLabels) as AlertTab[])
              .filter((key) => key === 'ALL' || key === 'UNREAD' || (tabCounts[key] ?? 0) > 0)
              .map((key) => (
                <button
                  aria-selected={tab === key}
                  className={cn('notification-tab', tab === key && 'notification-tab-active')}
                  key={key}
                  onClick={() => setTab(key)}
                  role="tab"
                  type="button"
                >
                  {tabLabels[key]}
                  <span className="notification-tab-count">{tabCounts[key] ?? 0}</span>
                </button>
              ))}
          </div>

          <div className="notification-scroll">
            {query.isPending ? (
              <div className="space-y-2 p-4" role="status">
                <span className="sr-only">Loading notifications</span>
                {[0, 1, 2].map((index) => (
                  <div className="skeleton h-14 rounded-[10px]" key={index} />
                ))}
              </div>
            ) : query.isError ? (
              <div className="p-6 text-center" role="alert">
                <p className="text-sm font-bold text-[var(--color-danger)]">
                  Notifications could not be loaded.
                </p>
                <button
                  className="button-secondary mt-3"
                  onClick={() => void query.refetch()}
                  type="button"
                >
                  Try again
                </button>
              </div>
            ) : visibleGroups.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-xl bg-[var(--color-success-soft)] text-[var(--color-success)]">
                  <CheckCircle2 aria-hidden="true" size={24} />
                </span>
                <p className="mt-3 font-extrabold text-[var(--color-primary-strong)]">
                  {tab === 'UNREAD' ? 'No unread notifications' : "You're all caught up"}
                </p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Overdue returns, low stock, cartridges and gate passes will appear here.
                </p>
              </div>
            ) : (
              visibleGroups.map(({ group, items }) => (
                <section
                  className="border-b border-[var(--color-border)] last:border-b-0"
                  key={group.category}
                >
                  <div className="sticky top-0 z-[1] flex items-center justify-between gap-2 bg-[var(--color-surface-tint)] px-4 py-2">
                    <h3 className="text-xs font-extrabold uppercase tracking-[0.06em] text-[var(--color-text-muted)]">
                      {group.label} · {group.total}
                    </h3>
                    <Link
                      className="inline-flex items-center gap-0.5 text-xs font-extrabold text-[var(--color-primary)] hover:underline"
                      onClick={() => setOpen(false)}
                      to={group.href}
                    >
                      View all
                      <ChevronRight aria-hidden="true" size={14} />
                    </Link>
                  </div>
                  <ul>
                    {items.map((item) => {
                      const style = severityStyles[item.severity];
                      const Icon = style.icon;
                      const time = timeLabel(item);
                      return (
                        <li className="group/alert relative" key={item.key}>
                          <button
                            className={cn(
                              'notification-item',
                              !item.read && 'notification-item-unread',
                            )}
                            onClick={() => openAlert(item)}
                            type="button"
                          >
                            <span
                              className={cn(
                                'grid size-9 shrink-0 place-items-center rounded-[10px]',
                                style.className,
                              )}
                            >
                              <Icon aria-hidden="true" size={18} />
                            </span>
                            <span className="min-w-0 flex-1 text-left">
                              <span className="block text-sm font-extrabold leading-5 text-[var(--color-text-strong)]">
                                {item.title}
                              </span>
                              {item.message ? (
                                <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-[var(--color-text-muted)]">
                                  {item.message}
                                </span>
                              ) : null}
                              {time ? (
                                <span className="mt-1 block text-[11px] font-bold text-[var(--color-text-muted)]">
                                  {time}
                                </span>
                              ) : null}
                            </span>
                            {!item.read ? <span className="sr-only">Unread</span> : null}
                          </button>
                          {!item.read ? (
                            <button
                              aria-label={`Mark ${item.title} as read`}
                              className="notification-mark-read"
                              onClick={() => markRead.mutate({ keys: [item.key] })}
                              title="Mark as read"
                              type="button"
                            >
                              <span aria-hidden="true" className="notification-dot" />
                            </button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                  {group.total > items.length && tab !== 'UNREAD' ? (
                    <p className="px-4 pb-3 text-xs font-semibold text-[var(--color-text-muted)]">
                      Showing {items.length} of {group.total}. Use View all for the full list.
                    </p>
                  ) : null}
                </section>
              ))
            )}
          </div>
          <p className="border-t border-[var(--color-border)] px-4 py-2 text-[11px] font-semibold text-[var(--color-text-muted)]">
            Live from current records · refreshes every minute
          </p>
        </div>
      ) : null}
    </div>
  );
}
