import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  Check,
  Clipboard,
  IdCard,
  KeyRound,
  Mail,
  Pencil,
  Phone,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import type { TemporaryCredential, UpdateWorkerRequest, Worker } from '@assetdesk/contracts';

import {
  AppCard,
  Button,
  ErrorState,
  ErrorSummary,
  LoadingPanel,
  PageHeader,
  TextField,
  WorkerStatusBadge,
} from '../../components/ui';
import { isApiError } from '../../lib/api-client';
import {
  deleteWorker,
  getWorker,
  regenerateWorkerCredentials,
  setWorkerStatus,
  updateWorker,
} from '../../lib/workers-api';

function formatDate(value: string | null): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

export function WorkerDetailPage() {
  const { workerId = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(searchParams.get('edit') === '1');
  const [confirmAction, setConfirmAction] = useState<'status' | 'credential' | 'delete' | null>(
    null,
  );
  const [credential, setCredential] = useState<TemporaryCredential | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['worker', workerId],
    queryFn: ({ signal }) => getWorker(workerId, signal),
    enabled: Boolean(workerId),
  });

  async function updateCached(worker: Worker) {
    queryClient.setQueryData(['worker', workerId], worker);
    await queryClient.invalidateQueries({ queryKey: ['workers'] });
  }

  const statusMutation = useMutation({
    mutationFn: async (worker: Worker) =>
      setWorkerStatus(worker.workerId, worker.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED'),
    onSuccess: async (worker) => {
      await updateCached(worker);
      setConfirmAction(null);
    },
    onError: (error) =>
      setActionError(isApiError(error) ? error.message : 'The Worker status could not be changed.'),
  });

  const credentialMutation = useMutation({
    mutationFn: () => regenerateWorkerCredentials(workerId),
    onSuccess: async (result) => {
      await updateCached(result.worker);
      setConfirmAction(null);
      setCredential(result.credential);
    },
    onError: (error) =>
      setActionError(
        isApiError(error) ? error.message : 'A new credential could not be generated.',
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteWorker(workerId),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ['worker', workerId] });
      await queryClient.invalidateQueries({ queryKey: ['workers'] });
      navigate('/workers', { replace: true });
    },
    onError: (error) =>
      setActionError(isApiError(error) ? error.message : 'The Worker could not be deleted.'),
  });

  if (query.isPending) return <LoadingPanel label="Loading worker details" />;
  if (query.isError || !query.data) {
    return (
      <ErrorState
        message="This Worker could not be loaded."
        onRetry={() => void query.refetch()}
        title="Worker not available"
      />
    );
  }
  const worker = query.data;

  function setEditingMode(enabled: boolean) {
    setEditing(enabled);
    if (enabled) setSearchParams({ edit: '1' });
    else setSearchParams({});
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Link className="button-quiet" to="/workers">
            <ArrowLeft aria-hidden="true" size={18} />
            Back to workers
          </Link>
        }
        description={`${worker.workerId} · ${worker.email}`}
        title={worker.name}
      />
      {actionError ? <ErrorSummary message={actionError} title="Action failed" /> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <AppCard>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                <IdCard aria-hidden="true" size={22} />
              </span>
              <div>
                <h2 className="font-extrabold text-[var(--color-primary-strong)]">
                  Worker information
                </h2>
                <WorkerStatusBadge status={worker.status} />
              </div>
            </div>
            {!editing ? (
              <Button onClick={() => setEditingMode(true)} variant="secondary">
                <Pencil aria-hidden="true" size={18} />
                Edit details
              </Button>
            ) : null}
          </div>
          {editing ? (
            <EditWorkerForm
              onCancel={() => setEditingMode(false)}
              onSaved={async (updated) => {
                await updateCached(updated);
                setEditingMode(false);
              }}
              worker={worker}
            />
          ) : (
            <dl className="mt-5 divide-y divide-[var(--color-border)]">
              <Detail icon={IdCard} label="Worker ID" value={worker.workerId} />
              <Detail icon={Mail} label="Email" value={worker.email} />
              <Detail icon={Phone} label="Contact" value={worker.contact ?? 'Not provided'} />
              <Detail
                icon={Building2}
                label="Department"
                value={worker.department ?? 'Not provided'}
              />
              <Detail
                icon={ShieldCheck}
                label="Invitation email"
                value={
                  worker.invitationStatus === 'PENDING'
                    ? 'Pending'
                    : worker.invitationStatus === 'SENT'
                      ? 'Sent'
                      : 'Failed'
                }
              />
              <Detail icon={KeyRound} label="Last login" value={formatDate(worker.lastLoginAt)} />
            </dl>
          )}
        </AppCard>

        <AppCard>
          <h2 className="font-extrabold text-[var(--color-primary-strong)]">Account actions</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
            Security actions are recorded in the audit log.
          </p>
          <div className="mt-5 space-y-2">
            <Button
              className="w-full"
              onClick={() => {
                setActionError(null);
                setConfirmAction('credential');
              }}
              variant="secondary"
            >
              <KeyRound aria-hidden="true" size={18} />
              Regenerate temporary credential
            </Button>
            <Button
              className="w-full"
              onClick={() => {
                setActionError(null);
                setConfirmAction('status');
              }}
              variant={worker.status === 'DISABLED' ? 'secondary' : 'danger'}
            >
              <ShieldCheck aria-hidden="true" size={18} />
              {worker.status === 'DISABLED' ? 'Reactivate worker' : 'Disable worker'}
            </Button>
            <Button
              className="w-full"
              onClick={() => {
                setActionError(null);
                setConfirmAction('delete');
              }}
              variant="danger"
            >
              <Trash2 aria-hidden="true" size={18} />
              Delete worker
            </Button>
          </div>
          {worker.temporaryPasswordExpiresAt ? (
            <p className="mt-4 rounded-[10px] bg-[var(--color-warning-soft)] p-3 text-xs leading-5 text-amber-900">
              Temporary credential expires {formatDate(worker.temporaryPasswordExpiresAt)}.
            </p>
          ) : null}
        </AppCard>
      </div>

      {confirmAction === 'status' ? (
        <ConfirmDialog
          confirmLabel={worker.status === 'DISABLED' ? 'Reactivate worker' : 'Disable worker'}
          danger={worker.status !== 'DISABLED'}
          description={
            worker.status === 'DISABLED'
              ? 'The Worker will be able to sign in again. If the initial password is still pending, the account will return to Invited.'
              : 'The Worker will be signed out and will not be able to access AssetDesk until reactivated.'
          }
          loading={statusMutation.isPending}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => statusMutation.mutate(worker)}
          title={worker.status === 'DISABLED' ? 'Reactivate this Worker?' : 'Disable this Worker?'}
        />
      ) : null}
      {confirmAction === 'credential' ? (
        <ConfirmDialog
          confirmLabel="Generate new credential"
          description="The current password and all active sessions will be revoked. A new one-time temporary password will be displayed once."
          loading={credentialMutation.isPending}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => credentialMutation.mutate()}
          title="Regenerate temporary credential?"
        />
      ) : null}
      {confirmAction === 'delete' ? (
        <ConfirmDialog
          confirmLabel="Delete worker"
          danger
          description="This permanently removes the Worker account and signs out any active sessions. Existing issue and return history will remain in records."
          loading={deleteMutation.isPending}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => deleteMutation.mutate()}
          title="Delete this Worker?"
        />
      ) : null}
      {credential ? (
        <CredentialDialog credential={credential} onClose={() => setCredential(null)} />
      ) : null}
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof IdCard;
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[170px_1fr]">
      <dt className="flex items-center gap-2 text-sm font-bold text-[var(--color-text-muted)]">
        <Icon aria-hidden="true" className="text-[var(--color-primary)]" size={17} />
        {label}
      </dt>
      <dd className="break-words text-sm font-semibold text-[var(--color-text-strong)] sm:text-right">
        {value}
      </dd>
    </div>
  );
}

function EditWorkerForm({
  worker,
  onCancel,
  onSaved,
}: {
  worker: Worker;
  onCancel: () => void;
  onSaved: (worker: Worker) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: worker.name,
    email: worker.email,
    contact: worker.contact ?? '',
    department: worker.department ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: UpdateWorkerRequest = {
      name: form.name.trim(),
      email: form.email.trim(),
      contact: form.contact.trim(),
      department: form.department.trim(),
    };
    setSaving(true);
    setMessage(null);
    setErrors({});
    try {
      await onSaved(await updateWorker(worker.workerId, input));
    } catch (error) {
      if (isApiError(error)) {
        setMessage(error.message);
        setErrors(error.fields);
      } else setMessage('The Worker details could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="mt-5 space-y-4" noValidate onSubmit={(event) => void submit(event)}>
      {message ? <ErrorSummary message={message} /> : null}
      <TextField
        error={errors.name}
        label="Worker name"
        onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))}
        value={form.name}
      />
      <TextField
        error={errors.email}
        label="Email"
        onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))}
        type="email"
        value={form.email}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          error={errors.contact}
          label="Contact"
          onChange={(event) => setForm((value) => ({ ...value, contact: event.target.value }))}
          optional
          value={form.contact}
        />
        <TextField
          error={errors.department}
          label="Department"
          onChange={(event) => setForm((value) => ({ ...value, department: event.target.value }))}
          optional
          value={form.department}
        />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button disabled={saving} onClick={onCancel} type="button" variant="secondary">
          Cancel
        </Button>
        <Button loading={saving} type="submit">
          {saving ? 'Saving changes…' : 'Save changes'}
        </Button>
      </div>
    </form>
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
      className="w-[min(92vw,480px)] rounded-[18px] border border-[var(--color-border)] bg-white p-0 text-[var(--color-text)] shadow-[var(--shadow-overlay)] backdrop:bg-slate-950/40"
      onCancel={onClose}
      onClose={onClose}
      ref={reference}
    >
      {children}
    </dialog>
  );
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  danger = false,
  loading,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog label={title} onClose={onCancel}>
      <div className="p-5 sm:p-6">
        <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{description}</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button disabled={loading} onClick={onCancel} variant="secondary">
            Cancel
          </Button>
          <Button loading={loading} onClick={onConfirm} variant={danger ? 'danger' : 'primary'}>
            {loading ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function CredentialDialog({
  credential,
  onClose,
}: {
  credential: TemporaryCredential;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(
      `Worker ID: ${credential.workerId}\nTemporary password: ${credential.temporaryPassword}`,
    );
    setCopied(true);
  }
  return (
    <Dialog label="New temporary credential" onClose={onClose}>
      <div className="p-5 sm:p-6">
        <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
          New temporary credential
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          This password is shown once. Share it securely; the Worker must change it at sign-in.
        </p>
        <div className="mt-4 rounded-[12px] bg-[var(--color-surface-tint)] p-4">
          <p className="text-xs font-bold text-[var(--color-text-muted)]">Worker ID</p>
          <p className="mt-1 font-bold text-[var(--color-primary-strong)]">{credential.workerId}</p>
          <p className="mt-4 text-xs font-bold text-[var(--color-text-muted)]">
            Temporary password
          </p>
          <p className="mt-1 break-all font-mono text-sm font-bold text-[var(--color-primary-strong)]">
            {credential.temporaryPassword}
          </p>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
          <Button onClick={() => void copy()}>
            {copied ? (
              <Check aria-hidden="true" size={18} />
            ) : (
              <Clipboard aria-hidden="true" size={18} />
            )}
            {copied ? 'Copied' : 'Copy credential'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
