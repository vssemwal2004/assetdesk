import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Eye,
  FileUp,
  MoreVertical,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';

import type { Worker, WorkerPermission } from '@assetdesk/contracts';

import {
  Button,
  EmptyState,
  ErrorState,
  ErrorSummary,
  LoadingPanel,
  PageHeader,
  SearchForm,
  WorkerStatusBadge,
} from '../../components/ui';
import { deleteWorker, getWorkers, updateWorker } from '../../lib/workers-api';
import { isApiError } from '../../lib/api-client';
import { DataAccessMatrix, PermissionMatrix, permissionLabels } from './permission-matrix';

function formatDate(value: string | null): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

export function WorkersPage() {
  const queryClient = useQueryClient();
  const [parameters, setParameters] = useSearchParams();
  const [accessWorker, setAccessWorker] = useState<Worker | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Worker | null>(null);
  const [viewWorker, setViewWorker] = useState<Worker | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const page = Math.max(1, Number(parameters.get('page')) || 1);
  const search = parameters.get('search') ?? '';
  const status = parameters.get('status') ?? '';
  const query = useQuery({
    queryKey: ['workers', { page, search, status }],
    queryFn: ({ signal }) =>
      getWorkers(
        {
          page,
          ...(search ? { search } : {}),
          ...(status ? { status } : {}),
        },
        signal,
      ),
    placeholderData: (previous) => previous,
  });

  function updateParameters(updates: Record<string, string>) {
    const next = new URLSearchParams(parameters);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    if (!Object.hasOwn(updates, 'page')) next.set('page', '1');
    setParameters(next);
  }

  const response = query.data;
  const workers = response?.data ?? [];
  const filtered = Boolean(search || status);
  const deleteMutation = useMutation({
    mutationFn: (worker: Worker) => deleteWorker(worker.workerId),
    onSuccess: async () => {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['workers'] });
    },
    onError: (error) =>
      setActionError(isApiError(error) ? error.message : 'The Worker could not be deleted.'),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            <Link className="button-secondary" to="/workers/import">
              <FileUp aria-hidden="true" size={18} />
              Import file
            </Link>
            <Link className="button-primary" to="/workers/new">
              <Plus aria-hidden="true" size={18} />
              Add worker
            </Link>
          </>
        }
        description="Create and manage Admin-authorized Worker accounts."
        title="Workers"
      />

      <section className="rounded-[14px] border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-card)] sm:p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(280px,1fr)_220px_auto]">
          <SearchForm
            id="worker-search"
            key={search}
            label="Search workers"
            onSearch={(value) => updateParameters({ search: value })}
            placeholder="Name, Worker ID, email or department"
            value={search}
          />
          <div>
            <label className="sr-only" htmlFor="worker-status">
              Filter by status
            </label>
            <select
              className="field-input"
              id="worker-status"
              onChange={(event) => updateParameters({ status: event.target.value })}
              value={status}
            >
              <option value="">All statuses</option>
              <option value="INVITED">Invited</option>
              <option value="ACTIVE">Active</option>
              <option value="DISABLED">Disabled</option>
            </select>
          </div>
          {filtered ? (
            <Button onClick={() => setParameters({ page: '1' })} type="button" variant="quiet">
              Clear filters
            </Button>
          ) : null}
        </div>
        {response ? (
          <p className="mt-3 text-xs font-semibold text-[var(--color-text-muted)]" role="status">
            {response.meta.total} {response.meta.total === 1 ? 'worker' : 'workers'} found
          </p>
        ) : null}
      </section>
      {actionError ? <ErrorSummary message={actionError} title="Action failed" /> : null}

      {query.isPending ? (
        <LoadingPanel label="Loading workers" />
      ) : query.isError ? (
        <ErrorState
          message="The Worker list could not be loaded."
          onRetry={() => void query.refetch()}
        />
      ) : workers.length === 0 ? (
        <EmptyState
          action={
            filtered ? (
              <Button onClick={() => setParameters({ page: '1' })} variant="secondary">
                Clear filters
              </Button>
            ) : (
              <Link className="button-primary" to="/workers/new">
                <Plus aria-hidden="true" size={18} />
                Add worker
              </Link>
            )
          }
          message={
            filtered ? 'Try a different search or status.' : 'Create the first Worker account.'
          }
          title={filtered ? 'No workers match these filters' : 'No workers yet'}
        />
      ) : (
        <>
          <div className="space-y-3 min-[840px]:hidden">
            {workers.map((worker) => (
              <WorkerCard
                key={worker.workerId}
                onDelete={setDeleteTarget}
                onManageAccess={setAccessWorker}
                worker={worker}
              />
            ))}
          </div>
          <div className="hidden overflow-visible rounded-[14px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)] min-[840px]:block">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Worker accounts</caption>
              <thead className="bg-[var(--color-surface-tint)] text-xs text-[var(--color-text-muted)]">
                <tr>
                  <th className="h-11 px-4 font-bold" scope="col">
                    Worker
                  </th>
                  <th className="h-11 px-4 font-bold" scope="col">
                    Department
                  </th>
                  <th className="h-11 px-4 font-bold" scope="col">
                    Status
                  </th>
                  <th className="h-11 px-4 font-bold" scope="col">
                    Last login
                  </th>
                  <th className="h-11 px-4 text-right font-bold" scope="col">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {workers.map((worker) => (
                  <tr
                    className="h-[64px] cursor-pointer hover:bg-[var(--color-surface-tint)]"
                    key={worker.workerId}
                    onClick={() => setViewWorker(worker)}
                    tabIndex={0}
                  >
                    <td className="px-4">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                          <UserRound aria-hidden="true" size={18} />
                        </span>
                        <div>
                          <p className="text-sm font-bold text-[var(--color-text-strong)]">
                            {worker.name}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)]">
                            {worker.workerId} · {worker.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 text-sm text-[var(--color-text-muted)]">
                      {worker.department ?? 'Not provided'}
                    </td>
                    <td className="px-4">
                      <WorkerStatusBadge status={worker.status} />
                    </td>
                    <td className="px-4 text-sm text-[var(--color-text-muted)]">
                      {formatDate(worker.lastLoginAt)}
                    </td>
                    <td className="px-4 text-right">
                      <div onClick={(event) => event.stopPropagation()}>
                        <WorkerActionsMenu
                          onDelete={setDeleteTarget}
                          onManageAccess={setAccessWorker}
                          worker={worker}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {response && response.meta.totalPages > 1 ? (
            <nav aria-label="Worker list pages" className="flex items-center justify-between gap-3">
              <Button
                disabled={page <= 1}
                onClick={() => updateParameters({ page: String(page - 1) })}
                variant="secondary"
              >
                Previous
              </Button>
              <p className="text-sm font-semibold text-[var(--color-text-muted)]">
                Page {page} of {response.meta.totalPages}
              </p>
              <Button
                disabled={page >= response.meta.totalPages}
                onClick={() => updateParameters({ page: String(page + 1) })}
                variant="secondary"
              >
                Next
              </Button>
            </nav>
          ) : null}
        </>
      )}
      {accessWorker ? (
        <ManageAccessDialog
          onClose={() => setAccessWorker(null)}
          onSaved={async () => {
            setAccessWorker(null);
            await queryClient.invalidateQueries({ queryKey: ['workers'] });
          }}
          worker={accessWorker}
        />
      ) : null}
      {viewWorker ? (
        <WorkerQuickViewDialog
          onClose={() => setViewWorker(null)}
          onDelete={(worker) => {
            setViewWorker(null);
            setDeleteTarget(worker);
          }}
          onManageAccess={(worker) => {
            setViewWorker(null);
            setAccessWorker(worker);
          }}
          worker={viewWorker}
        />
      ) : null}
      {deleteTarget ? (
        <ConfirmDialog
          confirmLabel="Delete worker"
          danger
          description={`${deleteTarget.name} will be permanently removed. Existing issue and return history will stay in records.`}
          loading={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget)}
          title="Delete this Worker?"
        />
      ) : null}
    </div>
  );
}

function WorkerActionsMenu({
  worker,
  onManageAccess,
  onDelete,
}: {
  worker: Worker;
  onManageAccess: (worker: Worker) => void;
  onDelete: (worker: Worker) => void;
}) {
  return (
    <details className="relative inline-block text-left">
      <summary
        aria-label={`Actions for ${worker.name}`}
        className="icon-button list-none marker:hidden"
      >
        <MoreVertical aria-hidden="true" size={18} />
      </summary>
      <div className="absolute right-0 top-full z-[80] mt-2 w-52 rounded-[12px] border border-[var(--color-border)] bg-white p-1.5 shadow-[var(--shadow-overlay)]">
        <Link className="menu-item" to={`/workers/${worker.workerId}`}>
          <Eye aria-hidden="true" size={17} />
          View details
        </Link>
        <Link className="menu-item" to={`/workers/${worker.workerId}?edit=1`}>
          <Pencil aria-hidden="true" size={17} />
          Edit
        </Link>
        <button className="menu-item w-full" onClick={() => onManageAccess(worker)} type="button">
          <ShieldCheck aria-hidden="true" size={17} />
          Manage access
        </button>
        <button
          className="menu-item w-full text-[var(--color-danger)]"
          onClick={() => onDelete(worker)}
          type="button"
        >
          <Trash2 aria-hidden="true" size={17} />
          Delete
        </button>
      </div>
    </details>
  );
}

function WorkerCard({
  worker,
  onManageAccess,
  onDelete,
}: {
  worker: Worker;
  onManageAccess: (worker: Worker) => void;
  onDelete: (worker: Worker) => void;
}) {
  return (
    <article className="rounded-[14px] border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
          <UsersRound aria-hidden="true" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="truncate font-extrabold text-[var(--color-text-strong)]">
              {worker.name}
            </h2>
            <WorkerStatusBadge status={worker.status} />
          </div>
          <p className="mt-1 text-xs font-bold text-[var(--color-primary)]">{worker.workerId}</p>
          <p className="mt-2 break-all text-sm text-[var(--color-text-muted)]">{worker.email}</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {worker.department ?? 'Department not provided'}
          </p>
        </div>
      </div>
      <Link className="button-secondary mt-4 w-full" to={`/workers/${worker.workerId}`}>
        View worker details
      </Link>
      <div className="mt-3 flex justify-end">
        <WorkerActionsMenu
          onDelete={onDelete}
          onManageAccess={onManageAccess}
          worker={worker}
        />
      </div>
    </article>
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
      className="w-[min(94vw,980px)] rounded-[12px] border border-[var(--color-border)] bg-white p-0 text-[var(--color-text)] shadow-[var(--shadow-overlay)] backdrop:bg-slate-950/40"
      onCancel={onClose}
      onClose={onClose}
      ref={reference}
    >
      {children}
    </dialog>
  );
}

function DetailGrid({ children }: { children: ReactNode }) {
  return <dl className="mt-5 grid gap-3 sm:grid-cols-2">{children}</dl>;
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

function WorkerQuickViewDialog({
  worker,
  onClose,
  onManageAccess,
  onDelete,
}: {
  worker: Worker;
  onClose: () => void;
  onManageAccess: (worker: Worker) => void;
  onDelete: (worker: Worker) => void;
}) {
  return (
    <Dialog label={`${worker.name} details`} onClose={onClose}>
      <div className="max-h-[86vh] overflow-y-auto p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-[var(--color-primary-strong)]">
              {worker.name}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {worker.workerId} · {worker.email}
            </p>
          </div>
          <WorkerStatusBadge status={worker.status} />
        </div>
        <DetailGrid>
          <DetailItem label="Email" value={worker.email} />
          <DetailItem label="Contact" value={worker.contact ?? 'Not provided'} />
          <DetailItem label="Department" value={worker.department ?? 'Not provided'} />
          <DetailItem label="Last login" value={formatDate(worker.lastLoginAt)} />
          <DetailItem label="Invitation email" value={worker.invitationStatus} />
          <DetailItem label="Permissions" value={`${worker.permissions.length} enabled`} />
        </DetailGrid>
        <div className="mt-5 rounded-[10px] border border-[var(--color-border)] p-3">
          <p className="text-xs font-bold text-[var(--color-text-muted)]">Access enabled</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {worker.permissions.map((permission) => (
              <span
                className="rounded-full bg-[var(--color-primary-soft)] px-2.5 py-1 text-xs font-bold text-[var(--color-primary)]"
                key={permission}
              >
                {permissionLabels[permission]}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
          <Link className="button-secondary" to={`/workers/${worker.workerId}`}>
            Full record
          </Link>
          <Link className="button-secondary" to={`/workers/${worker.workerId}?edit=1`}>
            Edit
          </Link>
          <Button onClick={() => onManageAccess(worker)} variant="secondary">
            Manage access
          </Button>
          <Button onClick={() => onDelete(worker)} variant="danger">
            Delete
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ManageAccessDialog({
  worker,
  onClose,
  onSaved,
}: {
  worker: Worker;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<WorkerPermission[]>(worker.permissions);
  const [dataAccess, setDataAccess] = useState(worker.dataAccess);
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => updateWorker(worker.workerId, { permissions: selected, dataAccess }),
    onSuccess: () => void onSaved(),
    onError: (error) =>
      setMessage(isApiError(error) ? error.message : 'Access could not be saved.'),
  });

  return (
    <Dialog label={`Manage access for ${worker.name}`} onClose={onClose}>
      <div className="max-h-[86vh] overflow-y-auto p-5 sm:p-6">
        <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
          Manage access
        </h2>
        <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
          {worker.name} · {worker.workerId}
        </p>
        {message ? (
          <div className="mt-4">
            <ErrorSummary message={message} />
          </div>
        ) : null}
        <div className="mt-5">
          <PermissionMatrix onChange={setSelected} selected={selected} />
          <div className="mt-3">
            <DataAccessMatrix onChange={setDataAccess} value={dataAccess} />
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button disabled={mutation.isPending} onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button
            disabled={selected.length === 0}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Save access
          </Button>
        </div>
      </div>
    </Dialog>
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
            {loading ? 'Working...' : confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
