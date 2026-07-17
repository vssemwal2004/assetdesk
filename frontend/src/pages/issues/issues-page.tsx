import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Eye, MoreVertical, PackagePlus, Pencil, Printer, RotateCcw } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';

import type {
  IssuePeriod,
  IssueReturnState,
  IssueStatus,
  IssueSummary,
} from '@assetdesk/contracts';

import { useAuth } from '../../auth/auth-context';
import { CatalogBadge, PageCount } from '../../components/catalog-ui';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingPanel,
  PageHeader,
  SearchForm,
} from '../../components/ui';
import { formatIstDateTime } from '../../lib/date-time';
import { getIssues } from '../../lib/issues-api';

const statuses: IssueStatus[] = [
  'ISSUED',
  'PARTIALLY_RETURNED',
  'RETURNED',
  'DAMAGED',
  'LOST',
  'CANCELLED',
];

function issueStatus(value: string): IssueStatus | undefined {
  return statuses.find((status) => status === value);
}

function issuePeriod(value: string): IssuePeriod | undefined {
  return value === 'TODAY' ? value : undefined;
}

function issueReturnState(value: string): IssueReturnState | undefined {
  return ['PENDING', 'DUE_TODAY'].includes(value)
    ? (value as IssueReturnState)
    : undefined;
}

export function IssuesPage() {
  const { user } = useAuth();
  const [parameters, setParameters] = useSearchParams();
  const page = Math.max(1, Number(parameters.get('page')) || 1);
  const search = parameters.get('search') ?? '';
  const status = issueStatus(parameters.get('status') ?? '');
  const period = issuePeriod(parameters.get('period') ?? '');
  const returnState = issueReturnState(parameters.get('returnState') ?? '');
  const query = useQuery({
    queryKey: ['issues', { page, search, status, period, returnState }],
    queryFn: ({ signal }) =>
      getIssues(
        {
          page,
          ...(search ? { search } : {}),
          ...(status ? { status } : {}),
          ...(period ? { period } : {}),
          ...(returnState ? { returnState } : {}),
        },
        signal,
      ),
    placeholderData: (previous) => previous,
  });

  function updateParameters(updates: Record<string, string>) {
    const next = new URLSearchParams(parameters);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!Object.hasOwn(updates, 'page')) next.set('page', '1');
    setParameters(next);
  }

  const issues = query.data?.data ?? [];
  const filtered = Boolean(search || status || period || returnState);

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Link className="button-primary" to="/issues/new">
            <PackagePlus aria-hidden="true" size={18} />
            Issue material
          </Link>
        }
        description={
          user?.role === 'ADMIN'
            ? 'Review all university Issue Records.'
            : 'Review Issue Records you created or helped return.'
        }
        title="Issue Records"
      />
      <section className="rounded-[14px] border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-card)] sm:p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_190px_190px_190px_auto]">
          <SearchForm
            id="issue-list-search"
            key={search}
            label="Search Issue Records"
            onSearch={(value) => updateParameters({ search: value })}
            placeholder="Issue ID, Receiver or material"
            value={search}
          />
          <div>
            <label className="sr-only" htmlFor="issue-status-filter">
              Filter by Issue status
            </label>
            <select
              className="field-input"
              id="issue-status-filter"
              onChange={(event) => updateParameters({ status: event.target.value })}
              value={status ?? ''}
            >
              <option value="">All statuses</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {value.toLowerCase().replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="sr-only" htmlFor="issue-period-filter">
              Filter by issue date
            </label>
            <select
              className="field-input"
              id="issue-period-filter"
              onChange={(event) => updateParameters({ period: event.target.value })}
              value={period ?? ''}
            >
              <option value="">All issue dates</option>
              <option value="TODAY">Issued today</option>
            </select>
          </div>
          <div>
            <label className="sr-only" htmlFor="issue-return-filter">
              Filter by return state
            </label>
            <select
              className="field-input"
              id="issue-return-filter"
              onChange={(event) => updateParameters({ returnState: event.target.value })}
              value={returnState ?? ''}
            >
              <option value="">All return states</option>
              <option value="PENDING">Pending Return</option>
              <option value="DUE_TODAY">Due today</option>
            </select>
          </div>
          {filtered ? (
            <Button onClick={() => setParameters({ page: '1' })} variant="quiet">
              Clear filters
            </Button>
          ) : null}
        </div>
        {query.data ? <PageCount count={query.data.meta.total} noun="Issue Record" /> : null}
      </section>

      {query.isPending ? (
        <LoadingPanel label="Loading Issue Records" />
      ) : query.isError ? (
        <ErrorState
          message="Issue Records could not be loaded."
          onRetry={() => void query.refetch()}
        />
      ) : issues.length === 0 ? (
        <EmptyState
          action={
            filtered ? (
              <Button onClick={() => setParameters({ page: '1' })} variant="secondary">
                Clear filters
              </Button>
            ) : (
              <Link className="button-primary" to="/issues/new">
                <PackagePlus aria-hidden="true" size={18} />
                Issue material
              </Link>
            )
          }
          message={
            filtered
              ? 'Try a different Issue ID, Receiver, material or status.'
              : 'Confirmed Issue Records will appear here.'
          }
          title={filtered ? 'No Issue Records match' : 'No Issue Records yet'}
        />
      ) : (
        <>
          <div className="space-y-3 min-[840px]:hidden">
            {issues.map((issue) => (
              <IssueCard issue={issue} key={issue.issueId} />
            ))}
          </div>
          <IssueTable issues={issues} />
          {query.data && query.data.meta.totalPages > 1 ? (
            <nav
              aria-label="Issue Record pages"
              className="flex items-center justify-between gap-3"
            >
              <Button
                disabled={page <= 1}
                onClick={() => updateParameters({ page: String(page - 1) })}
                variant="secondary"
              >
                Previous
              </Button>
              <p className="text-sm font-semibold text-[var(--color-text-muted)]">
                Page {page} of {query.data.meta.totalPages}
              </p>
              <Button
                disabled={page >= query.data.meta.totalPages}
                onClick={() => updateParameters({ page: String(page + 1) })}
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

function materialSummary(issue: IssueSummary): string {
  const first = issue.materialNames[0] ?? 'Material';
  const extra = issue.materialNames.length - 1;
  return extra > 0 ? `${first} + ${extra} more` : first;
}

function IssueCard({ issue }: { issue: IssueSummary }) {
  return (
    <article className="rounded-[14px] border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
          <ClipboardList aria-hidden="true" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="text-sm font-extrabold text-[var(--color-primary-strong)]">
              {issue.issueId}
            </h2>
            <CatalogBadge value={issue.status} />
          </div>
          <p className="mt-2 font-bold text-[var(--color-text-strong)]">{materialSummary(issue)}</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Receiver: {issue.receiver.fullName}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Issued {formatIstDateTime(issue.issuedAt)}
            {issue.expectedReturnAt
              ? ` · Expected ${formatIstDateTime(issue.expectedReturnAt)}`
              : ''}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <Link className="button-secondary flex-1" to={`/issues/${issue.issueId}`}>
          View Issue Record
        </Link>
        <IssueActionsMenu issue={issue} align="right" />
      </div>
    </article>
  );
}

function IssueActionsMenu({ issue, align = 'right' }: { issue: IssueSummary; align?: 'right' | 'left' }) {
  return (
    <details className="group relative inline-flex">
      <summary
        aria-label={`Open actions for ${issue.issueId}`}
        className="grid size-10 cursor-pointer list-none place-items-center rounded-[10px] border border-[var(--color-border)] bg-white text-[var(--color-text-muted)] transition hover:border-[var(--color-primary-border)] hover:text-[var(--color-primary)] [&::-webkit-details-marker]:hidden"
      >
        <MoreVertical aria-hidden="true" size={18} />
      </summary>
      <div
        className={`absolute bottom-full z-[80] mb-2 min-w-48 overflow-hidden rounded-[10px] border border-[var(--color-border)] bg-white py-1 text-left shadow-xl ${
          align === 'right' ? 'right-0' : 'left-0'
        }`}
      >
        <Link
          className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-[var(--color-text-strong)] hover:bg-[var(--color-surface-tint)]"
          to={`/issues/${issue.issueId}`}
        >
          <Eye aria-hidden="true" size={16} />
          View details
        </Link>
        <Link
          className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-[var(--color-text-strong)] hover:bg-[var(--color-surface-tint)]"
          to={`/issues/${issue.issueId}?edit=1`}
        >
          <Pencil aria-hidden="true" size={16} />
          Edit Issue
        </Link>
        <Link
          className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-[var(--color-text-strong)] hover:bg-[var(--color-surface-tint)]"
          to={`/bills/${issue.issueId}`}
        >
          <Printer aria-hidden="true" size={16} />
          Generate bill
        </Link>
        {issue.totalOutstandingQuantity > 0 ? (
          <Link
            className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-[var(--color-text-strong)] hover:bg-[var(--color-surface-tint)]"
            to={`/issues/${issue.issueId}/return`}
          >
            <RotateCcw aria-hidden="true" size={16} />
            Record Return
          </Link>
        ) : null}
      </div>
    </details>
  );
}

function IssueTable({ issues }: { issues: IssueSummary[] }) {
  return (
    <div className="hidden overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)] min-[840px]:block">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Issue Records</caption>
        <thead className="bg-[var(--color-surface-tint)] text-xs text-[var(--color-text-muted)]">
          <tr>
            <th className="h-11 px-4 font-bold" scope="col">
              Issue
            </th>
            <th className="h-11 px-4 font-bold" scope="col">
              Receiver
            </th>
            <th className="h-11 px-4 font-bold" scope="col">
              Material
            </th>
            <th className="h-11 px-4 font-bold" scope="col">
              Expected Return
            </th>
            <th className="h-11 px-4 font-bold" scope="col">
              Status
            </th>
            <th className="h-11 px-4 text-right font-bold" scope="col">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {issues.map((issue) => (
            <tr className="h-[68px] hover:bg-[var(--color-surface-tint)]" key={issue.issueId}>
              <td className="px-4">
                <p className="text-sm font-bold text-[var(--color-primary-strong)]">
                  {issue.issueId}
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {formatIstDateTime(issue.issuedAt)}
                </p>
              </td>
              <td className="px-4 text-sm font-semibold text-[var(--color-text-strong)]">
                {issue.receiver.fullName}
              </td>
              <td className="px-4 text-sm text-[var(--color-text-muted)]">
                {materialSummary(issue)}
              </td>
              <td className="px-4 text-sm text-[var(--color-text-muted)]">
                {formatIstDateTime(issue.expectedReturnAt)}
              </td>
              <td className="px-4">
                <CatalogBadge value={issue.status} />
              </td>
              <td className="px-4 text-right">
                <IssueActionsMenu issue={issue} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
