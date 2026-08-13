import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Files,
  Search,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import writeExcelFile, { type SheetData } from 'write-excel-file/browser';

import {
  AppCard,
  Button,
  EmptyState,
  ErrorState,
  ErrorSummary,
  LoadingPanel,
  PageHeader,
} from '../../components/ui';
import { isApiError } from '../../lib/api-client';
import {
  commitInventoryImport,
  getInventoryImportPreview,
  type InventoryImportPreview,
  type InventoryImportResult,
} from '../../lib/inventory-api';
import { inventoryStatusLabel } from '../../lib/inventory-status';

type ReviewFilter = 'ALL' | 'READY' | 'FAILED';
type PreviewRow = InventoryImportPreview['rows'][number];

function reportName(fileName: string, suffix: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-');
  return `${base || 'inventory-upload'}-${suffix}.xlsx`;
}

async function saveWorkbook(
  rows: Record<string, string | number>[],
  sheetName: string,
  fileName: string,
) {
  const headings = Object.keys(rows[0] ?? {});
  const sheetData: SheetData = [
    headings.map((heading) => ({
      value: heading,
      fontWeight: 'bold',
      backgroundColor: '#EDE9FE',
      color: '#3B0764',
      wrap: true,
    })),
    ...rows.map((row) =>
      headings.map((heading) => ({
        value: row[heading] ?? '',
        wrap: true,
        alignVertical: 'top' as const,
      })),
    ),
  ];
  await writeExcelFile(
    [
      {
        data: sheetData,
        sheet: sheetName,
        columns: headings.map((heading) => ({
          width: Math.min(45, Math.max(15, heading.length + 3)),
        })),
      },
    ],
  ).toFile(fileName);
}

function downloadErrorReport(preview: InventoryImportPreview) {
  const failed = preview.rows.filter((row) => !row.valid);
  void saveWorkbook(
    failed.map((row) => ({
      'Excel row': row.rowNumber,
      'Validation status': 'FAILED',
      'Why it failed': row.errors.join(' '),
      'Recommended action': row.duplicates?.length
        ? 'Review the duplicate comparison and remove or correct the repeated value.'
        : 'Correct the highlighted source data, then upload the file again.',
      'Type/model name': row.name,
      Category: row.category,
      Configuration: row.configuration ?? '',
      'Serial number': row.serialNumber ?? '',
      Quantity: row.quantity ?? '',
      Unit: row.unitLabel ?? '',
      Location: row.location ?? '',
      Block: row.block ?? '',
      Department: row.department ?? '',
      Vendor: row.vendorName ?? '',
      'Inventory status': row.status ?? '',
    })),
    'Failed rows',
    reportName(preview.fileName, 'error-report'),
  );
}

function duplicateReportRows(rows: PreviewRow[]): Record<string, string | number>[] {
  return rows.flatMap((row) =>
    (row.duplicates ?? []).map((duplicate) => ({
      'Excel row': row.rowNumber,
      'Matched field': duplicate.matchedField === 'serialNumber' ? 'Serial number' : duplicate.matchedField,
      'Uploaded value': duplicate.uploadedValue,
      'Duplicate source':
        duplicate.source === 'EXISTING_INVENTORY' ? 'Existing inventory' : 'Same upload file',
      'Other Excel rows': duplicate.otherRowNumbers?.join(', ') ?? '',
      'Existing asset tag': duplicate.assetTag ?? '',
      'Existing material code': duplicate.materialCode ?? '',
      'Existing material': duplicate.name ?? '',
      'Existing category': duplicate.category ?? '',
      'Existing model': duplicate.typeModelName ?? '',
      'Existing configuration': duplicate.configuration ?? '',
      'Existing location': duplicate.location ?? '',
      'Existing block': duplicate.block ?? '',
      'Existing status': duplicate.status ?? '',
      Resolution:
        duplicate.source === 'EXISTING_INVENTORY'
          ? 'Do not upload this serial again. Verify the existing asset or correct the Excel serial number.'
          : 'Keep one correct row and remove or correct the repeated serial number.',
    })),
  );
}

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
  const [searchDraft, setSearchDraft] = useState('');
  const [result, setResult] = useState<InventoryImportResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);

  const query = useQuery({
    queryKey: ['inventory-import-review', importId],
    queryFn: () => getInventoryImportPreview(importId),
    enabled: Boolean(importId) && !result,
    initialData: initialPreview,
  });

  const preview = query.data;
  const duplicateRows = useMemo(
    () => (preview?.rows ?? []).filter((row) => (row.duplicates?.length ?? 0) > 0),
    [preview?.rows],
  );
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
        row.department,
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

  if (query.isPending && !preview) return <LoadingPanel label="Loading upload review" />;
  if (!preview) {
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

      {query.isError ? (
        <ErrorSummary
          message={
            isApiError(query.error)
              ? query.error.message
              : 'The saved upload review could not be refreshed.'
          }
          title="Review refresh failed"
        />
      ) : null}

      {actionError ? <ErrorSummary message={actionError} title="Upload failed" /> : null}

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Total rows" value={preview.totalRows} />
        <MetricCard label="Ready" tone="success" value={preview.validRows} />
        <MetricCard label="Failed" tone="danger" value={preview.invalidRows} />
        <MetricCard label="Showing" value={rows.length} />
      </div>

      {result ? (
        <UploadResult preview={preview} result={result} />
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
              <form
                className="relative block min-w-[280px]"
                onSubmit={(event) => {
                  event.preventDefault();
                  setSearch(searchDraft.trim());
                }}
                role="search"
              >
                <label className="sr-only" htmlFor="inventory-import-review-search">
                  Search review rows
                </label>
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
                  size={17}
                />
                <input
                  className="field-input pl-9"
                  id="inventory-import-review-search"
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder="Type and press Enter"
                  value={searchDraft}
                />
              </form>
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
            <div className="mt-4 flex flex-col gap-3 rounded-[8px] border border-[var(--color-danger-border)] bg-[var(--color-danger-soft)] p-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-extrabold text-[var(--color-danger)]">
                  {preview.invalidRows} rows need attention
                </p>
                <p className="mt-0.5 text-xs font-semibold text-[var(--color-text-muted)]">
                  Failed rows stay out of inventory. Download the report for row-by-row corrections.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {duplicateRows.length > 0 ? (
                  <Button onClick={() => setDuplicatesOpen(true)} type="button" variant="secondary">
                    <Files aria-hidden="true" size={17} />
                    Compare duplicates ({duplicateRows.length})
                  </Button>
                ) : null}
                <Button onClick={() => downloadErrorReport(preview)} type="button" variant="secondary">
                  <Download aria-hidden="true" size={17} />
                  Download error report
                </Button>
              </div>
            </div>
          ) : null}

          {rows.length === 0 ? (
            <EmptyState message="Change the search or status filter." title="No rows found" />
          ) : (
            <ReviewTable mode={preview.mode} rows={rows} />
          )}
        </AppCard>
      )}
      {duplicatesOpen ? (
        <DuplicateComparisonDialog
          fileName={preview.fileName}
          onClose={() => setDuplicatesOpen(false)}
          rows={duplicateRows}
        />
      ) : null}
    </div>
  );
}

function Dialog({ children, label, onClose }: { children: ReactNode; label: string; onClose: () => void }) {
  const reference = useRef<HTMLDialogElement>(null);
  useEffect(() => reference.current?.showModal(), []);
  return (
    <dialog
      aria-label={label}
      className="relative m-auto max-h-[90vh] w-[min(96vw,1180px)] overflow-hidden rounded-[12px] border border-[var(--color-border)] bg-white p-0 text-[var(--color-text)] shadow-[var(--shadow-overlay)] backdrop:bg-slate-950/45"
      onCancel={onClose}
      onClose={onClose}
      ref={reference}
    >
      <button
        aria-label="Close"
        className="absolute right-4 top-4 z-20 grid size-9 place-items-center rounded-full border border-[var(--color-border)] bg-white text-[var(--color-text-muted)] shadow-sm hover:text-[var(--color-primary)]"
        onClick={onClose}
        type="button"
      >
        <X aria-hidden="true" size={18} />
      </button>
      {children}
    </dialog>
  );
}

function DuplicateComparisonDialog({
  fileName,
  onClose,
  rows,
}: {
  fileName: string;
  onClose: () => void;
  rows: PreviewRow[];
}) {
  const reportRows = duplicateReportRows(rows);
  return (
    <Dialog label="Duplicate comparison" onClose={onClose}>
      <div className="border-b border-[var(--color-border)] px-6 py-5 pr-16">
        <p className="text-lg font-extrabold">Duplicate comparison</p>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Uploaded values are matched against this file and existing inventory records.
        </p>
      </div>
      <div className="max-h-[calc(90vh-150px)] overflow-auto p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold text-[var(--color-text-muted)]">
            {rows.length} affected Excel rows · {reportRows.length} duplicate matches
          </p>
          <Button
            onClick={() =>
              void saveWorkbook(reportRows, 'Duplicate comparison', reportName(fileName, 'duplicates'))
            }
            type="button"
            variant="secondary"
          >
            <Download aria-hidden="true" size={17} />
            Download duplicate report
          </Button>
        </div>
        <div className="overflow-auto rounded-[8px] border border-[var(--color-border)]">
          <table className="w-full min-w-[1050px] table-fixed text-left text-sm">
            <thead className="sticky top-0 bg-[var(--color-surface-tint)] text-xs text-[var(--color-text-muted)]">
              <tr>
                <th className="w-20 p-3">Row</th>
                <th className="w-44 p-3">Matched value</th>
                <th className="w-40 p-3">Duplicate found in</th>
                <th className="w-48 p-3">Asset / material code</th>
                <th className="w-56 p-3">Existing material</th>
                <th className="w-44 p-3">Location</th>
                <th className="p-3">What to do</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.flatMap((row) =>
                (row.duplicates ?? []).map((duplicate, index) => (
                  <tr key={`${row.rowNumber}-${duplicate.source}-${index}`} className="align-top hover:bg-[var(--color-surface-tint)]">
                    <td className="p-3 font-extrabold">{row.rowNumber}</td>
                    <td className="break-words p-3">
                      <span className="block text-xs font-bold text-[var(--color-text-muted)]">Serial number</span>
                      <span className="font-extrabold">{duplicate.uploadedValue}</span>
                    </td>
                    <td className="p-3 font-bold">
                      {duplicate.source === 'EXISTING_INVENTORY'
                        ? 'Existing inventory'
                        : `Excel row ${duplicate.otherRowNumbers?.join(', ')}`}
                    </td>
                    <td className="break-words p-3">
                      <span className="block font-bold">{duplicate.assetTag ?? 'Not created'}</span>
                      <span className="text-xs text-[var(--color-text-muted)]">{duplicate.materialCode ?? 'Same upload file'}</span>
                    </td>
                    <td className="break-words p-3">
                      <span className="block font-bold">{duplicate.name ?? row.name}</span>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {[duplicate.category, duplicate.typeModelName, duplicate.configuration].filter(Boolean).join(' · ') || 'Uploaded row'}
                      </span>
                    </td>
                    <td className="break-words p-3">
                      {[duplicate.location, duplicate.block].filter(Boolean).join(' / ') || 'Same upload file'}
                    </td>
                    <td className="break-words p-3 text-xs font-semibold">
                      {duplicate.source === 'EXISTING_INVENTORY'
                        ? 'Verify the existing asset. Correct the Excel serial if this is a different item.'
                        : 'Keep one correct row and remove or correct the repeated serial.'}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Dialog>
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
    <button
      className={active ? 'button-primary' : 'button-secondary'}
      onClick={onClick}
      type="button"
    >
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
            {mode === 'SERIALIZED' ? <th className="w-56 p-3 font-bold">Configuration</th> : null}
            <th className="w-44 p-3 font-bold">
              {mode === 'SERIALIZED' ? 'Asset type' : 'Consumable type'}
            </th>
            <th className="w-36 p-3 font-bold">Inventory status</th>
            <th className="w-36 p-3 font-bold">Location</th>
            <th className="w-36 p-3 font-bold">Block</th>
            <th className="w-40 p-3 font-bold">Department</th>
            <th className="w-40 p-3 font-bold">Vendor</th>
            <th className="w-44 p-3 font-bold">
              {mode === 'SERIALIZED' ? 'Serial number' : 'Quantity'}
            </th>
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
                  {row.valid ? (
                    <CheckCircle2 aria-hidden="true" size={14} />
                  ) : (
                    <XCircle aria-hidden="true" size={14} />
                  )}
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
              <td className="break-words p-3">{row.department || 'Not provided'}</td>
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

function UploadResult({
  preview,
  result,
}: {
  preview: InventoryImportPreview;
  result: InventoryImportResult;
}) {
  return (
    <AppCard className="max-w-none">
      <div className="grid gap-3 md:grid-cols-2">
        <MetricCard label="Materials created" tone="success" value={result.created.length} />
        <MetricCard label="Rows failed or skipped" tone="danger" value={result.failed.length} />
      </div>
      {result.failed.length > 0 ? (
        <>
          <div className="mt-5 flex justify-end">
            <Button
              onClick={() =>
                void saveWorkbook(
                  result.failed.map((failure) => {
                    const source = preview.rows.find((row) => row.rowNumber === failure.rowNumber);
                    return {
                      'Excel row': failure.rowNumber,
                      'Validation status': 'FAILED',
                      'Why it failed': failure.reason,
                      'Recommended action':
                        'Correct this row using the reason shown, then upload the file again.',
                      'Type/model name': failure.name,
                      Category: source?.category ?? '',
                      Configuration: source?.configuration ?? '',
                      'Serial number': source?.serialNumber ?? '',
                      Quantity: source?.quantity ?? '',
                      Location: source?.location ?? '',
                      Block: source?.block ?? '',
                      Department: source?.department ?? '',
                    };
                  }),
                  'Upload failures',
                  reportName(preview.fileName, 'upload-failures'),
                )
              }
              type="button"
              variant="secondary"
            >
              <Download aria-hidden="true" size={17} />
              Download failure report
            </Button>
          </div>
          <div className="mt-3 max-h-[520px] overflow-auto rounded-[8px] border border-[var(--color-border)]">
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
                  <td className="break-words p-3 font-bold text-[var(--color-danger)]">
                    {row.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      ) : null}
      <Link className="button-secondary mt-5" to="/inventory">
        View Inventory
      </Link>
    </AppCard>
  );
}
