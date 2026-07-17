import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarClock,
  ContactRound,
  PackageCheck,
  Pencil,
  Printer,
  RotateCcw,
  UserRound,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';

import {
  UpdateIssueRequestSchema,
  type Issue,
  type IssueLine,
  type ReceiverType,
  type ReturnEvent,
} from '@assetdesk/contracts';

import { CatalogBadge, DetailRow } from '../../components/catalog-ui';
import { AppCard, Button, ErrorState, LoadingPanel, PageHeader } from '../../components/ui';
import { formatIstDateTime } from '../../lib/date-time';
import { returnedUnitCount } from '../../lib/issue-format';
import { getIssue, updateIssue } from '../../lib/issues-api';
import { NotificationStatusCard } from './notification-status-card';

export function IssueDetailPage() {
  const { issueId = '' } = useParams();
  const [parameters] = useSearchParams();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(() => parameters.get('edit') === '1');
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
            {issue.totalOutstandingQuantity > 0 ? (
              <Link className="button-primary" to={`/issues/${issue.issueId}/return`}>
                <RotateCcw aria-hidden="true" size={18} />
                Record Return
              </Link>
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
                  {issue.totalOutstandingQuantity} of{' '}
                  {full?.totalIssuedQuantity ??
                    issue.lines.reduce((sum, line) => sum + line.issuedQuantity, 0)}{' '}
                  items outstanding
                </p>
              </div>
            </div>
            <CatalogBadge value={issue.status} />
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
    </div>
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
          </li>
        ))}
      </ol>
    </AppCard>
  );
}
