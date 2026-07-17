import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';

import type { IssueReportFilters, IssueReportRow, IssueStatus } from '@assetdesk/contracts';

import { CatalogBadge, PageCount } from '../../components/catalog-ui';
import {
  AppCard,
  Button,
  EmptyState,
  ErrorState,
  ErrorSummary,
  LoadingPanel,
  PageHeader,
  SearchForm,
} from '../../components/ui';
import { formatIstDateTime, toIstDateTimeInput } from '../../lib/date-time';
import { exportIssueReport, getIssueReport } from '../../lib/reports-api';

const statuses: IssueStatus[] = [
  'ISSUED',
  'PARTIALLY_RETURNED',
  'RETURNED',
  'DAMAGED',
  'LOST',
  'CANCELLED',
];

function dateDaysAgo(days: number): string {
  return toIstDateTimeInput(new Date(Date.now() - days * 86_400_000)).slice(0, 10);
}

export function ReportsPage() {
  const [parameters, setParameters] = useSearchParams();
  const page = Math.max(1, Number(parameters.get('page')) || 1);
  const issuedFrom = parameters.get('issuedFrom') ?? dateDaysAgo(30);
  const issuedThrough = parameters.get('issuedThrough') ?? dateDaysAgo(0);
  const status = parameters.get('status') as IssueStatus | null;
  const returnState = parameters.get('returnState') as IssueReportFilters['returnState'] | null;
  const search = parameters.get('search') ?? '';
  const filters: IssueReportFilters = {
    issuedFrom,
    issuedThrough,
    ...(status ? { status } : {}),
    ...(returnState ? { returnState } : {}),
    ...(search ? { search } : {}),
  };
  const query = useQuery({
    queryKey: ['issue-report', { filters, page }],
    queryFn: ({ signal }) => getIssueReport(filters, page, signal),
    placeholderData: (previous) => previous,
  });
  const download = useMutation({
    mutationFn: () => exportIssueReport(filters),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `assetdesk-issue-register-${issuedThrough}.csv`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    },
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

  const rows = query.data?.data ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Button loading={download.isPending} onClick={() => download.mutate()}>
            <Download aria-hidden="true" size={18} />
            Download CSV
          </Button>
        }
        description="Generate a non-financial Issue Register from authorized university records."
        title="Reports"
      />
      <AppCard>
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
            <FileSpreadsheet aria-hidden="true" size={20} />
          </span>
          <div>
            <h2 className="font-extrabold text-[var(--color-primary-strong)]">Issue Register</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              No prices, fines, payments or financial fields are included.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_180px_190px_180px_180px]">
          <SearchForm
            className="self-end"
            id="report-search"
            key={search}
            label="Search Issue Register"
            onSearch={(value) => update({ search: value })}
            placeholder="Issue ID, Receiver or material"
            value={search}
          />
          <label className="space-y-1 text-xs font-bold text-[var(--color-text-muted)]">
            Status
            <select
              className="field-input"
              onChange={(event) => update({ status: event.target.value })}
              value={status ?? ''}
            >
              <option value="">All statuses</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {value.toLowerCase().replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-bold text-[var(--color-text-muted)]">
            Return state
            <select
              className="field-input"
              onChange={(event) => update({ returnState: event.target.value })}
              value={returnState ?? ''}
            >
              <option value="">All Returns</option>
              <option value="PENDING">Pending</option>
              <option value="DUE_TODAY">Due today</option>
            </select>
          </label>
          <label className="space-y-1 text-xs font-bold text-[var(--color-text-muted)]">
            Issued from
            <input
              className="field-input"
              max={issuedThrough}
              onChange={(event) => update({ issuedFrom: event.target.value })}
              type="date"
              value={issuedFrom}
            />
          </label>
          <label className="space-y-1 text-xs font-bold text-[var(--color-text-muted)]">
            Issued through
            <input
              className="field-input"
              min={issuedFrom}
              onChange={(event) => update({ issuedThrough: event.target.value })}
              type="date"
              value={issuedThrough}
            />
          </label>
        </div>
        {query.data ? <PageCount count={query.data.meta.total} noun="Issue Record" /> : null}
      </AppCard>
      {download.isError ? (
        <ErrorSummary
          message="The CSV could not be generated. Check the date range and try again."
          title="Export failed"
        />
      ) : null}
      {query.isPending ? (
        <LoadingPanel label="Preparing report preview" />
      ) : query.isError ? (
        <ErrorState
          message="The Issue Register could not be loaded."
          onRetry={() => void query.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          message="Change the date range or filters to find Issue Records."
          title="No report rows"
        />
      ) : (
        <>
          <div className="space-y-3 min-[840px]:hidden">
            {rows.map((row) => (
              <ReportCard key={row.issueId} row={row} />
            ))}
          </div>
          <ReportTable rows={rows} />
          {query.data && query.data.meta.totalPages > 1 ? (
            <nav aria-label="Report pages" className="flex items-center justify-between gap-3">
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

function materials(row: IssueReportRow): string {
  return row.materials.length > 1
    ? `${row.materials[0]} + ${row.materials.length - 1} more`
    : (row.materials[0] ?? 'Material');
}

function ReportCard({ row }: { row: IssueReportRow }) {
  return (
    <article className="rounded-[14px] border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            className="font-extrabold text-[var(--color-primary-strong)]"
            to={`/issues/${row.issueId}`}
          >
            {row.issueId}
          </Link>
          <p className="mt-1 font-bold text-[var(--color-text-strong)]">{row.receiverName}</p>
        </div>
        <CatalogBadge value={row.status} />
      </div>
      <p className="mt-3 text-sm text-[var(--color-text-muted)]">{materials(row)}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-[var(--color-surface-tint)] p-2">
          <dt>Issued</dt>
          <dd className="mt-1 font-bold">{row.totalIssuedQuantity}</dd>
        </div>
        <div className="rounded-lg bg-[var(--color-surface-tint)] p-2">
          <dt>Outstanding</dt>
          <dd className="mt-1 font-bold">{row.totalOutstandingQuantity}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-[var(--color-text-muted)]">
        {formatIstDateTime(row.issuedAt)}
      </p>
    </article>
  );
}

function ReportTable({ rows }: { rows: IssueReportRow[] }) {
  return (
    <div className="hidden overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)] min-[840px]:block">
      <table className="w-full border-collapse text-left">
        <thead className="bg-[var(--color-surface-tint)] text-xs text-[var(--color-text-muted)]">
          <tr>
            <th className="h-11 px-4">Issue</th>
            <th className="h-11 px-4">Receiver</th>
            <th className="h-11 px-4">Materials</th>
            <th className="h-11 px-4">Issued / Outstanding</th>
            <th className="h-11 px-4">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {rows.map((row) => (
            <tr key={row.issueId}>
              <td className="px-4 py-3">
                <Link
                  className="text-sm font-extrabold text-[var(--color-primary-strong)]"
                  to={`/issues/${row.issueId}`}
                >
                  {row.issueId}
                </Link>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {formatIstDateTime(row.issuedAt)}
                </p>
              </td>
              <td className="px-4 py-3 text-sm">
                <p className="font-bold">{row.receiverName}</p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {row.receiverType.toLowerCase()} · {row.department ?? 'No department'}
                </p>
              </td>
              <td className="max-w-xs px-4 py-3 text-sm text-[var(--color-text-muted)]">
                {materials(row)}
              </td>
              <td className="px-4 py-3 text-sm font-bold">
                {row.totalIssuedQuantity} / {row.totalOutstandingQuantity}
              </td>
              <td className="px-4 py-3">
                <CatalogBadge value={row.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
