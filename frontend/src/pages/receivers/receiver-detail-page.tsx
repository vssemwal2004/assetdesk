import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  ContactRound,
  IdCard,
  Mail,
  Pencil,
  Phone,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import {
  UpdateReceiverRequestSchema,
  type Receiver,
  type ReceiverType,
  type UpdateReceiverRequest,
} from '@assetdesk/contracts';

import { useAuth } from '../../auth/auth-context';
import { CatalogBadge, DetailRow, SelectField } from '../../components/catalog-ui';
import {
  AppCard,
  Button,
  ErrorState,
  ErrorSummary,
  LoadingPanel,
  PageHeader,
  TextField,
} from '../../components/ui';
import { isApiError } from '../../lib/api-client';
import { humanizeCatalogValue } from '../../lib/catalog-format';
import { deleteReceiver, getReceiver, setReceiverStatus, updateReceiver } from '../../lib/receivers-api';

const receiverTypes: ReceiverType[] = [
  'FACULTY',
  'STAFF',
  'STUDENT',
  'DEPARTMENT',
  'AUTHORIZED_EXTERNAL',
];

export function ReceiverDetailPage() {
  const { receiverCode = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const notice = (location.state as { notice?: string } | null)?.notice;
  const admin = user?.role === 'ADMIN';

  const query = useQuery({
    queryKey: ['receiver', receiverCode],
    queryFn: ({ signal }) => getReceiver(receiverCode, signal),
    enabled: Boolean(receiverCode),
  });

  async function updateCached(receiver: Receiver) {
    queryClient.setQueryData(['receiver', receiverCode], receiver);
    await queryClient.invalidateQueries({ queryKey: ['receivers'] });
  }

  const statusMutation = useMutation({
    mutationFn: (receiver: Receiver) =>
      setReceiverStatus(
        receiver.receiverCode,
        receiver.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
      ),
    onSuccess: async (receiver) => {
      await updateCached(receiver);
      setConfirmStatus(false);
    },
    onError: (error) => {
      setConfirmStatus(false);
      setActionError(
        isApiError(error) ? error.message : 'The Receiver status could not be changed.',
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (receiver: Receiver) => deleteReceiver(receiver.receiverCode),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['receivers'] });
      navigate('/receivers', { replace: true });
    },
    onError: (error) => {
      setConfirmDelete(false);
      setActionError(
        isApiError(error)
          ? error.message
          : 'This Receiver could not be deleted. Mark it inactive if it has history.',
      );
    },
  });

  if (query.isPending) return <LoadingPanel label="Loading Receiver details" />;
  if (query.isError || !query.data) {
    return (
      <ErrorState
        message="This Receiver could not be loaded."
        onRetry={() => void query.refetch()}
        title="Receiver not available"
      />
    );
  }
  const receiver = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Link className="button-quiet" to="/receivers">
            <ArrowLeft aria-hidden="true" size={18} />
            Back to Receivers
          </Link>
        }
        description={`${receiver.receiverCode} · ${humanizeCatalogValue(receiver.type)}`}
        title={receiver.fullName}
      />
      {notice ? (
        <div
          className="rounded-[12px] border border-emerald-200 bg-[var(--color-success-soft)] p-4 text-sm font-bold text-[var(--color-success)]"
          role="status"
        >
          {notice}
        </div>
      ) : null}
      {actionError ? <ErrorSummary message={actionError} title="Action failed" /> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <AppCard>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                <ContactRound aria-hidden="true" size={22} />
              </span>
              <div>
                <h2 className="font-extrabold text-[var(--color-primary-strong)]">
                  Receiver information
                </h2>
                <CatalogBadge value={receiver.status} />
              </div>
            </div>
            {admin && !editing ? (
              <Button onClick={() => setEditing(true)} variant="secondary">
                <Pencil aria-hidden="true" size={18} />
                Edit details
              </Button>
            ) : null}
          </div>
          {editing ? (
            <EditReceiverForm
              onCancel={() => setEditing(false)}
              onSaved={async (updated) => {
                await updateCached(updated);
                setEditing(false);
              }}
              receiver={receiver}
            />
          ) : (
            <dl className="mt-5 divide-y divide-[var(--color-border)]">
              <DetailRow label="Receiver code" value={receiver.receiverCode} />
              <DetailRow label="University ID" value={receiver.universityId ?? 'Not provided'} />
              <DetailRow label="Type" value={humanizeCatalogValue(receiver.type)} />
              <DetailRow label="Department" value={receiver.department ?? 'Not provided'} />
              <DetailRow label="Contact" value={receiver.contact} />
              <DetailRow label="Email" value={receiver.email} />
            </dl>
          )}
        </AppCard>

        <div className="space-y-4">
          <AppCard>
            <h2 className="font-extrabold text-[var(--color-primary-strong)]">Directory status</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
              {receiver.status === 'ACTIVE'
                ? 'This Receiver is available in operational searches.'
                : 'This Receiver is retained for records but hidden from active operational searches.'}
            </p>
            {admin ? (
              <div className="mt-4 space-y-2">
                <Button
                  className="w-full"
                  onClick={() => {
                    setActionError(null);
                    setConfirmStatus(true);
                  }}
                  variant={receiver.status === 'ACTIVE' ? 'danger' : 'secondary'}
                >
                  <ShieldCheck aria-hidden="true" size={18} />
                  {receiver.status === 'ACTIVE' ? 'Deactivate Receiver' : 'Reactivate Receiver'}
                </Button>
                <Button
                  className="w-full"
                  onClick={() => {
                    setActionError(null);
                    setConfirmDelete(true);
                  }}
                  variant="danger"
                >
                  <Trash2 aria-hidden="true" size={18} />
                  Delete Receiver
                </Button>
              </div>
            ) : (
              <p className="mt-3 rounded-[10px] bg-[var(--color-surface-tint)] p-3 text-xs font-semibold text-[var(--color-text-muted)]">
                Receiver records are read-only for Worker accounts.
              </p>
            )}
          </AppCard>
          <AppCard>
            <h2 className="font-extrabold text-[var(--color-primary-strong)]">Contact summary</h2>
            <ul className="mt-4 space-y-3 text-sm text-[var(--color-text-muted)]">
              <li className="flex gap-2">
                <IdCard aria-hidden="true" size={18} />
                {receiver.universityId ?? receiver.receiverCode}
              </li>
              <li className="flex gap-2">
                <Building2 aria-hidden="true" size={18} />
                {receiver.department ?? 'Department not provided'}
              </li>
              <li className="flex gap-2">
                <Phone aria-hidden="true" size={18} />
                {receiver.contact}
              </li>
              <li className="flex min-w-0 gap-2">
                <Mail aria-hidden="true" className="shrink-0" size={18} />
                <span className="break-all">{receiver.email}</span>
              </li>
            </ul>
          </AppCard>
        </div>
      </div>

      {confirmStatus ? (
        <StatusDialog
          active={receiver.status === 'ACTIVE'}
          loading={statusMutation.isPending}
          onCancel={() => setConfirmStatus(false)}
          onConfirm={() => statusMutation.mutate(receiver)}
        />
      ) : null}
      {confirmDelete ? (
        <DeleteReceiverDialog
          loading={deleteMutation.isPending}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => deleteMutation.mutate(receiver)}
          receiver={receiver}
        />
      ) : null}
    </div>
  );
}

function EditReceiverForm({
  receiver,
  onSaved,
  onCancel,
}: {
  receiver: Receiver;
  onSaved: (receiver: Receiver) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    fullName: receiver.fullName,
    universityId: receiver.universityId ?? '',
    type: receiver.type,
    department: receiver.department ?? '',
    contact: receiver.contact,
    email: receiver.email,
  });
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (input: UpdateReceiverRequest) => updateReceiver(receiver.receiverCode, input),
    onSuccess: onSaved,
    onError: (error) =>
      setMessage(isApiError(error) ? error.message : 'Changes could not be saved.'),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const result = UpdateReceiverRequestSchema.safeParse({
      fullName: form.fullName,
      universityId: form.universityId.trim() || null,
      type: form.type,
      department: form.department.trim() || null,
      contact: form.contact,
      email: form.email,
    });
    if (!result.success) {
      setMessage(result.error.issues[0]?.message ?? 'Check the Receiver details.');
      return;
    }
    mutation.mutate(result.data);
  }

  return (
    <form className="mt-5 space-y-5" noValidate onSubmit={submit}>
      {message ? <ErrorSummary message={message} /> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Full name"
          onChange={(event) => setForm((value) => ({ ...value, fullName: event.target.value }))}
          value={form.fullName}
        />
        <TextField
          label="University ID"
          onChange={(event) => setForm((value) => ({ ...value, universityId: event.target.value }))}
          optional
          value={form.universityId}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          id="edit-receiver-type"
          label="Receiver type"
          onChange={(value) => setForm((current) => ({ ...current, type: value as ReceiverType }))}
          value={form.type}
        >
          {receiverTypes.map((value) => (
            <option key={value} value={value}>
              {humanizeCatalogValue(value)}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Department"
          onChange={(event) => setForm((value) => ({ ...value, department: event.target.value }))}
          optional
          value={form.department}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Contact number"
          onChange={(event) => setForm((value) => ({ ...value, contact: event.target.value }))}
          type="tel"
          value={form.contact}
        />
        <TextField
          label="Email"
          onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))}
          type="email"
          value={form.email}
        />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button disabled={mutation.isPending} onClick={onCancel} type="button" variant="secondary">
          Cancel
        </Button>
        <Button loading={mutation.isPending} type="submit">
          {mutation.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}

function StatusDialog({
  active,
  loading,
  onConfirm,
  onCancel,
}: {
  active: boolean;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const reference = useRef<HTMLDialogElement>(null);
  useEffect(() => reference.current?.showModal(), []);
  const title = active ? 'Deactivate Receiver?' : 'Reactivate Receiver?';
  return (
    <dialog
      aria-labelledby="receiver-status-title"
      className="w-[min(92vw,480px)] rounded-[18px] border border-[var(--color-border)] bg-white p-0 text-[var(--color-text)] shadow-[var(--shadow-overlay)]"
      onCancel={onCancel}
      onClose={onCancel}
      ref={reference}
    >
      <div className="p-5 sm:p-6">
        <h2
          className="text-lg font-extrabold text-[var(--color-primary-strong)]"
          id="receiver-status-title"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          {active
            ? 'The Receiver will no longer appear in active operational searches. Existing records are preserved.'
            : 'The Receiver will become available in operational searches again.'}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button disabled={loading} onClick={onCancel} variant="secondary">
            Cancel
          </Button>
          <Button loading={loading} onClick={onConfirm} variant={active ? 'danger' : 'primary'}>
            {loading ? 'Working…' : active ? 'Deactivate' : 'Reactivate'}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

function DeleteReceiverDialog({
  receiver,
  loading,
  onConfirm,
  onCancel,
}: {
  receiver: Receiver;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const reference = useRef<HTMLDialogElement>(null);
  useEffect(() => reference.current?.showModal(), []);
  return (
    <dialog
      aria-labelledby="receiver-delete-title"
      className="w-[min(92vw,480px)] rounded-[18px] border border-[var(--color-border)] bg-white p-0 text-[var(--color-text)] shadow-[var(--shadow-overlay)]"
      onCancel={onCancel}
      onClose={onCancel}
      ref={reference}
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[8px] bg-[var(--color-danger-soft)] text-[var(--color-danger)]">
            <Trash2 aria-hidden="true" size={20} />
          </span>
          <div>
            <h2
              className="text-lg font-extrabold text-[var(--color-primary-strong)]"
              id="receiver-delete-title"
            >
              Delete Receiver?
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
              {receiver.fullName} will be permanently removed. Delete is allowed only when this
              Receiver has no Issue history.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button disabled={loading} onClick={onCancel} variant="secondary">
            Cancel
          </Button>
          <Button loading={loading} onClick={onConfirm} variant="danger">
            {loading ? 'Deleting...' : 'Delete Receiver'}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
