import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { AppCard, ErrorState, LoadingPanel, PageHeader } from '../../components/ui';
import { getInventory } from '../../lib/inventory-api';

export function LowStockPage() {
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind') ?? 'ALL';
  const maxParam = params.get('max') ?? '1';
  const maxAvailable = maxParam === '' ? undefined : Math.max(0, Number(maxParam));

  const query = useQuery({
    queryKey: ['low-stock-inventory', kind, maxParam],
    queryFn: async ({ signal }) => {
      const pageSize = 500;
      const all: Awaited<ReturnType<typeof getInventory>>['data'] = [];
      let page = 1;
      while (true) {
        const response = await getInventory({
          page,
          pageSize,
          ...(maxAvailable !== undefined ? { availableMax: maxAvailable } : {}),
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

  const update = (values: Record<string, string>) => setParams({ kind, max: maxParam, ...values });

  return (
    <div className="space-y-6">
      <PageHeader description="Consumables and assets filtered by available quantity. Enter a maximum quantity to inspect stock levels." title="Low stock" />
      <AppCard>
        <div className="grid gap-4 md:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)]">
          <label className="space-y-1.5">
            <span className="field-label">Material type</span>
            <select className="field-input" value={kind} onChange={(event) => update({ kind: event.target.value })}>
              <option value="ALL">Consumables and assets</option>
              <option value="CONSUMABLE">Consumables</option>
              <option value="ASSET">Assets</option>
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="field-label">Available quantity up to</span>
            <input aria-label="Maximum available quantity" className="field-input" min="0" onChange={(event) => update({ max: event.target.value })} placeholder="No limit" type="number" value={maxParam} />
            <span className="text-[11px] text-[var(--color-text-muted)]">Default: 1 available. Enter 0, 1, 2, 3, etc. to change the limit.</span>
          </label>
        </div>
      </AppCard>
      {query.isPending ? <LoadingPanel label="Loading complete inventory and calculating low stock" /> : query.isError ? <ErrorState message="Low stock could not be loaded." onRetry={() => void query.refetch()} /> : (
        <AppCard>
          {rows.length === 0 ? <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">No low stock items found.</div> : (
            <div className="divide-y divide-[var(--color-border)]">
              {rows.map((item) => <div className="flex items-center gap-3 py-4" key={item.materialCode}>
                <span className="grid size-9 place-items-center rounded bg-[var(--color-warning-soft)] text-[var(--color-warning)]"><AlertTriangle size={18} /></span>
                <div className="min-w-0 flex-1"><p className="font-extrabold">{item.name}</p><p className="text-xs text-[var(--color-text-muted)]">{item.category} · {item.trackingMode === 'QUANTITY' ? 'Consumable' : 'Asset'}</p></div>
                <strong className="text-sm">{item.availableQuantity} / {item.totalQuantity} available</strong>
              </div>)}
            </div>
          )}
        </AppCard>
      )}
    </div>
  );
}
