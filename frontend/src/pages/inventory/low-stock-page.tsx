import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { AppCard, ErrorState, LoadingPanel, PageHeader } from '../../components/ui';
import { getInventory } from '../../lib/inventory-api';

export function LowStockPage() {
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind') ?? 'ALL';
  const percent = Math.min(100, Math.max(0, Number(params.get('percent') ?? 100)));
  const query = useQuery({ queryKey: ['low-stock'], queryFn: async ({ signal }) => {
    const pageSize = 500;
    const all: Awaited<ReturnType<typeof getInventory>>['data'] = [];
    let page = 1;
    while (true) {
      const response = await getInventory({ page, pageSize }, signal);
      all.push(...response.data);
      if (response.data.length === 0 || response.data.length < pageSize || page >= response.meta.totalPages) break;
      page += 1;
    }
    return all;
  } });
  const rows = (query.data ?? []).filter(item => { const total = Number(item.totalQuantity); const available = Number(item.availableQuantity); const typeMatches = kind === 'ALL' || (kind === 'CONSUMABLE' ? item.trackingMode === 'QUANTITY' : item.trackingMode === 'SERIALIZED'); const lowAtThreshold = percent >= 100 ? available < total || (total === 0 && available === 0) : available <= total * percent / 100; return typeMatches && total >= 0 && available >= 0 && lowAtThreshold; });
  const update = (values: Record<string, string>) => setParams({ kind, percent: String(percent), ...values });
  return <div className="space-y-6"><PageHeader description={`Inventory at or below ${percent}% available stock. Change the percentage to inspect every low-stock level.`} title="Low stock" /><AppCard><div className="grid gap-4 md:grid-cols-[minmax(220px,1fr)_minmax(320px,2fr)]"><label className="space-y-1.5"><span className="field-label">Material type</span><select className="field-input" value={kind} onChange={e => update({ kind: e.target.value })}><option value="ALL">Consumables and assets</option><option value="CONSUMABLE">Consumables</option><option value="ASSET">Assets</option></select></label><label className="space-y-1.5"><span className="flex items-center justify-between"><span className="field-label">Low-stock threshold</span><strong className="text-sm text-[var(--color-primary)]">{percent}%</strong></span><input aria-label="Low stock percentage threshold" className="w-full accent-[var(--color-primary)]" max="100" min="0" onChange={e => update({ percent: e.target.value })} type="range" value={percent} /><span className="flex justify-between text-[11px] text-[var(--color-text-muted)]"><span>0% = only zero available</span><span>100% = all partially/fully issued</span></span></label></div></AppCard>{query.isPending ? <LoadingPanel label="Loading complete inventory and calculating low stock" /> : query.isError ? <ErrorState message="Low stock could not be loaded." onRetry={() => void query.refetch()} /> : <AppCard>{rows.length === 0 ? <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">No low stock items found at {percent}%.</div> : <div className="divide-y divide-[var(--color-border)]">{rows.map(item => <div className="flex items-center gap-3 py-4" key={item.materialCode}><span className="grid size-9 place-items-center rounded bg-[var(--color-warning-soft)] text-[var(--color-warning)]"><AlertTriangle size={18} /></span><div className="min-w-0 flex-1"><p className="font-extrabold">{item.name}</p><p className="text-xs text-[var(--color-text-muted)]">{item.category} · {item.trackingMode === 'QUANTITY' ? 'Consumable' : 'Asset'}</p></div><strong className="text-sm">{item.availableQuantity} / {item.totalQuantity} available</strong></div>)}</div>}</AppCard>}</div>;
}
