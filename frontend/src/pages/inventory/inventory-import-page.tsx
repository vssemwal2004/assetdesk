import { ArrowLeft, Download, FileSpreadsheet, PackagePlus, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import type { TrackingMode } from '@assetdesk/contracts';

import { SelectField } from '../../components/catalog-ui';
import { AppCard, Button, ErrorSummary, PageHeader } from '../../components/ui';
import { isApiError } from '../../lib/api-client';
import {
  previewInventoryImport,
} from '../../lib/inventory-api';

const ASSET_TEMPLATE =
  'IT Asset,Type/Model Name,Configuration,Serial Number,Location,Block,Vendor Name,Description,Inventory Status\r\nComputer,Dell Latitude 5450,Intel Core i5 / 16 GB RAM / 512 GB SSD,DL5450-001,Computer Centre,A Block,Dell,Staff laptop,Active / in use\r\nComputer,Dell Latitude 5450,Intel Core i5 / 16 GB RAM / 512 GB SSD,DL5450-002,Computer Centre,A Block,Dell,Spare laptop,Faulty (scrap)\r\nPrinter,HP LaserJet 1020,Monochrome laser / USB,HPLJ1020-OLD-01,Store Room,B Block,HP,Old printer not in regular use,Outdated (not in use)\r\n';
const CONSUMABLE_TEMPLATE =
  'IT Consumable,Type/Model Name,Quantity,Unit Label,Return Policy,Location,Block,Vendor Name,Description,Inventory Status\r\nCable,USB-C Cable,50,pieces,CONSUMABLE,Computer Centre,A Block,Local Vendor,One metre cable,Active / in use\r\nCartridge,Printer Toner,12,pieces,CONSUMABLE,Store Room,B Block,HP,Reserve stock,Outdated (not in use)\r\n';

export function InventoryImportPage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [mode, setMode] = useState<TrackingMode>('SERIALIZED');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetUpload() {
    setFile(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
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
    setBusy(true);
    setError(null);
    try {
      const nextPreview = await previewInventoryImport(file, mode);
      void navigate(`/inventory/import/${nextPreview.importId}/review`, {
        state: { preview: nextPreview },
      });
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : 'The file could not be validated.');
    } finally {
      setBusy(false);
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
      <AppCard className="max-w-7xl">
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
              {mode === 'SERIALIZED'
                ? ' Required columns: IT Asset, Type/Model Name, Serial Number, Location, Block. Optional columns: Vendor Name, Description, Inventory Status.'
                : ' Required columns: IT Consumable, Type/Model Name, Quantity, Unit Label, Location, Block. Optional columns: Vendor Name, Return Policy, Description, Inventory Status.'}
            </p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              IT Asset, IT Consumable, Location, and Block are matched from saved asset details; spacing and letter case are ignored. Vendor Name is saved as entered.
            </p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Inventory Status accepts Active / in use, Faulty (scrap), and Outdated (not in use).
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
            <Button loading={busy} type="submit">
              <Upload aria-hidden="true" size={18} />
              {busy ? 'Validating...' : 'Review upload'}
            </Button>
          </div>
        </form>
      </AppCard>
    </div>
  );
}
