import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Search, SlidersHorizontal } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { AppCard, ErrorState, LoadingPanel, PageHeader } from '../../components/ui';
import { getInventory } from '../../lib/inventory-api';

export function LowStockPage() {
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind') ?? 'ALL';
  const maxParam = params.get('max') ?? '';
  const search = params.get('search') ?? '';
  const category = params.get('category') ?? '';
  const status = params.get('status') ?? '';
  const maxAvailable = maxParam === '' ? undefined : Math.max(0, Number(maxParam));

  const query = useQuery({
    queryKey: ['low-stock-inventory', kind, maxParam, search, category, status],
    queryFn: async ({ signal }) => {
      const pageSize = 500;
      const all: Awaited<ReturnType<typeof getInventory>>['data'] = [];
      let page = 1;
      while (true) {
        const response = await getInventory({
          page,
          pageSize,
          lowStockOnly: true,
          ...(maxAvailable !== undefined ? { availableMax: maxAvailable } : {}),
          ...(search ? { search } : {}),
          ...(category ? { category } : {}),
          ...(status ? { status: status as 'ACTIVE' | 'UNDER_MAINTENANCE' | 'SCRAP' | 'NOT_IN_USE' | 'ARCHIVED' } : {}),
          ...(kind === 'CONSUMABLE' ? { trackingMode: 'QUANTITY' } : {}),
          ...(kind === 'ASSET' ? { trackingMode: 'SERIALIZED' } : {}),
        }, signal);
        all.push(...response.data);
        if (response.data.length === 0 || response.data.length < pageSize || page >= response.meta.totalPages) break;
        page += 1;
      }
      return all;
    },
  });

  const rows = [...(query.data ?? [])].sort((a, b) => Number(a.availableQuantity) - Number(b.availableQuantity));
  const categories = [...new Set(rows.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const zeroCount = rows.filter((item) => Number(item.availableQuantity) === 0).length;
  const partialCount = rows.filter((item) => Number(item.availableQuantity) > 0 && Number(item.availableQuantity) < Number(item.totalQuantity)).length;
  const update = (values: Record<string, string>) => setParams({ kind, max: maxParam, search, category, status, ...values });

  return (
    <div className="space-y-6">
      <PageHeader description="Live inventory results from the database. Use the filters to find low-availability materials and variants." title="Low stock" />

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Matching items" value={rows.length} />
        <SummaryCard label="Zero available" value={zeroCount} />
        <SummaryCard label="Partially available" value={partialCount} />
      </div>

      <AppCard>
        <div className="mb-5 flex items-center gap-2 text-[var(--color-primary-strong)]">
          <SlidersHorizontal size={19} />
          <h2 className="font-extrabold">Inventory filters</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1.5 xl:col-span-2">
            <span className="field-label">Search material, model, code, location</span>
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 text-[var(--color-text-muted)]" size={18} /><input className="field-input pl-10" onChange={(event) => update({ search: event.target.value })} placeholder="Search inventory..." value={search} /></div>
          </label>
          <label className="space-y-1.5">
            <span className="field-label">Material type</span>
            <select className="field-input" value={kind} onChange={(event) => update({ kind: event.target.value })}><option value="ALL">All inventory</option><option value="CONSUMABLE">Consumables</option><option value="ASSET">Assets</option></select>
          </label>
          <label className="space-y-1.5">
            <span className="field-label">Available quantity up to</span>
            <input className="field-input" min="0" onChange={(event) => update({ max: event.target.value })} type="number" value={maxParam} />
          </label>
          <label className="space-y-1.5">
            <span className="field-label">Category</span>
            <select className="field-input" value={category} onChange={(event) => update({ category: event.target.value })}><option value="">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          </label>
          <label className="space-y-1.5">
            <span className="field-label">Status</span>
            <select className="field-input" value={status} onChange={(event) => update({ status: event.target.value })}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="UNDER_MAINTENANCE">Under maintenance</option><option value="SCRAP">Faulty / scrap</option><option value="NOT_IN_USE">Outdated / not in use</option></select>
          </label>
          <div className="flex items-end"><button className="button-secondary w-full" onClick={() => setParams({ kind: 'ALL', max: '', search: '', category: '', status: '' })} type="button">Reset filters</button></div>
        </div>
        <p className="mt-3 text-xs text-[var(--color-text-muted)]">Only records with available stock below total stock are shown. Enter a quantity to add an upper limit; blank shows every genuine low-stock record.</p>
      </AppCard>

      {query.isPending ? <LoadingPanel label="Fetching low-stock inventory from the database" /> : query.isError ? <ErrorState message="Low stock could not be loaded. Restart the backend if it was recently rebuilt, then try again." onRetry={() => void query.refetch()} /> : (
        <AppCard>
          <div className="mb-3 flex items-center justify-between"><h2 className="font-extrabold">Low-stock inventory</h2><span className="text-sm text-[var(--color-text-muted)]">{rows.length} records</span></div>
          {rows.length === 0 ? <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">No genuine low-stock records match these filters.</div> : <div className="divide-y divide-[var(--color-border)]">{rows.map((item) => <div className="flex flex-wrap items-center gap-3 py-4" key={item.materialCode}><span className="grid size-9 place-items-center rounded bg-[var(--color-warning-soft)] text-[var(--color-warning)]"><AlertTriangle size={18} /></span><div className="min-w-0 flex-1"><p className="font-extrabold">{item.typeModelName || item.name}</p><p className="text-xs text-[var(--color-text-muted)]">{item.materialCode} · {item.category} · {item.trackingMode === 'QUANTITY' ? 'Consumable' : 'Asset'}</p><p className="text-xs text-[var(--color-text-muted)]">{[item.location, item.block].filter(Boolean).join(' · ') || 'Location not specified'}</p></div><div className="text-right"><p className="font-extrabold">{item.availableQuantity} / {item.totalQuantity}</p><p className="text-xs text-[var(--color-text-muted)]">{item.status.replaceAll('_', ' ')}</p></div></div>)}</div>}
        </AppCard>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return <AppCard><p className="text-3xl font-extrabold text-[var(--color-primary)]">{value}</p><p className="mt-1 text-sm text-[var(--color-text-muted)]">{label}</p></AppCard>;
}
