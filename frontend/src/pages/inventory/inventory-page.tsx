import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, MoreVertical, PackagePlus, PackageSearch, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';

import type { Material, MaterialStatus, ReturnPolicy, TrackingMode } from '@assetdesk/contracts';

import { useAuth } from '../../auth/auth-context';
import { hasPermission } from '../../auth/permissions';
import { CatalogBadge, PageCount } from '../../components/catalog-ui';
import {
  Button,
  EmptyState,
  ErrorState,
  ErrorSummary,
  FilterPopover,
  LoadingPanel,
  PageHeader,
  SearchForm,
} from '../../components/ui';
import { deleteMaterial, downloadInventoryCsv, getInventory } from '../../lib/inventory-api';
import { isApiError } from '../../lib/api-client';
import { humanizeCatalogValue } from '../../lib/catalog-format';

function materialStatus(value: string): MaterialStatus | undefined {
  return value === 'ACTIVE' || value === 'ARCHIVED' ? value : undefined;
}

function trackingMode(value: string): TrackingMode | undefined {
  return value === 'SERIALIZED' || value === 'QUANTITY' ? value : undefined;
}

function returnPolicy(value: string): ReturnPolicy | undefined {
  return value === 'REUSABLE' || value === 'CONSUMABLE' ? value : undefined;
}

type InventoryStockState = 'AVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'ISSUED' | 'FULLY_ISSUED';

function stockState(value: string): InventoryStockState | undefined {
  return ['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK', 'ISSUED', 'FULLY_ISSUED'].includes(value)
    ? (value as InventoryStockState)
    : undefined;
}

function quantityLabel(material: Material): string {
  if (material.trackingMode === 'SERIALIZED') {
    return `${material.availableQuantity} of ${material.totalQuantity} units available`;
  }
  return `${material.availableQuantity} of ${material.totalQuantity} ${material.unitLabel ?? 'units'} available`;
}

function inactiveQuantity(material: Material): number {
  return Math.max(0, material.totalQuantity - material.availableQuantity - material.issuedQuantity);
}

interface MaterialGroup {
  category: string;
  materials: Material[];
  totalQuantity: number;
  availableQuantity: number;
  issuedQuantity: number;
}

function groupMaterials(materials: Material[]): MaterialGroup[] {
  const groups = new Map<string, MaterialGroup>();
  for (const material of materials) {
    const category = material.category || 'Unassigned asset type';
    const group =
      groups.get(category) ??
      {
        category,
        materials: [],
        totalQuantity: 0,
        availableQuantity: 0,
        issuedQuantity: 0,
      };
    group.materials.push(material);
    group.totalQuantity += material.totalQuantity;
    group.availableQuantity += material.availableQuantity;
    group.issuedQuantity += material.issuedQuantity;
    groups.set(category, group);
  }
  return [...groups.values()].sort((left, right) => left.category.localeCompare(right.category));
}

function materialStatsLabel(material: Material): string {
  if (material.status === 'ARCHIVED') return 'Archived';
  if (material.availableQuantity === 0) return 'Out of stock';
  if (material.issuedQuantity > 0 && material.issuedQuantity === material.totalQuantity) {
    return 'Fully issued';
  }
  if (material.availableQuantity <= Math.max(1, Math.ceil(material.totalQuantity * 0.2))) {
    return 'Low stock';
  }
  if (material.issuedQuantity > 0) return 'Partially issued';
  return 'Available';
}

export function InventoryPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [parameters, setParameters] = useSearchParams();
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);
  const [viewMaterial, setViewMaterial] = useState<Material | null>(null);
  const [downloading, setDownloading] = useState(false);
  const page = Math.max(1, Number(parameters.get('page')) || 1);
  const search = parameters.get('search') ?? '';
  const category = parameters.get('category') ?? '';
  const status = materialStatus(parameters.get('status') ?? '');
  const mode = trackingMode(parameters.get('trackingMode') ?? '');
  const policy = returnPolicy(parameters.get('returnPolicy') ?? '');
  const stock = stockState(parameters.get('stockState') ?? '');
  const admin = hasPermission(user, 'INVENTORY_MANAGE');
  const canExportInventory = hasPermission(user, 'INVENTORY_EXPORT');

  const query = useQuery({
    queryKey: ['inventory', { page, search, category, status, mode, policy, stock }],
    queryFn: ({ signal }) =>
      getInventory(
        {
          page,
          ...(search ? { search } : {}),
          ...(category ? { category } : {}),
          ...(status ? { status } : {}),
          ...(mode ? { trackingMode: mode } : {}),
          ...(policy ? { returnPolicy: policy } : {}),
          ...(stock ? { stockState: stock } : {}),
        },
        signal,
      ),
    placeholderData: (previous) => previous,
  });

  function updateParameters(updates: Record<string, string>) {
    const next = new URLSearchParams(parameters);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!Object.hasOwn(updates, 'page')) next.set('page', '1');
    setParameters(next);
  }

  const materials = query.data?.data ?? [];
  const materialGroups = groupMaterials(materials);
  const filtered = Boolean(search || category || status || mode || policy || stock);
  const deleteMutation = useMutation({
    mutationFn: (material: Material) => deleteMaterial(material.materialCode),
    onSuccess: async () => {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (error) => {
      setActionError(
        isApiError(error)
          ? error.message
          : 'This material could not be deleted. Archive it if it has history.',
      );
    },
  });

  function confirmDelete(material: Material) {
    setActionError(null);
    setDeleteTarget(material);
  }

  async function downloadData() {
    setActionError(null);
    setDownloading(true);
    try {
      const blob = await downloadInventoryCsv({
        ...(search ? { search } : {}),
        ...(category ? { category } : {}),
        ...(status ? { status } : {}),
        ...(mode ? { trackingMode: mode } : {}),
        ...(policy ? { returnPolicy: policy } : {}),
        ...(stock ? { stockState: stock } : {}),
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'assetdesk-inventory.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setActionError('Inventory data could not be downloaded.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            {canExportInventory ? <Button loading={downloading} onClick={() => void downloadData()} type="button" variant="secondary">
              <Download aria-hidden="true" size={18} />
              {downloading ? 'Downloading...' : 'Download data'}
            </Button> : null}
            {admin ? (
              <Link aria-label="Add material to inventory" className="button-primary" to="/inventory/new">
                <PackagePlus aria-hidden="true" size={18} />
                Add material
              </Link>
            ) : null}
          </div>
        }
        description={
          admin
            ? 'Track IT Assets, IT Consumables, availability, and stock health.'
            : 'Search current university material availability.'
        }
        title="Inventory"
      />
      {actionError ? <ErrorSummary message={actionError} title="Action failed" /> : null}

      <section className="rounded-[14px] border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-card)] sm:p-4">
        <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <SearchForm
            debounceMs={300}
            id="inventory-search"
            key={search}
            label="Search Inventory"
            onSearch={(value) => updateParameters({ search: value })}
            placeholder="IT asset, code, asset type, location or description"
            value={search}
          />
          <FilterPopover
            activeCount={[category, status, mode, policy, stock].filter(Boolean).length}
            onClear={() =>
              updateParameters({
                category: '',
                status: '',
                trackingMode: '',
                returnPolicy: '',
                stockState: '',
              })
            }
          >
            <FilterField label="Asset type">
              <SearchForm
                debounceMs={300}
                id="inventory-category-filter"
                key={category}
                label="Filter by asset type"
                onSearch={(value) => updateParameters({ category: value })}
                placeholder="Any asset type"
                value={category}
              />
            </FilterField>
            {admin ? (
              <FilterField label="Status">
                <FilterSelect
                  id="inventory-status-filter"
                  label="Filter by status"
                  onChange={(value) => updateParameters({ status: value })}
                  value={status ?? ''}
                >
                  <option value="">Any status</option>
                  <option value="ACTIVE">Active</option>
                  <option value="ARCHIVED">Archived</option>
                </FilterSelect>
              </FilterField>
            ) : null}
            <FilterField label="Stats">
              <FilterSelect
                id="inventory-stock-filter"
                label="Filter by stats"
                onChange={(value) => updateParameters({ stockState: value })}
                value={stock ?? ''}
              >
                <option value="">Any stats</option>
                <option value="AVAILABLE">Available stock</option>
                <option value="LOW_STOCK">Low stock</option>
                <option value="OUT_OF_STOCK">Out of stock</option>
                <option value="ISSUED">Issued stock</option>
                <option value="FULLY_ISSUED">Fully issued</option>
              </FilterSelect>
            </FilterField>
            <FilterField label="Material type">
              <FilterSelect
                id="inventory-mode-filter"
                label="Filter by material type"
                onChange={(value) => updateParameters({ trackingMode: value })}
                value={mode ?? ''}
              >
                <option value="">Any material type</option>
                <option value="SERIALIZED">IT Assets</option>
                <option value="QUANTITY">IT Consumables</option>
              </FilterSelect>
            </FilterField>
            <FilterField label="Return policy">
              <FilterSelect
                id="inventory-policy-filter"
                label="Filter by return policy"
                onChange={(value) => updateParameters({ returnPolicy: value })}
                value={policy ?? ''}
              >
                <option value="">Any return policy</option>
                <option value="REUSABLE">Reusable</option>
                <option value="CONSUMABLE">Consumable</option>
              </FilterSelect>
            </FilterField>
          </FilterPopover>
        </div>
        {query.data ? <PageCount count={query.data.meta.total} noun="IT asset" /> : null}
      </section>

      {query.isPending ? (
        <LoadingPanel label="Loading inventory" />
      ) : query.isError ? (
        <ErrorState message="Inventory could not be loaded." onRetry={() => void query.refetch()} />
      ) : materials.length === 0 ? (
        <EmptyState
          action={
            filtered ? (
              <Button onClick={() => setParameters({ page: '1' })} variant="secondary">
                Clear filters
              </Button>
            ) : admin ? (
              <Link className="button-primary" to="/inventory/new">
                <PackagePlus aria-hidden="true" size={18} />
                Add material
              </Link>
            ) : undefined
          }
          message={
            filtered
              ? 'Try a different IT asset, asset type or filter.'
              : 'No catalog material is available. New Issues can be entered directly.'
          }
          title={filtered ? 'No IT asset matches these filters' : 'No material added'}
        />
      ) : (
        <>
          <div className="space-y-3 min-[840px]:hidden">
            {materialGroups.map((group) => (
              <section className="space-y-2" key={group.category}>
                <div className="rounded-[10px] border border-[var(--color-primary-border)] bg-[var(--color-primary-soft)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-extrabold text-[var(--color-primary-strong)]">
                        {group.category}
                      </h2>
                      <p className="text-xs font-semibold text-[var(--color-text-muted)]">
                        {group.materials.length} model{group.materials.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <p className="text-right text-xs font-bold text-[var(--color-text-muted)]">
                      {group.availableQuantity} / {group.totalQuantity} available
                    </p>
                  </div>
                </div>
                {group.materials.map((material) => (
                  <MaterialCard
                    admin={admin}
                    key={material.materialCode}
                    material={material}
                    onDelete={confirmDelete}
                  />
                ))}
              </section>
            ))}
          </div>
          <MaterialTable
            admin={admin}
            materials={materials}
            onDelete={confirmDelete}
            onView={setViewMaterial}
          />
          {query.data && query.data.meta.totalPages > 1 ? (
            <nav aria-label="Inventory pages" className="flex items-center justify-between gap-3">
              <Button
                disabled={page <= 1}
                onClick={() => updateParameters({ page: String(page - 1) })}
                variant="secondary"
              >
                Previous
              </Button>
              <p className="text-sm font-semibold text-[var(--color-text-muted)]">
                Page {page} of {query.data.meta.totalPages}
              </p>
              <Button
                disabled={page >= query.data.meta.totalPages}
                onClick={() => updateParameters({ page: String(page + 1) })}
                variant="secondary"
              >
                Next
              </Button>
            </nav>
          ) : null}
        </>
      )}
      {deleteTarget ? (
        <DeleteMaterialDialog
          loading={deleteMutation.isPending}
          material={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget)}
        />
      ) : null}
      {viewMaterial ? (
        <MaterialQuickViewDialog
          admin={admin}
          material={viewMaterial}
          onClose={() => setViewMaterial(null)}
          onDelete={(material) => {
            setViewMaterial(null);
            confirmDelete(material);
          }}
        />
      ) : null}
    </div>
  );
}

function Dialog({
  children,
  onClose,
  label,
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
}) {
  const reference = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    reference.current?.showModal();
  }, []);
  return (
    <dialog
      aria-label={label}
      className="w-[min(92vw,520px)] rounded-[18px] border border-[var(--color-border)] bg-white p-0 text-[var(--color-text)] shadow-[var(--shadow-overlay)] backdrop:bg-slate-950/40"
      onCancel={onClose}
      onClose={onClose}
      ref={reference}
    >
      {children}
    </dialog>
  );
}

function DeleteMaterialDialog({
  material,
  loading,
  onConfirm,
  onCancel,
}: {
  material: Material;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog label={`Delete ${material.name}`} onClose={onCancel}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-[var(--color-danger-soft)] text-[var(--color-danger)]">
            <Trash2 aria-hidden="true" size={22} />
          </span>
          <div>
            <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
              Delete material?
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
              {material.name} will be permanently removed from Inventory. Delete is allowed only
              when there is no issue history and no stock is currently issued.
            </p>
          </div>
        </div>
        <dl className="mt-5 grid gap-2 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-tint)] p-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="font-bold text-[var(--color-text-muted)]">Inventory code</dt>
            <dd className="font-extrabold text-[var(--color-text-strong)]">
              {material.materialCode}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="font-bold text-[var(--color-text-muted)]">Total stock</dt>
            <dd className="font-extrabold text-[var(--color-text-strong)]">
              {material.totalQuantity}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="font-bold text-[var(--color-text-muted)]">Issued stock</dt>
            <dd className="font-extrabold text-[var(--color-text-strong)]">
              {material.issuedQuantity}
            </dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button disabled={loading} onClick={onCancel} variant="secondary">
            Cancel
          </Button>
          <Button loading={loading} onClick={onConfirm} variant="danger">
            {loading ? 'Deleting...' : 'Delete material'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function DetailGrid({ children }: { children: ReactNode }) {
  return <dl className="mt-5 grid gap-3 sm:grid-cols-2">{children}</dl>;
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-tint)] p-3">
      <dt className="text-xs font-bold text-[var(--color-text-muted)]">{label}</dt>
      <dd className="mt-1 break-words text-sm font-extrabold text-[var(--color-text-strong)]">
        {value}
      </dd>
    </div>
  );
}

function MaterialQuickViewDialog({
  material,
  admin,
  onClose,
  onDelete,
}: {
  material: Material;
  admin: boolean;
  onClose: () => void;
  onDelete: (material: Material) => void;
}) {
  return (
    <Dialog label={`${material.name} details`} onClose={onClose}>
      <div className="max-h-[86vh] overflow-y-auto p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-[var(--color-primary-strong)]">
              {material.name}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {material.materialCode} · {material.category}
            </p>
          </div>
          <CatalogBadge value={material.status} />
        </div>
        <DetailGrid>
          <DetailItem label="Tracking" value={humanizeCatalogValue(material.trackingMode)} />
          <DetailItem label="Asset type" value={material.category} />
          <DetailItem label="Type/model name" value={material.typeModelName ?? material.name} />
          <DetailItem label="Location / block" value={material.locationBlock ?? 'Not provided'} />
          <DetailItem label="Return policy" value={humanizeCatalogValue(material.returnPolicy)} />
          <DetailItem label="Stats" value={materialStatsLabel(material)} />
          <DetailItem label="Availability" value={quantityLabel(material)} />
          <DetailItem label="Unit label" value={material.unitLabel ?? 'Not applicable'} />
        </DetailGrid>
        <div className="mt-5 overflow-hidden rounded-[12px] border border-[var(--color-border)]">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Inventory stock stats</caption>
            <thead className="bg-[var(--color-surface-tint)] text-xs text-[var(--color-text-muted)]">
              <tr>
                <th className="h-10 px-3 font-bold" scope="col">
                  Stock bucket
                </th>
                <th className="h-10 px-3 font-bold" scope="col">
                  Quantity
                </th>
                <th className="h-10 px-3 font-bold" scope="col">
                  Meaning
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              <StatsRow
                label="Total registered"
                note="All stock recorded in AssetDesk."
                value={material.totalQuantity}
              />
              <StatsRow
                label="Available"
                note="Can be issued right now."
                value={material.availableQuantity}
              />
              <StatsRow
                label="Issued"
                note="Currently assigned to receivers."
                value={material.issuedQuantity}
              />
              <StatsRow
                label="Repair/damaged/lost/scrapped"
                note="Registered but not issue-ready."
                value={inactiveQuantity(material)}
              />
            </tbody>
          </table>
        </div>
        <div className="mt-5 rounded-[10px] border border-[var(--color-border)] p-3">
          <p className="text-xs font-bold text-[var(--color-text-muted)]">Description</p>
          <p className="mt-1 text-sm leading-6 text-[var(--color-text-strong)]">
            {material.description ?? 'Not provided'}
          </p>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
          <Link className="button-secondary" to={`/inventory/${material.materialCode}`}>
            Full record
          </Link>
          {admin ? (
            <>
              <Link className="button-secondary" to={`/inventory/${material.materialCode}?edit=1`}>
                Edit
              </Link>
              <Button onClick={() => onDelete(material)} variant="danger">
                Delete
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

function StatsRow({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <tr>
      <td className="px-3 py-3 font-bold text-[var(--color-text-strong)]">{label}</td>
      <td className="px-3 py-3 font-extrabold text-[var(--color-primary-strong)]">{value}</td>
      <td className="px-3 py-3 text-[var(--color-text-muted)]">{note}</td>
    </tr>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <select
        className="field-input"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="field-label">{label}</p>
      {children}
    </div>
  );
}

function MaterialActions({
  material,
  admin,
  onDelete,
}: {
  material: Material;
  admin: boolean;
  onDelete: (material: Material) => void;
}) {
  return (
    <details className="relative inline-block text-left">
      <summary
        aria-label={`Actions for ${material.name}`}
        className="icon-button list-none marker:hidden"
      >
        <MoreVertical aria-hidden="true" size={18} />
      </summary>
      <div className="absolute right-0 top-full z-[80] mt-2 w-52 rounded-[12px] border border-[var(--color-border)] bg-white p-1.5 shadow-[var(--shadow-overlay)]">
        <Link className="menu-item" to={`/inventory/${material.materialCode}`}>
          <Eye aria-hidden="true" size={17} />
          View details
        </Link>
        {admin ? (
          <>
            <Link className="menu-item" to={`/inventory/${material.materialCode}?edit=1`}>
              <Pencil aria-hidden="true" size={17} />
              Edit
            </Link>
            <button
              className="menu-item w-full text-[var(--color-danger)]"
              onClick={() => onDelete(material)}
              type="button"
            >
              <Trash2 aria-hidden="true" size={17} />
              Delete
            </button>
          </>
        ) : null}
      </div>
    </details>
  );
}

function MaterialCard({
  material,
  admin,
  onDelete,
}: {
  material: Material;
  admin: boolean;
  onDelete: (material: Material) => void;
}) {
  return (
    <article className="rounded-[14px] border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
          <PackageSearch aria-hidden="true" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="font-extrabold text-[var(--color-text-strong)]">{material.name}</h2>
            <div className="flex items-center gap-2">
              <CatalogBadge value={material.status} />
              <MaterialActions admin={admin} material={material} onDelete={onDelete} />
            </div>
          </div>
          <p className="mt-1 text-xs font-bold text-[var(--color-primary)]">
            {material.materialCode}
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {material.category} · {humanizeCatalogValue(material.trackingMode)}
          </p>
          <p className="mt-1 text-sm font-bold text-[var(--color-text-strong)]">
            {quantityLabel(material)}
          </p>
        </div>
      </div>
      <Link className="button-secondary mt-4 w-full" to={`/inventory/${material.materialCode}`}>
        View inventory details
      </Link>
    </article>
  );
}

function MaterialTable({
  materials,
  admin,
  onDelete,
  onView,
}: {
  materials: Material[];
  admin: boolean;
  onDelete: (material: Material) => void;
  onView: (material: Material) => void;
}) {
  const groups = groupMaterials(materials);
  return (
    <div className="hidden overflow-visible rounded-[14px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)] min-[840px]:block">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Inventory materials</caption>
        <thead className="bg-[var(--color-surface-tint)] text-xs text-[var(--color-text-muted)]">
          <tr>
            <th className="h-11 px-4 font-bold" scope="col">
              IT asset
            </th>
            <th className="h-11 px-4 font-bold" scope="col">
              Tracking
            </th>
            <th className="h-11 px-4 font-bold" scope="col">
              Availability
            </th>
            <th className="h-11 px-4 font-bold" scope="col">
              Status
            </th>
            <th className="h-11 px-4 text-right font-bold" scope="col">
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <GroupedMaterialRows
              admin={admin}
              group={group}
              key={group.category}
              onDelete={onDelete}
              onView={onView}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupedMaterialRows({
  group,
  admin,
  onDelete,
  onView,
}: {
  group: MaterialGroup;
  admin: boolean;
  onDelete: (material: Material) => void;
  onView: (material: Material) => void;
}) {
  return (
    <>
      <tr className="border-t border-[var(--color-border)] bg-[var(--color-primary-soft)]">
        <td className="px-4 py-3" colSpan={5}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold text-[var(--color-primary-strong)]">
                {group.category}
              </p>
              <p className="text-xs font-semibold text-[var(--color-text-muted)]">
                {group.materials.length} model{group.materials.length === 1 ? '' : 's'} registered
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-bold text-[var(--color-text-muted)]">
              <span>Total: {group.totalQuantity}</span>
              <span>Available: {group.availableQuantity}</span>
              <span>Issued: {group.issuedQuantity}</span>
            </div>
          </div>
        </td>
      </tr>
      {group.materials.map((material) => (
        <tr
          className="h-[64px] cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-surface-tint)]"
          key={material.materialCode}
          onClick={() => onView(material)}
          tabIndex={0}
        >
          <td className="px-4">
            <p className="text-sm font-bold text-[var(--color-text-strong)]">{material.name}</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {material.materialCode} · {material.typeModelName ?? material.name}
            </p>
          </td>
          <td className="px-4">
            <CatalogBadge value={material.trackingMode} />
          </td>
          <td className="px-4 text-sm text-[var(--color-text-muted)]">
            {quantityLabel(material)}
          </td>
          <td className="px-4">
            <CatalogBadge value={material.status} />
          </td>
          <td className="px-4 text-right">
            <div onClick={(event) => event.stopPropagation()}>
              <MaterialActions admin={admin} material={material} onDelete={onDelete} />
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}
