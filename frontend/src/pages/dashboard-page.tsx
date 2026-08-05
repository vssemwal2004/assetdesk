import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  ArrowRight,
  AlertTriangle,
  Boxes,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileUp,
  ListChecks,
  PackagePlus,
  PackageCheck,
  PackageOpen,
  RefreshCw,
  RotateCcw,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import { Link } from 'react-router';

import type {
  AdminDashboardStats,
  DashboardInventory,
  IssueSummary,
  MaterialStatus,
  TrackingMode,
} from '@assetdesk/contracts';

import { useAuth } from '../auth/auth-context';
import { hasPermission } from '../auth/permissions';
import { CatalogBadge } from '../components/catalog-ui';
import { AppCard, Button, EmptyState, ErrorState, LoadingPanel } from '../components/ui';
import { formatIstDateTime } from '../lib/date-time';
import { getAdminDashboard } from '../lib/dashboard-api';
import { getCartridgeDashboard } from '../lib/cartridges-api';
import { isApiError } from '../lib/api-client';

export function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === 'ADMIN' ? (
    <AdminDashboard adminName={user.name} />
  ) : (
    <WorkerDashboard workerName={user.name} />
  );
}

function AdminDashboard({ adminName }: { adminName: string }) {
  const query = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: ({ signal }) => getAdminDashboard(signal),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[18px] border border-[var(--color-primary-border)] bg-[linear-gradient(120deg,var(--color-primary-strong),var(--color-primary))] px-5 py-6 text-white shadow-[0_18px_45px_rgba(59,37,84,.16)] sm:px-7 sm:py-7">
        <div className="absolute -right-12 -top-16 size-52 rounded-full border-[32px] border-white/5" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-white/65">
              Operations command center
            </p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl">
              Good to see you, {adminName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">
              Track issue movement, returns, inventory health, employees and cartridge operations
              from one live workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="border-white/20 bg-white/10 text-white hover:bg-white/20"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
              variant="secondary"
            >
              <RefreshCw
                aria-hidden="true"
                className={query.isFetching ? 'animate-spin' : undefined}
                size={18}
              />
              Refresh
            </Button>
            <Link
              className="button-primary border-white bg-white text-[var(--color-primary-strong)] hover:bg-white/90"
              to="/issues/new"
            >
              <PackagePlus aria-hidden="true" size={18} />
              Issue material
            </Link>
          </div>
        </div>
      </section>

      {query.isPending ? (
        <LoadingPanel label="Loading Admin dashboard" />
      ) : query.isError ? (
        <ErrorState
          message={
            isApiError(query.error) ? query.error.message : 'Dashboard counts could not be loaded.'
          }
          onRetry={() => void query.refetch()}
        />
      ) : (
        <DashboardContent
          generatedAt={query.data.data.generatedAt}
          attentionIssues={query.data.data.attentionIssues}
          recentIssues={query.data.data.recentIssues}
          stats={query.data.data.stats}
          inventory={query.data.data.inventory}
        />
      )}
    </div>
  );
}

function DashboardContent({
  stats,
  attentionIssues,
  recentIssues,
  generatedAt,
  inventory,
}: {
  stats: AdminDashboardStats;
  attentionIssues: IssueSummary[];
  recentIssues: IssueSummary[];
  generatedAt: string;
  inventory: DashboardInventory;
}) {
  const primaryMetrics = [
    {
      label: 'Issued today',
      value: stats.todayIssued,
      helper: 'Issue Records created today',
      icon: CalendarDays,
      to: '/issues?period=TODAY',
      tone: 'primary' as const,
    },
    {
      label: 'Pending Returns',
      value: stats.pendingReturns,
      helper: `${stats.outstandingItems} material item${stats.outstandingItems === 1 ? '' : 's'} outside`,
      icon: Clock3,
      to: '/issues?returnState=PENDING',
      tone: 'warning' as const,
    },
    {
      label: 'Overdue',
      value: stats.overdueReturns,
      helper: 'Return-by-date Issues past due',
      icon: AlertTriangle,
      to: '/overdue',
      tone: 'danger' as const,
    },
    {
      label: 'Due today',
      value: stats.dueToday,
      helper: 'Returnable material due today',
      icon: CalendarClock,
      to: '/issues?returnState=DUE_TODAY',
      tone: 'info' as const,
    },
  ];

  return (
    <div className="space-y-5">
      <section
        aria-labelledby="overview-heading"
        className="overflow-hidden rounded-[16px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)]"
      >
        <div className="flex items-end justify-between gap-3">
          <div className="px-5 pt-5">
            <h2
              className="text-lg font-extrabold text-[var(--color-primary-strong)]"
              id="overview-heading"
            >
              Today at a glance
            </h2>
            <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">
              Updated {formatIstDateTime(generatedAt)}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 border-y border-[var(--color-border)] lg:grid-cols-4 lg:divide-x lg:divide-[var(--color-border)]">
          {primaryMetrics.map((metric) => (
            <MetricCard {...metric} key={metric.label} />
          ))}
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--color-border)] sm:grid-cols-3 xl:grid-cols-5">
          <SmallMetric
            icon={ClipboardList}
            label="Total Issues"
            to="/issues"
            value={stats.totalIssues}
          />
          <SmallMetric
            icon={ListChecks}
            label="Permanent issues"
            to="/issues"
            value={stats.permanentIssues}
          />
          <SmallMetric
            icon={CheckCircle2}
            label="Returned today"
            to="/returns?period=TODAY"
            value={stats.returnedToday}
          />
          <SmallMetric
            icon={Boxes}
            label="Outstanding items"
            to="/inventory"
            value={stats.outstandingItems}
          />
          <SmallMetric
            icon={UsersRound}
            label="Active employees"
            to="/workers?status=ACTIVE"
            value={stats.activeWorkers}
          />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <InventoryOverview inventory={inventory} />
        <MainCartridgeOverview />
      </div>

      <section
        aria-labelledby="quick-actions-heading"
        className="rounded-[16px] border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-card)]"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2
              className="text-lg font-extrabold text-[var(--color-primary-strong)]"
              id="quick-actions-heading"
            >
              Quick actions
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Common server-room tasks, ready in one tap.
            </p>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-2 lg:max-w-3xl lg:grid-cols-4">
            <QuickAction icon={PackagePlus} label="Issue material" to="/issues/new" />
            <QuickAction icon={RotateCcw} label="Record Return" to="/returns" />
            <QuickAction icon={UserPlus} label="Add employee" to="/workers/new" />
            <QuickAction icon={FileUp} label="Import employees" to="/workers/import" />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <IssuePanel
          issues={attentionIssues}
          kind="attention"
          title="Needs attention"
          viewAll="/issues?returnState=DUE_TODAY"
        />
        <IssuePanel issues={recentIssues} kind="recent" title="Recent Issues" viewAll="/issues" />
      </div>
    </div>
  );
}

function MainCartridgeOverview() {
  const query = useQuery({ queryKey: ['cartridge-dashboard'], queryFn: getCartridgeDashboard });
  if (query.isError) return null;
  const counts = query.data?.data.counts ?? {};
  const metrics: Array<[string, string]> = [
    ['FILLED_AVAILABLE', 'Filled'],
    ['ISSUED', 'Issued'],
    ['EMPTY', 'Empty'],
    ['DEFECTIVE', 'Defective'],
    ['WITH_VENDOR', 'With vendor'],
    ['QC_PENDING', 'QC pending'],
  ];
  return (
    <section
      aria-labelledby="cartridge-overview-heading"
      className="overflow-hidden rounded-[16px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)]"
    >
      <div className="flex items-end justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
        <div>
          <h2
            className="text-lg font-extrabold text-[var(--color-primary-strong)]"
            id="cartridge-overview-heading"
          >
            Cartridge overview
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Serialized cartridge stock and latest operational state.
          </p>
        </div>
        <Link className="text-sm font-bold text-[var(--color-primary)]" to="/cartridges/dashboard">
          View dashboard
        </Link>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--color-border)]">
        {metrics.map(([key, label]) => (
          <SmallMetric
            icon={Boxes}
            key={key}
            label={label}
            to={`/cartridges?status=${key}`}
            value={counts[key] ?? 0}
          />
        ))}
        <SmallMetric
          icon={Clock3}
          label="Open Gate Passes"
          to="/cartridges/gate-passes"
          value={query.data?.data.openGatePasses ?? 0}
        />
      </div>
    </section>
  );
}

const inventoryStatuses: Array<{ value: MaterialStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active / in use' },
  { value: 'UNDER_MAINTENANCE', label: 'Under maintenance' },
  { value: 'NOT_IN_USE', label: 'Outdated / not in use' },
  { value: 'SCRAP', label: 'Faulty / scrap' },
  { value: 'ARCHIVED', label: 'Archived' },
];

function InventoryOverview({ inventory }: { inventory: DashboardInventory }) {
  const [trackingMode, setTrackingMode] = useState<TrackingMode | 'ALL'>('ALL');
  const [status, setStatus] = useState<MaterialStatus | 'ALL'>('ALL');
  const totals = useMemo(
    () =>
      inventory.breakdown
        .filter(
          (row) =>
            (trackingMode === 'ALL' || row.trackingMode === trackingMode) &&
            (status === 'ALL' || row.status === status),
        )
        .reduce(
          (sum, row) => ({
            materialCount: sum.materialCount + row.materialCount,
            totalQuantity: sum.totalQuantity + row.totalQuantity,
            availableQuantity: sum.availableQuantity + row.availableQuantity,
            issuedQuantity: sum.issuedQuantity + row.issuedQuantity,
          }),
          { materialCount: 0, totalQuantity: 0, availableQuantity: 0, issuedQuantity: 0 },
        ),
    [inventory.breakdown, status, trackingMode],
  );
  const availablePercent = totals.totalQuantity
    ? Math.round((totals.availableQuantity / totals.totalQuantity) * 100)
    : 0;

  return (
    <section
      aria-labelledby="inventory-overview-heading"
      className="overflow-hidden rounded-[16px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)]"
    >
      <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            className="text-lg font-extrabold text-[var(--color-primary-strong)]"
            id="inventory-overview-heading"
          >
            Inventory counts
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Material records and actual physical quantity, including every inventory state.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-bold text-[var(--color-text-muted)]">
            Material type
            <select
              className="mt-1 block min-w-0 rounded-[9px] border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text-strong)]"
              onChange={(event) => setTrackingMode(event.target.value as TrackingMode | 'ALL')}
              value={trackingMode}
            >
              <option value="ALL">All types</option>
              <option value="SERIALIZED">IT assets</option>
              <option value="QUANTITY">IT consumables</option>
            </select>
          </label>
          <label className="text-xs font-bold text-[var(--color-text-muted)]">
            Inventory state
            <select
              className="mt-1 block min-w-0 rounded-[9px] border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text-strong)]"
              onChange={(event) => setStatus(event.target.value as MaterialStatus | 'ALL')}
              value={status}
            >
              {inventoryStatuses.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="px-5 py-5">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
              Stock availability
            </p>
            <p className="mt-1 text-3xl font-extrabold tracking-[-0.04em] text-[var(--color-primary-strong)]">
              {availablePercent}%
            </p>
          </div>
          <p className="text-right text-xs font-semibold text-[var(--color-text-muted)]">
            {totals.availableQuantity.toLocaleString('en-IN')} of{' '}
            {totals.totalQuantity.toLocaleString('en-IN')} available
          </p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-tint)]">
          <div
            className="h-full rounded-full bg-[var(--color-primary)] transition-all"
            style={{ width: `${availablePercent}%` }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--color-border)] border-t border-[var(--color-border)] xl:grid-cols-4">
        <SmallMetric
          icon={Boxes}
          label="Material records"
          to="/inventory"
          value={totals.materialCount}
        />
        <SmallMetric
          icon={PackageOpen}
          label="Total quantity"
          to="/inventory"
          value={totals.totalQuantity}
        />
        <SmallMetric
          icon={PackageCheck}
          label="Available quantity"
          to="/inventory?stockState=AVAILABLE"
          value={totals.availableQuantity}
        />
        <SmallMetric
          icon={Clock3}
          label="Issued quantity"
          to="/inventory?stockState=ISSUED"
          value={totals.issuedQuantity}
        />
      </div>
    </section>
  );
}

type MetricTone = 'primary' | 'info' | 'warning' | 'danger';

const toneClasses: Record<MetricTone, { icon: string; border: string }> = {
  primary: {
    icon: 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]',
    border: 'hover:border-[var(--color-primary-border)]',
  },
  info: {
    icon: 'bg-[var(--color-info-soft)] text-[var(--color-info)]',
    border: 'hover:border-[var(--color-info)]',
  },
  warning: {
    icon: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
    border: 'hover:border-[var(--color-warning)]',
  },
  danger: {
    icon: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
    border: 'hover:border-[var(--color-danger)]',
  },
};

function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  to,
  tone,
}: {
  label: string;
  value: number;
  helper: string;
  icon: typeof CalendarDays;
  to: string;
  tone: MetricTone;
}) {
  const classes = toneClasses[tone];
  return (
    <Link
      aria-label={`${label}: ${value}`}
      className={`group min-w-0 p-4 transition hover:bg-[var(--color-surface-tint)] sm:p-5 ${classes.border}`}
      to={to}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`grid size-9 shrink-0 place-items-center rounded-[10px] ${classes.icon}`}>
          <Icon aria-hidden="true" size={19} />
        </span>
        <ArrowRight
          aria-hidden="true"
          className="text-[var(--color-text-muted)] transition-transform group-hover:translate-x-0.5"
          size={17}
        />
      </div>
      <p className="mt-3 text-2xl font-extrabold leading-none text-[var(--color-primary-strong)] sm:text-3xl">
        {value.toLocaleString('en-IN')}
      </p>
      <h3 className="mt-2 text-xs font-extrabold text-[var(--color-text-strong)] sm:text-sm">
        {label}
      </h3>
      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--color-text-muted)] sm:text-xs">
        {helper}
      </p>
    </Link>
  );
}

function SmallMetric({
  icon: Icon,
  label,
  value,
  to,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: number;
  to: string;
}) {
  return (
    <Link
      className="group flex min-h-[76px] min-w-0 items-center gap-3 overflow-hidden px-3 py-3 transition hover:bg-[var(--color-surface-tint)] sm:px-4"
      to={to}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
        <Icon aria-hidden="true" size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xl font-extrabold leading-none text-[var(--color-primary-strong)]">
          {value.toLocaleString('en-IN')}
        </span>
        <span className="mt-1 block truncate text-xs font-bold text-[var(--color-text-muted)]">
          {label}
        </span>
      </span>
      <ArrowRight
        aria-hidden="true"
        className="ml-auto shrink-0 text-[var(--color-text-muted)] transition-transform group-hover:translate-x-0.5"
        size={17}
      />
    </Link>
  );
}

function QuickAction({
  icon: Icon,
  label,
  to,
}: {
  icon: typeof PackagePlus;
  label: string;
  to: string;
}) {
  return (
    <Link
      className="group flex min-h-[76px] flex-col justify-between rounded-[12px] bg-[var(--color-surface-tint)] p-3.5 transition hover:bg-[var(--color-primary-soft)] sm:min-h-[84px] sm:p-4"
      to={to}
    >
      <Icon aria-hidden="true" className="text-[var(--color-primary)]" size={21} />
      <span className="mt-3 flex items-end justify-between gap-2 text-xs font-extrabold text-[var(--color-text-strong)] sm:text-sm">
        {label}
        <ArrowRight
          aria-hidden="true"
          className="shrink-0 text-[var(--color-text-muted)] transition-transform group-hover:translate-x-0.5"
          size={16}
        />
      </span>
    </Link>
  );
}

function IssuePanel({
  title,
  issues,
  kind,
  viewAll,
}: {
  title: string;
  issues: IssueSummary[];
  kind: 'attention' | 'recent';
  viewAll: string;
}) {
  return (
    <AppCard className="!p-0">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-[9px] ${kind === 'attention' ? 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]' : 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]'}`}
          >
            {kind === 'attention' ? (
              <CalendarClock aria-hidden="true" size={18} />
            ) : (
              <ListChecks aria-hidden="true" size={18} />
            )}
          </span>
          <h2 className="truncate text-base font-extrabold text-[var(--color-primary-strong)] sm:text-lg">
            {title}
          </h2>
        </div>
        <Link className="button-quiet shrink-0" to={viewAll}>
          View all
        </Link>
      </div>

      {issues.length === 0 ? (
        <div className="p-4 sm:p-5">
          <EmptyState
            message={
              kind === 'attention'
                ? 'No return-by-date issues are due today.'
                : 'New Issue Records will appear here.'
            }
            title={kind === 'attention' ? 'All clear' : 'No recent Issues'}
          />
        </div>
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {issues.map((issue) => (
            <DashboardIssueRow
              issue={issue}
              key={issue.issueId}
              showDueState={kind === 'attention'}
            />
          ))}
        </div>
      )}
    </AppCard>
  );
}

function DashboardIssueRow({
  issue,
  showDueState,
}: {
  issue: IssueSummary;
  showDueState: boolean;
}) {
  return (
    <article className="px-4 py-4 transition-colors hover:bg-[var(--color-surface-tint)] sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            className="text-sm font-extrabold text-[var(--color-primary-strong)] hover:underline"
            to={`/issues/${issue.issueId}`}
          >
            {issue.issueId}
          </Link>
          <p className="mt-1 truncate text-sm font-bold text-[var(--color-text-strong)]">
            {issue.receiver.fullName}
          </p>
          <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">
            {materialSummary(issue)} · {issue.totalOutstandingQuantity} outstanding
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {showDueState
              ? `Due ${formatIstDateTime(issue.expectedReturnAt)}`
              : `Issued ${formatIstDateTime(issue.issuedAt)}`}
          </p>
        </div>
        {showDueState ? (
          <span className="shrink-0 rounded-full bg-[var(--color-warning-soft)] px-2.5 py-1 text-[11px] font-extrabold text-[var(--color-warning)]">
            Due today
          </span>
        ) : (
          <CatalogBadge value={issue.status} />
        )}
      </div>
      {showDueState ? (
        <div className="mt-3 flex gap-2">
          <Link className="button-secondary flex-1" to={`/issues/${issue.issueId}`}>
            Details
          </Link>
          <Link className="button-primary flex-1" to={`/issues/${issue.issueId}/return`}>
            <RotateCcw aria-hidden="true" size={16} />
            Return
          </Link>
        </div>
      ) : null}
    </article>
  );
}

function materialSummary(issue: IssueSummary): string {
  const first = issue.materialNames[0] ?? 'Material';
  const remaining = issue.materialNames.length - 1;
  return remaining > 0 ? `${first} + ${remaining} more` : first;
}

function WorkerDashboard({ workerName }: { workerName: string }) {
  const { user } = useAuth();
  const actions = [
    hasPermission(user, 'ASSIGNMENTS_CREATE')
      ? {
          icon: PackagePlus,
          label: 'Issue material',
          to: '/issues/new',
          helper: 'Create a new material issue',
        }
      : null,
    hasPermission(user, 'RETURNS_RECORD')
      ? {
          icon: RotateCcw,
          label: 'Record a Return',
          to: '/returns',
          helper: 'Receive issued material',
        }
      : null,
    hasPermission(user, 'ISSUES_VIEW')
      ? {
          icon: ClipboardList,
          label: 'Issue Records',
          to: '/issues',
          helper: 'Search and review issues',
        }
      : null,
    hasPermission(user, 'RETURNS_VIEW')
      ? {
          icon: ListChecks,
          label: 'Return activity',
          to: '/returns',
          helper: 'Review return history',
        }
      : null,
    hasPermission(user, 'INVENTORY_VIEW')
      ? { icon: Boxes, label: 'Inventory', to: '/inventory', helper: 'Check current availability' }
      : null,
  ].filter(Boolean) as Array<{
    icon: typeof PackagePlus;
    label: string;
    to: string;
    helper: string;
  }>;

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[18px] border border-[var(--color-primary-border)] bg-[linear-gradient(120deg,var(--color-primary-strong),var(--color-primary))] px-5 py-7 text-white shadow-[0_18px_45px_rgba(59,37,84,.16)] sm:px-7">
        <div className="absolute -right-10 -top-14 size-44 rounded-full border-[28px] border-white/5" />
        <div className="relative max-w-2xl">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-white/65">
            My workspace
          </p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl">
            Welcome, {workerName}
          </h1>
          <p className="mt-2 text-sm leading-6 text-white/75">
            Your available operational tools are organized below according to the access assigned by
            Admin.
          </p>
        </div>
      </section>
      <section className="overflow-hidden rounded-[16px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)]">
        <div className="border-b border-[var(--color-border)] px-5 py-4">
          <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--color-primary)]">
            Daily operations
          </p>
          <h2 className="mt-1 text-xl font-extrabold tracking-[-0.02em] text-[var(--color-primary-strong)]">
            What would you like to do?
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Choose a task to continue. Only permitted actions are shown.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3">
          {actions.map(({ icon: Icon, label, to, helper }) => (
            <Link
              className="group flex min-h-28 items-center gap-4 border-b border-r border-[var(--color-border)] p-5 transition hover:bg-[var(--color-surface-tint)]"
              key={to}
              to={to}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-[11px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                <Icon aria-hidden="true" size={21} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold text-[var(--color-text-strong)]">
                  {label}
                </span>
                <span className="mt-1 block text-xs text-[var(--color-text-muted)]">{helper}</span>
              </span>
              <ArrowRight
                className="text-[var(--color-text-muted)] transition-transform group-hover:translate-x-1"
                size={18}
              />
            </Link>
          ))}
          {actions.length === 0 ? (
            <div className="p-5 sm:col-span-2 xl:col-span-3">
              <EmptyState
                message="Ask Admin to enable the operational access required for your role."
                title="No tasks assigned"
              />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
