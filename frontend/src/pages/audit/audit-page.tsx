import { useQuery } from '@tanstack/react-query';
import { FileClock, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router';

import type { AuditEvent, AuditResult, UserRole } from '@assetdesk/contracts';

import { PageCount } from '../../components/catalog-ui';
import {
  AppCard,
  Button,
  EmptyState,
  ErrorState,
  LoadingPanel,
  PageHeader,
  SearchForm,
} from '../../components/ui';
import { getAuditEvents } from '../../lib/audit-api';
import { formatIstDateTime, toIstDateTimeInput } from '../../lib/date-time';

const actions = [
  'AUTH_LOGIN',
  'AUTH_LOGOUT',
  'ISSUE_CREATED',
  'RETURN_RECORDED',
  'RETURN_REMINDER_SENT',
  'WORKER_CREATED',
  'WORKER_STATUS_CHANGED',
  'RECEIVER_CREATED',
  'NOTIFICATION_RETRY_REQUESTED',
  'REPORT_ISSUE_REGISTER_EXPORTED',
];

function dateDaysAgo(days: number): string {
  return toIstDateTimeInput(new Date(Date.now() - days * 86_400_000)).slice(0, 10);
}

export function AuditPage() {
  const [parameters, setParameters] = useSearchParams();
  const today = parameters.get('today') === '1';
  const page = Math.max(1, Number(parameters.get('page')) || 1);
  const from = parameters.get('from') ?? dateDaysAgo(today ? 0 : 30);
  const to = parameters.get('to') ?? dateDaysAgo(0);
  const search = parameters.get('search') ?? '';
  const action = parameters.get('action') ?? '';
  const result = (parameters.get('result') as AuditResult | null) ?? '';
  const actorRole = (parameters.get('actorRole') as UserRole | null) ?? '';
  const query = useQuery({
    queryKey: ['audit-events', { page, from, to, search, action, result, actorRole }],
    queryFn: ({ signal }) =>
      getAuditEvents(
        {
          page,
          from,
          to,
          ...(search ? { search } : {}),
          ...(action ? { action } : {}),
          ...(result ? { result } : {}),
          ...(actorRole ? { actorRole } : {}),
        },
        signal,
      ),
    placeholderData: (previous) => previous,
  });

  function update(updates: Record<string, string>) {
    const next = new URLSearchParams(parameters);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!Object.hasOwn(updates, 'page')) next.set('page', '1');
    setParameters(next);
  }

  const events = query.data?.data ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        description="Immutable operational evidence showing who performed each protected action and when."
        title="Audit logs"
      />
      <AppCard>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_160px_160px_180px_180px]">
          <SearchForm
            className="self-end"
            id="audit-search"
            key={search}
            label="Search audit logs"
            onSearch={(value) => update({ search: value })}
            placeholder="Employee ID, target or request ID"
            value={search}
          />
          <Filter
            label="Result"
            onChange={(value) => update({ result: value })}
            value={result}
            options={[
              ['', 'All results'],
              ['SUCCESS', 'Success'],
              ['DENIED', 'Denied'],
              ['FAILED', 'Failed'],
            ]}
          />
          <Filter
            label="Actor role"
            onChange={(value) => update({ actorRole: value })}
            value={actorRole}
            options={[
              ['', 'All roles'],
              ['ADMIN', 'Admin'],
              ['WORKER', 'Employee'],
            ]}
          />
          <label className="space-y-1 text-xs font-bold text-[var(--color-text-muted)]">
            From
            <input
              className="field-input"
              max={to}
              onChange={(event) => update({ from: event.target.value })}
              type="date"
              value={from}
            />
          </label>
          <label className="space-y-1 text-xs font-bold text-[var(--color-text-muted)]">
            Through
            <input
              className="field-input"
              min={from}
              onChange={(event) => update({ to: event.target.value })}
              type="date"
              value={to}
            />
          </label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(220px,320px)_auto]">
          <Filter
            label="Action"
            onChange={(value) => update({ action: value })}
            value={action}
            options={[
              ['', 'All actions'],
              ...actions.map((value) => [value, actionLabel(value)] as [string, string]),
            ]}
          />
          {query.data ? <PageCount count={query.data.meta.total} noun="audit event" /> : null}
        </div>
      </AppCard>

      {query.isPending ? (
        <LoadingPanel label="Loading audit logs" />
      ) : query.isError ? (
        <ErrorState
          message="Audit logs could not be loaded."
          onRetry={() => void query.refetch()}
        />
      ) : events.length === 0 ? (
        <EmptyState
          message="Change the dates or filters to review other activity."
          title="No audit events match"
        />
      ) : (
        <>
          <div className="space-y-3 min-[840px]:hidden">
            {events.map((event) => (
              <AuditCard event={event} key={event.id} />
            ))}
          </div>
          <AuditTable events={events} />
          {query.data && query.data.meta.totalPages > 1 ? (
            <nav aria-label="Audit pages" className="flex items-center justify-between gap-3">
              <Button
                disabled={page <= 1}
                onClick={() => update({ page: String(page - 1) })}
                variant="secondary"
              >
                Previous
              </Button>
              <p className="text-sm font-semibold text-[var(--color-text-muted)]">
                Page {page} of {query.data.meta.totalPages}
              </p>
              <Button
                disabled={page >= query.data.meta.totalPages}
                onClick={() => update({ page: String(page + 1) })}
                variant="secondary"
              >
                Next
              </Button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="space-y-1 text-xs font-bold text-[var(--color-text-muted)]">
      {label}
      <select
        className="field-input"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function actionLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function ResultBadge({ result }: { result: AuditResult }) {
  const style =
    result === 'SUCCESS'
      ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
      : result === 'DENIED'
        ? 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]'
        : 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]';
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${style}`}>
      {result === 'SUCCESS' ? 'Success' : result === 'DENIED' ? 'Denied' : 'Failed'}
    </span>
  );
}

function AuditDetails({ event }: { event: AuditEvent }) {
  return (
    <details className="mt-3 rounded-[10px] bg-[var(--color-surface-tint)] p-3">
      <summary className="cursor-pointer text-xs font-bold text-[var(--color-primary)]">
        View evidence details
      </summary>
      <dl className="mt-3 grid gap-2 text-xs">
        <div>
          <dt className="font-bold text-[var(--color-text-muted)]">Request ID</dt>
          <dd className="mt-1 break-all">{event.requestId}</dd>
        </div>
        {event.reasonCode ? (
          <div>
            <dt className="font-bold text-[var(--color-text-muted)]">Reason</dt>
            <dd className="mt-1">{event.reasonCode}</dd>
          </div>
        ) : null}
        {event.metadata
          ? Object.entries(event.metadata).map(([key, value]) => (
              <div key={key}>
                <dt className="font-bold text-[var(--color-text-muted)]">{actionLabel(key)}</dt>
                <dd className="mt-1 break-words">
                  {typeof value === 'string' ? value : JSON.stringify(value)}
                </dd>
              </div>
            ))
          : null}
      </dl>
    </details>
  );
}

function AuditCard({ event }: { event: AuditEvent }) {
  return (
    <article className="rounded-[14px] border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
            <FileClock aria-hidden="true" size={18} />
          </span>
          <div>
            <h2 className="text-sm font-extrabold text-[var(--color-text-strong)]">
              {actionLabel(event.action)}
            </h2>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {event.actorWorkerId ?? 'System'} · {formatIstDateTime(event.timestampUtc)}
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {event.targetType}
              {event.targetId ? ` · ${event.targetId}` : ''}
            </p>
          </div>
        </div>
        <ResultBadge result={event.result} />
      </div>
      <AuditDetails event={event} />
    </article>
  );
}

function AuditTable({ events }: { events: AuditEvent[] }) {
  return (
    <div className="hidden overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)] min-[840px]:block">
      <table className="w-full border-collapse text-left">
        <thead className="bg-[var(--color-surface-tint)] text-xs text-[var(--color-text-muted)]">
          <tr>
            <th className="h-11 px-4">Time</th>
            <th className="h-11 px-4">Actor</th>
            <th className="h-11 px-4">Action</th>
            <th className="h-11 px-4">Target</th>
            <th className="h-11 px-4">Result / Evidence</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {events.map((event) => (
            <tr className="align-top" key={event.id}>
              <td className="px-4 py-4 text-xs text-[var(--color-text-muted)]">
                {formatIstDateTime(event.timestampUtc)}
              </td>
              <td className="px-4 py-4 text-sm font-bold">{event.actorWorkerId ?? 'System'}</td>
              <td className="px-4 py-4 text-sm">
                <div className="flex items-center gap-2">
                  <ShieldCheck
                    aria-hidden="true"
                    className="text-[var(--color-primary)]"
                    size={17}
                  />
                  {actionLabel(event.action)}
                </div>
              </td>
              <td className="px-4 py-4 text-sm">
                {event.targetType}
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {event.targetId ?? 'No target ID'}
                </p>
              </td>
              <td className="px-4 py-4">
                <ResultBadge result={event.result} />
                <AuditDetails event={event} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
