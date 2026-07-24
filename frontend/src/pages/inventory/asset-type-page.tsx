import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, FileSpreadsheet, PackagePlus, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router';

import type { AssetType } from '@assetdesk/contracts';

import { useAuth } from '../../auth/auth-context';
import { hasPermission } from '../../auth/permissions';
import { AppCard, Button, ErrorState, ErrorSummary, LoadingPanel, PageHeader, TextField } from '../../components/ui';
import {
  commitAssetTypeImport,
  createAssetType,
  deleteAssetType,
  getAssetTypes,
  previewAssetTypeImport,
  type AssetTypeImportPreviewResponse,
  type AssetTypeImportResponse,
} from '../../lib/inventory-api';
import { isApiError } from '../../lib/api-client';

type Mode = 'individual' | 'bulk';

const ASSET_TYPE_TEMPLATE = 'Asset Type\r\nComputer\r\nPrinter\r\nNetwork Device\r\n';

export function AssetTypePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('individual');
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<AssetTypeImportPreviewResponse['data'] | null>(null);
  const [result, setResult] = useState<AssetTypeImportResponse['data'] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AssetType | null>(null);
  const canAddAssetTypes = hasPermission(user, 'ASSET_TYPES_ADD');
  const canDeleteAssetTypes = hasPermission(user, 'ASSET_TYPES_DELETE');

  const query = useQuery({
    queryKey: ['asset-types'],
    queryFn: ({ signal }) => getAssetTypes(signal),
  });

  const createMutation = useMutation({
    mutationFn: (assetTypeName: string) => createAssetType(assetTypeName),
    onSuccess: async (assetType) => {
      setName('');
      setMessage(`${assetType.name} saved as an asset type.`);
      await queryClient.invalidateQueries({ queryKey: ['asset-types'] });
    },
    onError: (error) =>
      setMessage(isApiError(error) ? error.message : 'The asset type could not be saved.'),
  });

  const previewMutation = useMutation({
    mutationFn: (upload: File) => previewAssetTypeImport(upload),
    onSuccess: (importPreview) => {
      setPreview(importPreview);
    },
    onError: (error) =>
      setMessage(isApiError(error) ? error.message : 'The asset type sheet could not be validated.'),
  });

  const commitMutation = useMutation({
    mutationFn: (importId: string) => commitAssetTypeImport(importId),
    onSuccess: async (importResult) => {
      setResult(importResult);
      setPreview(null);
      await queryClient.invalidateQueries({ queryKey: ['asset-types'] });
    },
    onError: (error) =>
      setMessage(isApiError(error) ? error.message : 'The asset type sheet could not be uploaded.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (assetType: AssetType) => deleteAssetType(assetType.id),
    onSuccess: async () => {
      setDeleteTarget(null);
      setMessage('Asset type deleted.');
      await queryClient.invalidateQueries({ queryKey: ['asset-types'] });
    },
    onError: (error) =>
      setMessage(isApiError(error) ? error.message : 'The asset type could not be deleted.'),
  });

  function submitIndividual(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setResult(null);
    setPreview(null);
    const trimmed = name.trim();
    if (trimmed.length < 2) return setMessage('Enter an asset type with at least 2 characters.');
    createMutation.mutate(trimmed);
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    setMessage(null);
    setResult(null);
    const selected = event.target.files?.[0] ?? null;
    if (!selected) return setFile(null);
    const extension = selected.name.split('.').pop()?.toLowerCase();
    if (!extension || !['csv', 'xlsx'].includes(extension)) {
      event.target.value = '';
      setFile(null);
      return setMessage('Choose a CSV or XLSX file.');
    }
    if (selected.size > 5 * 1024 * 1024) {
      event.target.value = '';
      setFile(null);
      return setMessage('Choose a file no larger than 5 MB.');
    }
    setFile(selected);
  }

  function submitBulk(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setResult(null);
    if (!file) {
      setMessage('Choose a CSV or XLSX file first.');
      return fileInput.current?.focus();
    }
    previewMutation.mutate(file);
  }

  function commitBulk() {
    if (!preview || preview.validRows === 0) return;
    commitMutation.mutate(preview.importId);
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(
      new Blob(['\uFEFF', ASSET_TYPE_TEMPLATE], { type: 'text/csv;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'assetdesk-asset-types-template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Link className="button-quiet" to="/inventory">
            <ArrowLeft aria-hidden="true" size={18} />
            Back to Inventory
          </Link>
        }
        description="Save reusable asset type names for the inventory dropdown."
        title="Add asset type"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <AppCard>
          <div className="mb-5 grid grid-cols-2 gap-2">
            {canAddAssetTypes ? <Button
              onClick={() => {
                setMode('individual');
                setMessage(null);
                setResult(null);
              }}
              type="button"
              variant={mode === 'individual' ? 'primary' : 'secondary'}
            >
              <PackagePlus aria-hidden="true" size={18} />
              Individual
            </Button> : null}
            {canAddAssetTypes ? <Button
              onClick={() => {
                setMode('bulk');
                setMessage(null);
                setResult(null);
              }}
              type="button"
              variant={mode === 'bulk' ? 'primary' : 'secondary'}
            >
              <FileSpreadsheet aria-hidden="true" size={18} />
              Bulk upload
            </Button> : null}
          </div>

          {message ? <ErrorSummary message={message} title={mode === 'individual' ? 'Asset type' : 'Upload'} /> : null}

          {!canAddAssetTypes ? (
            <p className="mt-3 rounded-[10px] bg-[var(--color-surface-tint)] p-3 text-sm font-semibold text-[var(--color-text-muted)]">
              You can view saved asset types. Add/upload access is not enabled for this account.
            </p>
          ) : mode === 'individual' ? (
            <form className="mt-5 space-y-5" onSubmit={submitIndividual}>
              <TextField
                label="Asset type"
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                placeholder="Computer, Printer, UPS"
                required
                value={name}
              />
              <div className="flex justify-end">
                <Button loading={createMutation.isPending} type="submit">
                  {createMutation.isPending ? 'Saving...' : 'Save asset type'}
                </Button>
              </div>
            </form>
          ) : (
            <form className="mt-5 space-y-5" onSubmit={submitBulk}>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="rounded-[8px] border border-[var(--color-border)] p-5">
                  <p className="font-bold text-[var(--color-text-strong)]">Upload asset type list</p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    CSV and XLSX, maximum 5 MB and 1,000 rows. Required column: Asset Type.
                  </p>
                  <input
                    accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="field-input mt-4"
                    onChange={chooseFile}
                    ref={fileInput}
                    type="file"
                  />
                  {file ? (
                    <p className="mt-2 text-xs font-semibold text-[var(--color-text-muted)]">
                      Selected: {file.name} · {(file.size / 1024).toFixed(1)} KB
                    </p>
                  ) : null}
                </div>
                <Button onClick={downloadTemplate} type="button" variant="secondary">
                  <Download aria-hidden="true" size={18} />
                  Template
                </Button>
              </div>
              <div className="flex justify-end">
                <Button loading={previewMutation.isPending} type="submit">
                  <Upload aria-hidden="true" size={18} />
                  {previewMutation.isPending ? 'Validating...' : 'Validate and preview'}
                </Button>
              </div>
            </form>
          )}

          {preview ? (
            <section className="mt-6 border-t border-[var(--color-border)] pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
                    Review asset type data
                  </h2>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {preview.validRows} ready · {preview.invalidRows} invalid
                  </p>
                </div>
                <Button
                  disabled={preview.validRows === 0}
                  loading={commitMutation.isPending}
                  onClick={commitBulk}
                >
                  Upload valid rows to server
                </Button>
              </div>
              <div className="mt-4 max-h-[420px] overflow-auto rounded-[8px] border border-[var(--color-border)]">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-[var(--color-surface-tint)]">
                    <tr>
                      <th className="p-3">Row</th>
                      <th className="p-3">Asset type</th>
                      <th className="p-3">Validation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr className="border-t border-[var(--color-border)]" key={row.rowNumber}>
                        <td className="p-3">{row.rowNumber}</td>
                        <td className="p-3 font-semibold">{row.name || 'Missing'}</td>
                        <td
                          className={`p-3 font-bold ${
                            row.valid ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
                          }`}
                        >
                          {row.valid ? 'Ready' : row.errors.join(' ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {result ? (
            <section className="mt-6 border-t border-[var(--color-border)] pt-5">
              <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
                Upload complete
              </h2>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                {result.created.length} saved. {result.skipped.length} skipped. {result.failed.length} failed.
              </p>
              {result.skipped.length > 0 || result.failed.length > 0 ? (
                <div className="mt-4 rounded-[8px] border border-[var(--color-border)]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[var(--color-surface-tint)]">
                      <tr>
                        <th className="p-3">Row</th>
                        <th className="p-3">Asset type</th>
                        <th className="p-3">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ...result.skipped.map((row, index) => ({ ...row, rowNumber: index + 1 })),
                        ...result.failed,
                      ].map((row) => (
                        <tr className="border-t border-[var(--color-border)]" key={`${row.rowNumber}-${row.name}-${row.reason}`}>
                          <td className="p-3">{row.rowNumber}</td>
                          <td className="p-3">{row.name || 'Missing'}</td>
                          <td className="p-3 font-bold text-[var(--color-danger)]">{row.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ) : null}
        </AppCard>

        <AppCard>
          <h2 className="font-extrabold text-[var(--color-primary-strong)]">Saved asset types</h2>
          {query.isPending ? (
            <LoadingPanel label="Loading asset types" />
          ) : query.isError ? (
            <ErrorState message="Asset types could not be loaded." onRetry={() => void query.refetch()} />
          ) : query.data.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">No asset types saved yet.</p>
          ) : (
            <ul className="mt-4 max-h-[480px] space-y-2 overflow-auto">
              {query.data.map((assetType) => (
                <li
                  className="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--color-border)] px-3 py-2 text-sm font-bold text-[var(--color-text-strong)]"
                  key={assetType.id}
                >
                  <span className="min-w-0 break-words">{assetType.name}</span>
                  {canDeleteAssetTypes ? <Button
                    aria-label={`Delete ${assetType.name}`}
                    onClick={() => {
                      setMessage(null);
                      setDeleteTarget(assetType);
                    }}
                    type="button"
                    variant="danger"
                  >
                    <Trash2 aria-hidden="true" size={16} />
                  </Button> : null}
                </li>
              ))}
            </ul>
          )}
        </AppCard>
      </div>

      {deleteTarget ? (
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
                  Delete asset type?
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                  {deleteTarget.name} will be removed from the asset type dropdown. It cannot be
                  deleted while inventory data is using it.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                disabled={deleteMutation.isPending}
                onClick={() => setDeleteTarget(null)}
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                loading={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteTarget)}
                type="button"
                variant="danger"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
