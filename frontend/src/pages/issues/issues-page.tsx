import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  ClipboardList,
  Eye,
  MoreVertical,
  PackagePlus,
  Pencil,
  Printer,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';

import type {
  AuthUser,
  IssuePeriod,
  IssueReturnState,
  IssueStatus,
  IssueSummary,
} from '@assetdesk/contracts';

import { useAuth } from '../../auth/auth-context';
import { hasPermission } from '../../auth/permissions';
import { CatalogBadge, PageCount } from '../../components/catalog-ui';
import {
  Button,
  EmptyState,
  ErrorState,
  FilterPopover,
  LoadingPanel,
  PageHeader,
  SearchForm,
} from '../../components/ui';
import { formatIstDateTime, toIstDateTimeInput } from '../../lib/date-time';
import { isApiError } from '../../lib/api-client';
import { deleteIssue, getIssues, updateIssue } from '../../lib/issues-api';
import { humanizeCatalogValue } from '../../lib/catalog-format';

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
  return ['PENDING', 'DUE_TODAY'].includes(value) ? (value as IssueReturnState) : undefined;
}

export function IssuesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [parameters, setParameters] = useSearchParams();
  const [viewIssue, setViewIssue] = useState<IssueSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IssueSummary | null>(null);
  const [extendTarget, setExtendTarget] = useState<IssueSummary | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
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
  const admin = user?.role === 'ADMIN';
  const canCreateIssue = hasPermission(user, 'ASSIGNMENTS_CREATE');
  const deleteMutation = useMutation({
    mutationFn: (issue: IssueSummary) => deleteIssue(issue.issueId),
    onSuccess: async () => {
      setDeleteTarget(null);
      setActionError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['issues'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['returns'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
    onError: (error) => {
      setActionError(isApiError(error) ? error.message : 'This Issue Record could not be deleted.');
    },
  });
  const extendMutation = useMutation({
    mutationFn: ({ issue, expectedReturnAt }: { issue: IssueSummary; expectedReturnAt: string }) =>
      updateIssue(issue.issueId, { expectedReturnAt }),
    onSuccess: async () => {
      setExtendTarget(null);
      setActionError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['issues'] }),
        queryClient.invalidateQueries({ queryKey: ['overdue-assets'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
    onError: (error) => {
      setActionError(isApiError(error) ? error.message : 'The return date could not be extended.');
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          canCreateIssue ? <Link className="button-primary" to="/issues/new">
            <PackagePlus aria-hidden="true" size={18} />
            Issue material
          </Link> : null
        }
        description={
          user?.role === 'ADMIN'
            ? 'Review all university Issue Records.'
            : 'Review Issue Records you created or helped return.'
        }
        title="Issue Records"
      />
      <section className="rounded-[14px] border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-card)] sm:p-4">
        <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <SearchForm
            debounceMs={300}
            id="issue-list-search"
            key={search}
            label="Search Issue Records"
            onSearch={(value) => updateParameters({ search: value })}
            placeholder="Issue ID, Receiver or material"
            value={search}
          />
          <FilterPopover
            activeCount={[status, period, returnState].filter(Boolean).length}
            onClear={() => updateParameters({ status: '', period: '', returnState: '' })}
          >
            <FilterField label="Issue status">
              <select
                className="field-input"
                onChange={(event) => updateParameters({ status: event.target.value })}
                value={status ?? ''}
              >
                <option value="">All statuses</option>
                {statuses.map((value) => (
                  <option key={value} value={value}>
                    {humanizeCatalogValue(value)}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Issue date">
              <select
                className="field-input"
                onChange={(event) => updateParameters({ period: event.target.value })}
                value={period ?? ''}
              >
                <option value="">Any date</option>
                <option value="TODAY">Issued today</option>
              </select>
            </FilterField>
            <FilterField label="Return state">
              <select
                className="field-input"
                onChange={(event) => updateParameters({ returnState: event.target.value })}
                value={returnState ?? ''}
              >
                <option value="">Any return state</option>
                <option value="PENDING">Pending return</option>
                <option value="DUE_TODAY">Due today</option>
              </select>
            </FilterField>
          </FilterPopover>
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
            ) : canCreateIssue ? (
              <Link className="button-primary" to="/issues/new">
                <PackagePlus aria-hidden="true" size={18} />
                Issue material
              </Link>
            ) : undefined
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
              <IssueCard
                admin={admin}
                user={user}
                issue={issue}
                key={issue.issueId}
                onDelete={setDeleteTarget}
                onExtend={setExtendTarget}
              />
            ))}
          </div>
          <IssueTable
            admin={admin}
            user={user}
            issues={issues}
            onDelete={setDeleteTarget}
            onExtend={setExtendTarget}
            onView={setViewIssue}
          />
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
      {viewIssue ? (
        <IssueQuickViewDialog
          admin={admin}
          user={user}
          issue={viewIssue}
          onClose={() => setViewIssue(null)}
          onDelete={setDeleteTarget}
          onExtend={setExtendTarget}
        />
      ) : null}
      {extendTarget ? (
        <ExtendReturnDateDialog
          error={actionError}
          issue={extendTarget}
          loading={extendMutation.isPending}
          onCancel={() => {
            setExtendTarget(null);
            setActionError(null);
          }}
          onConfirm={(expectedReturnAt) =>
            extendMutation.mutate({ issue: extendTarget, expectedReturnAt })
          }
        />
      ) : null}
      {deleteTarget ? (
        <DeleteIssueDialog
          error={actionError}
          issue={deleteTarget}
          loading={deleteMutation.isPending}
          onCancel={() => {
            setDeleteTarget(null);
            setActionError(null);
          }}
          onConfirm={() => deleteMutation.mutate(deleteTarget)}
        />
      ) : null}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="field-label">{label}</span>
      {children}
    </label>
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

function canRecordReturn(issue: IssueSummary): boolean {
  return issue.totalOutstandingQuantity > 0;
}

function canExtendReturnDate(issue: IssueSummary): boolean {
  return (
    issue.assignmentType === 'SHORT_TERM' &&
    issue.totalOutstandingQuantity > 0 &&
    issue.expectedReturnAt !== null &&
    ['ISSUED', 'PARTIALLY_RETURNED'].includes(issue.status)
  );
}

function displayIssueStatus(issue: IssueSummary): string {
  if (issue.status === 'ISSUED' && issue.totalOutstandingQuantity === 0) return 'CONSUMED';
  return issue.status;
}

function returnStateText(issue: IssueSummary): string {
  if (canRecordReturn(issue)) {
    return `${issue.totalOutstandingQuantity} item${
      issue.totalOutstandingQuantity === 1 ? '' : 's'
    } pending return`;
  }
  if (issue.status === 'ISSUED') return 'Consumable issue completed. No return is required.';
  return 'No material is pending return.';
}

function IssueCard({
  admin,
  user,
  issue,
  onDelete,
  onExtend,
}: {
  admin: boolean;
  user: AuthUser | null;
  issue: IssueSummary;
  onDelete: (issue: IssueSummary) => void;
  onExtend: (issue: IssueSummary) => void;
}) {
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
            <CatalogBadge value={displayIssueStatus(issue)} />
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
        <IssueActionsMenu
          admin={admin}
          user={user}
          issue={issue}
          align="right"
          onDelete={onDelete}
          onExtend={onExtend}
        />
      </div>
    </article>
  );
}

function IssueActionsMenu({
  admin,
  user,
  issue,
  onDelete,
  onExtend,
  align = 'right',
}: {
  admin: boolean;
  user: AuthUser | null;
  issue: IssueSummary;
  onDelete: (issue: IssueSummary) => void;
  onExtend: (issue: IssueSummary) => void;
  align?: 'right' | 'left';
}) {
  const canEditIssue = hasPermission(user, 'ISSUES_EDIT');
  const canOpenSlip = hasPermission(user, 'ISSUE_SLIPS_VIEW');
  const canReturn = hasPermission(user, 'RETURNS_RECORD');
  const canExtend = admin && hasPermission(user, 'RETURN_DATES_EXTEND');
  const canDelete = hasPermission(user, 'ISSUES_DELETE');
  return (
    <details className="group relative inline-flex">
      <summary
        aria-label={`Open actions for ${issue.issueId}`}
        className="grid size-10 cursor-pointer list-none place-items-center rounded-[10px] border border-[var(--color-border)] bg-white text-[var(--color-text-muted)] transition hover:border-[var(--color-primary-border)] hover:text-[var(--color-primary)] [&::-webkit-details-marker]:hidden"
      >
        <MoreVertical aria-hidden="true" size={18} />
      </summary>
      <div
        className={`absolute top-full z-[80] mt-2 min-w-48 overflow-hidden rounded-[10px] border border-[var(--color-border)] bg-white py-1 text-left shadow-xl ${
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
        {canEditIssue ? (
          <Link
            className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-[var(--color-text-strong)] hover:bg-[var(--color-surface-tint)]"
            to={`/issues/${issue.issueId}?edit=1`}
          >
            <Pencil aria-hidden="true" size={16} />
            Edit Issue
          </Link>
        ) : null}
        {canOpenSlip ? (
          <Link
            className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-[var(--color-text-strong)] hover:bg-[var(--color-surface-tint)]"
            to={receiptTarget(issue)}
          >
            <Printer aria-hidden="true" size={16} />
            Generate receipt
          </Link>
        ) : null}
        {canReturn && canRecordReturn(issue) ? (
          <Link
            className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-[var(--color-text-strong)] hover:bg-[var(--color-surface-tint)]"
            to={`/issues/${issue.issueId}/return`}
          >
            <RotateCcw aria-hidden="true" size={16} />
            Record Return
          </Link>
        ) : null}
        {canExtend && canExtendReturnDate(issue) ? (
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-bold text-[var(--color-text-strong)] hover:bg-[var(--color-surface-tint)]"
            onClick={() => onExtend(issue)}
            type="button"
          >
            <CalendarClock aria-hidden="true" size={16} />
            Extend return date
          </button>
        ) : null}
        {canDelete ? (
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-bold text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
            onClick={() => onDelete(issue)}
            type="button"
          >
            <Trash2 aria-hidden="true" size={16} />
            Delete Issue
          </button>
        ) : null}
      </div>
    </details>
  );
}

function IssueTable({
  admin,
  user,
  issues,
  onDelete,
  onExtend,
  onView,
}: {
  admin: boolean;
  user: AuthUser | null;
  issues: IssueSummary[];
  onDelete: (issue: IssueSummary) => void;
  onExtend: (issue: IssueSummary) => void;
  onView: (issue: IssueSummary) => void;
}) {
  return (
    <div className="hidden overflow-visible rounded-[14px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)] min-[840px]:block">
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
            <tr
              className="h-[68px] cursor-pointer hover:bg-[var(--color-surface-tint)]"
              key={issue.issueId}
              onClick={() => onView(issue)}
              tabIndex={0}
            >
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
                <CatalogBadge value={displayIssueStatus(issue)} />
              </td>
              <td className="px-4 text-right">
                <div onClick={(event) => event.stopPropagation()}>
                  <IssueActionsMenu
                    admin={admin}
                    user={user}
                    issue={issue}
                    onDelete={onDelete}
                    onExtend={onExtend}
                  />
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

function IssueQuickViewDialog({
  admin,
  user,
  issue,
  onClose,
  onDelete,
  onExtend,
}: {
  admin: boolean;
  user: AuthUser | null;
  issue: IssueSummary;
  onClose: () => void;
  onDelete: (issue: IssueSummary) => void;
  onExtend: (issue: IssueSummary) => void;
}) {
  const canEditIssue = hasPermission(user, 'ISSUES_EDIT');
  const canOpenSlip = hasPermission(user, 'ISSUE_SLIPS_VIEW');
  const canReturn = hasPermission(user, 'RETURNS_RECORD');
  const canExtend = admin && hasPermission(user, 'RETURN_DATES_EXTEND');
  const canDelete = hasPermission(user, 'ISSUES_DELETE');
  return (
    <Dialog label={`${issue.issueId} details`} onClose={onClose}>
      <div className="max-h-[86vh] overflow-y-auto p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-[var(--color-primary-strong)]">
              {issue.issueId}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Issued {formatIstDateTime(issue.issuedAt)}
            </p>
          </div>
          <CatalogBadge value={displayIssueStatus(issue)} />
        </div>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <DetailItem label="Receiver" value={issue.receiver.fullName} />
          <DetailItem label="Material" value={materialSummary(issue)} />
          <DetailItem label="Expected return" value={formatIstDateTime(issue.expectedReturnAt)} />
          <DetailItem label="Return status" value={returnStateText(issue)} />
        </dl>
        <div className="mt-5 rounded-[10px] border border-[var(--color-border)] p-3">
          <p className="text-xs font-bold text-[var(--color-text-muted)]">Materials</p>
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
          {canEditIssue ? <Link className="button-secondary" to={`/issues/${issue.issueId}?edit=1`}>
            Edit
          </Link> : null}
          {canOpenSlip ? <Link className="button-secondary" to={receiptTarget(issue)}>
            Generate receipt
          </Link> : null}
          {canReturn && canRecordReturn(issue) ? (
            <Link className="button-primary" to={`/issues/${issue.issueId}/return`}>
              Record Return
            </Link>
          ) : (
            <Link className="button-secondary" to={`/issues/${issue.issueId}`}>
              View lifecycle
            </Link>
          )}
          {admin ? (
            <>
              {canExtend && canExtendReturnDate(issue) ? (
                <Button
                  onClick={() => {
                    onClose();
                    onExtend(issue);
                  }}
                  variant="secondary"
                >
                  <CalendarClock aria-hidden="true" size={18} />
                  Extend date
                </Button>
              ) : null}
              {canDelete ? <Button
                onClick={() => {
                  onClose();
                  onDelete(issue);
                }}
                variant="danger"
              >
                <Trash2 aria-hidden="true" size={18} />
                Delete
              </Button> : null}
            </>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

function DeleteIssueDialog({
  error,
  issue,
  loading,
  onCancel,
  onConfirm,
}: {
  error: string | null;
  issue: IssueSummary;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog label={`Delete ${issue.issueId}`} onClose={onCancel}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--color-danger-soft)] text-[var(--color-danger)]">
            <Trash2 aria-hidden="true" size={22} />
          </span>
          <div>
            <h2 className="text-xl font-extrabold text-[var(--color-danger)]">
              Delete Issue Record?
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
              This will remove {issue.issueId}. Outstanding reusable stock will be returned to
              inventory, and consumed quantity will be restored for consumable-only records.
            </p>
          </div>
        </div>
        {error ? (
          <div className="mt-4">
            <ErrorState message={error} title="Delete failed" />
          </div>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button disabled={loading} onClick={onCancel} variant="secondary">
            Cancel
          </Button>
          <Button loading={loading} onClick={onConfirm} variant="danger">
            Delete Issue
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ExtendReturnDateDialog({
  error,
  issue,
  loading,
  onCancel,
  onConfirm,
}: {
  error: string | null;
  issue: IssueSummary;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (expectedReturnAt: string) => void;
}) {
  const [value, setValue] = useState(() =>
    issue.expectedReturnAt
      ? toIstDateTimeInput(new Date(issue.expectedReturnAt))
      : toIstDateTimeInput(new Date()),
  );
  const selected = value ? new Date(`${value}:00+05:30`) : null;
  const invalid = !selected || selected <= new Date();

  return (
    <Dialog label={`Extend return date for ${issue.issueId}`} onClose={onCancel}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
            <CalendarClock aria-hidden="true" size={22} />
          </span>
          <div>
            <h2 className="text-xl font-extrabold text-[var(--color-primary-strong)]">
              Extend return date
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
              Update the expected return time for {issue.issueId}. This controls overdue tracking
              and reminder eligibility.
            </p>
          </div>
        </div>
        <label className="mt-5 block space-y-1.5">
          <span className="field-label">New expected return (IST)</span>
          <input
            className="field-input"
            onChange={(event) => setValue(event.target.value)}
            type="datetime-local"
            value={value}
          />
        </label>
        {invalid ? (
          <p className="mt-2 text-sm font-semibold text-[var(--color-danger)]">
            Choose a future date and time.
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-[10px] border border-red-200 bg-[var(--color-danger-soft)] p-3 text-sm font-semibold text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button disabled={loading} onClick={onCancel} variant="secondary">
            Cancel
          </Button>
          <Button
            disabled={invalid}
            loading={loading}
            onClick={() => {
              if (selected) onConfirm(selected.toISOString());
            }}
          >
            Save new date
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
