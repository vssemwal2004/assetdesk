import { useQuery } from '@tanstack/react-query';
import { ClipboardList, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';

import {
  AssetTagSchema,
  IssueIdSchema,
  type IssueSummary,
  type IssuePeriod,
  type ReturnEvent,
  type ReturnableIssue,
} from '@assetdesk/contracts';

import { useAuth } from '../../auth/auth-context';
import { CatalogBadge, PageCount } from '../../components/catalog-ui';
import {
  AppCard,
  Button,
  EmptyState,
  ErrorState,
  LoadingPanel,
  PageHeader,
  SearchForm,
} from '../../components/ui';
import { formatIstDateTime } from '../../lib/date-time';
import { getIssues, getReturns, searchReturnableIssues } from '../../lib/issues-api';

export function ReturnsPage() {
  const { user } = useAuth();
  const [parameters, setParameters] = useSearchParams();
  const page = Math.max(1, Number(parameters.get('page')) || 1);
  const activitySearch = parameters.get('activitySearch') ?? '';
  const activityPeriod: IssuePeriod | undefined =
    parameters.get('period') === 'TODAY' ? 'TODAY' : undefined;
  const [lookup, setLookup] = useState('');
  const [lookupPage, setLookupPage] = useState(1);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [viewReturn, setViewReturn] = useState<ReturnEvent | null>(null);
  const exactLookupRequired = user?.role === 'WORKER';

  const lookupQuery = useQuery({
    queryKey: ['return-search', lookup, lookupPage],
    queryFn: ({ signal }) => searchReturnableIssues(lookup, lookupPage, signal),
    enabled: lookup.length >= 2,
  });
  const matchingIssuesQuery = useQuery({
    queryKey: ['return-issue-context', lookup],
    queryFn: ({ signal }) => getIssues({ page: 1, pageSize: 5, search: lookup }, signal),
    enabled:
      lookup.length >= 2 &&
      !exactLookupRequired &&
      Boolean(lookupQuery.data && lookupQuery.data.data.length === 0),
  });
  const activityQuery = useQuery({
    queryKey: ['returns', { page, search: activitySearch, period: activityPeriod }],
    queryFn: ({ signal }) =>
      getReturns(
        {
          page,
          ...(activitySearch ? { search: activitySearch } : {}),
          ...(activityPeriod ? { period: activityPeriod } : {}),
        },
        signal,
      ),
    placeholderData: (previous) => previous,
  });

  function updateActivity(updates: Record<string, string>) {
    const next = new URLSearchParams(parameters);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!Object.hasOwn(updates, 'page')) next.set('page', '1');
    setParameters(next);
  }

  function submitLookup(value: string) {
    if (
      exactLookupRequired &&
      !IssueIdSchema.safeParse(value).success &&
      !AssetTagSchema.safeParse(value).success
    ) {
      setLookup('');
      setLookupError('Enter a complete Issue ID or asset tag, for example GEU-ISS-2026-000123.');
      return;
    }
    setLookupError(null);
    setLookupPage(1);
    setLookup(value);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        description="Find an active Issue Record, then record a full or partial Return."
        title="Returns"
      />
      <AppCard>
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
            <ClipboardList aria-hidden="true" size={22} />
          </span>
          <div>
            <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
              Find Issue Record
            </h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              {exactLookupRequired
                ? 'Enter the exact Issue ID or asset tag for a secure cross-shift Return.'
                : 'Search by Issue ID, Receiver, asset tag, serial number or material.'}
            </p>
          </div>
        </div>
        <SearchForm
          autoComplete="off"
          className="mt-5"
          error={lookupError}
          id="return-issue-search"
          label="Find an Issue Record to Return"
          onSearch={submitLookup}
          placeholder={
            exactLookupRequired
              ? 'GEU-ISS-2026-000123 or GEU-2026-000123'
              : 'Issue ID, Receiver, asset tag or material'
          }
          transform={(value) => value.toUpperCase()}
          value={lookup}
        />
        <div className="mt-4">
          {!lookup ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              {exactLookupRequired
                ? 'Workers must use a complete Issue ID or asset tag.'
                : 'Enter at least two characters to search active outstanding records.'}
            </p>
          ) : lookup.length < 2 ? (
            <p className="text-sm text-[var(--color-danger)]" role="alert">
              Enter at least two characters.
            </p>
          ) : lookupQuery.isPending ? (
            <LoadingPanel label="Searching active Issue Records" />
          ) : lookupQuery.isError ? (
            <ErrorState
              message="Active Issue Records could not be searched."
              onRetry={() => void lookupQuery.refetch()}
            />
          ) : !lookupQuery.data?.data.length ? (
            <NoReturnableResults
              exactLookupRequired={exactLookupRequired}
              lookup={lookup}
              query={matchingIssuesQuery}
            />
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-bold text-[var(--color-text-muted)]" role="status">
                {lookupQuery.data.meta.total} active{' '}
                {lookupQuery.data.meta.total === 1 ? 'record' : 'records'} found
              </p>
              {lookupQuery.data.data.map((issue) => (
                <ReturnableIssueCard issue={issue} key={issue.issueId} />
              ))}
              {lookupQuery.data.meta.totalPages > 1 ? (
                <nav
                  aria-label="Return search result pages"
                  className="flex items-center justify-between gap-3 pt-1"
                >
                  <Button
                    disabled={lookupPage <= 1}
                    onClick={() => setLookupPage((value) => Math.max(1, value - 1))}
                    variant="secondary"
                  >
                    Previous
                  </Button>
                  <p className="text-sm font-semibold text-[var(--color-text-muted)]">
                    Page {lookupPage} of {lookupQuery.data.meta.totalPages}
                  </p>
                  <Button
                    disabled={lookupPage >= lookupQuery.data.meta.totalPages}
                    onClick={() =>
                      setLookupPage((value) =>
                        Math.min(lookupQuery.data.meta.totalPages, value + 1),
                      )
                    }
                    variant="secondary"
                  >
                    Next
                  </Button>
                </nav>
              ) : null}
            </div>
          )}
        </div>
      </AppCard>

      <section aria-labelledby="return-activity-heading" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2
              className="text-lg font-extrabold text-[var(--color-primary-strong)]"
              id="return-activity-heading"
            >
              Return activity
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Saved Return events in your authorized scope.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:max-w-xl sm:flex-row">
            <SearchForm
              className="w-full sm:max-w-sm"
              id="return-activity-search"
              key={activitySearch}
              label="Search Return activity"
              onSearch={(value) => updateActivity({ activitySearch: value })}
              placeholder="Issue ID or material"
              value={activitySearch}
            />
            <label className="sr-only" htmlFor="return-activity-period">
              Filter Return activity by date
            </label>
            <select
              className="field-input sm:w-44"
              id="return-activity-period"
              onChange={(event) => updateActivity({ period: event.target.value })}
              value={activityPeriod ?? ''}
            >
              <option value="">All dates</option>
              <option value="TODAY">Returned today</option>
            </select>
          </div>
        </div>
        {activityQuery.data ? (
          <PageCount count={activityQuery.data.meta.total} noun="Return event" />
        ) : null}
        {activityQuery.isPending ? (
          <LoadingPanel label="Loading Return activity" />
        ) : activityQuery.isError ? (
          <ErrorState
            message="Return activity could not be loaded."
            onRetry={() => void activityQuery.refetch()}
          />
        ) : !activityQuery.data?.data.length ? (
          <EmptyState
            action={
              activitySearch || activityPeriod ? (
                <Button
                  onClick={() => updateActivity({ activitySearch: '', period: '' })}
                  variant="secondary"
                >
                  Clear filters
                </Button>
              ) : undefined
            }
            message={
              activitySearch || activityPeriod
                ? 'Try another Issue ID, asset tag or material.'
                : 'Completed Return events will appear here.'
            }
            title={
              activitySearch || activityPeriod
                ? 'No Return activity matches'
                : 'No Returns recorded'
            }
          />
        ) : (
          <>
            <div className="space-y-3 min-[840px]:hidden">
              {activityQuery.data.data.map((event) => (
                <ReturnEventCard event={event} key={event.returnEventId} />
              ))}
            </div>
            <ReturnEventTable events={activityQuery.data.data} onView={setViewReturn} />
            {activityQuery.data.meta.totalPages > 1 ? (
              <nav
                aria-label="Return activity pages"
                className="flex items-center justify-between gap-3"
              >
                <Button
                  disabled={page <= 1}
                  onClick={() => updateActivity({ page: String(page - 1) })}
                  variant="secondary"
                >
                  Previous
                </Button>
                <p className="text-sm font-semibold text-[var(--color-text-muted)]">
                  Page {page} of {activityQuery.data.meta.totalPages}
                </p>
                <Button
                  disabled={page >= activityQuery.data.meta.totalPages}
                  onClick={() => updateActivity({ page: String(page + 1) })}
                  variant="secondary"
                >
                  Next
                </Button>
              </nav>
            ) : null}
          </>
        )}
      </section>
      {viewReturn ? (
        <ReturnQuickViewDialog event={viewReturn} onClose={() => setViewReturn(null)} />
      ) : null}
    </div>
  );
}

function ReturnableIssueCard({ issue }: { issue: ReturnableIssue }) {
  return (
    <article className="rounded-[12px] border border-[var(--color-primary-border)] bg-[var(--color-surface-tint)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-extrabold text-[var(--color-primary-strong)]">{issue.issueId}</h3>
          <p className="mt-1 font-bold text-[var(--color-text-strong)]">
            {issue.receiver.fullName}
          </p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Issued {formatIstDateTime(issue.issuedAt)} · {issue.totalOutstandingQuantity}{' '}
            outstanding
          </p>
        </div>
        <CatalogBadge value={issue.status} />
      </div>
      <Link className="button-primary mt-4 w-full sm:w-auto" to={`/issues/${issue.issueId}/return`}>
        <RotateCcw aria-hidden="true" size={18} />
        Record Return
      </Link>
    </article>
  );
}

function NoReturnableResults({
  exactLookupRequired,
  lookup,
  query,
}: {
  exactLookupRequired: boolean;
  lookup: string;
  query: {
    isPending: boolean;
    isError: boolean;
    data: { data: IssueSummary[]; meta: { total: number } } | undefined;
  };
}) {
  if (exactLookupRequired) {
    return (
      <EmptyState
        message="Check the complete Issue ID or asset tag and try again. Only records with outstanding returnable material can be accepted here."
        title="No outstanding Issue Record found"
      />
    );
  }

  if (query.isPending) return <LoadingPanel label="Checking matching Issue Records" />;
  if (query.isError) {
    return (
      <EmptyState
        message="No returnable material is pending return for this search."
        title="No outstanding Issue Record found"
      />
    );
  }

  const matches = query.data?.data ?? [];
  if (matches.length === 0) {
    return (
      <EmptyState
        message={`No Issue Record or outstanding Return was found for "${lookup}". Try Issue ID, receiver name, asset tag or material name.`}
        title="No matching Issue Record"
      />
    );
  }

  return (
    <div className="space-y-3">
      <EmptyState
        message="Matching Issue Records were found, but none currently have returnable material pending return."
        title="No return pending for these records"
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {matches.map((issue) => (
          <IssueReturnContextCard issue={issue} key={issue.issueId} />
        ))}
      </div>
    </div>
  );
}

function IssueReturnContextCard({ issue }: { issue: IssueSummary }) {
  const consumed = issue.status === 'ISSUED' && issue.totalOutstandingQuantity === 0;
  return (
    <article className="rounded-[12px] border border-[var(--color-border)] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-extrabold text-[var(--color-primary-strong)]">{issue.issueId}</h3>
          <p className="mt-1 text-sm font-bold text-[var(--color-text-strong)]">
            {issue.receiver.fullName}
          </p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {issue.materialNames.join(', ')}
          </p>
        </div>
        <CatalogBadge value={consumed ? 'CONSUMED' : issue.status} />
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
        {consumed
          ? 'Consumable material was deducted from stock at issue time. No return is required.'
          : 'This record has no material currently pending return.'}
      </p>
      <Link className="button-secondary mt-4 w-full sm:w-auto" to={`/issues/${issue.issueId}`}>
        View Issue Record
      </Link>
    </article>
  );
}

function returnSummary(event: ReturnEvent): string {
  const first = event.items[0]?.materialName ?? 'Material';
  const extra = event.items.length - 1;
  return extra > 0 ? `${first} + ${extra} more` : first;
}

function ReturnEventCard({ event }: { event: ReturnEvent }) {
  return (
    <article className="rounded-[14px] border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--color-success-soft)] text-[var(--color-success)]">
          <RotateCcw aria-hidden="true" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-extrabold text-[var(--color-primary-strong)]">{event.issueId}</h3>
          <p className="mt-2 font-bold text-[var(--color-text-strong)]">{returnSummary(event)}</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Returned by {event.performedBy.name}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {formatIstDateTime(event.returnedAt)}
          </p>
        </div>
      </div>
      <Link className="button-secondary mt-4 w-full" to={`/issues/${event.issueId}`}>
        View Issue Record
      </Link>
    </article>
  );
}

function ReturnEventTable({
  events,
  onView,
}: {
  events: ReturnEvent[];
  onView: (event: ReturnEvent) => void;
}) {
  return (
    <div className="hidden overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)] min-[840px]:block">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Return activity</caption>
        <thead className="bg-[var(--color-surface-tint)] text-xs text-[var(--color-text-muted)]">
          <tr>
            <th className="h-11 px-4 font-bold" scope="col">
              Issue ID
            </th>
            <th className="h-11 px-4 font-bold" scope="col">
              Material
            </th>
            <th className="h-11 px-4 font-bold" scope="col">
              Returned by
            </th>
            <th className="h-11 px-4 font-bold" scope="col">
              Returned at
            </th>
            <th className="h-11 px-4 text-right font-bold" scope="col">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {events.map((event) => (
            <tr
              className="h-[64px] cursor-pointer hover:bg-[var(--color-surface-tint)]"
              key={event.returnEventId}
              onClick={() => onView(event)}
              tabIndex={0}
            >
              <td className="px-4 text-sm font-bold text-[var(--color-primary-strong)]">
                {event.issueId}
              </td>
              <td className="px-4 text-sm text-[var(--color-text-muted)]">
                {returnSummary(event)}
              </td>
              <td className="px-4">
                <p className="text-sm font-semibold text-[var(--color-text-strong)]">
                  {event.performedBy.name}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {event.performedBy.workerId}
                </p>
              </td>
              <td className="px-4 text-sm text-[var(--color-text-muted)]">
                {formatIstDateTime(event.returnedAt)}
              </td>
              <td className="px-4 text-right">
                <div onClick={(clickEvent) => clickEvent.stopPropagation()}>
                  <Link className="button-quiet" to={`/issues/${event.issueId}`}>
                    View details
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Dialog({
  children,
  onClose,
  label,
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
}) {
  const reference = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    reference.current?.showModal();
  }, []);
  return (
    <dialog
      aria-label={label}
      className="w-[min(92vw,600px)] rounded-[18px] border border-[var(--color-border)] bg-white p-0 text-[var(--color-text)] shadow-[var(--shadow-overlay)] backdrop:bg-slate-950/40"
      onCancel={onClose}
      onClose={onClose}
      ref={reference}
    >
      {children}
    </dialog>
  );
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-tint)] p-3">
      <dt className="text-xs font-bold text-[var(--color-text-muted)]">{label}</dt>
      <dd className="mt-1 break-words text-sm font-extrabold text-[var(--color-text-strong)]">
        {value}
      </dd>
    </div>
  );
}

function ReturnQuickViewDialog({
  event,
  onClose,
}: {
  event: ReturnEvent;
  onClose: () => void;
}) {
  return (
    <Dialog label={`${event.issueId} return details`} onClose={onClose}>
      <div className="max-h-[86vh] overflow-y-auto p-5 sm:p-6">
        <h2 className="text-xl font-extrabold text-[var(--color-primary-strong)]">
          Return details
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {event.issueId} · {formatIstDateTime(event.returnedAt)}
        </p>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <DetailItem label="Returned by" value={event.performedBy.name} />
          <DetailItem label="Worker ID" value={event.performedBy.workerId} />
          <DetailItem label="Items returned" value={event.items.length} />
          <DetailItem label="Return event ID" value={event.returnEventId} />
        </dl>
        <div className="mt-5 overflow-hidden rounded-[12px] border border-[var(--color-border)]">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Returned items</caption>
            <thead className="bg-[var(--color-surface-tint)] text-xs text-[var(--color-text-muted)]">
              <tr>
                <th className="h-10 px-3 font-bold">Material</th>
                <th className="h-10 px-3 font-bold">Quantity</th>
                <th className="h-10 px-3 font-bold">Condition</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)] text-sm">
              {event.items.map((item, index) => (
                <tr key={`${item.materialCode}-${index}`}>
                  <td className="px-3 py-3 font-bold">{item.materialName}</td>
                  <td className="px-3 py-3 text-[var(--color-text-muted)]">
                    {'quantity' in item ? item.quantity : item.assetTag}
                  </td>
                  <td className="px-3 py-3 text-[var(--color-text-muted)]">
                    {'condition' in item ? item.condition : 'Recorded'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
          <Link className="button-secondary" to={`/issues/${event.issueId}`}>
            Full Issue Record
          </Link>
        </div>
      </div>
    </Dialog>
  );
}
