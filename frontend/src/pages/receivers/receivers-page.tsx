import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ContactRound, Plus, Search, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';

import type { Receiver, ReceiverStatus, ReceiverType } from '@assetdesk/contracts';

import { useAuth } from '../../auth/auth-context';
import { hasPermission } from '../../auth/permissions';
import { CatalogBadge, PageCount } from '../../components/catalog-ui';
import { Button, EmptyState, ErrorState, ErrorSummary, LoadingPanel, PageHeader } from '../../components/ui';
import { deleteReceiver, getReceivers } from '../../lib/receivers-api';
import { humanizeCatalogValue } from '../../lib/catalog-format';
import { isApiError } from '../../lib/api-client';

const receiverTypes: ReceiverType[] = [
  'FACULTY',
  'STAFF',
  'STUDENT',
  'DEPARTMENT',
  'AUTHORIZED_EXTERNAL',
  'MANAGEMENT',
  'GEHU',
];

function receiverStatus(value: string): ReceiverStatus | undefined {
  return value === 'ACTIVE' || value === 'INACTIVE' ? value : undefined;
}

function receiverType(value: string): ReceiverType | undefined {
  return receiverTypes.find((item) => item === value);
}

export function ReceiversPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [parameters, setParameters] = useSearchParams();
  const [deleteTarget, setDeleteTarget] = useState<Receiver | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const page = Math.max(1, Number(parameters.get('page')) || 1);
  const search = parameters.get('search') ?? '';
  const status = receiverStatus(parameters.get('status') ?? '');
  const type = receiverType(parameters.get('type') ?? '');
  const department = parameters.get('department') ?? '';
  const admin = user?.role === 'ADMIN';
  const canAddReceivers = hasPermission(user, 'RECEIVERS_ADD');
  const canDeleteReceivers = hasPermission(user, 'RECEIVERS_DELETE');

  const query = useQuery({
    queryKey: ['receivers', { page, search, status, type, department }],
    queryFn: ({ signal }) =>
      getReceivers(
        {
          page,
          ...(search ? { search } : {}),
          ...(status ? { status } : {}),
          ...(type ? { type } : {}),
          ...(department ? { department } : {}),
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

  const receivers = query.data?.data ?? [];
  const filtered = Boolean(search || status || type || department);
  const deleteMutation = useMutation({
    mutationFn: (receiver: Receiver) => deleteReceiver(receiver.receiverCode),
    onSuccess: async () => {
      setDeleteTarget(null);
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ['receivers'] });
    },
    onError: (error) => {
      setDeleteTarget(null);
      setActionError(
        isApiError(error)
          ? error.message
          : 'This Receiver could not be deleted. Mark it inactive if it has history.',
      );
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          canAddReceivers ? (
            <Link className="button-primary" to="/receivers/new">
              <Plus aria-hidden="true" size={18} />
              Add receiver
            </Link>
          ) : undefined
        }
        description={
          admin
            ? 'Maintain the authorized university Receiver directory.'
            : 'Search active Receivers for university material operations.'
        }
        title="Receivers"
      />

      <section className="rounded-[14px] border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-card)] sm:p-4">
        <ReceiverFilters
          department={department}
          key={`${search}-${department}`}
          onApply={(values) => updateParameters(values)}
          search={search}
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[220px_240px_auto]">
          <label className="sr-only" htmlFor="receiver-status-filter">
            Filter by Receiver status
          </label>
          <select
            className="field-input"
            id="receiver-status-filter"
            onChange={(event) => updateParameters({ status: event.target.value })}
            value={status ?? ''}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            {admin ? <option value="INACTIVE">Inactive</option> : null}
          </select>
          <label className="sr-only" htmlFor="receiver-type-filter">
            Filter by Receiver type
          </label>
          <select
            className="field-input"
            id="receiver-type-filter"
            onChange={(event) => updateParameters({ type: event.target.value })}
            value={type ?? ''}
          >
            <option value="">All Receiver types</option>
            {receiverTypes.map((value) => (
              <option key={value} value={value}>
                {humanizeCatalogValue(value)}
              </option>
            ))}
          </select>
          {filtered ? (
            <Button onClick={() => setParameters({ page: '1' })} type="button" variant="quiet">
              Clear filters
            </Button>
          ) : null}
        </div>
        {query.data ? <PageCount count={query.data.meta.total} noun="receiver" /> : null}
      </section>

      {actionError ? <ErrorSummary message={actionError} title="Action failed" /> : null}

      {query.isPending ? (
        <LoadingPanel label="Loading Receivers" />
      ) : query.isError ? (
        <ErrorState
          message="The Receiver directory could not be loaded."
          onRetry={() => void query.refetch()}
        />
      ) : receivers.length === 0 ? (
        <EmptyState
          action={
            filtered ? (
              <Button onClick={() => setParameters({ page: '1' })} variant="secondary">
                Clear filters
              </Button>
            ) : canAddReceivers ? (
              <Link className="button-primary" to="/receivers/new">
                <Plus aria-hidden="true" size={18} />
                Add receiver
              </Link>
            ) : undefined
          }
          message={
            filtered
              ? 'Try a different name, ID, department, type or status.'
              : admin
                ? 'Add the first authorized Receiver.'
                : 'No active Receivers are available.'
          }
          title={filtered ? 'No Receivers match these filters' : 'No Receivers yet'}
        />
      ) : (
        <>
          <div className="space-y-3 min-[840px]:hidden">
            {receivers.map((receiver) => (
              <ReceiverCard
                canDelete={canDeleteReceivers}
                key={receiver.receiverCode}
                onDelete={setDeleteTarget}
                receiver={receiver}
              />
            ))}
          </div>
          <ReceiverTable
            canDelete={canDeleteReceivers}
            onDelete={setDeleteTarget}
            receivers={receivers}
          />
          {query.data && query.data.meta.totalPages > 1 ? (
            <nav
              aria-label="Receiver list pages"
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
      {deleteTarget ? (
        <DeleteReceiverDialog
          loading={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget)}
          receiver={deleteTarget}
        />
      ) : null}
    </div>
  );
}

function ReceiverFilters({
  search,
  department,
  onApply,
}: {
  search: string;
  department: string;
  onApply: (values: Record<string, string>) => void;
}) {
  const [searchDraft, setSearchDraft] = useState(search);
  const [departmentDraft, setDepartmentDraft] = useState(department);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onApply({ search: searchDraft.trim(), department: departmentDraft.trim() });
  }

  return (
    <form
      className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_260px_auto]"
      onSubmit={submit}
      role="search"
    >
      <div className="relative">
        <label className="sr-only" htmlFor="receiver-search">
          Search Receivers
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
          size={18}
        />
        <input
          className="field-input field-input-search"
          id="receiver-search"
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="Name, Receiver code, university ID or email"
          value={searchDraft}
        />
      </div>
      <div>
        <label className="sr-only" htmlFor="receiver-department-filter">
          Filter by department
        </label>
        <input
          className="field-input"
          id="receiver-department-filter"
          onChange={(event) => setDepartmentDraft(event.target.value)}
          placeholder="Department"
          value={departmentDraft}
        />
      </div>
      <Button type="submit" variant="secondary">
        Apply
      </Button>
    </form>
  );
}

function ReceiverCard({
  canDelete,
  receiver,
  onDelete,
}: {
  canDelete: boolean;
  receiver: Receiver;
  onDelete: (receiver: Receiver) => void;
}) {
  return (
    <article className="rounded-[14px] border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
          <ContactRound aria-hidden="true" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="font-extrabold text-[var(--color-text-strong)]">{receiver.fullName}</h2>
            <CatalogBadge value={receiver.status} />
          </div>
          <p className="mt-1 text-xs font-bold text-[var(--color-primary)]">
            {receiver.receiverCode}
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {humanizeCatalogValue(receiver.type)} · {receiver.department ?? 'No department'}
          </p>
          <p className="mt-1 break-all text-sm text-[var(--color-text-muted)]">{receiver.email}</p>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Link className="button-secondary flex-1" to={`/receivers/${receiver.receiverCode}`}>
          View Receiver details
        </Link>
        {canDelete ? (
          <Button onClick={() => onDelete(receiver)} type="button" variant="danger">
            <Trash2 aria-hidden="true" size={17} />
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function ReceiverTable({
  canDelete,
  receivers,
  onDelete,
}: {
  canDelete: boolean;
  receivers: Receiver[];
  onDelete: (receiver: Receiver) => void;
}) {
  return (
    <div className="hidden overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)] min-[840px]:block">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Receiver directory</caption>
        <thead className="bg-[var(--color-surface-tint)] text-xs text-[var(--color-text-muted)]">
          <tr>
            <th className="h-11 px-4 font-bold" scope="col">
              Receiver
            </th>
            <th className="h-11 px-4 font-bold" scope="col">
              Type
            </th>
            <th className="h-11 px-4 font-bold" scope="col">
              Department
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
          {receivers.map((receiver) => (
            <tr
              className="h-[64px] hover:bg-[var(--color-surface-tint)]"
              key={receiver.receiverCode}
            >
              <td className="px-4">
                <p className="text-sm font-bold text-[var(--color-text-strong)]">
                  {receiver.fullName}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {receiver.receiverCode} · {receiver.email}
                </p>
              </td>
              <td className="px-4 text-sm text-[var(--color-text-muted)]">
                {humanizeCatalogValue(receiver.type)}
              </td>
              <td className="px-4 text-sm text-[var(--color-text-muted)]">
                {receiver.department ?? 'Not provided'}
              </td>
              <td className="px-4">
                <CatalogBadge value={receiver.status} />
              </td>
              <td className="px-4 text-right">
                <div className="flex justify-end gap-2">
                  <Link className="button-quiet" to={`/receivers/${receiver.receiverCode}`}>
                    View details
                  </Link>
                  {canDelete ? (
                    <Button onClick={() => onDelete(receiver)} type="button" variant="danger">
                      <Trash2 aria-hidden="true" size={17} />
                    </Button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeleteReceiverDialog({
  receiver,
  loading,
  onCancel,
  onConfirm,
}: {
  receiver: Receiver;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/40 p-4"
      role="dialog"
    >
      <div className="w-[min(92vw,460px)] rounded-[10px] border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-overlay)]">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[8px] bg-[var(--color-danger-soft)] text-[var(--color-danger)]">
            <Trash2 aria-hidden="true" size={20} />
          </span>
          <div>
            <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
              Delete Receiver?
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
              {receiver.fullName} will be removed from the Receiver directory. Receivers with Issue
              history cannot be deleted; mark them inactive instead.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button disabled={loading} onClick={onCancel} type="button" variant="secondary">
            Cancel
          </Button>
          <Button loading={loading} onClick={onConfirm} type="button" variant="danger">
            {loading ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  );
}
