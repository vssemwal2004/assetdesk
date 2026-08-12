import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileClock } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';

import { CatalogBadge, PageCount } from '../../components/catalog-ui';
import {
  AppCard,
  Button,
  ErrorState,
  LoadingPanel,
  PageHeader,
  SearchForm,
} from '../../components/ui';
import { getCartridgeActivity } from '../../lib/cartridges-api';
import { humanizeCatalogValue } from '../../lib/catalog-format';

const activityTypes = [
  'CREATED',
  'ISSUED',
  'RETURNED',
  'GATE_PASS_CREATED',
  'GATE_PASS_VERIFIED',
  'GATE_PASS_CANCELLED',
  'GATE_OUT',
  'GATE_IN',
  'QC',
  'STATUS_CHANGED',
] as const;

function formatDateTime(value: string): string {
  return `${new Date(value).toLocaleString('en-IN')} IST`;
}

function statusChange(fromStatus: string | null, toStatus: string): string {
  return fromStatus
    ? `${humanizeCatalogValue(fromStatus)} -> ${humanizeCatalogValue(toStatus)}`
    : humanizeCatalogValue(toStatus);
}

export function CartridgeActivityPage() {
  const [parameters, setParameters] = useSearchParams();
  const search = parameters.get('search') ?? '';
  const type = parameters.get('type') ?? '';
  const page = Number(parameters.get('page') ?? '1');
  const query = useQuery({
    queryKey: ['cartridge-activity', { search, type, page }],
    queryFn: () => getCartridgeActivity({ search, type, page, pageSize: 50 }),
  });

  function updateParameters(updates: Record<string, string>) {
    const next = new URLSearchParams(parameters);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!('page' in updates)) next.delete('page');
    setParameters(next);
  }

  const rows = query.data?.data ?? [];
  const meta = query.data?.meta;

  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          <Link className="button-quiet" to="/cartridges">
            <ArrowLeft aria-hidden="true" size={18} />
            Cartridges
          </Link>
        }
        description="Complete cartridge movement trail across issue, return, Gate Pass, Gate In, and QC."
        title="Cartridge Activity Log"
      />

      <AppCard className="max-w-none">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
            <FileClock aria-hidden="true" size={22} />
          </span>
          <div>
            <h2 className="font-extrabold text-[var(--color-primary-strong)]">Movement history</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
              Search by serial number, employee, status, remarks, or worker ID.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
          <SearchForm
            id="cartridge-activity-search"
            key={search}
            label="Search cartridge activity"
            onSearch={(value) => updateParameters({ search: value })}
            placeholder="Serial, employee, status, remarks or worker ID"
            value={search}
          />
          <label>
            <span className="sr-only">Filter by activity type</span>
            <select
              className="field-input"
              onChange={(event) => updateParameters({ type: event.target.value })}
              value={type}
            >
              <option value="">All activity types</option>
              {activityTypes.map((activityType) => (
                <option key={activityType} value={activityType}>
                  {humanizeCatalogValue(activityType)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {meta ? <PageCount count={meta.total} noun="activity record" /> : null}
      </AppCard>

      {query.isPending ? (
        <LoadingPanel label="Loading cartridge activity" />
      ) : query.isError ? (
        <ErrorState
          message="Cartridge activity could not be loaded."
          onRetry={() => void query.refetch()}
        />
      ) : rows.length === 0 ? (
        <AppCard>
          <p className="text-sm font-semibold text-[var(--color-text-muted)]">
            No cartridge activity matches the current filters.
          </p>
        </AppCard>
      ) : (
        <>
          <AppCard className="hidden max-w-none overflow-x-auto p-0 sm:p-0 min-[900px]:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--color-surface-tint)] text-xs uppercase text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Serial</th>
                  <th className="px-4 py-3">Activity</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Person / Department</th>
                  <th className="px-4 py-3">Remarks</th>
                  <th className="px-4 py-3">Worker</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="border-t border-[var(--color-border)]" key={row.id}>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-[var(--color-text-muted)]">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        className="font-extrabold text-[var(--color-primary)] hover:underline"
                        to={`/cartridges/${encodeURIComponent(row.serialNumber)}`}
                      >
                        {row.serialNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <CatalogBadge value={row.type} />
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {statusChange(row.fromStatus, row.toStatus)}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">
                      {[row.employeeName, row.employeeId, row.department]
                        .filter(Boolean)
                        .join(' / ') || 'Not recorded'}
                    </td>
                    <td className="max-w-sm px-4 py-3 text-[var(--color-text-muted)]">
                      {row.defectReason || row.remarks || 'Not recorded'}
                    </td>
                    <td className="px-4 py-3 font-bold">{row.actorWorkerId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AppCard>

          <div className="space-y-3 min-[900px]:hidden">
            {rows.map((row) => (
              <AppCard className="max-w-none" key={row.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      className="font-extrabold text-[var(--color-primary)]"
                      to={`/cartridges/${encodeURIComponent(row.serialNumber)}`}
                    >
                      {row.serialNumber}
                    </Link>
                    <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">
                      {formatDateTime(row.createdAt)}
                    </p>
                  </div>
                  <CatalogBadge value={row.type} />
                </div>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <ActivityInfo label="Status" value={statusChange(row.fromStatus, row.toStatus)} />
                  <ActivityInfo label="Worker" value={row.actorWorkerId} />
                  <ActivityInfo
                    label="Person"
                    value={
                      [row.employeeName, row.employeeId, row.department]
                        .filter(Boolean)
                        .join(' / ') || 'Not recorded'
                    }
                  />
                  <ActivityInfo
                    label="Remarks"
                    value={row.defectReason || row.remarks || 'Not recorded'}
                  />
                </dl>
              </AppCard>
            ))}
          </div>

          {meta && meta.totalPages > 1 ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-[var(--color-text-muted)]">
                Page {meta.page} of {meta.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  disabled={meta.page <= 1}
                  onClick={() => updateParameters({ page: String(Math.max(1, meta.page - 1)) })}
                  type="button"
                  variant="secondary"
                >
                  Previous
                </Button>
                <Button
                  disabled={meta.page >= meta.totalPages}
                  onClick={() =>
                    updateParameters({ page: String(Math.min(meta.totalPages, meta.page + 1)) })
                  }
                  type="button"
                  variant="secondary"
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function ActivityInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-extrabold uppercase tracking-[0.06em] text-[var(--color-text-muted)]">
        {label}
      </dt>
      <dd className="mt-1 break-words font-semibold text-[var(--color-text-strong)]">{value}</dd>
    </div>
  );
}
