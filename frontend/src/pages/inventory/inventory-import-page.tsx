import { ArrowLeft, Download, FileSpreadsheet, PackagePlus, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router';

import type { TrackingMode } from '@assetdesk/contracts';

import { SelectField } from '../../components/catalog-ui';
import { AppCard, Button, ErrorSummary, PageHeader } from '../../components/ui';
import { isApiError } from '../../lib/api-client';
import {
  commitInventoryImport,
  previewInventoryImport,
  type InventoryImportPreview,
  type InventoryImportResult,
} from '../../lib/inventory-api';

const ASSET_TEMPLATE =
  'Material Name,Material Group,Description,Serial Number\r\nDell Latitude 5450,Laptops,Staff laptop,DL5450-001\r\nDell Latitude 5450,Laptops,Staff laptop,DL5450-002\r\n';
const CONSUMABLE_TEMPLATE =
  'Material Name,Material Group,Description,Quantity,Unit Label,Return Policy\r\nUSB-C Cable,Cables,One metre cable,50,pieces,CONSUMABLE\r\n';

export function InventoryImportPage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<TrackingMode>('SERIALIZED');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<InventoryImportPreview | null>(null);
  const [result, setResult] = useState<InventoryImportResult | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetUpload() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setPreview(null);
    setResult(null);
    setError(null);
    if (!selected) return setFile(null);
    const extension = selected.name.split('.').pop()?.toLowerCase();
    if (!extension || !['csv', 'xlsx'].includes(extension)) {
      event.target.value = '';
      setFile(null);
      return setError('Choose a CSV or XLSX file.');
    }
    if (selected.size > 5 * 1024 * 1024) {
      event.target.value = '';
      setFile(null);
      return setError('Choose a file no larger than 5 MB.');
    }
    setFile(selected);
  }

  function downloadTemplate() {
    const contents = mode === 'SERIALIZED' ? ASSET_TEMPLATE : CONSUMABLE_TEMPLATE;
    const url = URL.createObjectURL(
      new Blob(['\uFEFF', contents], { type: 'text/csv;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download =
      mode === 'SERIALIZED'
        ? 'assetdesk-it-assets-template.csv'
        : 'assetdesk-it-consumables-template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function validate(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setError('Choose a CSV or XLSX file first.');
      return fileInput.current?.focus();
    }
    setBusy('preview');
    setError(null);
    try {
      setPreview(await previewInventoryImport(file, mode));
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : 'The file could not be validated.');
    } finally {
      setBusy(null);
    }
  }

  async function commit() {
    if (!preview || preview.invalidRows > 0) return;
    setBusy('commit');
    setError(null);
    try {
      setResult(await commitInventoryImport(preview.importId));
      setPreview(null);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : 'The materials could not be uploaded.');
    } finally {
      setBusy(null);
    }
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
        description="Validate, review, then upload IT Assets or IT Consumables."
        title="Bulk upload"
      />
      <AppCard className="max-w-5xl">
        <div className="mb-5 grid grid-cols-2 gap-2">
          <Link className="button-secondary" to="/inventory/new">
            <PackagePlus aria-hidden="true" size={18} />
            Individual
          </Link>
          <Button type="button">
            <FileSpreadsheet aria-hidden="true" size={18} />
            Bulk upload
          </Button>
        </div>
        {error ? <ErrorSummary message={error} /> : null}
        <form className="mt-5 space-y-5" onSubmit={(event) => void validate(event)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              id="inventory-import-type"
              label="Upload type"
              onChange={(value) => {
                setMode(value as TrackingMode);
                resetUpload();
              }}
              value={mode}
            >
              <option value="SERIALIZED">Upload IT Assets</option>
              <option value="QUANTITY">Upload IT Consumables</option>
            </SelectField>
            <Button onClick={downloadTemplate} type="button" variant="secondary">
              <Download aria-hidden="true" size={18} />
              Download template
            </Button>
          </div>
          <div className="rounded-[8px] border border-[var(--color-border)] p-5">
            <p className="font-bold text-[var(--color-text-strong)]">
              {mode === 'SERIALIZED'
                ? 'One physical IT Asset and unique serial number per row'
                : 'One IT Consumable material per row'}
            </p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              CSV and XLSX, maximum 5 MB and 1,000 rows.
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
          <div className="flex justify-end">
            <Button loading={busy === 'preview'} type="submit">
              <Upload aria-hidden="true" size={18} />
              {busy === 'preview' ? 'Validating...' : 'Validate and preview'}
            </Button>
          </div>
        </form>

        {preview ? (
          <section className="mt-6 border-t border-[var(--color-border)] pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
                  Review upload data
                </h2>
                <p className="text-sm text-[var(--color-text-muted)]">
                  {preview.validRows} ready · {preview.invalidRows} invalid
                </p>
              </div>
              <Button
                disabled={preview.invalidRows > 0}
                loading={busy === 'commit'}
                onClick={() => void commit()}
              >
                Upload to server
              </Button>
            </div>
            {preview.invalidRows > 0 ? (
              <p className="mt-3 rounded-[8px] bg-[var(--color-danger-soft)] p-3 text-sm font-bold text-[var(--color-danger)]">
                Nothing was created. Correct every invalid row and upload the file again.
              </p>
            ) : null}
            <div className="mt-4 max-h-[520px] overflow-auto rounded-[8px] border border-[var(--color-border)]">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="sticky top-0 bg-[var(--color-surface-tint)]">
                  <tr>
                    <th className="p-3">Row</th>
                    <th className="p-3">Material</th>
                    <th className="p-3">Group</th>
                    <th className="p-3">
                      {mode === 'SERIALIZED' ? 'Serial number' : 'Quantity'}
                    </th>
                    <th className="p-3">Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 200).map((row) => (
                    <tr className="border-t border-[var(--color-border)]" key={row.rowNumber}>
                      <td className="p-3">{row.rowNumber}</td>
                      <td className="p-3 font-semibold">{row.name || 'Missing'}</td>
                      <td className="p-3">{row.category || 'Missing'}</td>
                      <td className="p-3">
                        {mode === 'SERIALIZED'
                          ? row.serialNumber || 'Missing'
                          : `${row.quantity ?? 'Missing'} ${row.unitLabel ?? ''}`}
                      </td>
                      <td
                        className={`p-3 font-bold ${
                          row.valid
                            ? 'text-[var(--color-success)]'
                            : 'text-[var(--color-danger)]'
                        }`}
                      >
                        {row.valid ? 'Ready' : row.errors.join(' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.rows.length > 200 ? (
              <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                Showing 200 of {preview.rows.length} rows for fast review. Every validated row will
                still be uploaded.
              </p>
            ) : null}
          </section>
        ) : null}

        {result ? (
          <section className="mt-6 border-t border-[var(--color-border)] pt-5">
            <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
              Upload complete
            </h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              {result.created.length} materials created. {result.failed.length} rows failed.
            </p>
            <Link className="button-secondary mt-4" to="/inventory">
              View Inventory
            </Link>
          </section>
        ) : null}
      </AppCard>
    </div>
  );
}
