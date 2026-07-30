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
import { CatalogBadge } from '../components/catalog-ui';
import {
  AppCard,
  Button,
  EmptyState,
  ErrorState,
  LoadingPanel,
  PageHeader,
} from '../components/ui';
import { formatIstDateTime } from '../lib/date-time';
import { getAdminDashboard } from '../lib/dashboard-api';
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
    <div className="space-y-6">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
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
            <Link className="button-primary" to="/issues/new">
              <PackagePlus aria-hidden="true" size={18} />
              Issue material
            </Link>
          </div>
        }
        description="Live assignment, return, and asset quantity overview. All dates use IST."
        title={`Good to see you, ${adminName}`}
      />

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
    <>
      <section aria-labelledby="overview-heading" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
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
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {primaryMetrics.map((metric) => (
            <MetricCard {...metric} key={metric.label} />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
            label="Active workers"
            to="/workers?status=ACTIVE"
            value={stats.activeWorkers}
          />
        </div>
      </section>

      <InventoryOverview inventory={inventory} />

      <section aria-labelledby="quick-actions-heading" className="space-y-3">
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
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <QuickAction icon={PackagePlus} label="Issue material" to="/issues/new" />
          <QuickAction icon={RotateCcw} label="Record Return" to="/returns" />
          <QuickAction icon={UserPlus} label="Add worker" to="/workers/new" />
          <QuickAction icon={FileUp} label="Import workers" to="/workers/import" />
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
    </>
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

  return (
    <section aria-labelledby="inventory-overview-heading" className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
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
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SmallMetric icon={Boxes} label="Material records" to="/inventory" value={totals.materialCount} />
        <SmallMetric icon={PackageOpen} label="Total quantity" to="/inventory" value={totals.totalQuantity} />
        <SmallMetric icon={PackageCheck} label="Available quantity" to="/inventory?stockState=AVAILABLE" value={totals.availableQuantity} />
        <SmallMetric icon={Clock3} label="Issued quantity" to="/inventory?stockState=ISSUED" value={totals.issuedQuantity} />
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
      className={`group min-w-0 rounded-[14px] border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-card)] transition sm:p-4 ${classes.border}`}
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
      className="group flex min-h-16 min-w-0 items-center gap-3 overflow-hidden rounded-[12px] border border-[var(--color-border)] bg-white px-3 py-3 shadow-[var(--shadow-card)] transition hover:border-[var(--color-primary-border)] sm:px-4"
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
      className="group flex min-h-[76px] flex-col justify-between rounded-[12px] border border-[var(--color-border)] bg-white p-3.5 shadow-[var(--shadow-card)] transition hover:border-[var(--color-primary-border)] hover:bg-[var(--color-surface-tint)] sm:min-h-[84px] sm:p-4"
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
  return (
    <div className="space-y-6">
      <PageHeader
        description="Issue material, record Returns, and review the work available to your account."
        title={`Welcome, ${workerName}`}
      />
      <AppCard>
        <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">Start a task</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <QuickAction icon={PackagePlus} label="Issue material" to="/issues/new" />
          <QuickAction icon={RotateCcw} label="Record a Return" to="/returns" />
          <QuickAction icon={ClipboardList} label="My Issue Records" to="/issues" />
          <QuickAction icon={ListChecks} label="Return activity" to="/returns" />
        </div>
      </AppCard>
    </div>
  );
}
