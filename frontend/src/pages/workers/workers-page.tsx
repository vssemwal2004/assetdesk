import { useQuery } from '@tanstack/react-query';
import { FileUp, Plus, UserRound, UsersRound } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';

import type { Worker } from '@assetdesk/contracts';

import {
  Button,
  EmptyState,
  ErrorState,
  LoadingPanel,
  PageHeader,
  SearchForm,
  WorkerStatusBadge,
} from '../../components/ui';
import { getWorkers } from '../../lib/workers-api';

function formatDate(value: string | null): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

export function WorkersPage() {
  const [parameters, setParameters] = useSearchParams();
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
              <WorkerCard key={worker.workerId} worker={worker} />
            ))}
          </div>
          <div className="hidden overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)] min-[840px]:block">
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
                    className="h-[64px] hover:bg-[var(--color-surface-tint)]"
                    key={worker.workerId}
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
                      <Link
                        className="inline-flex min-h-11 items-center rounded-[10px] px-3 text-sm font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)] focus-visible:outline-2 focus-visible:outline-[var(--color-focus)]"
                        to={`/workers/${worker.workerId}`}
                      >
                        View details
                      </Link>
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
    </div>
  );
}

function WorkerCard({ worker }: { worker: Worker }) {
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
    </article>
  );
}
