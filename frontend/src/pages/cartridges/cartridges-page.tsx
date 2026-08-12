import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router';
import { MoreVertical, Plus, Printer, Send, RotateCcw, Eye } from 'lucide-react';
import {
  AppCard,
  ErrorSummary,
  FilterPopover,
  LoadingPanel,
  PageHeader,
  SearchForm,
} from '../../components/ui';
import { getCartridges } from '../../lib/cartridges-api';

const statusLabels: Record<string, string> = {
  FILLED_AVAILABLE: 'Filled available',
  ISSUED: 'Issued',
  EMPTY: 'Empty',
  DEFECTIVE: 'Defective',
  READY_FOR_GATE_OUT: 'Ready for Gate Out',
  WITH_VENDOR: 'With vendor',
  QC_PENDING: 'QC pending',
  REFILL_FAILED: 'Refill failed',
  DAMAGED: 'Damaged',
  SCRAP_PENDING: 'Scrap pending',
  SCRAPPED: 'Scrapped',
};
export function CartridgesPage() {
  const location = useLocation();
  const [search, setSearch] = useState(new URLSearchParams(location.search).get('search') ?? '');
  const [status, setStatus] = useState(new URLSearchParams(location.search).get('status') ?? '');
  useEffect(() => {
    const next = new URLSearchParams(location.search);
    setSearch(next.get('search') ?? '');
    setStatus(next.get('status') ?? '');
  }, [location.search]);
  const query = useQuery({
    queryKey: ['cartridges', { search, status }],
    queryFn: () => getCartridges({ search, status }),
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="All Cartridges"
        description="Track every serialized cartridge, its current holder, condition, refill cycle, and latest movement."
        actions={
          <>
            <Link className="button-primary" to="/cartridges/new">
              <Plus size={18} />
              Add cartridges
            </Link>
            <GlobalActions />
          </>
        }
      />
      <AppCard>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
          <SearchForm
            className="flex-1"
            id="cartridge-search"
            label="Search cartridges"
            placeholder="Serial number, model, employee or vendor"
            value={search}
            onSearch={setSearch}
          />
          <FilterPopover activeCount={status ? 1 : 0} onClear={() => setStatus('')}>
            <label className="field-label" htmlFor="cartridge-status">
              Status
            </label>
            <select
              className="field-input"
              id="cartridge-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Any status</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FilterPopover>
        </div>
      </AppCard>
      {query.isPending ? (
        <LoadingPanel label="Loading cartridges" />
      ) : query.isError ? (
        <ErrorSummary message="Cartridge data could not be loaded." />
      ) : (
        <AppCard className="overflow-x-auto p-0 sm:p-0">
          <table className="min-w-full">
            <caption className="sr-only">Cartridge register</caption>
            <thead>
              <tr className="border-b text-left text-xs uppercase text-[var(--color-text-muted)]">
                <th className="px-4 py-3">Serial</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Holder / Location</th>
                <th className="px-4 py-3">Refills</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {query.data?.data.map((item) => (
                <tr className="border-b last:border-0" key={item.id}>
                  <td className="px-4 py-4 font-bold text-[var(--color-primary-strong)]">
                    {item.serialNumber}
                  </td>
                  <td className="px-4 py-4 text-sm">
                    {item.model} · {item.colour}
                  </td>
                  <td className="px-4 py-4">
                    <span className="rounded-full bg-[var(--color-primary-soft)] px-2.5 py-1 text-xs font-bold text-[var(--color-primary)]">
                      {statusLabels[item.status]}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm">{item.currentHolderName ?? item.location}</td>
                  <td className="px-4 py-4 text-sm">{item.refillCount}</td>
                  <td className="px-4 py-4">
                    <RowActions serial={item.serialNumber} status={item.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {query.data?.data.length === 0 ? (
            <p className="p-8 text-center text-sm text-[var(--color-text-muted)]">
              No cartridges match the current search and filters.
            </p>
          ) : null}
        </AppCard>
      )}
    </div>
  );
}
function RowActions({ serial, status }: { serial: string; status: string }) {
  return (
    <details className="relative" data-action-menu>
      <summary
        aria-label={`Actions for ${serial}`}
        className="button-quiet cursor-pointer list-none p-2"
      >
        <MoreVertical size={18} />
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-52 rounded-[8px] border bg-white p-1 shadow-[var(--shadow-overlay)]">
        <Link className="menu-item" to={`/cartridges/${encodeURIComponent(serial)}`}>
          <Eye size={16} />
          View details
        </Link>
        {status === 'FILLED_AVAILABLE' ? (
          <Link
            className="menu-item"
            to={`/cartridges/issues/new?serial=${encodeURIComponent(serial)}`}
          >
            <Send size={16} />
            Issue cartridge
          </Link>
        ) : null}
        {status === 'ISSUED' ? (
          <Link
            className="menu-item"
            to={`/cartridges/returns/new?serial=${encodeURIComponent(serial)}`}
          >
            <RotateCcw size={16} />
            Record return
          </Link>
        ) : null}
      </div>
    </details>
  );
}
function GlobalActions() {
  return (
    <details className="relative" data-action-menu>
      <summary
        aria-label="Cartridge page actions"
        className="button-secondary cursor-pointer list-none"
      >
        <MoreVertical size={18} />
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-56 rounded-[8px] border bg-white p-1 shadow-[var(--shadow-overlay)]">
        <Link className="menu-item" to="/cartridges/gate-passes/new">
          <Printer size={16} />
          Create Gate Pass
        </Link>
        <button className="menu-item w-full" onClick={() => window.print()} type="button">
          <Printer size={16} />
          Print current view
        </button>
      </div>
    </details>
  );
}
