import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Eye, MoreVertical, Printer, RotateCcw, Search } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';

import type { OverdueIssue } from '@assetdesk/contracts';

import { CatalogBadge, PageCount } from '../../components/catalog-ui';
import {
  Button,
  EmptyState,
  ErrorState,
  ErrorSummary,
  LoadingPanel,
  PageHeader,
  SearchForm,
} from '../../components/ui';
import { isApiError } from '../../lib/api-client';
import { formatIstDateTime } from '../../lib/date-time';
import { createPendingSubmission } from '../../lib/idempotent-submission';
import { getOverdueIssues, sendReminder } from '../../lib/operations-api';

function materialSummary(issue: OverdueIssue): string {
  const first = issue.materialNames[0] ?? 'Material';
  const extra = issue.materialNames.length - 1;
  return extra > 0 ? `${first} + ${extra} more` : first;
}

function overdueDuration(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  if (minutes < 1_440) return `${Math.ceil(minutes / 60)} hr`;
  return `${Math.floor(minutes / 1_440)} day${minutes >= 2_880 ? 's' : ''}`;
}

export function OverdueAssetsPage() {
  const queryClient = useQueryClient();
  const [parameters, setParameters] = useSearchParams();
  const page = Math.max(1, Number(parameters.get('page')) || 1);
  const search = parameters.get('search') ?? '';
  const [viewIssue, setViewIssue] = useState<OverdueIssue | null>(null);
  const [reminderTarget, setReminderTarget] = useState<OverdueIssue | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['overdue-assets', { page, search }],
    queryFn: ({ signal }) => getOverdueIssues({ page, ...(search ? { search } : {}) }, signal),
    placeholderData: (previous) => previous,
  });

  const reminder = useMutation({
    mutationFn: (issue: OverdueIssue) => {
      const submission = createPendingSubmission({
        operation: 'RETURN_REMINDER_V1',
        issueId: issue.issueId,
      });
      return sendReminder(issue.issueId, submission.key);
    },
    onSuccess: async () => {
      setReminderTarget(null);
      setActionError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['overdue-assets'] }),
        queryClient.invalidateQueries({ queryKey: ['issue-notifications'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
    onError: (error) => {
      setActionError(isApiError(error) ? error.message : 'The reminder could not be sent.');
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

  const issues = query.data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        description="Track overdue return-by-date issues where reusable material is still outstanding."
        title="Overdue Assets"
      />

      <section className="rounded-[14px] border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-card)] sm:p-4">
        <SearchForm
          id="overdue-search"
          key={search}
          label="Search overdue assets"
          onSearch={(value) => update({ search: value })}
          placeholder="Issue ID, receiver, asset tag or material"
          value={search}
        />
        {query.data ? <PageCount count={query.data.meta.total} noun="overdue record" /> : null}
      </section>

      {actionError ? <ErrorSummary message={actionError} title="Action failed" /> : null}

      {query.isPending ? (
        <LoadingPanel label="Loading overdue assets" />
      ) : query.isError ? (
        <ErrorState
          message="Overdue assets could not be loaded."
          onRetry={() => void query.refetch()}
        />
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
              ? 'Try another Issue ID, receiver, material, asset tag or serial number.'
              : 'Expired and unreturned assets will appear here.'
          }
          title={search ? 'No overdue assets match' : 'No overdue assets'}
        />
      ) : (
        <>
          <div className="space-y-3 min-[840px]:hidden">
            {issues.map((issue) => (
              <OverdueCard
                issue={issue}
                key={issue.issueId}
                onRemind={setReminderTarget}
                onView={setViewIssue}
              />
            ))}
          </div>
          <OverdueTable issues={issues} onRemind={setReminderTarget} onView={setViewIssue} />
          {query.data && query.data.meta.totalPages > 1 ? (
            <nav
              aria-label="Overdue asset pages"
              className="flex items-center justify-between gap-3"
            >
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

      {viewIssue ? <OverdueDetails issue={viewIssue} onClose={() => setViewIssue(null)} /> : null}
      {reminderTarget ? (
        <ReminderDialog
          error={actionError}
          issue={reminderTarget}
          loading={reminder.isPending}
          onCancel={() => {
            setReminderTarget(null);
            setActionError(null);
          }}
          onConfirm={() => reminder.mutate(reminderTarget)}
        />
      ) : null}
    </div>
  );
}

function OverdueCard({
  issue,
  onRemind,
  onView,
}: {
  issue: OverdueIssue;
  onRemind: (issue: OverdueIssue) => void;
  onView: (issue: OverdueIssue) => void;
}) {
  return (
    <article className="rounded-[14px] border border-red-200 bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-extrabold text-[var(--color-primary-strong)]">{issue.issueId}</h2>
          <p className="mt-1 text-sm font-bold text-[var(--color-text-strong)]">
            {issue.receiver.fullName}
          </p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {materialSummary(issue)} · {issue.totalOutstandingQuantity} outstanding
          </p>
        </div>
        <CatalogBadge value="OVERDUE" />
      </div>
      <p className="mt-3 text-sm font-semibold text-[var(--color-danger)]">
        Due {formatIstDateTime(issue.expectedReturnAt)} · overdue{' '}
        {overdueDuration(issue.overdueMinutes)}
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button onClick={() => onView(issue)} variant="secondary">
          <Eye aria-hidden="true" size={17} />
          View details
        </Button>
        <Button onClick={() => onRemind(issue)}>
          <Bell aria-hidden="true" size={17} />
          Send reminder
        </Button>
      </div>
    </article>
  );
}

function OverdueActions({
  issue,
  onRemind,
  onView,
}: {
  issue: OverdueIssue;
  onRemind: (issue: OverdueIssue) => void;
  onView: (issue: OverdueIssue) => void;
}) {
  return (
    <details className="group relative inline-flex">
      <summary
        aria-label={`Open actions for ${issue.issueId}`}
        className="grid size-10 cursor-pointer list-none place-items-center rounded-[10px] border border-[var(--color-border)] bg-white text-[var(--color-text-muted)] hover:text-[var(--color-primary)] [&::-webkit-details-marker]:hidden"
      >
        <MoreVertical aria-hidden="true" size={18} />
      </summary>
      <div className="absolute right-0 top-full z-[80] mt-2 min-w-52 overflow-hidden rounded-[10px] border border-[var(--color-border)] bg-white py-1 text-left shadow-xl">
        <button className="menu-item w-full" onClick={() => onView(issue)} type="button">
          <Eye aria-hidden="true" size={16} />
          View details
        </button>
        <Link className="menu-item" to={`/issues/${issue.issueId}/return`}>
          <RotateCcw aria-hidden="true" size={16} />
          Record Return
        </Link>
        <Link className="menu-item" to={`/bills/${issue.issueId}`}>
          <Printer aria-hidden="true" size={16} />
          Issue bill
        </Link>
        <button className="menu-item w-full" onClick={() => onRemind(issue)} type="button">
          <Bell aria-hidden="true" size={16} />
          Send reminder
        </button>
      </div>
    </details>
  );
}

function OverdueTable({
  issues,
  onRemind,
  onView,
}: {
  issues: OverdueIssue[];
  onRemind: (issue: OverdueIssue) => void;
  onView: (issue: OverdueIssue) => void;
}) {
  return (
    <div className="hidden overflow-visible rounded-[14px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)] min-[840px]:block">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Overdue assets</caption>
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
              Expected return
            </th>
            <th className="h-11 px-4 font-bold" scope="col">
              Reminder
            </th>
            <th className="h-11 px-4 text-right font-bold" scope="col">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {issues.map((issue) => (
            <tr
              className="h-[70px] cursor-pointer hover:bg-[var(--color-surface-tint)]"
              key={issue.issueId}
              onClick={() => onView(issue)}
              tabIndex={0}
            >
              <td className="px-4">
                <p className="text-sm font-bold text-[var(--color-primary-strong)]">
                  {issue.issueId}
                </p>
                <p className="mt-1 text-xs font-semibold text-[var(--color-danger)]">
                  {overdueDuration(issue.overdueMinutes)} overdue
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
              <td className="px-4 text-sm text-[var(--color-text-muted)]">
                {issue.reminderCount
                  ? `${issue.reminderCount} sent · ${formatIstDateTime(issue.lastReminderAt)}`
                  : 'No reminder sent'}
              </td>
              <td className="px-4 text-right">
                <div onClick={(event) => event.stopPropagation()}>
                  <OverdueActions issue={issue} onRemind={onRemind} onView={onView} />
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
  label,
  onClose,
}: {
  children: ReactNode;
  label: string;
  onClose: () => void;
}) {
  const reference = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    reference.current?.showModal();
  }, []);
  return (
    <dialog
      aria-label={label}
      className="w-[min(94vw,720px)] rounded-[18px] border border-[var(--color-border)] bg-white p-0 text-[var(--color-text)] shadow-[var(--shadow-overlay)] backdrop:bg-slate-950/40"
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

function OverdueDetails({ issue, onClose }: { issue: OverdueIssue; onClose: () => void }) {
  return (
    <Dialog label={`${issue.issueId} overdue details`} onClose={onClose}>
      <div className="max-h-[86vh] overflow-y-auto p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-[var(--color-primary-strong)]">
              {issue.issueId}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-danger)]">
              Due {formatIstDateTime(issue.expectedReturnAt)} · overdue{' '}
              {overdueDuration(issue.overdueMinutes)}
            </p>
          </div>
          <CatalogBadge value="OVERDUE" />
        </div>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <DetailItem label="Receiver" value={issue.receiver.fullName} />
          <DetailItem label="Receiver email" value={issue.receiver.email} />
          <DetailItem label="Receiver contact" value={issue.receiver.contact} />
          <DetailItem label="Department" value={issue.receiver.department ?? 'Not provided'} />
          <DetailItem label="Outstanding quantity" value={issue.totalOutstandingQuantity} />
          <DetailItem
            label="Reminder history"
            value={
              issue.reminderCount
                ? `${issue.reminderCount} sent · last ${formatIstDateTime(issue.lastReminderAt)}`
                : 'No reminder sent'
            }
          />
        </dl>
        <div className="mt-5 rounded-[10px] border border-[var(--color-border)] p-3">
          <p className="text-xs font-bold text-[var(--color-text-muted)]">Materials pending</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {issue.materialNames.map((name) => (
              <span
                className="rounded-full bg-[var(--color-primary-soft)] px-2.5 py-1 text-xs font-bold text-[var(--color-primary)]"
                key={name}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
          <Link className="button-secondary" to={`/issues/${issue.issueId}`}>
            Full record
          </Link>
          <Link className="button-primary" to={`/issues/${issue.issueId}/return`}>
            Record Return
          </Link>
        </div>
      </div>
    </Dialog>
  );
}

function ReminderDialog({
  error,
  issue,
  loading,
  onCancel,
  onConfirm,
}: {
  error: string | null;
  issue: OverdueIssue;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog label={`Send reminder for ${issue.issueId}`} onClose={onCancel}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
            <Bell aria-hidden="true" size={22} />
          </span>
          <div>
            <h2 className="text-xl font-extrabold text-[var(--color-primary-strong)]">
              Send Return reminder?
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
              A reminder email will be queued for {issue.receiver.fullName} at{' '}
              {issue.receiver.email}. This record is overdue by{' '}
              {overdueDuration(issue.overdueMinutes)}.
            </p>
          </div>
        </div>
        {error ? (
          <p className="mt-4 rounded-[10px] border border-red-200 bg-[var(--color-danger-soft)] p-3 text-sm font-semibold text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button disabled={loading} onClick={onCancel} variant="secondary">
            Cancel
          </Button>
          <Button loading={loading} onClick={onConfirm}>
            <Bell aria-hidden="true" size={18} />
            Send reminder
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
