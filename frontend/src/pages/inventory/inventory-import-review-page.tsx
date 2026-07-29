import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Search, Upload, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';

import { AppCard, Button, EmptyState, ErrorState, ErrorSummary, LoadingPanel, PageHeader } from '../../components/ui';
import { isApiError } from '../../lib/api-client';
import {
  commitInventoryImport,
  getInventoryImportPreview,
  type InventoryImportPreview,
  type InventoryImportResult,
} from '../../lib/inventory-api';
import { inventoryStatusLabel } from '../../lib/inventory-status';

type ReviewFilter = 'ALL' | 'READY' | 'FAILED';

function statePreview(value: unknown): InventoryImportPreview | undefined {
  if (!value || typeof value !== 'object' || !('preview' in value)) return undefined;
  return (value as { preview?: InventoryImportPreview }).preview;
}

export function InventoryImportReviewPage() {
  const { importId = '' } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const initialPreview = statePreview(location.state);
  const [filter, setFilter] = useState<ReviewFilter>('ALL');
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<InventoryImportResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['inventory-import-review', importId],
    queryFn: () => getInventoryImportPreview(importId),
    enabled: Boolean(importId) && !result,
    initialData: initialPreview,
  });

  const preview = query.data;
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return (preview?.rows ?? []).filter((row) => {
      if (filter === 'READY' && !row.valid) return false;
      if (filter === 'FAILED' && row.valid) return false;
      if (!term) return true;
      return [
        row.rowNumber,
        row.name,
        row.category,
        row.typeModelName,
        row.location,
        row.block,
        row.vendorName,
        row.locationBlock,
        row.serialNumber,
        row.quantity,
        row.unitLabel,
        row.status,
        row.errors.join(' '),
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(term);
    });
  }, [filter, preview?.rows, search]);

  const commitMutation = useMutation({
    mutationFn: () => commitInventoryImport(importId),
    onSuccess: async (nextResult) => {
      setResult(nextResult);
      setActionError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
    onError: (error) => {
      setActionError(isApiError(error) ? error.message : 'The valid rows could not be uploaded.');
    },
  });

  if (query.isPending) return <LoadingPanel label="Loading upload review" />;
  if (query.isError || !preview) {
    return (
      <ErrorState
        message="This upload review could not be loaded. It may have expired."
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Link className="button-quiet" to="/inventory/import">
            <ArrowLeft aria-hidden="true" size={18} />
            Back to upload
          </Link>
        }
        description={`${preview.fileName} · ${preview.mode === 'SERIALIZED' ? 'IT Assets' : 'IT Consumables'}`}
        title={result ? 'Bulk upload result' : 'Bulk upload review'}
      />

      {actionError ? <ErrorSummary message={actionError} title="Upload failed" /> : null}

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Total rows" value={preview.totalRows} />
        <MetricCard label="Ready" tone="success" value={preview.validRows} />
        <MetricCard label="Failed" tone="danger" value={preview.invalidRows} />
        <MetricCard label="Showing" value={rows.length} />
      </div>

      {result ? (
        <UploadResult result={result} />
      ) : (
        <AppCard className="max-w-none">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              <FilterButton active={filter === 'ALL'} onClick={() => setFilter('ALL')}>
                All rows
              </FilterButton>
              <FilterButton active={filter === 'READY'} onClick={() => setFilter('READY')}>
                Ready only
              </FilterButton>
              <FilterButton active={filter === 'FAILED'} onClick={() => setFilter('FAILED')}>
                Failed only
              </FilterButton>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="relative block min-w-[280px]">
                <span className="sr-only">Search review rows</span>
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
                  size={17}
                />
                <input
                  className="field-input pl-9"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search rows or reasons"
                  value={search}
                />
              </label>
              <Button
                disabled={preview.validRows === 0}
                loading={commitMutation.isPending}
                onClick={() => commitMutation.mutate()}
                type="button"
              >
                <Upload aria-hidden="true" size={18} />
                Upload valid rows
              </Button>
            </div>
          </div>

          {preview.invalidRows > 0 ? (
            <p className="mt-4 rounded-[8px] bg-[var(--color-danger-soft)] p-3 text-sm font-bold text-[var(--color-danger)]">
              Failed rows will stay out of inventory. Only rows marked Ready are uploaded.
            </p>
          ) : null}

          {rows.length === 0 ? (
            <EmptyState message="Change the search or status filter." title="No rows found" />
          ) : (
            <ReviewTable mode={preview.mode} rows={rows} />
          )}
        </AppCard>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'success' | 'danger';
}) {
  const color =
    tone === 'success'
      ? 'text-[var(--color-success)]'
      : tone === 'danger'
        ? 'text-[var(--color-danger)]'
        : 'text-[var(--color-primary-strong)]';
  return (
    <div className="rounded-[10px] border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-card)]">
      <p className="text-xs font-bold text-[var(--color-text-muted)]">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${color}`}>{value}</p>
    </div>
  );
}

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button className={active ? 'button-primary' : 'button-secondary'} onClick={onClick} type="button">
      {children}
    </button>
  );
}

function ReviewTable({
  rows,
  mode,
}: {
  rows: InventoryImportPreview['rows'];
  mode: InventoryImportPreview['mode'];
}) {
  return (
    <div className="mt-4 max-h-[calc(100vh-360px)] min-h-[420px] overflow-auto rounded-[8px] border border-[var(--color-border)]">
      <table className="w-full min-w-[1080px] table-fixed text-left text-sm">
        <thead className="sticky top-0 z-10 bg-[var(--color-surface-tint)] text-xs text-[var(--color-text-muted)]">
          <tr>
            <th className="w-16 p-3 font-bold">Row</th>
            <th className="w-28 p-3 font-bold">Status</th>
            <th className="w-64 p-3 font-bold">Reason</th>
            <th className="w-56 p-3 font-bold">Type/model name</th>
            {mode === 'SERIALIZED' ? (
              <th className="w-56 p-3 font-bold">Configuration</th>
            ) : null}
            <th className="w-44 p-3 font-bold">
              {mode === 'SERIALIZED' ? 'Asset type' : 'Consumable type'}
            </th>
            <th className="w-36 p-3 font-bold">Inventory status</th>
            <th className="w-36 p-3 font-bold">Location</th>
            <th className="w-36 p-3 font-bold">Block</th>
            <th className="w-40 p-3 font-bold">Vendor</th>
            <th className="w-44 p-3 font-bold">{mode === 'SERIALIZED' ? 'Serial number' : 'Quantity'}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {rows.map((row) => (
            <tr key={row.rowNumber} className="align-top hover:bg-[var(--color-surface-tint)]">
              <td className="p-3 font-bold text-[var(--color-text-muted)]">{row.rowNumber}</td>
              <td className="p-3">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-extrabold ${
                    row.valid
                      ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
                      : 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
                  }`}
                >
                  {row.valid ? <CheckCircle2 aria-hidden="true" size={14} /> : <XCircle aria-hidden="true" size={14} />}
                  {row.valid ? 'Ready' : 'Failed'}
                </span>
              </td>
              <td className="break-words p-3 font-bold text-[var(--color-text-muted)]">
                {row.valid ? 'Ready to upload' : row.errors.join(' ')}
              </td>
              <td className="break-words p-3 font-bold">{row.name || 'Missing'}</td>
              {mode === 'SERIALIZED' ? (
                <td className="break-words p-3">{row.configuration || 'Missing'}</td>
              ) : null}
              <td className="break-words p-3">{row.category || 'Missing'}</td>
              <td className="break-words p-3">{inventoryStatusLabel(row.status ?? 'ACTIVE')}</td>
              <td className="break-words p-3">{row.location || 'Missing'}</td>
              <td className="break-words p-3">{row.block || 'Missing'}</td>
              <td className="break-words p-3">{row.vendorName || 'Not provided'}</td>
              <td className="break-words p-3">
                {mode === 'SERIALIZED'
                  ? row.serialNumber || 'Missing'
                  : `${row.quantity ?? 'Missing'} ${row.unitLabel ?? ''}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UploadResult({ result }: { result: InventoryImportResult }) {
  return (
    <AppCard className="max-w-none">
      <div className="grid gap-3 md:grid-cols-2">
        <MetricCard label="Materials created" tone="success" value={result.created.length} />
        <MetricCard label="Rows failed or skipped" tone="danger" value={result.failed.length} />
      </div>
      {result.failed.length > 0 ? (
        <div className="mt-5 max-h-[520px] overflow-auto rounded-[8px] border border-[var(--color-border)]">
          <table className="w-full min-w-[760px] table-fixed text-left text-sm">
            <thead className="sticky top-0 bg-[var(--color-surface-tint)] text-xs text-[var(--color-text-muted)]">
              <tr>
                <th className="w-20 p-3 font-bold">Row</th>
                <th className="w-64 p-3 font-bold">Type/model name</th>
                <th className="p-3 font-bold">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {result.failed.map((row) => (
                <tr key={`${row.rowNumber}-${row.name}`}>
                  <td className="p-3 font-bold text-[var(--color-text-muted)]">{row.rowNumber}</td>
                  <td className="break-words p-3 font-bold">{row.name || 'Missing'}</td>
                  <td className="break-words p-3 font-bold text-[var(--color-danger)]">{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Link className="button-secondary mt-5" to="/inventory">
        View Inventory
      </Link>
    </AppCard>
  );
}
