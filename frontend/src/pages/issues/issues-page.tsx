import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CalendarClock,
  Check,
  ClipboardList,
  Columns3,
  Eye,
  Filter,
  MapPin,
  MoreVertical,
  Package,
  PackagePlus,
  Pencil,
  Printer,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';

import type {
  AssignmentType,
  AuthUser,
  IssueLine,
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
import {
  deleteIssue,
  getIssue,
  getIssueFilterOptions,
  getIssues,
  updateIssue,
} from '../../lib/issues-api';
import { getAssetDetails } from '../../lib/inventory-api';
import { humanizeCatalogValue } from '../../lib/catalog-format';

const statuses: IssueStatus[] = [
  'ISSUED',
  'PARTIALLY_RETURNED',
  'RETURNED',
  'DAMAGED',
  'LOST',
  'CANCELLED',
];

type IssueColumnKey =
  | 'issue'
  | 'receiver'
  | 'material'
  | 'block'
  | 'location'
  | 'issuedAt'
  | 'expectedReturn'
  | 'status'
  | 'assignment'
  | 'quantity'
  | 'outstanding'
  | 'issuedBy'
  | 'purpose';

const issueColumns: Array<{ key: IssueColumnKey; label: string }> = [
  { key: 'issue', label: 'Issue ID' },
  { key: 'receiver', label: 'Receiver' },
  { key: 'material', label: 'Material' },
  { key: 'block', label: 'Block' },
  { key: 'location', label: 'Location' },
  { key: 'issuedAt', label: 'Issued on' },
  { key: 'expectedReturn', label: 'Expected return' },
  { key: 'status', label: 'Status' },
  { key: 'assignment', label: 'Assignment' },
  { key: 'quantity', label: 'Issued qty' },
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'issuedBy', label: 'Issued by' },
  { key: 'purpose', label: 'Purpose' },
];

const defaultIssueColumns: IssueColumnKey[] = [
  'issue',
  'receiver',
  'material',
  'block',
  'location',
  'expectedReturn',
  'status',
];

function storedIssueColumns(): IssueColumnKey[] {
  try {
    const stored = JSON.parse(window.localStorage.getItem('assetdesk:issue-columns') ?? 'null');
    if (!Array.isArray(stored)) return defaultIssueColumns;
    const valid = stored.filter((value): value is IssueColumnKey =>
      issueColumns.some((column) => column.key === value),
    );
    return valid.includes('issue') ? valid : defaultIssueColumns;
  } catch {
    return defaultIssueColumns;
  }
}

function issueStatus(value: string): IssueStatus | undefined {
  return statuses.find((status) => status === value);
}

function issuePeriod(value: string): IssuePeriod | undefined {
  return value === 'TODAY' ? value : undefined;
}

function issueReturnState(value: string): IssueReturnState | undefined {
  return ['PENDING', 'DUE_TODAY'].includes(value) ? (value as IssueReturnState) : undefined;
}

function assignmentType(value: string): AssignmentType | undefined {
  return ['LONG_TERM', 'SHORT_TERM'].includes(value) ? (value as AssignmentType) : undefined;
}

export function IssuesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [parameters, setParameters] = useSearchParams();
  const [viewIssue, setViewIssue] = useState<IssueSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IssueSummary | null>(null);
  const [extendTarget, setExtendTarget] = useState<IssueSummary | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<IssueColumnKey[]>(storedIssueColumns);
  const page = Math.max(1, Number(parameters.get('page')) || 1);
  const search = parameters.get('search') ?? '';
  const status = issueStatus(parameters.get('status') ?? '');
  const period = issuePeriod(parameters.get('period') ?? '');
  const returnState = issueReturnState(parameters.get('returnState') ?? '');
  const block = parameters.get('block') ?? parameters.get('destinationBlock') ?? '';
  const location = parameters.get('location') ?? '';
  const store = parameters.get('store') ?? '';
  const trackingMode =
    parameters.get('trackingMode') === 'SERIALIZED' || parameters.get('trackingMode') === 'QUANTITY'
      ? (parameters.get('trackingMode') as 'SERIALIZED' | 'QUANTITY')
      : '';
  const category = parameters.get('category') ?? '';
  const issueAssignmentType =
    assignmentType(parameters.get('assignmentType') ?? '') ??
    (returnState === 'PENDING' ? 'SHORT_TERM' : undefined);
  const issueFilterOptionsQuery = useQuery({
    queryKey: ['issue-filter-options', block],
    queryFn: ({ signal }) => getIssueFilterOptions(block || undefined, signal),
  });
  const catalogQuery = useQuery({
    queryKey: ['asset-details'],
    queryFn: ({ signal }) => getAssetDetails(undefined, signal),
  });
  const blockOptions = useMemo(
    () =>
      [...(issueFilterOptionsQuery.data?.blocks ?? [])]
        .filter((value, index, values) => values.indexOf(value) === index)
        .sort((left, right) => left.localeCompare(right)),
    [catalogQuery.data, issueFilterOptionsQuery.data?.blocks],
  );
  const locationOptions = useMemo(
    () =>
      (block
        ? [...(issueFilterOptionsQuery.data?.locations ?? [])]
        : [
            ...(catalogQuery.data ?? [])
              .filter((detail) => detail.kind === 'LOCATION')
              .map((detail) => detail.name),
            ...(issueFilterOptionsQuery.data?.locations ?? []),
          ])
        .filter((value, index, values) => values.indexOf(value) === index)
        .sort((left, right) => left.localeCompare(right)),
    [block, catalogQuery.data, issueFilterOptionsQuery.data?.locations],
  );
  const query = useQuery({
    queryKey: [
      'issues',
      {
        page,
        search,
        status,
        period,
        returnState,
        assignmentType: issueAssignmentType,
        block,
        location,
        store,
        trackingMode,
        category,
      },
    ],
    queryFn: ({ signal }) => {
      return getIssues(
        {
          page,
          ...(search ? { search } : {}),
          ...(status ? { status } : {}),
          ...(period ? { period } : {}),
          ...(returnState ? { returnState } : {}),
          ...(issueAssignmentType ? { assignmentType: issueAssignmentType } : {}),
          ...(block ? { block } : {}),
          ...(location ? { destinationLocation: location } : {}),
          ...(store ? { store } : {}),
          ...(trackingMode ? { trackingMode } : {}),
          ...(category && trackingMode ? { category } : {}),
        },
        signal,
      );
    },
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('assetdesk:issue-columns', JSON.stringify(visibleColumns));
    } catch {
      // Column preferences are optional and should not interrupt the issue list.
    }
  }, [visibleColumns]);

  function updateParameters(updates: Record<string, string>) {
    const next = new URLSearchParams(parameters);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (Object.hasOwn(updates, 'block') && updates.block !== block) next.delete('destinationBlock');
    if (updates.block !== undefined && updates.block !== block) next.delete('location');
    if (updates.returnState === 'PENDING') next.set('assignmentType', 'SHORT_TERM');
    if (updates.returnState === '') next.delete('assignmentType');
    if (!Object.hasOwn(updates, 'page')) next.set('page', '1');
    setParameters(next);
  }

  const issues = query.data?.data ?? [];
  const filtered = Boolean(
    search ||
    status ||
    period ||
    returnState ||
    issueAssignmentType ||
    block ||
    location ||
    store ||
    trackingMode ||
    category,
  );
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
          canCreateIssue ? (
            <Link className="button-primary" to="/issues/new">
              <PackagePlus aria-hidden="true" size={18} />
              Issue material
            </Link>
          ) : null
        }
        description={
          user?.role === 'ADMIN'
            ? 'Review all university Issue Records.'
            : 'Review Issue Records you created or helped return.'
        }
        title="Issue Records"
      />
      <section className="issue-list-toolbar rounded-[14px] border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-card)] sm:p-4">
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <SearchForm
            id="issue-list-search"
            key={search}
            label="Search Issue Records"
            onSearch={(value) => updateParameters({ search: value })}
            placeholder="Issue ID, Receiver or material"
            value={search}
          />
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <ColumnPicker
              columns={visibleColumns}
              onChange={setVisibleColumns}
              onReset={() => setVisibleColumns(defaultIssueColumns)}
            />
            <FilterPopover
              panelClassName="issue-filter-popover w-[min(94vw,680px)]"
              activeCount={
                [
                  block,
                  location,
                  store,
                  trackingMode,
                  category,
                  status,
                  period,
                  returnState,
                  issueAssignmentType,
                ].filter(Boolean).length
              }
              onClear={() =>
                updateParameters({
                  block: '',
                  location: '',
                  store: '',
                  status: '',
                  period: '',
                  returnState: '',
                  assignmentType: '',
                  trackingMode: '',
                  category: '',
                })
              }
            >
              <div className="rounded-[10px] border border-[var(--color-primary-border)] bg-[var(--color-primary-soft)] p-3">
                <div className="flex items-start gap-2">
                  <Filter
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-[var(--color-primary)]"
                    size={17}
                  />
                  <div>
                    <p className="text-sm font-extrabold text-[var(--color-primary-strong)]">
                      Narrow issue data in order
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[var(--color-primary-strong)]/75">
                      Start with a block, then choose any Location added by an administrator. Using
                      both together keeps the results accurate.
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FilterField label="1. Block">
                  <select
                    className="field-input"
                    onChange={(event) =>
                      updateParameters({ block: event.target.value, location: '' })
                    }
                    value={block}
                  >
                    <option value="">All blocks</option>
                    {blockOptions.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </FilterField>
                <FilterField label="2. Location">
                  <select
                    className="field-input"
                    disabled={!block}
                    onChange={(event) => updateParameters({ location: event.target.value })}
                    value={block ? location : ''}
                  >
                    <option value="">
                      {block ? 'All locations' : 'Select a block first'}
                    </option>
                    {locationOptions.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </FilterField>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FilterField label="3. Material type">
                  <select
                    className="field-input"
                    onChange={(event) =>
                      updateParameters({ trackingMode: event.target.value, category: '' })
                    }
                    value={trackingMode}
                  >
                    <option value="">All material types</option>
                    <option value="SERIALIZED">Asset</option>
                    <option value="QUANTITY">Consumable</option>
                  </select>
                </FilterField>
                <FilterField label="4. Issue status">
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
              </div>
              <div className="border-t border-[var(--color-border)] pt-4">
                <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                  More filters
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <FilterField label="Material category">
                    <select
                      className="field-input"
                      disabled={!trackingMode}
                      onChange={(event) => updateParameters({ category: event.target.value })}
                      value={trackingMode ? category : ''}
                    >
                      <option value="">
                        {trackingMode ? 'All categories' : 'Select material type first'}
                      </option>
                      {catalogQuery.data
                        ?.filter(
                          (detail) =>
                            detail.kind ===
                            (trackingMode === 'SERIALIZED' ? 'ASSET_TYPE' : 'CONSUMABLE_TYPE'),
                        )
                        .map((detail) => (
                          <option key={detail.id} value={detail.name}>
                            {detail.name}
                          </option>
                        ))}
                    </select>
                  </FilterField>
                  <FilterField label="Source store">
                    <select
                      className="field-input"
                      onChange={(event) => updateParameters({ store: event.target.value })}
                      value={store}
                    >
                      <option value="">All source stores</option>
                      {(catalogQuery.data ?? [])
                        .filter((detail) => detail.kind === 'STORE')
                        .map((detail) => (
                          <option key={detail.id} value={detail.name}>
                            {detail.name}
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
                  <FilterField label="Assignment type">
                    <select
                      className="field-input"
                      onChange={(event) => updateParameters({ assignmentType: event.target.value })}
                      value={issueAssignmentType ?? ''}
                    >
                      <option value="">All assignment types</option>
                      <option value="SHORT_TERM">Return by date</option>
                      <option value="LONG_TERM">Permanent</option>
                    </select>
                  </FilterField>
                </div>
              </div>
            </FilterPopover>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-3">
          {query.data ? <PageCount count={query.data.meta.total} noun="Issue Record" /> : <span />}
          <p className="text-xs font-semibold text-[var(--color-text-muted)]">
            {visibleColumns.length} columns visible · Click a row to preview the full record
          </p>
        </div>
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
                onView={setViewIssue}
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
            visibleColumns={visibleColumns}
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

function ColumnPicker({
  columns,
  onChange,
  onReset,
}: {
  columns: IssueColumnKey[];
  onChange: (columns: IssueColumnKey[]) => void;
  onReset: () => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function closeOnOutsideInteraction(event: MouseEvent | PointerEvent) {
      const details = detailsRef.current;
      if (details?.open && !details.contains(event.target as Node)) details.open = false;
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && detailsRef.current?.open) {
        detailsRef.current.open = false;
        detailsRef.current.querySelector<HTMLElement>('summary')?.focus();
      }
    }
    document.addEventListener('pointerdown', closeOnOutsideInteraction);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideInteraction);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  function toggleColumn(key: IssueColumnKey) {
    if (key === 'issue') return;
    if (columns.includes(key)) {
      onChange(columns.filter((column) => column !== key));
    } else {
      onChange([...columns, key]);
    }
  }

  return (
    <details className="relative" ref={detailsRef}>
      <summary className="button-secondary flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 [&::-webkit-details-marker]:hidden">
        <Columns3 aria-hidden="true" size={18} />
        Columns
        <span className="grid size-5 place-items-center rounded-full bg-[var(--color-primary-soft)] text-xs font-extrabold text-[var(--color-primary)]">
          {columns.length}
        </span>
      </summary>
      <div className="issue-columns-popover absolute right-0 z-30 mt-2 w-[min(94vw,360px)] rounded-[10px] border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-overlay)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-[var(--color-primary-strong)]">Visible columns</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
              Choose the fields shown in the issue table.
            </p>
          </div>
          <button className="button-quiet text-xs" onClick={onReset} type="button">
            Reset
          </button>
        </div>
        <div className="mt-4 grid gap-1.5">
          {issueColumns.map((column) => {
            const checked = columns.includes(column.key);
            const required = column.key === 'issue';
            return (
              <label
                className={`issue-column-option ${checked ? 'issue-column-option-selected' : ''}`}
                key={column.key}
              >
                <input
                  checked={checked}
                  className="sr-only"
                  disabled={required}
                  onChange={() => toggleColumn(column.key)}
                  type="checkbox"
                />
                <span
                  aria-hidden="true"
                  className={`issue-column-check ${checked ? 'issue-column-check-selected' : ''}`}
                >
                  {checked ? <Check size={13} strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1 text-sm font-bold text-[var(--color-text-strong)]">
                  {column.label}
                </span>
                {required ? (
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.05em] text-[var(--color-text-muted)]">
                    Required
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </div>
    </details>
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
  if (
    issue.expectedReturnAt !== null &&
    issue.totalOutstandingQuantity > 0 &&
    new Date(issue.expectedReturnAt) < new Date()
  ) {
    return 'OVERDUE';
  }
  switch (issue.status) {
    case 'PARTIALLY_RETURNED':
      return 'PARTIALLY RETURNED';
    case 'RETURNED':
      return 'RETURNED';
    case 'DAMAGED':
      return 'DAMAGED';
    case 'LOST':
      return 'LOST';
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      if (issue.expectedReturnAt === null) return 'PERMANENT ISSUE';
      return issue.totalOutstandingQuantity === 0 ? 'RETURNED' : 'ISSUED';
  }
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
  onView,
}: {
  admin: boolean;
  user: AuthUser | null;
  issue: IssueSummary;
  onDelete: (issue: IssueSummary) => void;
  onExtend: (issue: IssueSummary) => void;
  onView: (issue: IssueSummary) => void;
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
        <button className="button-secondary flex-1" onClick={() => onView(issue)} type="button">
          <Eye aria-hidden="true" size={16} />
          Quick view
        </button>
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
    <details className="group relative inline-flex" data-action-menu>
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
  visibleColumns,
}: {
  admin: boolean;
  user: AuthUser | null;
  issues: IssueSummary[];
  onDelete: (issue: IssueSummary) => void;
  onExtend: (issue: IssueSummary) => void;
  onView: (issue: IssueSummary) => void;
  visibleColumns: IssueColumnKey[];
}) {
  return (
    <div className="issue-table-shell hidden rounded-[14px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)] min-[840px]:block">
      <div className="issue-table-scroll">
        <table className="w-full min-w-[860px] border-collapse text-left">
          <caption className="sr-only">Issue Records</caption>
          <thead className="bg-[var(--color-surface-tint)] text-xs text-[var(--color-text-muted)]">
            <tr>
              {visibleColumns.map((key) => (
                <th className="h-11 whitespace-nowrap px-4 font-bold" key={key} scope="col">
                  {issueColumns.find((column) => column.key === key)?.label}
                </th>
              ))}
              <th className="h-11 px-4 text-right font-bold" scope="col">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {issues.map((issue) => (
              <tr
                className="h-[68px] cursor-pointer hover:bg-[var(--color-surface-tint)] focus-within:bg-[var(--color-surface-tint)]"
                key={issue.issueId}
                onClick={() => onView(issue)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onView(issue);
                  }
                }}
                tabIndex={0}
              >
                {visibleColumns.map((key) => (
                  <IssueTableCell issue={issue} key={key} column={key} />
                ))}
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
    </div>
  );
}

function IssueTableCell({ column, issue }: { column: IssueColumnKey; issue: IssueSummary }) {
  switch (column) {
    case 'issue':
      return (
        <td className="px-4">
          <p className="text-sm font-bold text-[var(--color-primary-strong)]">{issue.issueId}</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {formatIstDateTime(issue.issuedAt)}
          </p>
        </td>
      );
    case 'receiver':
      return (
        <td className="px-4 text-sm font-semibold text-[var(--color-text-strong)]">
          {issue.receiver.fullName}
        </td>
      );
    case 'material':
      return (
        <td className="max-w-60 px-4 text-sm text-[var(--color-text-muted)]">
          <span className="line-clamp-2">{materialSummary(issue)}</span>
        </td>
      );
    case 'block':
      return (
        <td className="px-4 text-sm font-semibold text-[var(--color-text-strong)]">
          {issue.destinationBlock ?? 'Not set'}
        </td>
      );
    case 'location':
      return (
        <td className="px-4 text-sm font-semibold text-[var(--color-text-strong)]">
          {issue.destinationLocation ?? 'Not set'}
        </td>
      );
    case 'issuedAt':
      return (
        <td className="px-4 text-sm text-[var(--color-text-muted)]">
          {formatIstDateTime(issue.issuedAt)}
        </td>
      );
    case 'expectedReturn':
      return (
        <td className="px-4 text-sm text-[var(--color-text-muted)]">
          {formatIstDateTime(issue.expectedReturnAt)}
        </td>
      );
    case 'status':
      return (
        <td className="px-4">
          <CatalogBadge value={displayIssueStatus(issue)} />
        </td>
      );
    case 'assignment':
      return (
        <td className="px-4 text-sm text-[var(--color-text-muted)]">
          {issue.assignmentType === 'LONG_TERM' ? 'Permanent' : 'Return by date'}
        </td>
      );
    case 'quantity':
      return (
        <td className="px-4 text-sm font-semibold text-[var(--color-text-strong)]">
          {issue.totalIssuedQuantity}
        </td>
      );
    case 'outstanding':
      return (
        <td className="px-4 text-sm font-semibold text-[var(--color-text-strong)]">
          {issue.totalOutstandingQuantity}
        </td>
      );
    case 'issuedBy':
      return <td className="px-4 text-sm text-[var(--color-text-muted)]">{issue.issuedBy.name}</td>;
    case 'purpose':
      return (
        <td className="max-w-52 px-4 text-sm text-[var(--color-text-muted)]">
          <span className="line-clamp-2">{issue.purpose ?? 'Not provided'}</span>
        </td>
      );
  }
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
      className="m-auto w-[min(94vw,1040px)] rounded-[20px] border border-[var(--color-border)] bg-white p-0 text-[var(--color-text)] shadow-[var(--shadow-overlay)] backdrop:bg-slate-950/40"
      onCancel={onClose}
      onClose={onClose}
      ref={reference}
    >
      {children}
    </dialog>
  );
}

function SidePanel({
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
      className="issue-detail-drawer border-0 bg-white p-0 text-[var(--color-text)] shadow-[var(--shadow-overlay)] backdrop:bg-slate-950/40"
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

function IssueMaterialDetail({ line }: { line: IssueLine }) {
  const unitLabel = line.material.unitLabel ?? 'unit';
  return (
    <article className="overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-tint)] p-4">
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
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        <DetailItem
          label="Total issued"
          value={`${line.issuedQuantity} ${unitLabel}${line.issuedQuantity === 1 ? '' : 's'}`}
        />
        <DetailItem label="Currently issued" value={line.outstandingQuantity} />
        <DetailItem label="Returned" value={line.issuedQuantity - line.outstandingQuantity} />
      </div>
      <dl className="grid gap-x-6 gap-y-3 px-4 pb-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-bold text-[var(--color-text-muted)]">Store</dt>
          <dd className="mt-1 font-semibold text-[var(--color-text-strong)]">
            {line.material.store ?? 'Not set'}
          </dd>
        </div>
        <div>
          <dt className="font-bold text-[var(--color-text-muted)]">Description</dt>
          <dd className="mt-1 font-semibold text-[var(--color-text-strong)]">
            {line.material.description ?? 'Not provided'}
          </dd>
        </div>
      </dl>
      {line.assets.length ? (
        <div className="overflow-x-auto border-t border-[var(--color-border)]">
          <table className="w-full min-w-[650px] border-collapse text-left text-sm">
            <thead className="bg-white text-xs text-[var(--color-text-muted)]">
              <tr>
                <th className="px-4 py-3" scope="col">
                  Asset ID
                </th>
                <th className="px-4 py-3" scope="col">
                  Serial number
                </th>
                <th className="px-4 py-3" scope="col">
                  Condition
                </th>
                <th className="px-4 py-3" scope="col">
                  Current state
                </th>
              </tr>
            </thead>
            <tbody>
              {line.assets.map((asset) => (
                <tr className="border-t border-[var(--color-border)]" key={asset.assetTag}>
                  <td className="px-4 py-3 font-bold text-[var(--color-text-strong)]">
                    {asset.assetTag}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">
                    {asset.serialNumber ?? 'NA'}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">
                    {asset.conditionAtIssue}
                  </td>
                  <td className="px-4 py-3">
                    <CatalogBadge
                      value={asset.outstanding ? 'ISSUED' : (asset.returnDisposition ?? 'RETURNED')}
                    />
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
  const detailQuery = useQuery({
    queryKey: ['issue', issue.issueId],
    queryFn: ({ signal }) => getIssue(issue.issueId, signal),
  });
  const fullIssue = detailQuery.data?.data.issue;
  return (
    <SidePanel label={`${issue.issueId} details`} onClose={onClose}>
      <div className="issue-detail-drawer-scroll max-h-[100dvh] overflow-y-auto">
        <div className="issue-detail-drawer-header border-b border-[var(--color-border)] bg-[var(--color-surface-tint)] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-[var(--color-primary)] text-white shadow-[0_4px_14px_rgba(109,40,217,.22)]">
              <Package aria-hidden="true" size={21} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--color-primary)]">
                Issue record
              </p>
              <h2 className="mt-1 break-all text-xl font-extrabold text-[var(--color-primary-strong)]">
                {issue.issueId}
              </h2>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Issued {formatIstDateTime(issue.issuedAt)}
              </p>
            </div>
            <button
              aria-label="Close issue details"
              className="icon-button shrink-0"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <CatalogBadge value={displayIssueStatus(issue)} />
            <IssueActionsMenu
              admin={admin}
              align="right"
              issue={issue}
              onDelete={(target) => {
                onClose();
                onDelete(target);
              }}
              onExtend={(target) => {
                onClose();
                onExtend(target);
              }}
              user={user}
            />
          </div>
        </div>
        <div className="p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-[10px] border border-[var(--color-border)] bg-white p-3">
              <p className="text-xs font-bold text-[var(--color-text-muted)]">Issued quantity</p>
              <p className="mt-1 text-xl font-extrabold text-[var(--color-text-strong)]">
                {issue.totalIssuedQuantity}
              </p>
            </div>
            <div className="rounded-[10px] border border-[var(--color-border)] bg-white p-3">
              <p className="text-xs font-bold text-[var(--color-text-muted)]">Outstanding</p>
              <p className="mt-1 text-xl font-extrabold text-[var(--color-primary)]">
                {issue.totalOutstandingQuantity}
              </p>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-2">
            <Building2 aria-hidden="true" className="text-[var(--color-primary)]" size={17} />
            <h2 className="text-base font-extrabold text-[var(--color-primary-strong)]">
              Issue context
            </h2>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <DetailItem label="Receiver" value={issue.receiver.fullName} />
            <DetailItem label="Issued by" value={issue.issuedBy.name} />
            <DetailItem label="Block" value={issue.destinationBlock ?? 'Not set'} />
            <DetailItem label="Location" value={issue.destinationLocation ?? 'Not set'} />
          </dl>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <DetailItem label="Assignment state" value={displayIssueStatus(issue)} />
            <DetailItem label="Expected return" value={formatIstDateTime(issue.expectedReturnAt)} />
            <DetailItem label="Return status" value={returnStateText(issue)} />
            <DetailItem label="Purpose" value={issue.purpose ?? 'Not provided'} />
          </dl>

          <section className="mt-7">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <MapPin aria-hidden="true" className="text-[var(--color-primary)]" size={17} />
                  <h2 className="text-base font-extrabold text-[var(--color-primary-strong)]">
                    Material details
                  </h2>
                </div>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Complete issued quantities, inventory IDs and serial numbers.
                </p>
              </div>
              <span className="rounded-full bg-[var(--color-primary-soft)] px-3 py-1 text-xs font-bold text-[var(--color-primary)]">
                {fullIssue?.lines.length ?? issue.materialNames.length} material
                {(fullIssue?.lines.length ?? issue.materialNames.length) === 1 ? '' : 's'}
              </span>
            </div>
            {detailQuery.isPending ? (
              <div className="mt-3">
                <LoadingPanel label="Loading complete material details..." />
              </div>
            ) : fullIssue ? (
              <div className="mt-3 space-y-3">
                {fullIssue.lines.map((line) => (
                  <IssueMaterialDetail key={line.lineId} line={line} />
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-[12px] border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-bold text-amber-900">
                  Complete details could not be loaded.
                </p>
                <p className="mt-1 text-sm text-amber-800">{issue.materialNames.join(', ')}</p>
              </div>
            )}
          </section>

          {issue.notes ? (
            <section className="mt-5 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-tint)] p-4">
              <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                Notes
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--color-text-strong)]">
                {issue.notes}
              </p>
            </section>
          ) : null}

          <div className="mt-6 flex justify-end">
            <Button onClick={onClose} variant="secondary">
              Close
            </Button>
          </div>
        </div>
      </div>
    </SidePanel>
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
