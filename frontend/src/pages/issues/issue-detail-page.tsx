import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarClock,
  ContactRound,
  PackageCheck,
  Pencil,
  Printer,
  RotateCcw,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useEffect, useRef, type FormEvent, type ReactNode, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import {
  UpdateIssueRequestSchema,
  type Issue,
  type IssueLine,
  type ReceiverType,
  type ReturnEvent,
} from '@assetdesk/contracts';

import { CatalogBadge, DetailRow } from '../../components/catalog-ui';
import { AppCard, Button, ErrorState, LoadingPanel, PageHeader } from '../../components/ui';
import { isApiError } from '../../lib/api-client';
import { formatIstDateTime, toIstDateTimeInput } from '../../lib/date-time';
import { returnedUnitCount } from '../../lib/issue-format';
import { deleteIssue, getIssue, updateIssue } from '../../lib/issues-api';
import { NotificationStatusCard } from './notification-status-card';

function canRecordReturn(issue: Pick<Issue, 'totalOutstandingQuantity'>): boolean {
  return issue.totalOutstandingQuantity > 0;
}

function canExtendReturnDate(
  issue: Pick<Issue, 'assignmentType' | 'expectedReturnAt' | 'status' | 'totalOutstandingQuantity'>,
): boolean {
  return (
    issue.assignmentType === 'SHORT_TERM' &&
    issue.expectedReturnAt !== null &&
    issue.totalOutstandingQuantity > 0 &&
    ['ISSUED', 'PARTIALLY_RETURNED'].includes(issue.status)
  );
}

function displayIssueStatus(issue: Pick<Issue, 'status' | 'totalOutstandingQuantity'>): string {
  if (issue.status === 'ISSUED' && issue.totalOutstandingQuantity === 0) return 'CONSUMED';
  return issue.status;
}

function returnProgressText(
  issue: Pick<Issue, 'status' | 'totalOutstandingQuantity'>,
  totalIssued: number,
): string {
  if (issue.totalOutstandingQuantity > 0) {
    return `${issue.totalOutstandingQuantity} of ${totalIssued} items outstanding`;
  }
  if (issue.status === 'ISSUED') return `${totalIssued} items consumed. No return is required.`;
  return `0 of ${totalIssued} items outstanding`;
}

export function IssueDetailPage() {
  const { issueId = '' } = useParams();
  const [parameters] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(() => parameters.get('edit') === '1');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [extendDialogOpen, setExtendDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [extendError, setExtendError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['issue', issueId],
    queryFn: ({ signal }) => getIssue(issueId, signal),
    enabled: Boolean(issueId),
  });

  if (query.isPending) return <LoadingPanel label="Loading Issue Record" />;
  if (query.isError || !query.data)
    return (
      <ErrorState
        message="This Issue Record could not be loaded."
        onRetry={() => void query.refetch()}
        title="Issue Record not available"
      />
    );
  const response = query.data;
  const issue = response.data.issue;
  const full = response.accessScope === 'FULL' ? response.data.issue : null;
  const returnable = canRecordReturn(issue);
  const totalIssued =
    full?.totalIssuedQuantity ?? issue.lines.reduce((sum, line) => sum + line.issuedQuantity, 0);
  const deleteMutation = useMutation({
    mutationFn: () => deleteIssue(issue.issueId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['issues'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['returns'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      navigate('/issues');
    },
    onError: (error) => {
      setDeleteError(isApiError(error) ? error.message : 'This Issue Record could not be deleted.');
    },
  });
  const extendMutation = useMutation({
    mutationFn: (expectedReturnAt: string) => updateIssue(issue.issueId, { expectedReturnAt }),
    onSuccess: async (response) => {
      queryClient.setQueryData(['issue', issueId], {
        accessScope: 'FULL',
        data: { issue: response.data.issue },
      });
      setExtendDialogOpen(false);
      setExtendError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['issues'] }),
        queryClient.invalidateQueries({ queryKey: ['overdue-assets'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
    onError: (error) => {
      setExtendError(isApiError(error) ? error.message : 'The return date could not be extended.');
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            <Link className="button-quiet" to="/issues">
              <ArrowLeft aria-hidden="true" size={18} />
              Back to Issues
            </Link>
            <Link className="button-secondary" to={`/bills/${issue.issueId}`}>
              <Printer aria-hidden="true" size={18} />
              Generate bill
            </Link>
            {full ? (
              <Button onClick={() => setEditing(true)} variant="secondary">
                <Pencil aria-hidden="true" size={18} />
                Edit Issue
              </Button>
            ) : null}
            {returnable ? (
              <Link className="button-primary" to={`/issues/${issue.issueId}/return`}>
                <RotateCcw aria-hidden="true" size={18} />
                Record Return
              </Link>
            ) : null}
            {full && canExtendReturnDate(issue) ? (
              <Button onClick={() => setExtendDialogOpen(true)} variant="secondary">
                <CalendarClock aria-hidden="true" size={18} />
                Extend date
              </Button>
            ) : null}
            {full ? (
              <Button onClick={() => setDeleteDialogOpen(true)} variant="danger">
                <Trash2 aria-hidden="true" size={18} />
                Delete
              </Button>
            ) : null}
          </>
        }
        description={`${issue.receiver.fullName} · Issued ${formatIstDateTime(issue.issuedAt)}`}
        title={issue.issueId}
      />
      {response.accessScope === 'RETURN_ONLY' ? (
        <div className="rounded-[12px] border border-blue-200 bg-[var(--color-info-soft)] p-4 text-sm leading-6 text-[var(--color-info)]">
          This operational view contains the information needed to record a Return. Full Issue
          Record history remains limited to the Admin and involved Workers.
        </div>
      ) : null}

      {full && editing ? (
        <EditIssueCard
          issue={full}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            queryClient.setQueryData(['issue', issueId], {
              accessScope: 'FULL',
              data: { issue: updated },
            });
            void queryClient.invalidateQueries({ queryKey: ['issues'] });
            setEditing(false);
          }}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <AppCard>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                <PackageCheck aria-hidden="true" size={22} />
              </span>
              <div>
                <h2 className="font-extrabold text-[var(--color-primary-strong)]">
                  Issued materials
                </h2>
                <p className="text-sm text-[var(--color-text-muted)]">
                  {returnProgressText(issue, totalIssued)}
                </p>
              </div>
            </div>
            <CatalogBadge value={displayIssueStatus(issue)} />
          </div>
          <div className="mt-5 space-y-3">
            {issue.lines.map((line) => (
              <IssueLineCard key={line.lineId} line={line} />
            ))}
          </div>
        </AppCard>

        <div className="space-y-4">
          <AppCard>
            <div className="flex items-center gap-2 text-[var(--color-primary)]">
              <ContactRound aria-hidden="true" size={20} />
              <h2 className="font-extrabold text-[var(--color-primary-strong)]">Receiver</h2>
            </div>
            <dl className="mt-3 divide-y divide-[var(--color-border)]">
              <DetailRow label="Name" value={issue.receiver.fullName} />
              <DetailRow label="Receiver code" value={issue.receiver.receiverCode} />
              <DetailRow
                label="University ID"
                value={issue.receiver.universityId ?? 'Not provided'}
              />
              <DetailRow label="Department" value={issue.receiver.department ?? 'Not provided'} />
              <DetailRow label="Contact" value={issue.receiver.contact} />
              <DetailRow label="Email" value={issue.receiver.email} />
            </dl>
          </AppCard>
          <AppCard>
            <div className="flex items-center gap-2 text-[var(--color-primary)]">
              <CalendarClock aria-hidden="true" size={20} />
              <h2 className="font-extrabold text-[var(--color-primary-strong)]">Schedule</h2>
            </div>
            <dl className="mt-3 divide-y divide-[var(--color-border)]">
              <DetailRow label="Issued at" value={formatIstDateTime(issue.issuedAt)} />
              <DetailRow
                label="Expected Return"
                value={formatIstDateTime(issue.expectedReturnAt)}
              />
            </dl>
          </AppCard>
          <AppCard>
            <div className="flex items-center gap-2 text-[var(--color-primary)]">
              <UserRound aria-hidden="true" size={20} />
              <h2 className="font-extrabold text-[var(--color-primary-strong)]">Issued by</h2>
            </div>
            <p className="mt-3 font-bold text-[var(--color-text-strong)]">{issue.issuedBy.name}</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {issue.issuedBy.workerId} · {issue.issuedBy.role === 'ADMIN' ? 'Admin' : 'Worker'}
            </p>
          </AppCard>
          {full ? <NotificationStatusCard issueId={issue.issueId} /> : null}
        </div>
      </div>

      {full ? (
        <>
          <AppCard>
            <h2 className="font-extrabold text-[var(--color-primary-strong)]">Purpose and notes</h2>
            <dl className="mt-3 divide-y divide-[var(--color-border)]">
              <DetailRow label="Purpose" value={full.purpose ?? 'Not provided'} />
              <DetailRow label="Notes" value={full.notes ?? 'Not provided'} />
            </dl>
          </AppCard>
          <Timeline issuedAt={full.issuedAt} returns={full.returnEvents} />
        </>
      ) : null}
      {deleteDialogOpen ? (
        <DeleteIssueDialog
          error={deleteError}
          issue={issue}
          loading={deleteMutation.isPending}
          onCancel={() => {
            setDeleteDialogOpen(false);
            setDeleteError(null);
          }}
          onConfirm={() => deleteMutation.mutate()}
        />
      ) : null}
      {extendDialogOpen ? (
        <ExtendReturnDateDialog
          error={extendError}
          issue={issue}
          loading={extendMutation.isPending}
          onCancel={() => {
            setExtendDialogOpen(false);
            setExtendError(null);
          }}
          onConfirm={(expectedReturnAt) => extendMutation.mutate(expectedReturnAt)}
        />
      ) : null}
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
      className="w-[min(92vw,560px)] rounded-[18px] border border-[var(--color-border)] bg-white p-0 text-[var(--color-text)] shadow-[var(--shadow-overlay)] backdrop:bg-slate-950/40"
      onCancel={onClose}
      onClose={onClose}
      ref={reference}
    >
      {children}
    </dialog>
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
  issue: Pick<Issue, 'issueId'>;
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
              This removes the Issue Record. Outstanding reusable stock will return to inventory;
              consumable quantity will be restored.
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
  issue: Pick<Issue, 'expectedReturnAt' | 'issueId'>;
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
              Update the expected return time. This controls overdue tracking and reminder
              eligibility.
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

function EditIssueCard({
  issue,
  onCancel,
  onSaved,
}: {
  issue: Issue;
  onCancel: () => void;
  onSaved: (issue: Issue) => void;
}) {
  const [fullName, setFullName] = useState(issue.receiver.fullName);
  const [universityId, setUniversityId] = useState(issue.receiver.universityId ?? '');
  const [type, setType] = useState<ReceiverType>(issue.receiver.type);
  const [department, setDepartment] = useState(issue.receiver.department ?? '');
  const [contact, setContact] = useState(issue.receiver.contact);
  const [email, setEmail] = useState(issue.receiver.email);
  const [purpose, setPurpose] = useState(issue.purpose ?? '');
  const [notes, setNotes] = useState(issue.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => {
      const input = UpdateIssueRequestSchema.parse({
        receiver: {
          fullName,
          universityId,
          type,
          department,
          contact,
          email,
        },
        purpose,
        notes,
      });
      return updateIssue(issue.issueId, input);
    },
    onSuccess: (response) => onSaved(response.data.issue),
    onError: (caught) => {
      setError(caught instanceof Error ? caught.message : 'Issue Record could not be updated.');
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      mutation.mutate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Check the highlighted details.');
    }
  }

  return (
    <AppCard>
      <form className="space-y-4" onSubmit={submit}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-[var(--color-primary-strong)]">
              Edit Issue details
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Materials and quantities stay locked after issue; use Return or re-issue for stock
              movement.
            </p>
          </div>
          <div className="flex gap-2">
            <Button disabled={mutation.isPending} onClick={onCancel} type="button" variant="quiet">
              Cancel
            </Button>
            <Button disabled={mutation.isPending} type="submit" variant="primary">
              {mutation.isPending ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </div>
        {error ? (
          <p className="rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <EditField label="Issued to" onChange={setFullName} value={fullName} />
          <EditField label="University ID" onChange={setUniversityId} optional value={universityId} />
          <label className="block">
            <span className="field-label">Type</span>
            <select
              className="field-input field-input-compact"
              onChange={(event) => setType(event.target.value as ReceiverType)}
              value={type}
            >
              <option value="STUDENT">Student</option>
              <option value="FACULTY">Faculty</option>
              <option value="STAFF">Staff</option>
              <option value="DEPARTMENT">Department</option>
              <option value="AUTHORIZED_EXTERNAL">Authorized external</option>
            </select>
          </label>
          <EditField label="Department" onChange={setDepartment} optional value={department} />
          <EditField label="Contact" onChange={setContact} value={contact} />
          <EditField label="Email" onChange={setEmail} value={email} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <label className="block">
            <span className="field-label">Purpose</span>
            <textarea
              className="field-input field-input-compact min-h-20 resize-y"
              maxLength={240}
              onChange={(event) => setPurpose(event.target.value)}
              value={purpose}
            />
          </label>
          <label className="block">
            <span className="field-label">Notes</span>
            <textarea
              className="field-input field-input-compact min-h-20 resize-y"
              maxLength={2000}
              onChange={(event) => setNotes(event.target.value)}
              value={notes}
            />
          </label>
        </div>
      </form>
    </AppCard>
  );
}

function EditField({
  label,
  value,
  onChange,
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  return (
    <label className="block">
      <span className="field-label">
        {label}{' '}
        {optional ? (
          <span className="font-medium text-[var(--color-text-muted)]">(optional)</span>
        ) : null}
      </span>
      <input
        className="field-input field-input-compact"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function IssueLineCard({ line }: { line: IssueLine }) {
  return (
    <article className="rounded-[12px] border border-[var(--color-border)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-extrabold text-[var(--color-text-strong)]">{line.material.name}</h3>
          <p className="mt-1 text-xs font-bold text-[var(--color-primary)]">
            {line.material.materialCode} · {line.material.category}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CatalogBadge value={line.material.trackingMode} />
          <CatalogBadge value={line.material.returnPolicy} />
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:max-w-sm">
        <div className="rounded-[10px] bg-[var(--color-surface-tint)] p-3">
          <dt className="text-xs font-bold text-[var(--color-text-muted)]">Issued</dt>
          <dd className="mt-1 font-extrabold text-[var(--color-primary-strong)]">
            {line.issuedQuantity} {line.material.unitLabel ?? 'units'}
          </dd>
        </div>
        <div className="rounded-[10px] bg-[var(--color-surface-tint)] p-3">
          <dt className="text-xs font-bold text-[var(--color-text-muted)]">Outstanding</dt>
          <dd className="mt-1 font-extrabold text-[var(--color-primary-strong)]">
            {line.outstandingQuantity} {line.material.unitLabel ?? 'units'}
          </dd>
        </div>
      </dl>
      {line.assets.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <caption className="sr-only">Serialized units for {line.material.name}</caption>
            <thead className="text-xs text-[var(--color-text-muted)]">
              <tr>
                <th className="border-b border-[var(--color-border)] py-2 pr-3" scope="col">
                  Asset tag
                </th>
                <th className="border-b border-[var(--color-border)] py-2 pr-3" scope="col">
                  Serial
                </th>
                <th className="border-b border-[var(--color-border)] py-2 pr-3" scope="col">
                  Condition at issue
                </th>
                <th className="border-b border-[var(--color-border)] py-2" scope="col">
                  State
                </th>
              </tr>
            </thead>
            <tbody>
              {line.assets.map((asset) => (
                <tr key={asset.assetTag}>
                  <td className="border-b border-[var(--color-border)] py-3 pr-3 font-bold text-[var(--color-text-strong)]">
                    {asset.assetTag}
                  </td>
                  <td className="border-b border-[var(--color-border)] py-3 pr-3 text-[var(--color-text-muted)]">
                    {asset.serialNumber ?? 'Not provided'}
                  </td>
                  <td className="border-b border-[var(--color-border)] py-3 pr-3 text-[var(--color-text-muted)]">
                    {asset.conditionAtIssue}
                  </td>
                  <td className="border-b border-[var(--color-border)] py-3">
                    {asset.outstanding ? (
                      <CatalogBadge value="ISSUED" />
                    ) : (
                      <CatalogBadge value={asset.returnDisposition ?? 'RETURNED'} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </article>
  );
}

function Timeline({ issuedAt, returns }: { issuedAt: string; returns: ReturnEvent[] }) {
  const events = [...returns].sort(
    (left, right) => new Date(left.returnedAt).getTime() - new Date(right.returnedAt).getTime(),
  );
  return (
    <AppCard>
      <h2 className="font-extrabold text-[var(--color-primary-strong)]">Activity timeline</h2>
      <ol className="mt-5 space-y-0 border-l-2 border-[var(--color-primary-border)] pl-5">
        <li className="relative pb-6">
          <span
            aria-hidden="true"
            className="absolute -left-[27px] top-0.5 size-3 rounded-full bg-[var(--color-primary)] ring-4 ring-white"
          />
          <h3 className="text-sm font-bold text-[var(--color-text-strong)]">Material issued</h3>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {formatIstDateTime(issuedAt)}
          </p>
        </li>
        {events.map((event) => (
          <li className="relative pb-6 last:pb-0" key={event.returnEventId}>
            <span
              aria-hidden="true"
              className="absolute -left-[27px] top-0.5 size-3 rounded-full bg-[var(--color-success)] ring-4 ring-white"
            />
            <h3 className="text-sm font-bold text-[var(--color-text-strong)]">
              Return recorded · {returnedUnitCount(event.items)}{' '}
              {returnedUnitCount(event.items) === 1 ? 'unit' : 'units'}
            </h3>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {formatIstDateTime(event.returnedAt)} · {event.performedBy.name} (
              {event.performedBy.workerId})
            </p>
            {event.notes ? (
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">{event.notes}</p>
            ) : null}
            <Link
              className="button-secondary mt-3 w-full sm:w-auto"
              to={`/bills/${event.issueId}?type=return&returnEventId=${event.returnEventId}`}
            >
              Return bill
            </Link>
          </li>
        ))}
      </ol>
    </AppCard>
  );
}
