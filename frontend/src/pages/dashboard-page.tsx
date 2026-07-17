import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Boxes,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileUp,
  ListChecks,
  PackagePlus,
  RefreshCw,
  RotateCcw,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import { Link } from 'react-router';

import type { AdminDashboardStats, IssueSummary } from '@assetdesk/contracts';

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
          message="Dashboard counts could not be loaded."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <DashboardContent
          generatedAt={query.data.data.generatedAt}
      attentionIssues={query.data.data.attentionIssues}
          recentIssues={query.data.data.recentIssues}
          stats={query.data.data.stats}
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
}: {
  stats: AdminDashboardStats;
  attentionIssues: IssueSummary[];
  recentIssues: IssueSummary[];
  generatedAt: string;
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
      label: 'Total Issues',
      value: stats.totalIssues,
      helper: 'Complete Issue history',
      icon: ClipboardList,
      to: '/issues',
      tone: 'info' as const,
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
      label: 'Inventory',
      value: stats.outstandingItems,
      helper: 'Open dense inventory quantity table',
      icon: Boxes,
      to: '/inventory',
      tone: 'primary' as const,
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
        <div className="grid gap-3 sm:grid-cols-3">
          <SmallMetric
            icon={CalendarClock}
            label="Due today"
            to="/issues?returnState=DUE_TODAY"
            value={stats.dueToday}
          />
          <SmallMetric
            icon={CheckCircle2}
            label="Returned today"
            to="/returns?period=TODAY"
            value={stats.returnedToday}
          />
          <SmallMetric
            icon={UsersRound}
            label="Active workers"
            to="/workers?status=ACTIVE"
            value={stats.activeWorkers}
          />
        </div>
      </section>

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
        <IssuePanel
          issues={recentIssues}
          kind="recent"
          title="Recent Issues"
          viewAll="/issues"
        />
      </div>
    </>
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
      className="group flex min-h-16 items-center gap-3 rounded-[12px] border border-[var(--color-border)] bg-white px-4 py-3 shadow-[var(--shadow-card)] transition hover:border-[var(--color-primary-border)]"
      to={to}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
        <Icon aria-hidden="true" size={18} />
      </span>
      <span className="min-w-0">
        <span className="block text-xl font-extrabold leading-none text-[var(--color-primary-strong)]">
          {value.toLocaleString('en-IN')}
        </span>
        <span className="mt-1 block text-xs font-bold text-[var(--color-text-muted)]">{label}</span>
      </span>
      <ArrowRight
        aria-hidden="true"
        className="ml-auto text-[var(--color-text-muted)] transition-transform group-hover:translate-x-0.5"
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
                ? 'No short-term assignments are due today.'
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
          <span
            className="shrink-0 rounded-full bg-[var(--color-warning-soft)] px-2.5 py-1 text-[11px] font-extrabold text-[var(--color-warning)]"
          >
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
