import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileBarChart,
  FileClock,
  Gauge,
  ListChecks,
  PackageCheck,
  PackageOpen,
  PackagePlus,
  Printer,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  UserPlus,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router';

import type {
  AdminDashboardResponse,
  AuthUser,
  DashboardInventory,
  DashboardRange,
  DashboardTrendPoint,
  IssueSummary,
  MaterialStatus,
  TrackingMode,
  WorkerPermission,
} from '@assetdesk/contracts';

import { useAuth } from '../auth/auth-context';
import { hasPermission } from '../auth/permissions';
import { CatalogBadge } from '../components/catalog-ui';
import { Button, ErrorState, LoadingPanel, cn } from '../components/ui';
import { isApiError } from '../lib/api-client';
import { getCartridgeDashboard } from '../lib/cartridges-api';
import { getAdminDashboard, getWorkerDashboard } from '../lib/dashboard-api';
import { formatIstDateTime } from '../lib/date-time';

type DashboardData = AdminDashboardResponse['data'];
type MetricTone = 'primary' | 'info' | 'success' | 'warning' | 'danger';

const rangeOptions: Array<{ value: DashboardRange; label: string; longLabel: string }> = [
  { value: '7D', label: '7D', longLabel: 'Last 7 days' },
  { value: '30D', label: '30D', longLabel: 'Last 30 days' },
  { value: '90D', label: '90D', longLabel: 'Last 90 days' },
];

const inventoryStatuses: Array<{ value: MaterialStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All inventory states' },
  { value: 'ACTIVE', label: 'Active / in use' },
  { value: 'UNDER_MAINTENANCE', label: 'Under maintenance' },
  { value: 'NOT_IN_USE', label: 'Outdated / not in use' },
  { value: 'SCRAP', label: 'Faulty / scrap' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const metricToneClasses: Record<MetricTone, { icon: string; accent: string }> = {
  primary: {
    icon: 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]',
    accent: 'bg-[var(--color-primary)]',
  },
  info: {
    icon: 'bg-[var(--color-info-soft)] text-[var(--color-info)]',
    accent: 'bg-[var(--color-info)]',
  },
  success: {
    icon: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
    accent: 'bg-[var(--color-success)]',
  },
  warning: {
    icon: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
    accent: 'bg-[var(--color-warning)]',
  },
  danger: {
    icon: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
    accent: 'bg-[var(--color-danger)]',
  },
};

export function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === 'ADMIN' ? <AdminDashboard user={user} /> : <WorkerDashboard user={user} />;
}

function AdminDashboard({ user }: { user: AuthUser }) {
  const [range, setRange] = useState<DashboardRange>('30D');
  const query = useQuery({
    queryKey: ['dashboard', 'admin', range],
    queryFn: ({ signal }) => getAdminDashboard(range, signal),
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });

  return (
    <DashboardFrame
      description="Organization-wide asset, issue, return, employee and cartridge operations."
      isFetching={query.isFetching}
      name={user.name}
      onRangeChange={setRange}
      onRefresh={() => void query.refetch()}
      range={range}
      roleLabel="Admin workspace"
    >
      {query.isPending ? (
        <LoadingPanel label="Loading Admin dashboard" />
      ) : query.isError ? (
        <ErrorState
          message={
            isApiError(query.error) ? query.error.message : 'Dashboard data could not be loaded.'
          }
          onRetry={() => void query.refetch()}
        />
      ) : (
        <DashboardContent data={query.data.data} range={query.data.data.range} user={user} />
      )}
    </DashboardFrame>
  );
}

function WorkerDashboard({ user }: { user: AuthUser }) {
  const [range, setRange] = useState<DashboardRange>('30D');
  const query = useQuery({
    queryKey: ['dashboard', 'worker', range],
    queryFn: ({ signal }) => getWorkerDashboard(range, signal),
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });

  return (
    <DashboardFrame
      description="Your operational workload, priorities and tools, based on assigned access."
      isFetching={query.isFetching}
      name={user.name}
      onRangeChange={setRange}
      onRefresh={() => void query.refetch()}
      range={range}
      roleLabel={user.department || 'Employee workspace'}
    >
      {query.isPending ? (
        <LoadingPanel label="Loading employee dashboard" />
      ) : query.isError ? (
        <ErrorState
          message={
            isApiError(query.error)
              ? query.error.message
              : 'Your dashboard data could not be loaded.'
          }
          onRetry={() => void query.refetch()}
        />
      ) : (
        <DashboardContent data={query.data.data} range={query.data.data.range} user={user} />
      )}
    </DashboardFrame>
  );
}

function DashboardFrame({
  name,
  roleLabel,
  description,
  range,
  onRangeChange,
  isFetching,
  onRefresh,
  children,
}: {
  name: string;
  roleLabel: string;
  description: string;
  range: DashboardRange;
  onRangeChange: (range: DashboardRange) => void;
  isFetching: boolean;
  onRefresh: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="dashboard-workspace space-y-4">
      <header className="dashboard-enter flex flex-col gap-4 border-b border-[var(--color-border)] pb-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-primary-soft)] px-2.5 py-1 text-[11px] font-extrabold uppercase text-[var(--color-primary-strong)]">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-[var(--color-primary)]"
              />
              {roleLabel}
            </span>
            <span className="text-xs font-semibold text-[var(--color-text-muted)]">
              {new Intl.DateTimeFormat('en-IN', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                timeZone: 'Asia/Kolkata',
              }).format(new Date())}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-extrabold text-[var(--color-primary-strong)] sm:text-[28px]">
            Good to see you, {name}
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)]">
            {description}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <DashboardRangeControl onChange={onRangeChange} value={range} />
          <Button
            aria-label="Refresh dashboard data"
            className="shrink-0"
            disabled={isFetching}
            onClick={onRefresh}
            title="Refresh dashboard data"
            variant="secondary"
          >
            <RefreshCw aria-hidden="true" className={isFetching ? 'animate-spin' : ''} size={17} />
            Refresh
          </Button>
        </div>
      </header>
      {children}
    </div>
  );
}

function DashboardRangeControl({
  value,
  onChange,
}: {
  value: DashboardRange;
  onChange: (value: DashboardRange) => void;
}) {
  return (
    <div
      aria-label="Dashboard trend period"
      className="grid h-10 grid-cols-3 rounded-[8px] border border-[var(--color-border)] bg-white p-1"
      role="group"
    >
      {rangeOptions.map((option) => (
        <button
          aria-pressed={value === option.value}
          className={cn(
            'min-w-12 rounded-[6px] px-3 text-xs font-extrabold transition-colors',
            value === option.value
              ? 'bg-[var(--color-primary)] text-white shadow-sm'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-tint)] hover:text-[var(--color-primary-strong)]',
          )}
          key={option.value}
          onClick={() => onChange(option.value)}
          title={option.longLabel}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function DashboardContent({
  data,
  range,
  user,
}: {
  data: DashboardData;
  range: DashboardRange;
  user: AuthUser;
}) {
  const admin = user.role === 'ADMIN';
  const canSeeInventory = admin || hasPermission(user, 'INVENTORY_VIEW');
  const canSeeCartridges = admin || hasPermission(user, 'CARTRIDGES_VIEW');
  const availability = data.inventory.totalQuantity
    ? Math.round((data.inventory.availableQuantity / data.inventory.totalQuantity) * 100)
    : 0;
  const primaryMetrics = [
    {
      label: 'Issued today',
      value: data.stats.todayIssued,
      helper: admin ? 'Issue records created today' : 'Issues in your assigned scope today',
      icon: CalendarDays,
      to: '/issues?period=TODAY',
      tone: 'primary' as const,
    },
    {
      label: 'Pending returns',
      value: data.stats.pendingReturns,
      helper: `${data.stats.outstandingItems} material item${data.stats.outstandingItems === 1 ? '' : 's'} outside`,
      icon: Clock3,
      to: '/issues?returnState=PENDING',
      tone: 'warning' as const,
    },
    {
      label: 'Overdue',
      value: data.stats.overdueReturns,
      helper: data.stats.overdueReturns ? 'Requires follow-up now' : 'No overdue returns',
      icon: AlertTriangle,
      to: admin ? '/overdue' : '/issues?returnState=PENDING',
      tone: data.stats.overdueReturns ? ('danger' as const) : ('success' as const),
    },
    canSeeInventory
      ? {
          label: 'Stock available',
          value: availability,
          suffix: '%',
          helper: `${data.inventory.availableQuantity.toLocaleString('en-IN')} of ${data.inventory.totalQuantity.toLocaleString('en-IN')} units`,
          icon: PackageCheck,
          to: '/inventory?stockState=AVAILABLE',
          tone: availability >= 60 ? ('success' as const) : ('warning' as const),
        }
      : {
          label: 'Returned today',
          value: data.stats.returnedToday,
          helper: 'Return transactions completed today',
          icon: CheckCircle2,
          to: '/returns?period=TODAY',
          tone: 'success' as const,
        },
  ];

  return (
    <div className="space-y-4">
      <section
        aria-label="Key operational metrics"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {primaryMetrics.map((metric, index) => (
          <MetricCard index={index} key={metric.label} {...metric} />
        ))}
      </section>

      <OperationalSummary admin={admin} stats={data.stats} />

      <section className="dashboard-enter grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.7fr)]">
        <TrendPanel data={data.trend} range={range} />
        <AttentionPanel admin={admin} issues={data.attentionIssues} stats={data.stats} />
      </section>

      {canSeeInventory || canSeeCartridges ? (
        <section
          className={cn(
            'dashboard-enter grid gap-4',
            canSeeInventory &&
              canSeeCartridges &&
              'xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]',
          )}
        >
          {canSeeInventory ? <InventoryHealth inventory={data.inventory} /> : null}
          {canSeeCartridges ? <CartridgePipeline /> : null}
        </section>
      ) : null}

      <section className="dashboard-enter grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <ActionCenter user={user} />
        {admin ? <TeamSnapshot stats={data.stats} /> : <AccessSnapshot user={user} />}
      </section>

      <RecentActivity issues={data.recentIssues} />

      <p className="text-right text-[11px] font-semibold text-[var(--color-text-muted)]">
        Data refreshed {formatIstDateTime(data.generatedAt)}
      </p>
    </div>
  );
}

function OperationalSummary({ stats, admin }: { stats: DashboardData['stats']; admin: boolean }) {
  const metrics = [
    { icon: ClipboardList, label: 'Total issues', value: stats.totalIssues, to: '/issues' },
    {
      icon: ListChecks,
      label: 'Permanent issues',
      value: stats.permanentIssues,
      to: '/issues?assignmentType=LONG_TERM',
    },
    {
      icon: CheckCircle2,
      label: 'Returned today',
      value: stats.returnedToday,
      to: '/returns?period=TODAY',
    },
    {
      icon: CalendarClock,
      label: 'Due today',
      value: stats.dueToday,
      to: '/issues?returnState=DUE_TODAY',
    },
    admin
      ? {
          icon: UsersRound,
          label: 'Active employees',
          value: stats.activeWorkers,
          to: '/workers?status=ACTIVE',
        }
      : {
          icon: PackageOpen,
          label: 'Outstanding items',
          value: stats.outstandingItems,
          to: '/issues?returnState=PENDING',
        },
  ];
  return (
    <section
      aria-label="Operational summary"
      className="dashboard-enter grid grid-cols-2 overflow-hidden rounded-[8px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)] sm:grid-cols-3 xl:grid-cols-5"
    >
      {metrics.map(({ icon: Icon, label, value, to }) => (
        <Link
          className="group flex min-h-[72px] min-w-0 items-center gap-3 border-b border-r border-[var(--color-border)] px-4 py-3 transition-colors hover:bg-[var(--color-surface-tint)]"
          key={label}
          to={to}
        >
          <Icon aria-hidden="true" className="shrink-0 text-[var(--color-primary)]" size={17} />
          <span className="min-w-0 flex-1">
            <strong className="block text-base text-[var(--color-primary-strong)]">
              {value.toLocaleString('en-IN')}
            </strong>
            <span className="block truncate text-[11px] font-bold text-[var(--color-text-muted)]">
              {label}
            </span>
          </span>
          <ArrowRight
            aria-hidden="true"
            className="shrink-0 text-[var(--color-text-muted)] opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100"
            size={14}
          />
        </Link>
      ))}
    </section>
  );
}

function MetricCard({
  label,
  value,
  suffix,
  helper,
  icon: Icon,
  to,
  tone,
  index,
}: {
  label: string;
  value: number;
  suffix?: string;
  helper: string;
  icon: LucideIcon;
  to: string;
  tone: MetricTone;
  index: number;
}) {
  const classes = metricToneClasses[tone];
  return (
    <Link
      aria-label={`${label}: ${value}${suffix ?? ''}`}
      className="dashboard-metric group relative min-h-[148px] overflow-hidden rounded-[8px] border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-[var(--color-primary-border)] hover:shadow-[0_10px_28px_rgba(67,45,90,.10)]"
      style={{ animationDelay: `${index * 55}ms` }}
      to={to}
    >
      <span aria-hidden="true" className={cn('absolute inset-x-0 top-0 h-0.5', classes.accent)} />
      <div className="flex items-start justify-between gap-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-[8px]', classes.icon)}>
          <Icon aria-hidden="true" size={18} />
        </span>
        <ArrowRight
          aria-hidden="true"
          className="text-[var(--color-text-muted)] transition-transform group-hover:translate-x-1 group-hover:text-[var(--color-primary)]"
          size={17}
        />
      </div>
      <p className="mt-4 text-[28px] font-extrabold leading-none text-[var(--color-primary-strong)]">
        {value.toLocaleString('en-IN')}
        {suffix ? <span className="ml-0.5 text-lg">{suffix}</span> : null}
      </p>
      <h2 className="mt-2 text-sm font-extrabold text-[var(--color-text-strong)]">{label}</h2>
      <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">{helper}</p>
    </Link>
  );
}

function TrendPanel({ data, range }: { data: DashboardTrendPoint[]; range: DashboardRange }) {
  const [series, setSeries] = useState<'ALL' | 'ISSUED' | 'RETURNED'>('ALL');
  const buckets = useMemo(() => bucketTrend(data, range), [data, range]);
  const totalIssued = data.reduce((total, point) => total + point.issued, 0);
  const totalReturned = data.reduce((total, point) => total + point.returned, 0);
  const maximum = Math.max(1, ...buckets.flatMap((point) => [point.issued, point.returned]));
  const periodLabel = rangeOptions.find((option) => option.value === range)?.longLabel ?? range;

  return (
    <div className="dashboard-panel min-w-0 overflow-hidden rounded-[8px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 aria-hidden="true" className="text-[var(--color-primary)]" size={19} />
            <h2 className="font-extrabold text-[var(--color-primary-strong)]">Operations trend</h2>
          </div>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Issue records and completed return events · {periodLabel}
          </p>
        </div>
        <div
          aria-label="Trend series"
          className="flex rounded-[7px] bg-[var(--color-surface-tint)] p-1"
          role="group"
        >
          {(['ALL', 'ISSUED', 'RETURNED'] as const).map((value) => (
            <button
              aria-pressed={series === value}
              className={cn(
                'rounded-[5px] px-2.5 py-1.5 text-[11px] font-extrabold transition-colors',
                series === value
                  ? 'bg-white text-[var(--color-primary-strong)] shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-primary)]',
              )}
              key={value}
              onClick={() => setSeries(value)}
              type="button"
            >
              {value === 'ALL' ? 'All' : value === 'ISSUED' ? 'Issued' : 'Returned'}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 pb-4 pt-3 sm:px-5">
        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <TrendLegend color="bg-[var(--color-primary)]" label="Issued" value={totalIssued} />
          <TrendLegend color="bg-[var(--color-success)]" label="Returned" value={totalReturned} />
          <span className="ml-auto text-[11px] font-semibold text-[var(--color-text-muted)]">
            Hover bars for daily totals
          </span>
        </div>
        <div className="relative h-[214px] border-b border-l border-[var(--color-border)] pl-2 pt-2">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-[25%] border-t border-dashed border-[var(--color-border)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-[50%] border-t border-dashed border-[var(--color-border)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-[75%] border-t border-dashed border-[var(--color-border)]"
          />
          {buckets.length ? (
            <div
              className="relative grid h-full items-end gap-1"
              style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(8px, 1fr))` }}
            >
              {buckets.map((point, index) => (
                <div
                  aria-label={`${point.label}: ${point.issued} issued, ${point.returned} returned`}
                  className="group relative flex h-full min-w-0 items-end justify-center gap-0.5"
                  key={`${point.date}-${index}`}
                  role="img"
                  title={`${point.label}: ${point.issued} issued, ${point.returned} returned`}
                >
                  {series !== 'RETURNED' ? (
                    <span
                      aria-hidden="true"
                      className="dashboard-chart-bar w-[42%] max-w-4 rounded-t-[3px] bg-[var(--color-primary)] group-hover:bg-[var(--color-primary-hover)]"
                      style={{ height: barHeight(point.issued, maximum) }}
                    />
                  ) : null}
                  {series !== 'ISSUED' ? (
                    <span
                      aria-hidden="true"
                      className="dashboard-chart-bar w-[42%] max-w-4 rounded-t-[3px] bg-[var(--color-success)] group-hover:brightness-90"
                      style={{ height: barHeight(point.returned, maximum) }}
                    />
                  ) : null}
                  {showChartLabel(index, buckets.length) ? (
                    <span className="absolute -bottom-5 whitespace-nowrap text-[9px] font-bold text-[var(--color-text-muted)]">
                      {point.shortLabel}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid h-full place-items-center text-sm font-semibold text-[var(--color-text-muted)]">
              Trend data will appear after the first operation.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TrendLegend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)]">
      <span aria-hidden="true" className={cn('size-2 rounded-sm', color)} />
      {label}
      <strong className="text-sm text-[var(--color-text-strong)]">
        {value.toLocaleString('en-IN')}
      </strong>
    </span>
  );
}

function AttentionPanel({
  issues,
  stats,
  admin,
}: {
  issues: IssueSummary[];
  stats: DashboardData['stats'];
  admin: boolean;
}) {
  return (
    <div className="dashboard-panel overflow-hidden rounded-[8px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarClock aria-hidden="true" className="text-[var(--color-warning)]" size={19} />
            <h2 className="font-extrabold text-[var(--color-primary-strong)]">Needs attention</h2>
          </div>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {stats.overdueReturns} overdue · {stats.dueToday} due today
          </p>
        </div>
        <Link
          className="button-quiet !min-h-8 !px-2 !text-xs"
          to={admin ? '/overdue' : '/issues?returnState=PENDING'}
        >
          View all
        </Link>
      </div>
      {issues.length ? (
        <div className="divide-y divide-[var(--color-border)]">
          {issues.slice(0, 4).map((issue) => {
            const overdue = isBeforeTodayInIst(issue.expectedReturnAt);
            return (
              <Link
                className="group flex min-h-[76px] items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-surface-tint)]"
                key={issue.issueId}
                to={`/issues/${issue.issueId}`}
              >
                <span
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-[8px]',
                    overdue
                      ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
                      : 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
                  )}
                >
                  {overdue ? (
                    <AlertTriangle aria-hidden="true" size={17} />
                  ) : (
                    <Clock3 aria-hidden="true" size={17} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <strong className="truncate text-xs text-[var(--color-primary-strong)]">
                      {issue.issueId}
                    </strong>
                    <span
                      className={cn(
                        'shrink-0 text-[10px] font-extrabold uppercase',
                        overdue ? 'text-[var(--color-danger)]' : 'text-[var(--color-warning)]',
                      )}
                    >
                      {overdue ? 'Overdue' : 'Due today'}
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-text-strong)]">
                    {issue.receiver.fullName}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-[var(--color-text-muted)]">
                    {issue.totalOutstandingQuantity} outstanding ·{' '}
                    {formatIstDateTime(issue.expectedReturnAt)}
                  </span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="shrink-0 text-[var(--color-text-muted)] transition-transform group-hover:translate-x-1"
                  size={16}
                />
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="grid min-h-[250px] place-items-center px-6 py-10 text-center">
          <div>
            <span className="mx-auto grid size-11 place-items-center rounded-[8px] bg-[var(--color-success-soft)] text-[var(--color-success)]">
              <CheckCircle2 aria-hidden="true" size={21} />
            </span>
            <p className="mt-3 text-sm font-extrabold text-[var(--color-text-strong)]">
              Queue is clear
            </p>
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
              No overdue or due-today returns need action.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function InventoryHealth({ inventory }: { inventory: DashboardInventory }) {
  const [trackingMode, setTrackingMode] = useState<TrackingMode | 'ALL'>('ALL');
  const [status, setStatus] = useState<MaterialStatus | 'ALL'>('ALL');
  const modeRows = inventory.breakdown.filter(
    (row) => trackingMode === 'ALL' || row.trackingMode === trackingMode,
  );
  const visibleRows = modeRows.filter((row) => status === 'ALL' || row.status === status);
  const totals = sumInventory(visibleRows);
  const availability = totals.totalQuantity
    ? Math.round((totals.availableQuantity / totals.totalQuantity) * 100)
    : 0;
  const distribution = inventoryStatuses
    .filter((item) => item.value !== 'ALL')
    .map((item) => ({
      ...item,
      total: modeRows
        .filter((row) => row.status === item.value)
        .reduce((sum, row) => sum + row.totalQuantity, 0),
    }));
  const distributionMax = Math.max(1, ...distribution.map((item) => item.total));
  const query = new URLSearchParams();
  if (trackingMode !== 'ALL') query.set('trackingMode', trackingMode);
  if (status !== 'ALL') query.set('status', status);
  const inventoryPath = `/inventory${query.size ? `?${query.toString()}` : ''}`;

  return (
    <div className="dashboard-panel overflow-hidden rounded-[8px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div>
          <div className="flex items-center gap-2">
            <Boxes aria-hidden="true" className="text-[var(--color-primary)]" size={19} />
            <h2 className="font-extrabold text-[var(--color-primary-strong)]">Inventory health</h2>
          </div>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Physical quantity by material type and state
          </p>
        </div>
        <Link className="button-quiet !min-h-8 !px-2 !text-xs" to={inventoryPath}>
          Open inventory <ArrowRight aria-hidden="true" size={14} />
        </Link>
      </div>
      <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(230px,0.75fr)_minmax(0,1.25fr)]">
        <div>
          <div
            aria-label="Material type"
            className="grid grid-cols-3 rounded-[7px] bg-[var(--color-surface-tint)] p-1"
            role="group"
          >
            {(
              [
                ['ALL', 'All'],
                ['SERIALIZED', 'Assets'],
                ['QUANTITY', 'Consumables'],
              ] as const
            ).map(([value, label]) => (
              <button
                aria-pressed={trackingMode === value}
                className={cn(
                  'rounded-[5px] px-2 py-1.5 text-[11px] font-extrabold transition-colors',
                  trackingMode === value
                    ? 'bg-white text-[var(--color-primary-strong)] shadow-sm'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-primary)]',
                )}
                key={value}
                onClick={() => setTrackingMode(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <label className="mt-3 block text-xs font-bold text-[var(--color-text-muted)]">
            Inventory state
            <select
              className="field-input field-input-compact mt-1"
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
          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <span className="text-[11px] font-extrabold uppercase text-[var(--color-text-muted)]">
                Availability
              </span>
              <p className="mt-1 text-3xl font-extrabold text-[var(--color-primary-strong)]">
                {availability}%
              </p>
            </div>
            <p className="text-right text-[11px] font-semibold leading-5 text-[var(--color-text-muted)]">
              {totals.availableQuantity.toLocaleString('en-IN')} available
              <br />
              {totals.issuedQuantity.toLocaleString('en-IN')} issued
            </p>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-surface-tint)]">
            <div
              className="dashboard-progress h-full rounded-full bg-[var(--color-success)]"
              style={{ width: `${availability}%` }}
            />
          </div>
        </div>
        <div className="space-y-2.5 border-t border-[var(--color-border)] pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          {distribution.map((item) => (
            <Link
              className={cn(
                'group grid grid-cols-[112px_minmax(0,1fr)_auto] items-center gap-2 text-[11px] font-bold',
                status === item.value
                  ? 'text-[var(--color-primary-strong)]'
                  : 'text-[var(--color-text-muted)]',
              )}
              key={item.value}
              to={`/inventory?${new URLSearchParams({
                ...(trackingMode === 'ALL' ? {} : { trackingMode }),
                status: item.value,
              }).toString()}`}
            >
              <span className="truncate">{item.label}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-tint)]">
                <span
                  className={cn(
                    'dashboard-progress block h-full rounded-full',
                    item.value === 'ACTIVE'
                      ? 'bg-[var(--color-success)]'
                      : item.value === 'UNDER_MAINTENANCE'
                        ? 'bg-[var(--color-warning)]'
                        : item.value === 'SCRAP'
                          ? 'bg-[var(--color-danger)]'
                          : 'bg-[var(--color-info)]',
                  )}
                  style={{ width: `${(item.total / distributionMax) * 100}%` }}
                />
              </span>
              <span className="min-w-9 text-right text-[var(--color-text-strong)]">
                {item.total.toLocaleString('en-IN')}
              </span>
            </Link>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-[var(--color-border)] border-t border-[var(--color-border)]">
        <CompactMetric
          icon={ClipboardList}
          label="Materials"
          to={inventoryPath}
          value={totals.materialCount}
        />
        <CompactMetric
          icon={PackageOpen}
          label="Total units"
          to={inventoryPath}
          value={totals.totalQuantity}
        />
        <CompactMetric
          icon={Clock3}
          label="Issued"
          to={`${inventoryPath}${inventoryPath.includes('?') ? '&' : '?'}stockState=ISSUED`}
          value={totals.issuedQuantity}
        />
      </div>
    </div>
  );
}

function CartridgePipeline() {
  const query = useQuery({ queryKey: ['cartridge-dashboard'], queryFn: getCartridgeDashboard });
  const counts = query.data?.data.counts ?? {};
  const statuses: Array<{ key: string; label: string; tone: string }> = [
    { key: 'FILLED_AVAILABLE', label: 'Filled available', tone: 'bg-[var(--color-success)]' },
    { key: 'ISSUED', label: 'Issued', tone: 'bg-[var(--color-primary)]' },
    { key: 'EMPTY', label: 'Empty', tone: 'bg-[var(--color-warning)]' },
    { key: 'DEFECTIVE', label: 'Defective', tone: 'bg-[var(--color-danger)]' },
    { key: 'READY_FOR_GATE_OUT', label: 'Ready for Gate Out', tone: 'bg-[#d97706]' },
    { key: 'WITH_VENDOR', label: 'With vendor', tone: 'bg-[var(--color-info)]' },
    { key: 'QC_PENDING', label: 'QC pending', tone: 'bg-[#7c3aed]' },
    { key: 'REFILL_FAILED', label: 'Refill failed', tone: 'bg-[#c2410c]' },
    { key: 'DAMAGED', label: 'Damaged', tone: 'bg-[#b42318]' },
    { key: 'SCRAP_PENDING', label: 'Scrap pending', tone: 'bg-[#b54708]' },
    { key: 'SCRAPPED', label: 'Scrapped', tone: 'bg-[#667085]' },
  ];
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const maximum = Math.max(1, ...statuses.map((status) => counts[status.key] ?? 0));

  return (
    <div className="dashboard-panel overflow-hidden rounded-[8px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-4">
        <div>
          <div className="flex items-center gap-2">
            <Printer aria-hidden="true" className="text-[var(--color-primary)]" size={19} />
            <h2 className="font-extrabold text-[var(--color-primary-strong)]">
              Cartridge pipeline
            </h2>
          </div>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Live stock and refill workflow
          </p>
        </div>
        <Link className="button-quiet !min-h-8 !px-2 !text-xs" to="/cartridges/dashboard">
          Details
        </Link>
      </div>
      {query.isPending ? (
        <div className="space-y-3 p-4" aria-label="Loading cartridge pipeline">
          {[0, 1, 2, 3].map((item) => (
            <div className="skeleton h-5 rounded" key={item} />
          ))}
        </div>
      ) : query.isError ? (
        <div className="grid min-h-[220px] place-items-center p-5 text-center text-xs font-semibold text-[var(--color-text-muted)]">
          Cartridge overview is temporarily unavailable.
        </div>
      ) : (
        <>
          <div className="p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <span className="text-[11px] font-extrabold uppercase text-[var(--color-text-muted)]">
                  Tracked cartridges
                </span>
                <p className="mt-1 text-3xl font-extrabold text-[var(--color-primary-strong)]">
                  {total.toLocaleString('en-IN')}
                </p>
              </div>
              <Link
                className="text-right text-xs font-extrabold text-[var(--color-primary)] hover:underline"
                to="/cartridges/gate-passes"
              >
                {query.data.data.openGatePasses} open gate passes
              </Link>
            </div>
            <div className="mt-4 space-y-2.5">
              {statuses.map((status) => {
                const value = counts[status.key] ?? 0;
                return (
                  <Link
                    className="group grid grid-cols-[104px_minmax(0,1fr)_auto] items-center gap-2 text-[11px] font-bold text-[var(--color-text-muted)]"
                    key={status.key}
                    to={`/cartridges?status=${status.key}`}
                  >
                    <span className="truncate group-hover:text-[var(--color-primary)]">
                      {status.label}
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-tint)]">
                      <span
                        className={cn('dashboard-progress block h-full rounded-full', status.tone)}
                        style={{ width: `${(value / maximum) * 100}%` }}
                      />
                    </span>
                    <span className="min-w-8 text-right text-[var(--color-text-strong)]">
                      {value.toLocaleString('en-IN')}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-[var(--color-border)] border-t border-[var(--color-border)]">
            <CompactMetric icon={Gauge} label="Pipeline" to="/cartridges/dashboard" value={total} />
            <CompactMetric
              icon={FileClock}
              label="Gate passes"
              to="/cartridges/gate-passes"
              value={query.data.data.openGatePasses}
            />
          </div>
        </>
      )}
    </div>
  );
}

function CompactMetric({
  icon: Icon,
  label,
  value,
  to,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  to: string;
}) {
  return (
    <Link
      className="group flex min-h-[70px] min-w-0 items-center gap-2.5 px-3 py-3 transition-colors hover:bg-[var(--color-surface-tint)]"
      to={to}
    >
      <Icon aria-hidden="true" className="shrink-0 text-[var(--color-primary)]" size={17} />
      <span className="min-w-0">
        <strong className="block text-base text-[var(--color-primary-strong)]">
          {value.toLocaleString('en-IN')}
        </strong>
        <span className="block truncate text-[10px] font-bold text-[var(--color-text-muted)]">
          {label}
        </span>
      </span>
      <ArrowRight
        aria-hidden="true"
        className="ml-auto shrink-0 text-[var(--color-text-muted)] opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100"
        size={14}
      />
    </Link>
  );
}

interface DashboardAction {
  label: string;
  helper: string;
  to: string;
  icon: LucideIcon;
  permission?: WorkerPermission;
}

function ActionCenter({ user }: { user: AuthUser }) {
  const allActions: DashboardAction[] = [
    {
      label: 'Issue material',
      helper: 'Create a new issue',
      to: '/issues/new',
      icon: PackagePlus,
      permission: 'ASSIGNMENTS_CREATE',
    },
    {
      label: 'Record return',
      helper: 'Receive issued material',
      to: '/returns',
      icon: RotateCcw,
      permission: 'RETURNS_RECORD',
    },
    {
      label: 'Add material',
      helper: 'Register stock',
      to: '/inventory/new',
      icon: Boxes,
      permission: 'INVENTORY_ADD',
    },
    { label: 'Add employee', helper: 'Create team access', to: '/workers/new', icon: UserPlus },
    {
      label: 'Add cartridges',
      helper: 'Register serialized stock',
      to: '/cartridges/new',
      icon: Printer,
      permission: 'CARTRIDGES_ADD',
    },
    {
      label: 'Reports',
      helper: 'Review operational data',
      to: '/reports',
      icon: FileBarChart,
      permission: 'REPORTS_VIEW',
    },
  ];
  const actions = allActions.filter((action) => {
    if (user.role === 'ADMIN') return true;
    if (action.label === 'Add employee') return false;
    return action.permission ? hasPermission(user, action.permission) : true;
  });

  return (
    <div className="dashboard-panel overflow-hidden rounded-[8px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)]">
      <div className="border-b border-[var(--color-border)] px-4 py-4 sm:px-5">
        <div className="flex items-center gap-2">
          <Activity aria-hidden="true" className="text-[var(--color-primary)]" size={19} />
          <h2 className="font-extrabold text-[var(--color-primary-strong)]">Action center</h2>
        </div>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Start common workflows from one place
        </p>
      </div>
      {actions.length ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3">
          {actions.map(({ icon: Icon, label, helper, to }) => (
            <Link
              className="group flex min-h-[88px] items-center gap-3 border-b border-r border-[var(--color-border)] px-4 py-3 transition-colors hover:bg-[var(--color-surface-tint)]"
              key={to}
              to={to}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-[var(--color-primary-soft)] text-[var(--color-primary)] transition-colors group-hover:bg-[var(--color-primary)] group-hover:text-white">
                <Icon aria-hidden="true" size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm text-[var(--color-text-strong)]">{label}</strong>
                <span className="mt-0.5 block truncate text-[11px] text-[var(--color-text-muted)]">
                  {helper}
                </span>
              </span>
              <ArrowRight
                aria-hidden="true"
                className="shrink-0 text-[var(--color-text-muted)] transition-transform group-hover:translate-x-1"
                size={15}
              />
            </Link>
          ))}
        </div>
      ) : (
        <div className="px-5 py-8 text-center text-sm text-[var(--color-text-muted)]">
          No operational actions are assigned.
        </div>
      )}
    </div>
  );
}

function TeamSnapshot({ stats }: { stats: DashboardData['stats'] }) {
  const issuesPerWorker = stats.activeWorkers ? stats.totalIssues / stats.activeWorkers : 0;
  const outstandingPerWorker = stats.activeWorkers
    ? stats.outstandingItems / stats.activeWorkers
    : 0;
  return (
    <div className="dashboard-panel overflow-hidden rounded-[8px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)]">
      <div className="border-b border-[var(--color-border)] px-4 py-4">
        <div className="flex items-center gap-2">
          <UsersRound aria-hidden="true" className="text-[var(--color-primary)]" size={19} />
          <h2 className="font-extrabold text-[var(--color-primary-strong)]">Team snapshot</h2>
        </div>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          People and operational workload
        </p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-[var(--color-border)] border-b border-[var(--color-border)]">
        <CompactMetric
          icon={UsersRound}
          label="Active employees"
          to="/workers?status=ACTIVE"
          value={stats.activeWorkers}
        />
        <CompactMetric
          icon={Clock3}
          label="Items outside"
          to="/issues?returnState=PENDING"
          value={stats.outstandingItems}
        />
      </div>
      <div className="space-y-3 px-4 py-4">
        <SnapshotRow label="Issue records per active employee" value={issuesPerWorker.toFixed(1)} />
        <SnapshotRow
          label="Outstanding items per employee"
          value={outstandingPerWorker.toFixed(1)}
        />
        <div className="flex gap-2 pt-1">
          <Link className="button-secondary flex-1 !min-h-9 !text-xs" to="/workers">
            Employees
          </Link>
          <Link className="button-secondary flex-1 !min-h-9 !text-xs" to="/audit">
            Audit logs
          </Link>
        </div>
      </div>
    </div>
  );
}

function AccessSnapshot({ user }: { user: AuthUser }) {
  const modules = [
    {
      label: 'Issues',
      icon: ClipboardList,
      enabled: permissionGroup(user, ['ISSUES_VIEW', 'ASSIGNMENTS_CREATE', 'RETURNS_RECORD']),
      scope: user.dataAccess.issues,
    },
    {
      label: 'Inventory',
      icon: Boxes,
      enabled: permissionGroup(user, ['INVENTORY_VIEW', 'INVENTORY_ADD']),
      scope: user.dataAccess.inventory,
    },
    {
      label: 'Cartridges',
      icon: Printer,
      enabled: permissionGroup(user, ['CARTRIDGES_VIEW', 'CARTRIDGES_ISSUE', 'CARTRIDGES_RETURN']),
      scope: user.dataAccess.cartridges,
    },
    {
      label: 'Receivers',
      icon: UsersRound,
      enabled: permissionGroup(user, ['RECEIVERS_VIEW', 'RECEIVERS_ADD']),
      scope: null,
    },
  ].filter((item) => item.enabled);
  return (
    <div className="dashboard-panel overflow-hidden rounded-[8px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)]">
      <div className="border-b border-[var(--color-border)] px-4 py-4">
        <div className="flex items-center gap-2">
          <ShieldCheck aria-hidden="true" className="text-[var(--color-primary)]" size={19} />
          <h2 className="font-extrabold text-[var(--color-primary-strong)]">Access overview</h2>
        </div>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Modules available in your workspace
        </p>
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {modules.map(({ label, icon: Icon, scope }) => (
          <div className="flex min-h-[54px] items-center gap-3 px-4 py-2.5" key={label}>
            <Icon aria-hidden="true" className="text-[var(--color-primary)]" size={17} />
            <span className="flex-1 text-xs font-extrabold text-[var(--color-text-strong)]">
              {label}
            </span>
            <span className="rounded-full bg-[var(--color-success-soft)] px-2 py-1 text-[10px] font-extrabold uppercase text-[var(--color-success)]">
              {scope === 'ALL' ? 'All data' : scope === 'OWN' ? 'Own data' : 'Enabled'}
            </span>
          </div>
        ))}
        {!modules.length ? (
          <p className="px-4 py-8 text-center text-xs text-[var(--color-text-muted)]">
            No operational modules assigned.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <strong className="text-[var(--color-text-strong)]">{value}</strong>
    </div>
  );
}

function RecentActivity({ issues }: { issues: IssueSummary[] }) {
  return (
    <section className="dashboard-enter overflow-hidden rounded-[8px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-4 sm:px-5">
        <div>
          <div className="flex items-center gap-2">
            <ListChecks aria-hidden="true" className="text-[var(--color-primary)]" size={19} />
            <h2 className="font-extrabold text-[var(--color-primary-strong)]">
              Recent issue activity
            </h2>
          </div>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Latest records in the current access scope
          </p>
        </div>
        <Link className="button-quiet !min-h-8 !px-2 !text-xs" to="/issues">
          View all
        </Link>
      </div>
      {issues.length ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-[var(--color-surface-tint)] text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-5 py-3 font-extrabold">Issue</th>
                  <th className="px-4 py-3 font-extrabold">Receiver</th>
                  <th className="px-4 py-3 font-extrabold">Material</th>
                  <th className="px-4 py-3 font-extrabold">Issued</th>
                  <th className="px-4 py-3 font-extrabold">Outstanding</th>
                  <th className="px-4 py-3 font-extrabold">Status</th>
                  <th className="px-5 py-3 text-right font-extrabold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {issues.map((issue) => (
                  <tr
                    className="transition-colors hover:bg-[var(--color-surface-tint)]"
                    key={issue.issueId}
                  >
                    <td className="px-5 py-3.5 font-extrabold text-[var(--color-primary-strong)]">
                      {issue.issueId}
                    </td>
                    <td className="max-w-44 truncate px-4 py-3.5 font-semibold text-[var(--color-text-strong)]">
                      {issue.receiver.fullName}
                    </td>
                    <td className="max-w-48 truncate px-4 py-3.5 text-[var(--color-text-muted)]">
                      {materialSummary(issue)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-[var(--color-text-muted)]">
                      {formatIstDateTime(issue.issuedAt)}
                    </td>
                    <td className="px-4 py-3.5 font-extrabold text-[var(--color-text-strong)]">
                      {issue.totalOutstandingQuantity}
                    </td>
                    <td className="px-4 py-3.5">
                      <CatalogBadge value={issue.status} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        aria-label={`View ${issue.issueId}`}
                        className="button-quiet !min-h-8 !px-2"
                        to={`/issues/${issue.issueId}`}
                      >
                        <ArrowRight aria-hidden="true" size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-[var(--color-border)] md:hidden">
            {issues.map((issue) => (
              <Link
                className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-[var(--color-surface-tint)]"
                key={issue.issueId}
                to={`/issues/${issue.issueId}`}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                  <ClipboardList aria-hidden="true" size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-xs text-[var(--color-primary-strong)]">
                    {issue.issueId} · {issue.receiver.fullName}
                  </strong>
                  <span className="mt-1 block truncate text-[11px] text-[var(--color-text-muted)]">
                    {materialSummary(issue)} · {issue.totalOutstandingQuantity} outstanding
                  </span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="shrink-0 text-[var(--color-text-muted)]"
                  size={16}
                />
              </Link>
            ))}
          </div>
        </>
      ) : (
        <div className="grid min-h-[150px] place-items-center px-5 py-8 text-center">
          <div>
            <ClipboardList
              aria-hidden="true"
              className="mx-auto text-[var(--color-text-muted)]"
              size={24}
            />
            <p className="mt-2 text-sm font-extrabold text-[var(--color-text-strong)]">
              No recent issue activity
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              New records will appear here automatically.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function bucketTrend(points: DashboardTrendPoint[], range: DashboardRange) {
  const bucketSize = range === '7D' ? 1 : range === '30D' ? 2 : 6;
  const buckets: Array<DashboardTrendPoint & { label: string; shortLabel: string }> = [];
  for (let index = 0; index < points.length; index += bucketSize) {
    const group = points.slice(index, index + bucketSize);
    const last = group[group.length - 1];
    if (!last) continue;
    const first = group[0] ?? last;
    const issued = group.reduce((sum, point) => sum + point.issued, 0);
    const returned = group.reduce((sum, point) => sum + point.returned, 0);
    const startLabel = chartDateLabel(first.date);
    const endLabel = chartDateLabel(last.date);
    buckets.push({
      date: last.date,
      issued,
      returned,
      label: first.date === last.date ? startLabel : `${startLabel} - ${endLabel}`,
      shortLabel: endLabel,
    });
  }
  return buckets;
}

function chartDateLabel(date: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(`${date}T00:00:00+05:30`));
}

function barHeight(value: number, maximum: number): string {
  return value === 0 ? '2px' : `${Math.max(8, (value / maximum) * 100)}%`;
}

function showChartLabel(index: number, total: number): boolean {
  if (total <= 7) return true;
  const middle = Math.floor((total - 1) / 2);
  return index === 0 || index === middle || index === total - 1;
}

function isBeforeTodayInIst(value: string | null): boolean {
  if (!value) return false;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
  return formatter.format(new Date(value)) < formatter.format(new Date());
}

function sumInventory(rows: DashboardInventory['breakdown']) {
  return rows.reduce(
    (total, row) => ({
      materialCount: total.materialCount + row.materialCount,
      totalQuantity: total.totalQuantity + row.totalQuantity,
      availableQuantity: total.availableQuantity + row.availableQuantity,
      issuedQuantity: total.issuedQuantity + row.issuedQuantity,
    }),
    { materialCount: 0, totalQuantity: 0, availableQuantity: 0, issuedQuantity: 0 },
  );
}

function permissionGroup(user: AuthUser, permissions: WorkerPermission[]): boolean {
  return permissions.some((permission) => hasPermission(user, permission));
}

function materialSummary(issue: IssueSummary): string {
  const first = issue.materialNames[0] ?? 'Material';
  const remaining = issue.materialNames.length - 1;
  return remaining > 0 ? `${first} + ${remaining} more` : first;
}
