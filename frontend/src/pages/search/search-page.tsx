import { useQuery } from '@tanstack/react-query';
import { Download, Info, Layers, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';

import {
  SEARCH_ENTITY_LABELS,
  SEARCH_FILTER_SUPPORT,
  SEARCH_STATUS_OPTIONS,
  SearchEntityTypeSchema,
  type AuthUser,
  type SearchEntityType,
  type SearchFilterKey,
  type WorkerPermission,
} from '@assetdesk/contracts';

import { useAuth } from '../../auth/auth-context';
import { hasPermission } from '../../auth/permissions';
import { ExportSheetDialog, type ActiveFilterChip } from '../../components/export-sheet-dialog';
import {
  SearchResultContent,
  rememberSearch,
  searchTypeIcons,
} from '../../components/global-search';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingPanel,
  PageHeader,
  SearchForm,
  cn,
} from '../../components/ui';
import { isApiError } from '../../lib/api-client';
import { humanizeCatalogValue } from '../../lib/catalog-format';
import { saveWorkbook } from '../../lib/excel-export';
import { getAssetDetails } from '../../lib/inventory-api';
import {
  globalSearch,
  hasSearchCriteria,
  searchFiltersFromParams,
  type GlobalSearchFilters,
} from '../../lib/search-api';

const ALL_TYPES = SearchEntityTypeSchema.options;

const TYPE_PERMISSIONS: Record<Exclude<SearchEntityType, 'EMPLOYEE'>, WorkerPermission> = {
  ISSUE: 'ISSUES_VIEW',
  MATERIAL: 'INVENTORY_VIEW',
  ASSET_UNIT: 'INVENTORY_VIEW',
  CARTRIDGE: 'CARTRIDGES_VIEW',
  CARTRIDGE_GATE_PASS: 'CARTRIDGE_GATE_PASSES_VIEW',
  GATE_PASS: 'GATE_PASS_VIEW',
  RECEIVER: 'RECEIVERS_VIEW',
};

const FILTER_LABELS: Record<SearchFilterKey, string> = {
  category: 'Category',
  trackingMode: 'Material type',
  location: 'Location',
  block: 'Block',
};

const MAX_EXPORT_PER_TYPE = 100;

function permittedSearchTypes(user: AuthUser | null): SearchEntityType[] {
  return ALL_TYPES.filter((type) =>
    type === 'EMPLOYEE' ? user?.role === 'ADMIN' : hasPermission(user, TYPE_PERMISSIONS[type]),
  );
}

/** Mirrors the server rule: a record type stays only if it supports every active filter. */
function typeSupports(type: SearchEntityType, filters: GlobalSearchFilters): boolean {
  const keys = Object.keys(SEARCH_FILTER_SUPPORT) as SearchFilterKey[];
  if (keys.some((key) => filters[key] && !SEARCH_FILTER_SUPPORT[key].includes(type))) return false;
  if (type === 'ASSET_UNIT' && filters.trackingMode === 'QUANTITY') return false;
  return !filters.status || (SEARCH_STATUS_OPTIONS[type] ?? []).includes(filters.status);
}

function filtersToParams(filters: GlobalSearchFilters): URLSearchParams {
  const parameters = new URLSearchParams();
  if (filters.q) parameters.set('q', filters.q);
  for (const type of filters.types ?? []) parameters.append('type', type);
  for (const key of [
    'dateFrom',
    'dateTo',
    'category',
    'location',
    'block',
    'trackingMode',
    'status',
  ] as const) {
    const value = filters[key];
    if (value) parameters.set(key, value);
  }
  return parameters;
}

function activeFilterCount(filters: GlobalSearchFilters): number {
  return (
    (filters.types?.length ? 1 : 0) +
    (filters.dateFrom || filters.dateTo ? 1 : 0) +
    ['category', 'location', 'block', 'trackingMode', 'status'].filter(
      (key) => filters[key as keyof GlobalSearchFilters],
    ).length
  );
}

function filterChips(
  filters: GlobalSearchFilters,
  update: (next: GlobalSearchFilters) => void,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  const without = (keys: Array<keyof GlobalSearchFilters>) => {
    const next = { ...filters };
    for (const key of keys) delete next[key];
    update(next);
  };
  if (filters.q)
    chips.push({ key: 'q', label: 'Search', value: filters.q, onRemove: () => without(['q']) });
  if (filters.types?.length) {
    chips.push({
      key: 'types',
      label: 'Records',
      value: filters.types.map((type) => SEARCH_ENTITY_LABELS[type]).join(', '),
      onRemove: () => without(['types']),
    });
  }
  if (filters.dateFrom || filters.dateTo) {
    chips.push({
      key: 'date',
      label: 'Date',
      value: `${filters.dateFrom ?? 'Any'} → ${filters.dateTo ?? 'Today'}`,
      onRemove: () => without(['dateFrom', 'dateTo']),
    });
  }
  if (filters.trackingMode) {
    chips.push({
      key: 'trackingMode',
      label: 'Material type',
      value: filters.trackingMode === 'SERIALIZED' ? 'IT Asset' : 'IT Consumable',
      onRemove: () => without(['trackingMode']),
    });
  }
  for (const key of ['category', 'block', 'location'] as const) {
    const value = filters[key];
    if (value) {
      chips.push({ key, label: FILTER_LABELS[key], value, onRemove: () => without([key]) });
    }
  }
  if (filters.status) {
    chips.push({
      key: 'status',
      label: 'Status',
      value: humanizeCatalogValue(filters.status),
      onRemove: () => without(['status']),
    });
  }
  return chips;
}

interface FilterOptions {
  categories: string[];
  blocks: string[];
  locations: string[];
}

function AppliesTo({ types }: { types: SearchEntityType[] }) {
  return (
    <p className="mt-1.5 text-[11px] font-semibold leading-4 text-[var(--color-text-muted)]">
      Applies to {types.map((type) => SEARCH_ENTITY_LABELS[type]).join(', ')}
    </p>
  );
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="search-drawer-section">
      <h3 className="search-drawer-heading">{title}</h3>
      {children}
    </section>
  );
}

function SearchFilterFields({
  value,
  onChange,
  permitted,
  options,
}: {
  value: GlobalSearchFilters;
  onChange: (next: GlobalSearchFilters) => void;
  permitted: SearchEntityType[];
  options: FilterOptions;
}) {
  const id = useId();
  const selectedTypes = value.types?.length ? value.types : permitted;
  // An undefined or empty value removes that filter.
  const set = (patch: {
    [K in keyof GlobalSearchFilters]?: GlobalSearchFilters[K] | undefined;
  }) => {
    const next: GlobalSearchFilters = { ...value };
    for (const [key, entry] of Object.entries(patch) as Array<
      [keyof GlobalSearchFilters, GlobalSearchFilters[keyof GlobalSearchFilters]]
    >) {
      if (entry === undefined || entry === '' || (Array.isArray(entry) && !entry.length)) {
        delete next[key];
      } else {
        (next as Record<string, unknown>)[key] = entry;
      }
    }
    onChange(next);
  };
  const toggleType = (type: SearchEntityType) => {
    const current = value.types?.length ? value.types : [];
    const next = current.includes(type)
      ? current.filter((item) => item !== type)
      : [...current, type];
    set({ types: next.length === permitted.length ? [] : next });
  };
  const statusTypes = selectedTypes.filter((type) => SEARCH_STATUS_OPTIONS[type]?.length);

  return (
    <div className="space-y-1">
      <DrawerSection title="Record types">
        <div className="flex flex-wrap gap-2">
          <button
            aria-pressed={!value.types?.length}
            className={cn('search-type-chip', !value.types?.length && 'search-type-chip-active')}
            onClick={() => set({ types: [] })}
            type="button"
          >
            <Layers aria-hidden="true" size={15} />
            Everything
          </button>
          {permitted.map((type) => {
            const Icon = searchTypeIcons[type];
            const active = Boolean(value.types?.includes(type));
            return (
              <button
                aria-pressed={active}
                className={cn('search-type-chip', active && 'search-type-chip-active')}
                key={type}
                onClick={() => toggleType(type)}
                type="button"
              >
                <Icon aria-hidden="true" size={15} />
                {SEARCH_ENTITY_LABELS[type]}
              </button>
            );
          })}
        </div>
      </DrawerSection>

      <DrawerSection title="Date">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5" htmlFor={`${id}-from`}>
            <span className="field-label">From</span>
            <input
              className="field-input"
              id={`${id}-from`}
              max={value.dateTo}
              onChange={(event) => set({ dateFrom: event.target.value })}
              type="date"
              value={value.dateFrom ?? ''}
            />
          </label>
          <label className="space-y-1.5" htmlFor={`${id}-to`}>
            <span className="field-label">To</span>
            <input
              className="field-input"
              id={`${id}-to`}
              min={value.dateFrom}
              onChange={(event) => set({ dateTo: event.target.value })}
              type="date"
              value={value.dateTo ?? ''}
            />
          </label>
        </div>
        <p className="mt-1.5 text-[11px] font-semibold leading-4 text-[var(--color-text-muted)]">
          Issue date for Issue Records; date added for every other record.
        </p>
      </DrawerSection>

      <DrawerSection title="Material">
        <div className="grid grid-cols-3 gap-1.5 rounded-[12px] bg-[var(--color-surface-tint)] p-1">
          {[
            { value: undefined, label: 'Any' },
            { value: 'SERIALIZED' as const, label: 'IT Asset' },
            { value: 'QUANTITY' as const, label: 'IT Consumable' },
          ].map((option) => (
            <button
              aria-pressed={value.trackingMode === option.value}
              className={cn(
                'search-segment',
                value.trackingMode === option.value && 'search-segment-active',
              )}
              key={option.label}
              onClick={() => set({ trackingMode: option.value })}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <AppliesTo types={SEARCH_FILTER_SUPPORT.trackingMode} />
        <label className="mt-4 block space-y-1.5" htmlFor={`${id}-category`}>
          <span className="field-label">Category</span>
          <input
            className="field-input"
            id={`${id}-category`}
            list={`${id}-categories`}
            onChange={(event) => set({ category: event.target.value })}
            placeholder="CPU, Printer, Cable…"
            value={value.category ?? ''}
          />
          <datalist id={`${id}-categories`}>
            {options.categories.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </label>
        <AppliesTo types={SEARCH_FILTER_SUPPORT.category} />
      </DrawerSection>

      <DrawerSection title="Place">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5" htmlFor={`${id}-block`}>
            <span className="field-label">Block</span>
            <input
              className="field-input"
              id={`${id}-block`}
              list={`${id}-blocks`}
              onChange={(event) => set({ block: event.target.value })}
              placeholder="Any block"
              value={value.block ?? ''}
            />
            <datalist id={`${id}-blocks`}>
              {options.blocks.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <label className="space-y-1.5" htmlFor={`${id}-location`}>
            <span className="field-label">Location</span>
            <input
              className="field-input"
              id={`${id}-location`}
              list={`${id}-locations`}
              onChange={(event) => set({ location: event.target.value })}
              placeholder="Any location"
              value={value.location ?? ''}
            />
            <datalist id={`${id}-locations`}>
              {options.locations.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
        </div>
        <AppliesTo types={SEARCH_FILTER_SUPPORT.location} />
      </DrawerSection>

      <DrawerSection title="Status">
        <select
          aria-label="Status"
          className="field-input"
          onChange={(event) => set({ status: event.target.value })}
          value={value.status ?? ''}
        >
          <option value="">Any status</option>
          {statusTypes.map((type) => (
            <optgroup key={type} label={SEARCH_ENTITY_LABELS[type]}>
              {(SEARCH_STATUS_OPTIONS[type] ?? []).map((status) => (
                <option key={`${type}:${status}`} value={status}>
                  {humanizeCatalogValue(status)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="mt-1.5 text-[11px] font-semibold leading-4 text-[var(--color-text-muted)]">
          Records without this status value are hidden while it is selected.
        </p>
      </DrawerSection>
    </div>
  );
}

function FilterDrawer({
  initial,
  permitted,
  options,
  onApply,
  onClose,
}: {
  initial: GlobalSearchFilters;
  permitted: SearchEntityType[];
  options: FilterOptions;
  onApply: (filters: GlobalSearchFilters) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<GlobalSearchFilters>(initial);
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);
  const requested = draft.types?.length ? draft.types : permitted;
  const included = requested.filter((type) => typeSupports(type, draft));
  const excluded = requested.filter((type) => !included.includes(type));
  const count = activeFilterCount(draft);

  return (
    <dialog
      aria-label="Search filters"
      className="search-filter-drawer"
      onCancel={onClose}
      onClose={onClose}
      ref={dialogRef}
    >
      <div className="flex h-full flex-col">
        <header className="search-drawer-header">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/75">
              Advanced search
            </p>
            <h2 className="text-xl font-extrabold text-white">Filters</h2>
            <p className="mt-1 text-xs font-semibold text-white/80">
              Filters combine together — every record shown matches all of them.
            </p>
          </div>
          <button
            aria-label="Close filters"
            className="grid size-10 place-items-center rounded-[10px] bg-white/15 text-white hover:bg-white/25"
            onClick={() => dialogRef.current?.close()}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <label className="block space-y-1.5">
            <span className="field-label">Search text (optional with filters)</span>
            <input
              className="field-input"
              onChange={(event) => setDraft((current) => ({ ...current, q: event.target.value }))}
              placeholder="Serial number, Issue ID, model, configuration…"
              value={draft.q ?? ''}
            />
          </label>
          <SearchFilterFields
            onChange={setDraft}
            options={options}
            permitted={permitted}
            value={draft}
          />
        </div>
        <div className="search-drawer-preview" role="status">
          <p className="text-xs font-extrabold text-[var(--color-primary-strong)]">
            This combination searches {included.length ? '' : 'no record types'}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {included.map((type) => (
              <span className="search-preview-chip" key={type}>
                {SEARCH_ENTITY_LABELS[type]}
              </span>
            ))}
            {excluded.map((type) => (
              <span className="search-preview-chip search-preview-chip-off" key={type}>
                {SEARCH_ENTITY_LABELS[type]}
              </span>
            ))}
          </div>
        </div>
        <footer className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] px-5 py-4">
          <Button
            onClick={() => setDraft(draft.q ? { q: draft.q } : {})}
            type="button"
            variant="quiet"
          >
            Reset filters
          </Button>
          <div className="flex gap-2">
            <Button onClick={() => dialogRef.current?.close()} type="button" variant="secondary">
              Cancel
            </Button>
            <Button
              disabled={!hasSearchCriteria(draft) || !included.length}
              onClick={() => {
                onApply({ ...draft, ...(draft.q?.trim() ? { q: draft.q.trim() } : {}) });
                dialogRef.current?.close();
              }}
              type="button"
            >
              Apply{count ? ` ${count} filter${count === 1 ? '' : 's'}` : ''}
            </Button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}

function cellDate(value: string | null): Date | string {
  return value ? new Date(value) : '';
}

export function SearchPage() {
  const { user } = useAuth();
  const [parameters, setParameters] = useSearchParams();
  const filters = useMemo(() => searchFiltersFromParams(parameters), [parameters]);
  const [drawerOpen, setDrawerOpen] = useState(parameters.get('filters') === '1');
  const [exportOpen, setExportOpen] = useState(false);
  const permitted = useMemo(() => permittedSearchTypes(user), [user]);
  const ready = hasSearchCriteria(filters);
  const singleType = filters.types?.length === 1;

  const query = useQuery({
    queryKey: ['global-search', 'page', filters],
    queryFn: ({ signal }) => globalSearch({ ...filters, limit: singleType ? 100 : 10 }, signal),
    enabled: ready,
    placeholderData: (previous) => previous,
  });
  const detailsQuery = useQuery({
    queryKey: ['asset-details'],
    queryFn: ({ signal }) => getAssetDetails(undefined, signal),
    retry: false,
  });
  const options = useMemo<FilterOptions>(() => {
    const names = (kinds: string[]) =>
      [
        ...new Set(
          (detailsQuery.data ?? []).filter((d) => kinds.includes(d.kind)).map((d) => d.name),
        ),
      ].sort((left, right) => left.localeCompare(right));
    return {
      categories: names(['ASSET_TYPE', 'CONSUMABLE_TYPE']),
      blocks: names(['BLOCK']),
      locations: names(['LOCATION', 'STORE']),
    };
  }, [detailsQuery.data]);

  useEffect(() => {
    if (filters.q) rememberSearch(filters.q);
  }, [filters.q]);

  function update(next: GlobalSearchFilters) {
    setParameters(filtersToParams(next));
  }

  const chips = filterChips(filters, update);
  const pageChips = chips.filter((chip) => chip.key !== 'q');
  const filterCount = activeFilterCount(filters);
  const data = ready ? query.data : undefined;

  async function downloadResults() {
    const result = await globalSearch({ ...filters, limit: MAX_EXPORT_PER_TYPE });
    const rows = result.groups.flatMap((group) =>
      group.results.map((item) => [
        group.label,
        item.title,
        item.subtitle ?? '',
        item.status ? humanizeCatalogValue(item.status) : '',
        item.matchedField ?? '',
        item.matchedValue ?? '',
        item.path.join(' > '),
        cellDate(item.occurredAt),
        `${window.location.origin}${item.href}`,
      ]),
    );
    if (!rows.length) throw new Error('No records match these filters.');
    return { rows, result };
  }

  const exportColumns = [
    { key: 'type', label: 'Record type', width: 22 },
    { key: 'title', label: 'Record', width: 34 },
    { key: 'details', label: 'Details', width: 44 },
    { key: 'status', label: 'Status', width: 18 },
    { key: 'matchedField', label: 'Matched field', width: 20 },
    { key: 'matchedValue', label: 'Matched value', width: 28 },
    { key: 'path', label: 'Found in (path)', width: 60 },
    { key: 'date', label: 'Date', width: 20 },
    { key: 'link', label: 'Link', width: 50 },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          <>
            <Button onClick={() => setDrawerOpen(true)} type="button" variant="secondary">
              <SlidersHorizontal aria-hidden="true" size={18} />
              Filters
              {filterCount ? (
                <span className="grid size-5 place-items-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white">
                  {filterCount}
                </span>
              ) : null}
            </Button>
            <Button disabled={!data?.totalCount} onClick={() => setExportOpen(true)} type="button">
              <Download aria-hidden="true" size={18} />
              Download sheet
            </Button>
          </>
        }
        description="Search every record you can access — serial numbers, asset tags, Issue IDs, models, configurations, cartridges, gate passes, receivers and employees."
        title="Search"
      />

      <section className="rounded-[14px] border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-card)] sm:p-4">
        <SearchForm
          id="search-page-input"
          key={filters.q ?? ''}
          label="Search all records"
          onSearch={(value) => update({ ...filters, q: value })}
          placeholder="Serial number, Issue ID, model, configuration, cartridge, gate pass…"
          value={filters.q ?? ''}
        />
        {pageChips.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {pageChips.map((chip) => (
              <span className="export-filter-chip" key={chip.key}>
                <span className="text-[var(--color-text-muted)]">{chip.label}:</span>
                <span className="font-extrabold">{chip.value}</span>
                <button aria-label={`Remove ${chip.label}`} onClick={chip.onRemove} type="button">
                  <X aria-hidden="true" size={13} />
                </button>
              </span>
            ))}
            <button
              className="button-quiet min-h-9 text-xs"
              onClick={() => update(filters.q ? { q: filters.q } : {})}
              type="button"
            >
              Clear filters
            </button>
          </div>
        ) : null}
        {data?.groups.length ? (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-3">
            {data.groups.map((group) => {
              const Icon = searchTypeIcons[group.type];
              const only = filters.types?.length === 1 && filters.types[0] === group.type;
              return (
                <button
                  aria-pressed={only}
                  className={cn('search-type-chip', only && 'search-type-chip-active')}
                  key={group.type}
                  onClick={() => update({ ...filters, types: only ? [] : [group.type] })}
                  type="button"
                >
                  <Icon aria-hidden="true" size={15} />
                  {group.label}
                  <span className="notification-tab-count">{group.total}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </section>

      {data?.excludedTypes.length ? (
        <p className="flex items-start gap-2 rounded-[12px] border border-[var(--color-info-soft)] bg-[var(--color-info-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-info)]">
          <Info aria-hidden="true" className="mt-0.5 shrink-0" size={17} />
          {data.excludedTypes.map((type) => SEARCH_ENTITY_LABELS[type]).join(', ')}{' '}
          {data.excludedTypes.length === 1 ? 'is' : 'are'} not searched because the selected filters
          do not apply to {data.excludedTypes.length === 1 ? 'it' : 'them'}.
        </p>
      ) : null}

      {!ready ? (
        <EmptyState
          action={
            <Button onClick={() => setDrawerOpen(true)} type="button" variant="secondary">
              <SlidersHorizontal aria-hidden="true" size={18} />
              Open filters
            </Button>
          }
          message="Type at least 2 characters, or open Filters to browse by date, category, block, location or status."
          title="Search everything in AssetDesk"
        />
      ) : query.isPending ? (
        <LoadingPanel label="Searching records" />
      ) : query.isError ? (
        <ErrorState
          message={isApiError(query.error) ? query.error.message : 'Search could not be completed.'}
          onRetry={() => void query.refetch()}
        />
      ) : !data?.groups.length ? (
        <EmptyState
          action={
            filterCount ? (
              <Button onClick={() => update(filters.q ? { q: filters.q } : {})} variant="secondary">
                Remove filters
              </Button>
            ) : undefined
          }
          message="Try part of the serial number, a different spelling, or fewer filters."
          title="No records match"
        />
      ) : (
        <div className="space-y-4">
          {data.groups.map((group) => {
            const Icon = searchTypeIcons[group.type];
            return (
              <section
                aria-labelledby={`search-group-${group.type}`}
                className="overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)]"
                key={group.type}
              >
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-primary-soft)] px-4 py-3">
                  <h2
                    className="flex items-center gap-2 font-extrabold text-[var(--color-primary-strong)]"
                    id={`search-group-${group.type}`}
                  >
                    <Icon aria-hidden="true" size={18} />
                    {group.label}
                    <span className="text-sm font-bold text-[var(--color-text-muted)]">
                      {group.results.length < group.total
                        ? `${group.results.length} of ${group.total}`
                        : group.total}
                    </span>
                  </h2>
                  {group.total > group.results.length && !singleType ? (
                    <button
                      className="button-quiet min-h-9 text-xs"
                      onClick={() => update({ ...filters, types: [group.type] })}
                      type="button"
                    >
                      Show all {group.total}
                    </button>
                  ) : group.total > group.results.length ? (
                    <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                      Showing first {group.results.length}. Add filters to narrow.
                    </span>
                  ) : null}
                </header>
                <ul className="divide-y divide-[var(--color-border)]">
                  {group.results.map((result) => (
                    <li key={result.key}>
                      <Link className="search-result-row search-result-page-row" to={result.href}>
                        <SearchResultContent result={result} search={filters.q ?? ''} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {drawerOpen ? (
        <FilterDrawer
          initial={filters}
          onApply={update}
          onClose={() => {
            setDrawerOpen(false);
            if (parameters.has('filters')) {
              const next = new URLSearchParams(parameters);
              next.delete('filters');
              setParameters(next, { replace: true });
            }
          }}
          options={options}
          permitted={permitted}
        />
      ) : null}

      {exportOpen && data ? (
        <ExportSheetDialog
          activeFilters={chips}
          allowAllScope={false}
          columns={exportColumns.map(({ key, label }) => ({ key, label }))}
          defaultColumns={exportColumns.map((column) => column.key)}
          defaultFileName={`assetdesk-search-${filters.q ? filters.q.replace(/\s+/g, '-') : 'filtered'}-${new Date().toISOString().slice(0, 10)}`}
          description={`Every matching record with its location path. Up to ${MAX_EXPORT_PER_TYPE} rows per record type.`}
          filters={
            <SearchFilterFields
              onChange={update}
              options={options}
              permitted={permitted}
              value={filters}
            />
          }
          onClearFilters={() => update(filters.q ? { q: filters.q } : {})}
          onClose={() => setExportOpen(false)}
          onDownload={async (request) => {
            const { rows } = await downloadResults();
            const indexes = request.columns.map((key) =>
              exportColumns.findIndex((column) => column.key === key),
            );
            await saveWorkbook({
              fileName: request.fileName,
              sheetName: 'Search results',
              columns: indexes.map((index) => exportColumns[index]!),
              rows: rows.map((row) => indexes.map((index) => row[index])),
              filterSummary: chips.map((chip) => ({ label: chip.label, value: chip.value })),
            });
          }}
          recordCount={query.isFetching ? null : data.totalCount}
          recordLabel="records"
          storageKey="assetdesk:search-export-columns"
          title="Download search results"
        />
      ) : null}
    </div>
  );
}
