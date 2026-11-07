import { Check, Download, FileSpreadsheet, Filter, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

import { Button, ErrorSummary, cn } from './ui';

export interface ExportColumn {
  key: string;
  label: string;
  group?: string;
}

export interface ActiveFilterChip {
  key: string;
  label: string;
  value: string;
  onRemove?: () => void;
}

export interface ExportLayoutOption {
  value: string;
  label: string;
  description: string;
}

export interface ExportRequest {
  scope: 'FILTERED' | 'ALL';
  columns: string[];
  layout: string;
  fileName: string;
}

function storedColumns(storageKey: string, columns: ExportColumn[], fallback: string[]) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null');
    if (!Array.isArray(stored)) return fallback;
    const valid = stored.filter((key): key is string =>
      columns.some((column) => column.key === key),
    );
    return valid.length ? valid : fallback;
  } catch {
    return fallback;
  }
}

export function ExportSheetDialog({
  title,
  description,
  recordLabel,
  recordCount,
  activeFilters,
  onClearFilters,
  filters,
  columns,
  defaultColumns,
  requiredColumns = [],
  storageKey,
  layoutOptions,
  defaultFileName,
  allowAllScope = true,
  onDownload,
  onClose,
}: {
  title: string;
  description: string;
  recordLabel: string;
  recordCount: number | null;
  activeFilters: ActiveFilterChip[];
  onClearFilters?: () => void;
  filters?: ReactNode;
  columns: ExportColumn[];
  defaultColumns: string[];
  requiredColumns?: string[];
  storageKey: string;
  layoutOptions?: ExportLayoutOption[];
  defaultFileName: string;
  allowAllScope?: boolean;
  onDownload: (request: ExportRequest) => Promise<void>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileNameId = useId();
  const [selected, setSelected] = useState<string[]>(() =>
    storedColumns(storageKey, columns, defaultColumns),
  );
  const [scope, setScope] = useState<'FILTERED' | 'ALL'>('FILTERED');
  const [layout, setLayout] = useState(layoutOptions?.[0]?.value ?? 'DEFAULT');
  const [fileName, setFileName] = useState(defaultFileName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(selected));
    } catch {
      // Column choices are a convenience and may be unavailable in private browsing.
    }
  }, [selected, storageKey]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, ExportColumn[]>();
    for (const column of columns) {
      const key = column.group ?? 'Columns';
      byGroup.set(key, [...(byGroup.get(key) ?? []), column]);
    }
    return [...byGroup.entries()];
  }, [columns]);

  const ordered = columns
    .map((column) => column.key)
    .filter((key) => selected.includes(key) || requiredColumns.includes(key));

  function toggle(key: string) {
    if (requiredColumns.includes(key)) return;
    setSelected((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
    );
  }

  async function download() {
    if (!ordered.length) {
      setError('Choose at least one column for the sheet.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onDownload({ scope, columns: ordered, layout, fileName });
      dialogRef.current?.close();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The sheet could not be downloaded.');
    } finally {
      setPending(false);
    }
  }

  const filteredDisabled = scope === 'ALL';

  return (
    <dialog
      aria-label={title}
      className="export-sheet-dialog"
      onCancel={onClose}
      onClose={onClose}
      ref={dialogRef}
    >
      <div className="flex max-h-[min(92dvh,900px)] flex-col">
        <header className="flex items-start gap-3 border-b border-[var(--color-border)] px-5 py-4 sm:px-6">
          <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-[var(--color-success-soft)] text-[var(--color-success)]">
            <FileSpreadsheet aria-hidden="true" size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">{title}</h2>
            <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">{description}</p>
          </div>
          <button
            aria-label="Close"
            className="icon-button"
            onClick={() => dialogRef.current?.close()}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <section
            aria-labelledby={`${fileNameId}-filters`}
            className={cn(
              'space-y-4 border-b border-[var(--color-border)] p-5 sm:p-6 lg:border-b-0 lg:border-r',
              filteredDisabled && 'opacity-55',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="export-step-title" id={`${fileNameId}-filters`}>
                  <span className="export-step-number">1</span>
                  Filters in this sheet
                </h3>
                <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
                  {filteredDisabled
                    ? 'Ignored — "All data" downloads every record you can access.'
                    : 'Change filters here; the page list updates with them.'}
                </p>
              </div>
              {activeFilters.length && onClearFilters && !filteredDisabled ? (
                <button
                  className="button-quiet min-h-9 text-xs"
                  onClick={onClearFilters}
                  type="button"
                >
                  Clear all
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {activeFilters.length ? (
                activeFilters.map((chip) => (
                  <span className="export-filter-chip" key={chip.key}>
                    <span className="text-[var(--color-text-muted)]">{chip.label}:</span>
                    <span className="font-extrabold">{chip.value}</span>
                    {chip.onRemove && !filteredDisabled ? (
                      <button
                        aria-label={`Remove ${chip.label} filter`}
                        onClick={chip.onRemove}
                        type="button"
                      >
                        <X aria-hidden="true" size={13} />
                      </button>
                    ) : null}
                  </span>
                ))
              ) : (
                <p className="rounded-[10px] bg-[var(--color-surface-tint)] px-3 py-2 text-sm font-semibold text-[var(--color-text-muted)]">
                  No filters applied — every record will be included.
                </p>
              )}
            </div>
            {filters && !filteredDisabled ? (
              <details className="export-filter-fields" open={activeFilters.length === 0}>
                <summary>
                  <Filter aria-hidden="true" size={16} />
                  Add or change filters
                </summary>
                <div className="space-y-4 pt-4">{filters}</div>
              </details>
            ) : null}
            <p className="text-sm font-bold text-[var(--color-primary-strong)]" role="status">
              {recordCount === null
                ? `Counting ${recordLabel}…`
                : `${recordCount.toLocaleString('en-IN')} ${recordLabel} match`}
            </p>
          </section>

          <section aria-labelledby={`${fileNameId}-columns`} className="space-y-4 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="export-step-title" id={`${fileNameId}-columns`}>
                <span className="export-step-number">2</span>
                Columns ({ordered.length}/{columns.length})
              </h3>
              <div className="flex gap-1">
                <button
                  className="button-quiet min-h-9 px-2 text-xs"
                  onClick={() => setSelected(columns.map((column) => column.key))}
                  type="button"
                >
                  All
                </button>
                <button
                  className="button-quiet min-h-9 px-2 text-xs"
                  onClick={() => setSelected(defaultColumns)}
                  type="button"
                >
                  Default
                </button>
              </div>
            </div>
            {groups.map(([group, groupColumns]) => (
              <fieldset className="space-y-1.5" key={group}>
                {groups.length > 1 ? (
                  <legend className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                    {group}
                  </legend>
                ) : (
                  <legend className="sr-only">{group}</legend>
                )}
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {groupColumns.map((column) => {
                    const required = requiredColumns.includes(column.key);
                    const checked = required || selected.includes(column.key);
                    return (
                      <label
                        className={`issue-column-option ${checked ? 'issue-column-option-selected' : ''}`}
                        key={column.key}
                      >
                        <input
                          checked={checked}
                          className="sr-only"
                          disabled={required}
                          onChange={() => toggle(column.key)}
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
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            {layoutOptions?.length ? (
              <fieldset className="space-y-2 border-t border-[var(--color-border)] pt-4">
                <legend className="export-step-title">Row layout</legend>
                {layoutOptions.map((option) => (
                  <label
                    className={cn(
                      'export-choice',
                      layout === option.value && 'export-choice-active',
                    )}
                    key={option.value}
                  >
                    <input
                      checked={layout === option.value}
                      className="mt-1 accent-[var(--color-primary)]"
                      name={`${fileNameId}-layout`}
                      onChange={() => setLayout(option.value)}
                      type="radio"
                    />
                    <span>
                      <span className="block text-sm font-extrabold text-[var(--color-text-strong)]">
                        {option.label}
                      </span>
                      <span className="block text-xs leading-5 text-[var(--color-text-muted)]">
                        {option.description}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : null}
          </section>
        </div>

        <footer className="space-y-3 border-t border-[var(--color-border)] bg-[var(--color-surface-tint)] px-5 py-4 sm:px-6">
          {error ? <ErrorSummary message={error} title="Download failed" /> : null}
          <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-end">
            <fieldset className="flex flex-wrap gap-2">
              <legend className="export-step-title mb-2">
                <span className="export-step-number">3</span>
                Download
              </legend>
              <label className={cn('export-scope', scope === 'FILTERED' && 'export-scope-active')}>
                <input
                  checked={scope === 'FILTERED'}
                  className="accent-[var(--color-primary)]"
                  name={`${fileNameId}-scope`}
                  onChange={() => setScope('FILTERED')}
                  type="radio"
                />
                Filtered data
                {recordCount !== null ? ` (${recordCount.toLocaleString('en-IN')})` : ''}
              </label>
              {allowAllScope ? (
                <label className={cn('export-scope', scope === 'ALL' && 'export-scope-active')}>
                  <input
                    checked={scope === 'ALL'}
                    className="accent-[var(--color-primary)]"
                    name={`${fileNameId}-scope`}
                    onChange={() => setScope('ALL')}
                    type="radio"
                  />
                  All data
                </label>
              ) : null}
            </fieldset>
            <div className="space-y-1.5">
              <label className="field-label" htmlFor={fileNameId}>
                File name
              </label>
              <div className="flex items-center gap-2">
                <input
                  className="field-input"
                  id={fileNameId}
                  onChange={(event) => setFileName(event.target.value)}
                  value={fileName}
                />
                <span className="text-sm font-bold text-[var(--color-text-muted)]">.xlsx</span>
              </div>
            </div>
            <div className="flex gap-2 md:justify-end">
              <Button onClick={() => dialogRef.current?.close()} type="button" variant="secondary">
                Cancel
              </Button>
              <Button
                disabled={!ordered.length || (scope === 'FILTERED' && recordCount === 0)}
                loading={pending}
                onClick={() => void download()}
                type="button"
              >
                {!pending ? <Download aria-hidden="true" size={18} /> : null}
                {pending ? 'Preparing sheet…' : 'Download Excel'}
              </Button>
            </div>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
