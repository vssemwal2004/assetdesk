import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  ChevronDown,
  Eye,
  MoreVertical,
  PackagePlus,
  PackageSearch,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';

import type {
  AssetDetail,
  AssetDetailKind,
  Material,
  MaterialStatus,
  ReturnPolicy,
  TrackingMode,
} from '@assetdesk/contracts';
import { AdjustQuantityRequestSchema } from '@assetdesk/contracts';

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
  TextField,
} from '../../components/ui';
import {
  adjustMaterialQuantity,
  deleteMaterial,
  downloadInventoryCsv,
  getAssetDetails,
  getInventory,
  getAssetUnits,
} from '../../lib/inventory-api';
import { isApiError } from '../../lib/api-client';
import { humanizeCatalogValue } from '../../lib/catalog-format';
import { inventoryStatusLabel, normalizeInventoryStatus } from '../../lib/inventory-status';

function materialStatus(value: string): MaterialStatus | undefined {
  return normalizeInventoryStatus(value);
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

function inventorySummary(materials: Material[]) {
  return materials.reduce(
    (summary, material) => {
      summary.total += material.totalQuantity;
      summary.available += material.availableQuantity;
      summary.issued += material.issuedQuantity;
      if (material.status === 'SCRAP') summary.scrap += material.totalQuantity;
      if (material.status === 'NOT_IN_USE') summary.notInUse += material.totalQuantity;
      if (material.status === 'UNDER_MAINTENANCE')
        summary.underMaintenance += material.totalQuantity;
      return summary;
    },
    { total: 0, available: 0, issued: 0, scrap: 0, notInUse: 0, underMaintenance: 0 },
  );
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
    const group = groups.get(category) ?? {
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
  return [...groups.values()]
    .map((group) => ({
      ...group,
      materials: group.materials.sort((left, right) =>
        [
          left.typeModelName ?? left.name,
          left.configuration ?? '',
          left.location ?? '',
          left.block ?? '',
        ]
          .join('|')
          .localeCompare(
            [
              right.typeModelName ?? right.name,
              right.configuration ?? '',
              right.location ?? '',
              right.block ?? '',
            ].join('|'),
          ),
      ),
    }))
    .sort((left, right) => left.category.localeCompare(right.category));
}

function materialStatsLabel(material: Material): string {
  if (material.status === 'ARCHIVED') return inventoryStatusLabel(material.status);
  if (material.status === 'SCRAP') return inventoryStatusLabel(material.status);
  if (material.status === 'NOT_IN_USE') return inventoryStatusLabel(material.status);
  if (material.status === 'UNDER_MAINTENANCE') return inventoryStatusLabel(material.status);
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

function assetDetailOptions(
  details: AssetDetail[],
  kind: AssetDetailKind | AssetDetailKind[],
  selectedValue: string,
): string[] {
  const kinds = Array.isArray(kind) ? kind : [kind];
  const values = details
    .filter((detail) => kinds.includes(detail.kind))
    .map((detail) => detail.name)
    .sort((left, right) => left.localeCompare(right));
  if (
    selectedValue &&
    !values.some((value) => value.toLocaleLowerCase() === selectedValue.toLocaleLowerCase())
  ) {
    return [selectedValue, ...values];
  }
  return values;
}

export function InventoryPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [parameters, setParameters] = useSearchParams();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);
  const [viewMaterial, setViewMaterial] = useState<Material | null>(null);
  const [quantityTarget, setQuantityTarget] = useState<Material | null>(null);
  const [downloading, setDownloading] = useState(false);
  const search = parameters.get('search') ?? '';
  const category = parameters.get('category') ?? '';
  const location = parameters.get('location') ?? '';
  const block = parameters.get('block') ?? '';
  const department = parameters.get('department') ?? '';
  const vendorName = parameters.get('vendorName') ?? '';
  const createdFrom = parameters.get('createdFrom') ?? '';
  const createdTo = parameters.get('createdTo') ?? '';
  const status = materialStatus(parameters.get('status') ?? '');
  const mode = trackingMode(parameters.get('trackingMode') ?? '');
  const policy = returnPolicy(parameters.get('returnPolicy') ?? '');
  const stock = stockState(parameters.get('stockState') ?? '');
  const canAddInventory = hasPermission(user, 'INVENTORY_ADD');
  const canEditInventory = hasPermission(user, 'INVENTORY_EDIT');
  const canDeleteInventory = hasPermission(user, 'INVENTORY_DELETE');
  const canAdjustQuantity = hasPermission(user, 'INVENTORY_QUANTITY_ADJUST');
  const canExportInventory = hasPermission(user, 'INVENTORY_EXPORT');

  const detailQuery = useQuery({
    queryKey: ['asset-details'],
    queryFn: ({ signal }) => getAssetDetails(undefined, signal),
  });

  const query = useQuery({
    queryKey: [
      'inventory',
      {
        search,
        category,
        location,
        block,
        department,
        vendorName,
        createdFrom,
        createdTo,
        status,
        mode,
        policy,
        stock,
      },
    ],
    queryFn: async ({ signal }) => {
      const filters = {
        ...(search ? { search } : {}),
        ...(category ? { category } : {}),
        ...(location ? { location } : {}),
        ...(block ? { block } : {}),
        ...(department ? { department } : {}),
        ...(vendorName ? { vendorName } : {}),
        ...(createdFrom ? { createdFrom } : {}),
        ...(createdTo ? { createdTo } : {}),
        ...(status ? { status } : {}),
        ...(mode ? { trackingMode: mode } : {}),
        ...(policy ? { returnPolicy: policy } : {}),
        ...(stock ? { stockState: stock } : {}),
      };
      const first = await getInventory({ page: 1, pageSize: 100, ...filters }, signal);
      if (first.meta.totalPages <= 1) return first;
      const remaining = await Promise.all(
        Array.from({ length: first.meta.totalPages - 1 }, (_, index) =>
          getInventory({ page: index + 2, pageSize: 100, ...filters }, signal),
        ),
      );
      return {
        data: [first, ...remaining].flatMap((response) => response.data),
        meta: { ...first.meta, page: 1, pageSize: first.meta.total, totalPages: 1 },
      };
    },
    placeholderData: (previous) => previous,
  });

  function updateParameters(updates: Record<string, string>) {
    const next = new URLSearchParams(parameters);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('page');
    setParameters(next);
  }

  const materials = query.data?.data ?? [];
  const assetDetails = detailQuery.data ?? [];
  const categoryOptions = assetDetailOptions(
    assetDetails,
    mode === 'SERIALIZED'
      ? 'ASSET_TYPE'
      : mode === 'QUANTITY'
        ? 'CONSUMABLE_TYPE'
        : ['ASSET_TYPE', 'CONSUMABLE_TYPE'],
    category,
  );
  const locationOptions = assetDetailOptions(assetDetails, 'LOCATION', location);
  const blockOptions = assetDetailOptions(assetDetails, 'BLOCK', block);
  const departmentOptions = assetDetailOptions(assetDetails, 'DEPARTMENT', department);
  const materialGroups = groupMaterials(materials);
  const summary = inventorySummary(materials);
  const filtered = Boolean(
    search ||
    category ||
    location ||
    block ||
    department ||
    vendorName ||
    createdFrom ||
    createdTo ||
    status ||
    mode ||
    policy ||
    stock,
  );
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
        ...(location ? { location } : {}),
        ...(block ? { block } : {}),
        ...(department ? { department } : {}),
        ...(vendorName ? { vendorName } : {}),
        ...(createdFrom ? { createdFrom } : {}),
        ...(createdTo ? { createdTo } : {}),
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
    <div className="space-y-4">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            {canExportInventory ? (
              <Button
                loading={downloading}
                onClick={() => void downloadData()}
                type="button"
                variant="secondary"
              >
                <Download aria-hidden="true" size={18} />
                {downloading ? 'Downloading...' : 'Download data'}
              </Button>
            ) : null}
            {canAddInventory ? (
              <Link
                aria-label="Add material to inventory"
                className="button-primary"
                to="/inventory/new"
              >
                <PackagePlus aria-hidden="true" size={18} />
                Add material
              </Link>
            ) : null}
          </div>
        }
        title="Inventory"
      />
      {actionError ? <ErrorSummary message={actionError} title="Action failed" /> : null}

      <section className="rounded-[14px] border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-card)]">
        <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <SearchForm
            id="inventory-search"
            key={search}
            label="Search Inventory"
            onSearch={(value) => updateParameters({ search: value })}
            placeholder="IT asset, code, asset type, location or description"
            value={search}
          />
          <FilterPopover
            activeCount={
              [
                category,
                location,
                block,
                department,
                vendorName,
                createdFrom,
                createdTo,
                status,
                mode,
                policy,
                stock,
              ].filter(Boolean).length
            }
            onClear={() =>
              updateParameters({
                category: '',
                location: '',
                block: '',
                department: '',
                vendorName: '',
                createdFrom: '',
                createdTo: '',
                status: '',
                trackingMode: '',
                returnPolicy: '',
                stockState: '',
              })
            }
            panelClassName="w-[min(94vw,720px)] p-5"
          >
            <div className="rounded-[8px] bg-[var(--color-surface-tint)] p-3">
              <div className="grid gap-3 sm:grid-cols-2">
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
                <FilterField label="Asset type">
                  <FilterSelect
                    id="inventory-category-filter"
                    label="Filter by asset type"
                    onChange={(value) => updateParameters({ category: value })}
                    value={category}
                  >
                    <option value="">Any asset type</option>
                    {categoryOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </FilterSelect>
                </FilterField>
                <FilterField label="Location">
                  <FilterSelect
                    id="inventory-location-filter"
                    label="Filter by location"
                    onChange={(value) => updateParameters({ location: value })}
                    value={location}
                  >
                    <option value="">Any location</option>
                    {locationOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </FilterSelect>
                </FilterField>
                <FilterField label="Block">
                  <FilterSelect
                    id="inventory-block-filter"
                    label="Filter by block"
                    onChange={(value) => updateParameters({ block: value })}
                    value={block}
                  >
                    <option value="">Any block</option>
                    {blockOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </FilterSelect>
                </FilterField>
                <FilterField label="Department">
                  <FilterSelect
                    id="inventory-department-filter"
                    label="Filter by department"
                    onChange={(value) => updateParameters({ department: value })}
                    value={department}
                  >
                    <option value="">Any department</option>
                    {departmentOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </FilterSelect>
                </FilterField>
                <FilterField label="Vendor">
                  <SearchForm
                    id="inventory-vendor-filter"
                    label="Filter by vendor"
                    onSearch={(value) => updateParameters({ vendorName: value })}
                    placeholder="Any vendor"
                    value={vendorName}
                  />
                </FilterField>
                <FilterField label="Added date">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      aria-label="Created from date"
                      className="field-input"
                      onChange={(event) => updateParameters({ createdFrom: event.target.value })}
                      type="date"
                      value={createdFrom}
                    />
                    <input
                      aria-label="Created to date"
                      className="field-input"
                      onChange={(event) => updateParameters({ createdTo: event.target.value })}
                      type="date"
                      value={createdTo}
                    />
                  </div>
                </FilterField>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {user?.role === 'ADMIN' ? (
                <FilterField label="Status">
                  <FilterSelect
                    id="inventory-status-filter"
                    label="Filter by status"
                    onChange={(value) => updateParameters({ status: value })}
                    value={status ?? ''}
                  >
                    <option value="">Any status</option>
                    <option value="ACTIVE">{inventoryStatusLabel('ACTIVE')}</option>
                    <option value="UNDER_MAINTENANCE">
                      {inventoryStatusLabel('UNDER_MAINTENANCE')}
                    </option>
                    <option value="SCRAP">{inventoryStatusLabel('SCRAP')}</option>
                    <option value="NOT_IN_USE">{inventoryStatusLabel('NOT_IN_USE')}</option>
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
            </div>
          </FilterPopover>
        </div>
        {query.data ? <PageCount count={query.data.meta.total} noun="IT asset" /> : null}
      </section>

      {query.data ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <SummaryCard label="Listed quantity" value={summary.total} />
          <SummaryCard label="Available" value={summary.available} />
          <SummaryCard label="Issued" value={summary.issued} />
          <SummaryCard label={inventoryStatusLabel('SCRAP')} tone="danger" value={summary.scrap} />
          <SummaryCard
            label={inventoryStatusLabel('NOT_IN_USE')}
            tone="warning"
            value={summary.notInUse}
          />
          <SummaryCard
            label={inventoryStatusLabel('UNDER_MAINTENANCE')}
            tone="warning"
            value={summary.underMaintenance}
          />
        </section>
      ) : null}

      {actionNotice ? (
        <div
          className="rounded-[12px] border border-emerald-200 bg-[var(--color-success-soft)] p-4 text-sm font-bold text-[var(--color-success)]"
          role="status"
        >
          {actionNotice}
        </div>
      ) : null}
      {query.isPending ? (
        <LoadingPanel label="Loading inventory" />
      ) : query.isError ? (
        <ErrorState message="Inventory could not be loaded." onRetry={() => void query.refetch()} />
      ) : materials.length === 0 ? (
        <EmptyState
          action={
            filtered ? (
              <Button onClick={() => setParameters({})} variant="secondary">
                Clear filters
              </Button>
            ) : canAddInventory ? (
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
              <details className="group space-y-2" key={group.category}>
                <summary className="list-none rounded-[10px] border border-[var(--color-primary-border)] bg-[var(--color-primary-soft)] p-3 marker:hidden">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <ChevronDown
                        className="text-[var(--color-primary)] transition-transform group-open:rotate-180"
                        size={18}
                      />
                      <div>
                        <h2 className="font-extrabold text-[var(--color-primary-strong)]">
                          {group.category}
                        </h2>
                        <p className="text-xs font-semibold text-[var(--color-text-muted)]">
                          {group.materials.length} model{group.materials.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                    <p className="text-right text-xs font-bold text-[var(--color-text-muted)]">
                      {group.availableQuantity} / {group.totalQuantity} available
                    </p>
                  </div>
                </summary>
                {group.materials.map((material) => (
                  <MaterialCard
                    canAdjustQuantity={canAdjustQuantity}
                    canDelete={canDeleteInventory}
                    canEdit={canEditInventory}
                    key={material.materialCode}
                    material={material}
                    onDelete={confirmDelete}
                    onAdjustQuantity={setQuantityTarget}
                  />
                ))}
              </details>
            ))}
          </div>
          <MaterialTable
            canAdd={canAddInventory}
            canAdjustQuantity={canAdjustQuantity}
            canDelete={canDeleteInventory}
            canEdit={canEditInventory}
            materials={materials}
            onDelete={confirmDelete}
            onAdjustQuantity={setQuantityTarget}
            onView={setViewMaterial}
          />
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
          canDelete={canDeleteInventory}
          canEdit={canEditInventory}
          material={viewMaterial}
          onClose={() => setViewMaterial(null)}
          onDelete={(material) => {
            setViewMaterial(null);
            confirmDelete(material);
          }}
        />
      ) : null}
      {quantityTarget ? (
        <InventoryQuantityDialog
          material={quantityTarget}
          onCancel={() => setQuantityTarget(null)}
          onSaved={async () => {
            setQuantityTarget(null);
            setActionNotice('Quantity updated and added to the permanent inventory log.');
            await queryClient.invalidateQueries({ queryKey: ['inventory'] });
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
      className="relative m-auto max-h-[88vh] w-[min(92vw,720px)] overflow-hidden rounded-[18px] border border-[var(--color-border)] bg-white p-0 text-[var(--color-text)] shadow-[var(--shadow-overlay)] backdrop:bg-slate-950/45"
      onCancel={onClose}
      onClose={onClose}
      ref={reference}
    >
      <button
        aria-label="Close"
        className="absolute right-4 top-4 z-20 grid size-9 place-items-center rounded-full border border-[var(--color-border)] bg-white text-[var(--color-text-muted)] shadow-sm transition hover:border-[var(--color-primary-border)] hover:text-[var(--color-primary)]"
        onClick={onClose}
        type="button"
      >
        <X aria-hidden="true" size={18} />
      </button>
      {children}
    </dialog>
  );
}

function InventoryQuantityDialog({
  material,
  onSaved,
  onCancel,
}: {
  material: Material;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (input: { quantityDelta: number; reason: string }) =>
      adjustMaterialQuantity(material.materialCode, input),
    onSuccess: () => void onSaved(),
    onError: (error) =>
      setMessage(isApiError(error) ? error.message : 'The quantity could not be updated.'),
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const parsed = AdjustQuantityRequestSchema.safeParse({
      quantityDelta: Number(delta),
      reason,
    });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? 'Check the quantity change.');
      return;
    }
    mutation.mutate(parsed.data);
  }

  return (
    <Dialog label={`Edit quantity for ${material.name}`} onClose={onCancel}>
      <form className="p-5 sm:p-6" onSubmit={submit}>
        <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">Edit quantity</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Current total: {material.totalQuantity} {material.unitLabel ?? 'units'}. Use a positive
          number to add or a negative number to reduce available stock.
        </p>
        {message ? (
          <div className="mt-4">
            <ErrorSummary message={message} />
          </div>
        ) : null}
        <div className="mt-5 space-y-4">
          <TextField
            inputMode="numeric"
            label="Quantity change"
            onChange={(event) => setDelta(event.target.value)}
            placeholder="Example: 10 or -3"
            required
            step="1"
            type="number"
            value={delta}
          />
          <TextField
            label="Reason"
            maxLength={500}
            minLength={5}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this quantity changing?"
            required
            value={reason}
          />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button
            disabled={mutation.isPending}
            onClick={onCancel}
            type="button"
            variant="secondary"
          >
            Cancel
          </Button>
          <Button loading={mutation.isPending} type="submit">
            Save quantity
          </Button>
        </div>
      </form>
    </Dialog>
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
          {material.trackingMode === 'SERIALIZED' ? (
            <div className="flex justify-between gap-3">
              <dt className="font-bold text-[var(--color-text-muted)]">Inventory code</dt>
              <dd className="font-extrabold text-[var(--color-text-strong)]">
                {material.materialCode}
              </dd>
            </div>
          ) : null}
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
  canEdit,
  canDelete,
  onClose,
  onDelete,
}: {
  material: Material;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onDelete: (material: Material) => void;
}) {
  return (
    <Dialog label={`${material.name} details`} onClose={onClose}>
      <div className="max-h-[88vh] overflow-y-auto p-5 pr-14 sm:p-6 sm:pr-16">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-[var(--color-primary-strong)]">
              {material.name}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {material.trackingMode === 'SERIALIZED'
                ? `${material.materialCode} · ${material.category}`
                : material.category}
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
          {canEdit ? (
            <Link className="button-secondary" to={`/inventory/${material.materialCode}?edit=1`}>
              Edit
            </Link>
          ) : null}
          {canDelete ? (
            <Button onClick={() => onDelete(material)} variant="danger">
              Delete
            </Button>
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

function SummaryCard({
  label,
  value,
  tone = 'primary',
}: {
  label: string;
  value: number;
  tone?: 'primary' | 'warning' | 'danger';
}) {
  const colors = {
    primary: 'text-[var(--color-primary-strong)]',
    warning: 'text-[var(--color-warning)]',
    danger: 'text-[var(--color-danger)]',
  };
  return (
    <div className="rounded-[12px] border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-card)]">
      <p className={`text-xl font-extrabold ${colors[tone]}`}>{value}</p>
      <p className="mt-1 text-xs font-bold text-[var(--color-text-muted)]">{label}</p>
    </div>
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
  canEdit,
  canDelete,
  canAdjustQuantity,
  onAdjustQuantity,
  onDelete,
}: {
  material: Material;
  canEdit: boolean;
  canDelete: boolean;
  canAdjustQuantity: boolean;
  onAdjustQuantity: (material: Material) => void;
  onDelete: (material: Material) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (detailsRef.current?.open && !detailsRef.current.contains(event.target as Node)) {
        detailsRef.current.open = false;
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && detailsRef.current?.open) detailsRef.current.open = false;
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  return (
    <details className="relative inline-block text-left" ref={detailsRef}>
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
        {canEdit ? (
          <Link className="menu-item" to={`/inventory/${material.materialCode}?status=1`}>
            <Pencil aria-hidden="true" size={17} />
            Change status
          </Link>
        ) : null}
        {canAdjustQuantity &&
        material.trackingMode === 'QUANTITY' &&
        material.status === 'ACTIVE' ? (
          <button
            className="menu-item w-full"
            onClick={() => onAdjustQuantity(material)}
            type="button"
          >
            <Pencil aria-hidden="true" size={17} />
            Add or adjust quantity
          </button>
        ) : null}
        {canEdit ? (
          <Link className="menu-item" to={`/inventory/${material.materialCode}?edit=1`}>
            <Pencil aria-hidden="true" size={17} />
            Edit
          </Link>
        ) : null}
        {canDelete ? (
          <button
            className="menu-item w-full text-[var(--color-danger)]"
            onClick={() => onDelete(material)}
            type="button"
          >
            <Trash2 aria-hidden="true" size={17} />
            Delete
          </button>
        ) : null}
      </div>
    </details>
  );
}

function MaterialCard({
  material,
  canEdit,
  canDelete,
  canAdjustQuantity,
  onAdjustQuantity,
  onDelete,
}: {
  material: Material;
  canEdit: boolean;
  canDelete: boolean;
  canAdjustQuantity: boolean;
  onAdjustQuantity: (material: Material) => void;
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
              <MaterialActions
                canAdjustQuantity={canAdjustQuantity}
                canDelete={canDelete}
                canEdit={canEdit}
                material={material}
                onDelete={onDelete}
                onAdjustQuantity={onAdjustQuantity}
              />
            </div>
          </div>
          {material.trackingMode === 'SERIALIZED' ? (
            <p className="mt-1 text-xs font-bold text-[var(--color-primary)]">
              {material.materialCode}
            </p>
          ) : null}
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
  canAdd,
  canEdit,
  canDelete,
  canAdjustQuantity,
  onAdjustQuantity,
  onDelete,
  onView,
}: {
  materials: Material[];
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canAdjustQuantity: boolean;
  onAdjustQuantity: (material: Material) => void;
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
              canAdd={canAdd}
              canDelete={canDelete}
              canAdjustQuantity={canAdjustQuantity}
              canEdit={canEdit}
              group={group}
              key={group.category}
              onDelete={onDelete}
              onAdjustQuantity={onAdjustQuantity}
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
  canAdd,
  canEdit,
  canDelete,
  canAdjustQuantity,
  onAdjustQuantity,
  onDelete,
  onView,
}: {
  group: MaterialGroup;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canAdjustQuantity: boolean;
  onAdjustQuantity: (material: Material) => void;
  onDelete: (material: Material) => void;
  onView: (material: Material) => void;
}) {
  const [open, setOpen] = useState(false);
  const [openModels, setOpenModels] = useState<string[]>([]);
  const modelGroups = Object.values(
    group.materials.reduce<
      Record<
        string,
        { key: string; label: string; materials: Material[]; total: number; available: number }
      >
    >((result, material) => {
      const label = material.typeModelName ?? material.name;
      const key = label.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleUpperCase('en-US');
      const model = result[key] ?? { key, label, materials: [], total: 0, available: 0 };
      model.materials.push(material);
      model.total += material.totalQuantity;
      model.available += material.availableQuantity;
      result[key] = model;
      return result;
    }, {}),
  );

  return (
    <>
      <tr
        className="cursor-pointer border-t border-[var(--color-border)] bg-[var(--color-primary-soft)] transition hover:bg-[#e9e3ff]"
        onClick={() => setOpen((value) => !value)}
      >
        <td className="px-4 py-3" colSpan={5}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-[9px] bg-white text-[var(--color-primary)] shadow-sm">
                <ChevronDown
                  aria-hidden="true"
                  className={`transition-transform ${open ? 'rotate-180' : ''}`}
                  size={18}
                />
              </span>
              <div>
                <p className="text-sm font-extrabold text-[var(--color-primary-strong)]">
                  {group.category}
                </p>
                <p className="text-xs font-semibold text-[var(--color-text-muted)]">
                  {modelGroups.length} model{modelGroups.length === 1 ? '' : 's'} ·{' '}
                  {group.materials.length} stock variant{group.materials.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--color-text-muted)]">
              <span>Total: {group.totalQuantity}</span>
              <span>Available: {group.availableQuantity}</span>
              <span>Issued: {group.issuedQuantity}</span>
              {canAdd ? (
                <details className="relative" onClick={(event) => event.stopPropagation()}>
                  <summary
                    aria-label={`Actions for ${group.category}`}
                    className="icon-button list-none marker:hidden"
                  >
                    <MoreVertical aria-hidden="true" size={17} />
                  </summary>
                  <div className="absolute right-0 top-full z-[80] mt-2 w-44 rounded-[12px] border border-[var(--color-border)] bg-white p-1.5 shadow-[var(--shadow-overlay)]">
                    <Link
                      className="menu-item"
                      to={`/inventory/new?category=${encodeURIComponent(group.category)}&trackingMode=${group.materials[0]?.trackingMode ?? 'SERIALIZED'}`}
                    >
                      <PackagePlus aria-hidden="true" size={17} />
                      Add more
                    </Link>
                  </div>
                </details>
              ) : null}
            </div>
          </div>
        </td>
      </tr>
      {open
        ? modelGroups.map((model) => {
            const modelOpen = openModels.includes(model.key);
            return (
              <Fragment key={model.key}>
                <tr
                  className="cursor-pointer border-t border-[var(--color-border)] bg-[var(--color-surface-tint)] hover:bg-white"
                  onClick={() =>
                    setOpenModels((current) =>
                      current.includes(model.key)
                        ? current.filter((key) => key !== model.key)
                        : [...current, model.key],
                    )
                  }
                >
                  <td className="px-4 py-3" colSpan={5}>
                    <div className="flex items-center justify-between gap-4 pl-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <ChevronDown
                          aria-hidden="true"
                          className={`shrink-0 text-[var(--color-primary)] transition-transform ${modelOpen ? 'rotate-180' : ''}`}
                          size={17}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-extrabold text-[var(--color-text-strong)]">
                            {model.label}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)]">
                            {model.materials.length} configuration/location variant
                            {model.materials.length === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                      <p className="shrink-0 text-xs font-bold text-[var(--color-text-muted)]">
                        {model.available} / {model.total} available
                      </p>
                    </div>
                  </td>
                </tr>
                {modelOpen
                  ? model.materials.map((material) => (
                      <MaterialVariantRows
                        canAdjustQuantity={canAdjustQuantity}
                        canDelete={canDelete}
                        canEdit={canEdit}
                        key={material.materialCode}
                        material={material}
                        onAdjustQuantity={onAdjustQuantity}
                        onDelete={onDelete}
                        onView={onView}
                      />
                    ))
                  : null}
              </Fragment>
            );
          })
        : null}
    </>
  );
}

function MaterialVariantRows({
  material,
  canEdit,
  canDelete,
  canAdjustQuantity,
  onAdjustQuantity,
  onDelete,
  onView,
}: {
  material: Material;
  canEdit: boolean;
  canDelete: boolean;
  canAdjustQuantity: boolean;
  onAdjustQuantity: (material: Material) => void;
  onDelete: (material: Material) => void;
  onView: (material: Material) => void;
}) {
  const [open, setOpen] = useState(false);
  const unitsQuery = useQuery({
    queryKey: ['inventory-units-inline', material.materialCode],
    queryFn: ({ signal }) => getAssetUnits(material.materialCode, 1, { pageSize: 100 }, signal),
    enabled: open && material.trackingMode === 'SERIALIZED',
  });
  const columnCount = 5;

  return (
    <>
      <tr className="h-[72px] border-t border-[var(--color-border)] bg-white hover:bg-[var(--color-surface-tint)]">
        <td className="px-4">
          <button
            className="flex w-full items-center gap-3 text-left"
            onClick={() => setOpen((value) => !value)}
            type="button"
          >
            <ChevronDown
              aria-hidden="true"
              className={`shrink-0 text-[var(--color-text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
              size={16}
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-[var(--color-text-strong)]">
                {material.configuration || 'Standard configuration'}
              </span>
              <span className="mt-0.5 block truncate text-xs text-[var(--color-text-muted)]">
                {material.materialCode} ·{' '}
                {[material.location, material.block].filter(Boolean).join(' · ')}
              </span>
            </span>
          </button>
        </td>
        <td className="px-4">
          <CatalogBadge value={material.trackingMode} />
        </td>
        <td className="px-4 text-sm text-[var(--color-text-muted)]">{quantityLabel(material)}</td>
        <td className="px-4">
          <CatalogBadge value={material.status} />
        </td>
        <td className="px-4 text-right">
          <div onClick={(event) => event.stopPropagation()}>
            <MaterialActions
              canAdjustQuantity={canAdjustQuantity}
              canDelete={canDelete}
              canEdit={canEdit}
              material={material}
              onDelete={onDelete}
              onAdjustQuantity={onAdjustQuantity}
            />
          </div>
        </td>
      </tr>
      {open ? (
        <tr className="border-t border-[var(--color-border)] bg-[#fbfaff]">
          <td colSpan={columnCount} className="px-5 py-4">
            <div className="ml-8 rounded-[12px] border border-[var(--color-border)] bg-white p-4">
              {material.trackingMode === 'QUANTITY' ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <InlineStat label="Total quantity" value={material.totalQuantity} />
                  <InlineStat label="Available" value={material.availableQuantity} />
                  <InlineStat label="Issued" value={material.issuedQuantity} />
                  <InlineStat label="Unit" value={material.unitLabel ?? 'units'} />
                </div>
              ) : unitsQuery.isPending ? (
                <p className="text-sm font-semibold text-[var(--color-text-muted)]">
                  Loading serial IDs…
                </p>
              ) : unitsQuery.isError ? (
                <p className="text-sm font-semibold text-[var(--color-danger)]">
                  Serial IDs could not be loaded.
                </p>
              ) : (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-extrabold text-[var(--color-primary-strong)]">
                      Serial and Asset IDs
                    </p>
                    <button className="button-quiet" onClick={() => onView(material)} type="button">
                      Open full details
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {(unitsQuery.data?.data ?? []).map((unit) => (
                      <div
                        className="rounded-[9px] bg-[var(--color-surface-tint)] px-3 py-2"
                        key={unit.assetTag}
                      >
                        <p className="text-xs font-extrabold text-[var(--color-text-strong)]">
                          {unit.serialNumber ?? 'No serial number'}
                        </p>
                        <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                          {unit.assetTag} · {unit.condition} · {unit.status}
                        </p>
                      </div>
                    ))}
                  </div>
                  {(unitsQuery.data?.meta.total ?? 0) > 100 ? (
                    <p className="mt-3 text-xs font-semibold text-[var(--color-text-muted)]">
                      Showing first 100 of {unitsQuery.data?.meta.total}. Open full details to view
                      all.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function InlineStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs font-bold text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-extrabold text-[var(--color-primary-strong)]">
        {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
      </p>
    </div>
  );
}
