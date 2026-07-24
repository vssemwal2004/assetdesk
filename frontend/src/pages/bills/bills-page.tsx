import { useQuery } from '@tanstack/react-query';
import { FileText, Printer } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';

import type { IssueSummary } from '@assetdesk/contracts';

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

export function BillsPage() {
  const [parameters, setParameters] = useSearchParams();
  const page = Math.max(1, Number(parameters.get('page')) || 1);
  const search = parameters.get('search') ?? '';
  const query = useQuery({
    queryKey: ['receipts', { page, search }],
    queryFn: ({ signal }) =>
      getIssues({ page, pageSize: 20, ...(search ? { search } : {}) }, signal),
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

  const issues = query.data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        description="Generate and print issue/return receipts from Issue Records."
        title="Issue/Return Receipt"
      />

      <section className="rounded-[14px] border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-card)] sm:p-4">
        <SearchForm
          id="bill-search"
          key={search}
          label="Search issue/return receipts"
          onSearch={(value) => update({ search: value })}
          placeholder="Issue ID, Receiver or material"
          value={search}
        />
        {query.data ? <PageCount count={query.data.meta.total} noun="receipt" /> : null}
      </section>

      {query.isPending ? (
        <LoadingPanel label="Loading issue/return receipts" />
      ) : query.isError ? (
        <ErrorState message="Issue/return receipts could not be loaded." onRetry={() => void query.refetch()} />
      ) : issues.length === 0 ? (
        <EmptyState
          action={
            search ? (
              <Button onClick={() => update({ search: '' })} variant="secondary">
                Clear search
              </Button>
            ) : undefined
          }
          message={
            search
              ? 'Try another Issue ID, Receiver or material name.'
              : 'Issue/return receipts will appear after material is issued.'
          }
          title={search ? 'No receipts match' : 'No issue/return receipts yet'}
        />
      ) : (
        <>
          <div className="space-y-2">
            {issues.map((issue) => (
              <BillListItem issue={issue} key={issue.issueId} />
            ))}
          </div>
          {query.data && query.data.meta.totalPages > 1 ? (
            <nav aria-label="Issue/return receipt pages" className="flex items-center justify-between gap-3">
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

function materialSummary(issue: IssueSummary): string {
  const first = issue.materialNames[0] ?? 'Material';
  const extra = issue.materialNames.length - 1;
  return extra > 0 ? `${first} + ${extra} more` : first;
}

function receiptTarget(issue: IssueSummary): string {
  if (issue.latestReturnEventId && issue.status !== 'ISSUED') {
    return `/bills/${issue.issueId}?type=return&returnEventId=${issue.latestReturnEventId}`;
  }
  return `/bills/${issue.issueId}`;
}

function BillListItem({ issue }: { issue: IssueSummary }) {
  return (
    <article className="flex flex-col gap-3 rounded-[10px] border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
          <FileText aria-hidden="true" size={18} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-extrabold text-[var(--color-primary-strong)]">
              {issue.issueId}
            </h2>
            <CatalogBadge value={issue.status} />
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-[var(--color-text-strong)]">
            {issue.receiver.fullName} · {materialSummary(issue)}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Issued {formatIstDateTime(issue.issuedAt)}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link className="button-secondary" to={`/issues/${issue.issueId}`}>
          View issue
        </Link>
        <Link className="button-primary" to={receiptTarget(issue)}>
          <Printer aria-hidden="true" size={17} />
          Generate receipt
        </Link>
      </div>
    </article>
  );
}
