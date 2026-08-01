import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clipboard,
  Download,
  FileSpreadsheet,
  Upload,
  XCircle,
} from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';

import {
  DEFAULT_WORKER_PERMISSIONS,
  type WorkerDataAccess,
  type WorkerImportCommitResponse,
  type WorkerImportPreviewResponse,
  type WorkerPermission,
} from '@assetdesk/contracts';

import { AppCard, Button, ErrorSummary, PageHeader, SuccessMark } from '../../components/ui';
import { isApiError } from '../../lib/api-client';
import { commitWorkerImport, previewWorkerImport, updateWorker } from '../../lib/workers-api';
import { DataAccessMatrix, PermissionMatrix } from './permission-matrix';

export function WorkerImportPage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<WorkerImportPreviewResponse['data'] | null>(null);
  const [result, setResult] = useState<WorkerImportCommitResponse['data'] | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [accessPermissions, setAccessPermissions] = useState<WorkerPermission[]>([
    ...DEFAULT_WORKER_PERMISSIONS,
  ]);
  const [accessData, setAccessData] = useState<WorkerDataAccess>({ inventory: 'OWN', issues: 'OWN' });
  const [accessSaving, setAccessSaving] = useState(false);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError(null);
    setPreview(null);
    setResult(null);
    if (!selected) {
      setFile(null);
      return;
    }
    const extension = selected.name.split('.').pop()?.toLowerCase();
    if (!extension || !['csv', 'xlsx'].includes(extension)) {
      setFile(null);
      setError('Choose a CSV or XLSX file.');
      event.target.value = '';
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setFile(null);
      setError('Choose a file no larger than 5 MB.');
      event.target.value = '';
      return;
    }
    setFile(selected);
  }

  async function createPreview() {
    if (!file) {
      setError('Choose a CSV or XLSX file first.');
      fileInput.current?.focus();
      return;
    }
    setBusy('preview');
    setError(null);
    try {
      const response = await previewWorkerImport(file);
      setPreview(response.data);
    } catch (requestError) {
      setError(
        isApiError(requestError) ? requestError.message : 'AssetDesk could not preview this file.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function commit() {
    if (!preview) return;
    setBusy('commit');
    setError(null);
    try {
      const response = await commitWorkerImport(preview.importId, crypto.randomUUID());
      setResult(response.data);
      if (response.data.created.length > 0) setAccessOpen(true);
    } catch (requestError) {
      setError(
        isApiError(requestError)
          ? requestError.message
          : 'AssetDesk could not import these Employees.',
      );
    } finally {
      setBusy(null);
    }
  }

  function downloadTemplate() {
    const contents =
      'Name,Email,Contact,Department\nAnita Sharma,anita.sharma@university.edu,9876543210,IT Services\n';
    const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'assetdesk-worker-import-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyCreatedCredentials() {
    if (!result || result.created.length === 0) return;
    const contents = result.created
      .map(
        ({ worker, credential }) =>
          `${worker.name}\nEmployee ID: ${credential.workerId}\nTemporary password: ${credential.temporaryPassword}`,
      )
      .join('\n\n');

    try {
      await navigator.clipboard.writeText(contents);
      setCopied(true);
    } catch {
      setError('The credentials could not be copied. Copy each visible credential manually.');
    }
  }

  async function saveCommonAccess() {
    if (!result || result.created.length === 0) return;
    setAccessSaving(true);
    setError(null);
    try {
      await Promise.all(
        result.created.map(({ worker }) =>
          updateWorker(worker.workerId, {
            permissions: accessPermissions,
            dataAccess: accessData,
          }),
        ),
      );
      setAccessOpen(false);
    } catch (requestError) {
      setError(
        isApiError(requestError)
          ? requestError.message
          : 'Common access could not be applied to uploaded employees.',
      );
    } finally {
      setAccessSaving(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-6">
        <PageHeader title="Import complete" />
        <AppCard className="mx-auto max-w-3xl">
          <SuccessMark label="Import complete" />
          <h2 className="mt-4 text-xl font-extrabold text-[var(--color-primary-strong)]">
            {result.created.length} {result.created.length === 1 ? 'Employee' : 'Employees'} created
          </h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {result.failed.length > 0
              ? `${result.failed.length} rows could not be created.`
              : 'Every valid row was created.'}
          </p>
          {result.created.length > 0 ? (
            <>
              <div className="mt-5 flex flex-col gap-3 rounded-[12px] bg-[var(--color-warning-soft)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-[var(--color-warning)]">
                    Save these one-time credentials now
                  </p>
                  <p className="mt-1 text-xs leading-5 text-amber-900">
                    They will not appear again after you leave this page. Each Employee must change
                    the temporary password at first sign-in.
                  </p>
                </div>
                <Button onClick={() => void copyCreatedCredentials()} variant="secondary">
                  {copied ? (
                    <Check aria-hidden="true" size={18} />
                  ) : (
                    <Clipboard aria-hidden="true" size={18} />
                  )}
                  {copied ? 'All credentials copied' : 'Copy all credentials'}
                </Button>
              </div>
              <div className="mt-4 overflow-hidden rounded-[12px] border border-[var(--color-border)]">
                <ul className="divide-y divide-[var(--color-border)]">
                  {result.created.map(({ worker, credential }) => (
                    <li
                      className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto]"
                      key={worker.workerId}
                    >
                      <div>
                        <p className="text-sm font-bold text-[var(--color-text-strong)]">
                          {worker.name}
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                          {worker.email}
                        </p>
                        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                          <div>
                            <dt className="font-bold text-[var(--color-text-muted)]">Employee ID</dt>
                            <dd className="mt-1 font-bold text-[var(--color-primary-strong)]">
                              {credential.workerId}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-bold text-[var(--color-text-muted)]">
                              Temporary password
                            </dt>
                            <dd className="mt-1 break-all font-mono font-bold text-[var(--color-primary-strong)]">
                              {credential.temporaryPassword}
                            </dd>
                          </div>
                        </dl>
                      </div>
                      <Link
                        className="text-sm font-bold text-[var(--color-primary)]"
                        to={`/workers/${worker.workerId}`}
                      >
                        View employee
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}
          {result.failed.length > 0 ? (
            <div className="mt-4 rounded-[12px] border border-red-200 bg-[var(--color-danger-soft)] p-4">
              <h3 className="font-bold text-[var(--color-danger)]">Rows not created</h3>
              <ul className="mt-2 space-y-2 text-sm text-red-900">
                {result.failed.map((row) => (
                  <li key={`${row.rowNumber}-${row.email}`}>
                    Row {row.rowNumber}: {row.email} — {row.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-2">
            {result.created.length > 0 ? (
              <Button onClick={() => setAccessOpen(true)} variant="secondary">
                Manage common access
              </Button>
            ) : null}
            <Link className="button-primary" to="/workers">
              View employees
            </Link>
            <Button
              onClick={() => {
                setResult(null);
                setPreview(null);
                setFile(null);
                setCopied(false);
                if (fileInput.current) fileInput.current.value = '';
              }}
              variant="secondary"
            >
              Import another file
            </Button>
          </div>
        </AppCard>
        {accessOpen ? (
          <div
            aria-labelledby="bulk-access-title"
            className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
            role="dialog"
          >
            <div className="max-h-[88vh] w-full max-w-5xl overflow-y-auto rounded-[12px] bg-white p-5 shadow-xl">
              <h2
                className="text-lg font-extrabold text-[var(--color-primary-strong)]"
                id="bulk-access-title"
              >
                Manage common access
              </h2>
              <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                Apply one permission and data visibility profile to all uploaded employees.
              </p>
              <div className="mt-5 space-y-3">
                <PermissionMatrix onChange={setAccessPermissions} selected={accessPermissions} />
                <DataAccessMatrix onChange={setAccessData} value={accessData} />
              </div>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  disabled={accessSaving}
                  onClick={() => setAccessOpen(false)}
                  variant="secondary"
                >
                  Later
                </Button>
                <Button
                  disabled={accessPermissions.length === 0}
                  loading={accessSaving}
                  onClick={() => void saveCommonAccess()}
                >
                  {accessSaving ? 'Saving access...' : 'Apply to uploaded employees'}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Link className="button-quiet" to="/workers">
            <ArrowLeft aria-hidden="true" size={18} />
            Back to employees
          </Link>
        }
        description="Upload a CSV or Excel workbook, check every row, then confirm the import."
        title="Import employees"
      />
      {error ? <ErrorSummary message={error} title="Import could not continue" /> : null}

      {!preview ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_0.7fr]">
          <AppCard>
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                <Upload aria-hidden="true" size={22} />
              </span>
              <div>
                <p className="text-xs font-bold text-[var(--color-primary)]">Step 1 of 3</p>
                <h2 className="font-extrabold text-[var(--color-primary-strong)]">Choose file</h2>
              </div>
            </div>
            <label
              className="mt-5 flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-[14px] border-2 border-dashed border-[var(--color-primary-border)] bg-[var(--color-surface-tint)] p-6 text-center transition-colors hover:border-[var(--color-primary)]"
              htmlFor="worker-file"
            >
              <FileSpreadsheet
                aria-hidden="true"
                className="text-[var(--color-primary)]"
                size={34}
              />
              <span className="mt-3 font-bold text-[var(--color-primary-strong)]">
                {file ? file.name : 'Select CSV or XLSX file'}
              </span>
              <span className="mt-1 text-xs text-[var(--color-text-muted)]">
                Maximum file size: 5 MB
              </span>
            </label>
            <input
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              id="worker-file"
              onChange={chooseFile}
              ref={fileInput}
              type="file"
            />
            <Button
              className="mt-5 w-full sm:w-auto"
              disabled={!file}
              loading={busy === 'preview'}
              onClick={() => void createPreview()}
            >
              {busy === 'preview' ? 'Checking file…' : 'Preview import'}
            </Button>
          </AppCard>

          <AppCard>
            <h2 className="font-extrabold text-[var(--color-primary-strong)]">File format</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
              Use one row per Employee. Name and Email are required.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-[var(--color-text-muted)]">
              {[
                'Name (required)',
                'Email (required)',
                'Contact (optional)',
                'Department (optional)',
              ].map((value) => (
                <li className="flex items-center gap-2" key={value}>
                  <CheckCircle2
                    aria-hidden="true"
                    className="text-[var(--color-success)]"
                    size={17}
                  />
                  {value}
                </li>
              ))}
            </ul>
            <Button className="mt-5" onClick={downloadTemplate} variant="secondary">
              <Download aria-hidden="true" size={18} />
              Download CSV template
            </Button>
          </AppCard>
        </div>
      ) : (
        <AppCard>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold text-[var(--color-primary)]">Step 2 of 3</p>
              <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
                Review {preview.fileName}
              </h2>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Previewing does not create any accounts.
              </p>
            </div>
            <Button
              onClick={() => {
                setPreview(null);
                setError(null);
              }}
              variant="secondary"
            >
              Choose another file
            </Button>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
            <Summary label="Total rows" value={preview.totalRows} />
            <Summary label="Valid" tone="success" value={preview.validRows} />
            <Summary label="Invalid" tone="danger" value={preview.invalidRows} />
          </div>
          <div className="mt-5 space-y-2 min-[840px]:hidden">
            {preview.rows.map((row) => (
              <article
                className={`rounded-[12px] border p-3 ${row.valid ? 'border-[var(--color-border)]' : 'border-red-200 bg-[var(--color-danger-soft)]'}`}
                key={row.rowNumber}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-[var(--color-text-strong)]">
                      Row {row.rowNumber}: {row.name || 'Missing name'}
                    </p>
                    <p className="mt-1 break-all text-xs text-[var(--color-text-muted)]">
                      {row.email || 'Missing email'}
                    </p>
                  </div>
                  {row.valid ? (
                    <CheckCircle2
                      aria-label="Valid row"
                      className="shrink-0 text-[var(--color-success)]"
                      size={19}
                    />
                  ) : (
                    <XCircle
                      aria-label="Invalid row"
                      className="shrink-0 text-[var(--color-danger)]"
                      size={19}
                    />
                  )}
                </div>
                {row.errors.length > 0 ? (
                  <ul className="mt-2 text-xs text-red-900">
                    {row.errors.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
          <div className="mt-5 hidden overflow-auto rounded-[12px] border border-[var(--color-border)] min-[840px]:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Employee import preview</caption>
              <thead className="bg-[var(--color-surface-tint)] text-xs text-[var(--color-text-muted)]">
                <tr>
                  <th className="h-11 px-3" scope="col">
                    Row
                  </th>
                  <th className="px-3" scope="col">
                    Name
                  </th>
                  <th className="px-3" scope="col">
                    Email
                  </th>
                  <th className="px-3" scope="col">
                    Department
                  </th>
                  <th className="px-3" scope="col">
                    Result
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {preview.rows.map((row) => (
                  <tr
                    className={row.valid ? '' : 'bg-[var(--color-danger-soft)]'}
                    key={row.rowNumber}
                  >
                    <td className="px-3 py-3">{row.rowNumber}</td>
                    <td className="px-3">{row.name}</td>
                    <td className="px-3">{row.email}</td>
                    <td className="px-3">{row.department ?? '—'}</td>
                    <td className="px-3">
                      {row.valid ? (
                        <span className="font-bold text-[var(--color-success)]">Valid</span>
                      ) : (
                        <span className="font-bold text-[var(--color-danger)]">
                          {row.errors.join(', ')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.invalidRows > 0 ? (
            <div className="mt-4 flex gap-2 rounded-[12px] bg-[var(--color-warning-soft)] p-3 text-sm text-amber-900">
              <AlertCircle
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-[var(--color-warning)]"
                size={18}
              />
              <p>
                Invalid rows will not be created. Correct the file and preview it again if they
                should be included.
              </p>
            </div>
          ) : null}
          <div className="mt-6 flex justify-end">
            <Button
              disabled={preview.validRows === 0}
              loading={busy === 'commit'}
              onClick={() => void commit()}
            >
              {busy === 'commit'
                ? 'Importing employees…'
                : `Import ${preview.validRows} ${preview.validRows === 1 ? 'employee' : 'employees'}`}
            </Button>
          </div>
        </AppCard>
      )}
    </div>
  );
}

function Summary({
  label,
  value,
  tone = 'primary',
}: {
  label: string;
  value: number;
  tone?: 'primary' | 'success' | 'danger';
}) {
  const colors = {
    primary: 'text-[var(--color-primary-strong)]',
    success: 'text-[var(--color-success)]',
    danger: 'text-[var(--color-danger)]',
  };
  return (
    <div className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-tint)] p-3 text-center">
      <p className={`text-xl font-extrabold ${colors[tone]}`}>{value}</p>
      <p className="mt-1 text-xs font-bold text-[var(--color-text-muted)]">{label}</p>
    </div>
  );
}
