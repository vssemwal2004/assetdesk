import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  FileClock,
  Minus,
  PackagePlus,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Workflow,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';

import {
  AdjustQuantityRequestSchema,
  CreateAssetUnitRequestSchema,
  UpdateAssetUnitRequestSchema,
  UpdateMaterialRequestSchema,
  type AuditEvent,
  type AssetUnitStatus,
  type AssetUnit,
  type AssetUnitsListResponse,
  type InventoryQuantityEntry,
  type InventoryQuantityEntryAction,
  type ManualAssetUnitStatus,
  type Material,
  type MaterialStatus,
  type ReturnPolicy,
  type UpdateMaterialRequest,
} from '@assetdesk/contracts';

import { useAuth } from '../../auth/auth-context';
import { hasPermission } from '../../auth/permissions';
import { CatalogBadge, DetailRow, SelectField } from '../../components/catalog-ui';
import {
  AppCard,
  Button,
  EmptyState,
  ErrorState,
  ErrorSummary,
  FilterPopover,
  LoadingPanel,
  PageHeader,
  TextField,
} from '../../components/ui';
import { isApiError } from '../../lib/api-client';
import { getAuditEvents } from '../../lib/audit-api';
import { humanizeCatalogValue } from '../../lib/catalog-format';
import { formatIstDate, formatIstDateTime, toIstDateTimeInput } from '../../lib/date-time';
import {
  addAssetUnit,
  adjustMaterialQuantity,
  deleteAssetUnit,
  deleteMaterial,
  getAssetDetails,
  getAssetUnits,
  getInventoryModels,
  getInventoryQuantityEntries,
  getMaterial,
  setMaterialStatus,
  updateAssetUnit,
  updateMaterial,
} from '../../lib/inventory-api';
import {
  inventoryModelOptions,
  quantityAdjustmentMaximum,
  resolveCatalogOption,
  signedQuantityDelta,
  type QuantityAdjustmentDirection,
} from './inventory-form-utils';
import { MaterialCategoryField } from './material-category-field';

function dateDaysAgo(days: number): string {
  return toIstDateTimeInput(new Date(Date.now() - days * 86_400_000)).slice(0, 10);
}

type QuantityHistoryFilters = {
  from: string;
  to: string;
  vendorName: string;
  action: InventoryQuantityEntryAction | '';
};

export function InventoryDetailPage() {
  const { materialCode = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [parameters, setParameters] = useSearchParams();
  const unitPage = Math.max(1, Number(parameters.get('unitPage')) || 1);
  const [editing, setEditing] = useState(parameters.get('edit') === '1');
  const [dialog, setDialog] = useState<'status' | 'quantity' | 'add-unit' | 'delete' | null>(null);
  const [nextMaterialStatus, setNextMaterialStatus] = useState<MaterialStatus>('ACTIVE');
  const [editUnit, setEditUnit] = useState<AssetUnit | null>(null);
  const [unitStatus, setUnitStatus] = useState<AssetUnitStatus | ''>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [quantityHistoryFilters, setQuantityHistoryFilters] = useState<QuantityHistoryFilters>({
    from: '',
    to: '',
    vendorName: '',
    action: '',
  });
  const notice = (location.state as { notice?: string } | null)?.notice;
  const canEditInventory = hasPermission(user, 'INVENTORY_EDIT');
  const canDeleteInventory = hasPermission(user, 'INVENTORY_DELETE');
  const canAdjustQuantity = hasPermission(user, 'INVENTORY_QUANTITY_ADJUST');
  const canAddAssetUnits = hasPermission(user, 'ASSET_UNITS_ADD');
  const canEditAssetUnits = hasPermission(user, 'ASSET_UNITS_EDIT');
  const canDeleteAssetUnits = hasPermission(user, 'ASSET_UNITS_DELETE');
  const canChangeStatus = canEditInventory;
  const canManageUnits = canAddAssetUnits || canEditAssetUnits || canDeleteAssetUnits;

  const query = useQuery({
    queryKey: ['material', materialCode],
    queryFn: ({ signal }) => getMaterial(materialCode, signal),
    enabled: Boolean(materialCode),
  });

  const unitsQuery = useQuery({
    queryKey: ['asset-units', materialCode, unitPage, unitStatus],
    queryFn: ({ signal }) =>
      getAssetUnits(
        materialCode,
        unitPage,
        { ...(unitStatus ? { status: unitStatus } : {}) },
        signal,
      ),
    enabled: query.data?.trackingMode === 'SERIALIZED',
    placeholderData: (previous) => previous,
  });

  const activityQuery = useQuery({
    queryKey: ['inventory-activity', materialCode],
    queryFn: ({ signal }) =>
      getAuditEvents(
        {
          page: 1,
          from: dateDaysAgo(365),
          to: dateDaysAgo(0),
          search: materialCode,
        },
        signal,
      ),
    enabled: Boolean(materialCode),
  });
  const quantityHistoryQuery = useQuery({
    queryKey: ['inventory-quantity-history', materialCode, quantityHistoryFilters],
    queryFn: ({ signal }) => {
      const { action, ...historyFilters } = quantityHistoryFilters;
      return getInventoryQuantityEntries(
        materialCode,
        { ...historyFilters, ...(action ? { action } : {}) },
        signal,
      );
    },
    enabled: Boolean(materialCode) && user?.role === 'ADMIN',
  });

  async function updateCached(material: Material) {
    queryClient.setQueryData(['material', materialCode], material);
    await queryClient.invalidateQueries({ queryKey: ['inventory'] });
  }

  useEffect(() => {
    if (parameters.get('status') === '1' && query.data && canChangeStatus) {
      const timeoutId = window.setTimeout(() => {
        setNextMaterialStatus(query.data.status);
        setDialog('status');
      }, 0);
      const next = new URLSearchParams(parameters);
      next.delete('status');
      setParameters(next, { replace: true });
      return () => window.clearTimeout(timeoutId);
    }
    return undefined;
  }, [canChangeStatus, parameters, query.data, setParameters]);

  const statusMutation = useMutation({
    mutationFn: ({ material, status }: { material: Material; status: MaterialStatus }) =>
      setMaterialStatus(material.materialCode, status),
    onSuccess: async (material) => {
      await updateCached(material);
      setDialog(null);
    },
    onError: (error) => {
      setDialog(null);
      setActionError(
        isApiError(error) ? error.message : 'The material status could not be changed.',
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (material: Material) => deleteMaterial(material.materialCode),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
      navigate('/inventory', { replace: true });
    },
    onError: (error) => {
      setDialog(null);
      setActionError(
        isApiError(error)
          ? error.message
          : 'This material could not be deleted. Archive it if it has history.',
      );
    },
  });

  if (query.isPending) return <LoadingPanel label="Loading material details" />;
  if (query.isError || !query.data) {
    return (
      <ErrorState
        message="This material could not be loaded."
        onRetry={() => void query.refetch()}
        title="Material not available"
      />
    );
  }
  const material = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Link className="button-quiet" to="/inventory">
            <ArrowLeft aria-hidden="true" size={18} />
            Back to Inventory
          </Link>
        }
        description={
          material.trackingMode === 'SERIALIZED'
            ? `${material.materialCode} · ${material.category}`
            : material.category
        }
        title={material.name}
      />
      {notice ? (
        <div
          className="rounded-[12px] border border-emerald-200 bg-[var(--color-success-soft)] p-4 text-sm font-bold text-[var(--color-success)]"
          role="status"
        >
          {notice}
        </div>
      ) : null}
      {actionError ? <ErrorSummary message={actionError} title="Action failed" /> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <AppCard>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                <Boxes aria-hidden="true" size={22} />
              </span>
              <div>
                <h2 className="font-extrabold text-[var(--color-primary-strong)]">
                  Inventory information
                </h2>
                <CatalogBadge value={material.status} />
              </div>
            </div>
            {canEditInventory && !editing ? (
              <Button onClick={() => setEditing(true)} variant="secondary">
                <Pencil aria-hidden="true" size={18} />
                Edit details
              </Button>
            ) : null}
          </div>
          {editing ? (
            <EditMaterialForm
              material={material}
              onCancel={() => setEditing(false)}
              onSaved={async (updated) => {
                await updateCached(updated);
                setEditing(false);
              }}
            />
          ) : (
            <dl className="mt-5 divide-y divide-[var(--color-border)]">
              {material.trackingMode === 'SERIALIZED' ? (
                <DetailRow label="Inventory code" value={material.materialCode} />
              ) : null}
              <DetailRow label="Asset type" value={material.category} />
              <DetailRow label="Type/model name" value={material.typeModelName ?? material.name} />
              {material.trackingMode === 'SERIALIZED' ? (
                <DetailRow label="Configuration" value={material.configuration ?? 'Not provided'} />
              ) : null}
              <DetailRow
                label="Store"
                value={
                  material.store ?? material.locationBlock ?? material.location ?? 'Not provided'
                }
              />
              <DetailRow label="Department" value={material.department ?? 'Not provided'} />
              <DetailRow label="Vendor name" value={material.vendorName ?? 'Not provided'} />
              <DetailRow
                label="Entry date"
                value={formatIstDate(material.entryDate ?? material.createdAt)}
              />
              <DetailRow
                label="Inventory type"
                value={<CatalogBadge value={material.trackingMode} />}
              />
              <DetailRow
                label="Return policy"
                value={<CatalogBadge value={material.returnPolicy} />}
              />
              <DetailRow label="Description" value={material.description ?? 'Not provided'} />
              {material.unitLabel ? (
                <DetailRow label="Unit label" value={material.unitLabel} />
              ) : null}
            </dl>
          )}
        </AppCard>

        <div className="space-y-4">
          <AppCard>
            <h2 className="font-extrabold text-[var(--color-primary-strong)]">Availability</h2>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <QuantityStat label="Total" value={material.totalQuantity} />
              <QuantityStat label="Available" value={material.availableQuantity} />
              <QuantityStat label="Issued" value={material.issuedQuantity} />
            </dl>
            {material.unitLabel ? (
              <p className="mt-2 text-center text-xs font-semibold text-[var(--color-text-muted)]">
                Values shown in {material.unitLabel}
              </p>
            ) : null}
            {canAdjustQuantity && material.status === 'ACTIVE' ? (
              <Button
                className="mt-4 w-full"
                onClick={() => setDialog('quantity')}
                variant="secondary"
              >
                <SlidersHorizontal aria-hidden="true" size={18} />
                {material.trackingMode === 'SERIALIZED'
                  ? 'Change IT Asset quantity'
                  : 'Adjust quantity'}
              </Button>
            ) : null}
          </AppCard>
          <AppCard>
            <h2 className="font-extrabold text-[var(--color-primary-strong)]">Record status</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
              Change this record between Active, Under maintenance, Faulty, Outdated, and Archived.
              Status changes apply to both IT Assets and IT Consumables.
            </p>
            {canChangeStatus || canDeleteInventory ? (
              <div className="mt-4 space-y-2">
                {canChangeStatus ? (
                  <Button
                    className="w-full"
                    onClick={() => {
                      setNextMaterialStatus(material.status);
                      setDialog('status');
                    }}
                    variant="secondary"
                  >
                    <RotateCcw aria-hidden="true" size={18} />
                    Change inventory status
                  </Button>
                ) : null}
                {canDeleteInventory ? (
                  <Button className="w-full" onClick={() => setDialog('delete')} variant="danger">
                    <Trash2 aria-hidden="true" size={18} />
                    Delete material
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 rounded-[10px] bg-[var(--color-surface-tint)] p-3 text-xs font-semibold text-[var(--color-text-muted)]">
                Inventory records are read-only for Employee accounts.
              </p>
            )}
          </AppCard>
        </div>
      </div>

      <InventoryFlowPanel material={material} />

      {material.trackingMode === 'SERIALIZED' ? (
        <SerializedUnits
          canAdd={canAddAssetUnits && material.status === 'ACTIVE'}
          canDelete={canDeleteAssetUnits && material.status === 'ACTIVE'}
          canEdit={canEditAssetUnits && material.status === 'ACTIVE'}
          canManage={canManageUnits && material.status === 'ACTIVE'}
          material={material}
          onAdd={() => setDialog('add-unit')}
          onEdit={setEditUnit}
          onPage={(page) => {
            const next = new URLSearchParams(parameters);
            next.set('unitPage', String(page));
            setParameters(next);
          }}
          page={unitPage}
          query={unitsQuery}
          status={unitStatus}
          onStatusChange={(nextStatus) => {
            setUnitStatus(nextStatus);
            const next = new URLSearchParams(parameters);
            next.set('unitPage', '1');
            setParameters(next);
          }}
        />
      ) : null}

      <InventoryActivityPanel
        events={activityQuery.data?.data ?? []}
        loading={activityQuery.isPending}
        onRetry={() => void activityQuery.refetch()}
        unavailable={activityQuery.isError}
      />
      {user?.role === 'ADMIN' ? (
        <QuantityHistoryPanel
          entries={quantityHistoryQuery.data?.data ?? []}
          filters={quantityHistoryFilters}
          loading={quantityHistoryQuery.isPending}
          onRetry={() => void quantityHistoryQuery.refetch()}
          onFiltersChange={setQuantityHistoryFilters}
          unavailable={quantityHistoryQuery.isError}
        />
      ) : null}

      {dialog === 'status' ? (
        <ConfirmStatusDialog
          material={material}
          loading={statusMutation.isPending}
          onCancel={() => setDialog(null)}
          onConfirm={(status) => statusMutation.mutate({ material, status })}
          onStatusChange={setNextMaterialStatus}
          status={nextMaterialStatus}
        />
      ) : null}
      {dialog === 'quantity' ? (
        <QuantityDialog
          material={material}
          onCancel={() => setDialog(null)}
          onSaved={async (updated) => {
            await updateCached(updated);
            await queryClient.invalidateQueries({ queryKey: ['asset-units', materialCode] });
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['inventory-activity', materialCode] }),
              queryClient.invalidateQueries({
                queryKey: ['inventory-quantity-history', materialCode],
              }),
            ]);
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === 'add-unit' ? (
        <UnitDialog
          material={material}
          onCancel={() => setDialog(null)}
          onSaved={async (updated) => {
            await updateCached(updated);
            await queryClient.invalidateQueries({ queryKey: ['asset-units', materialCode] });
            await queryClient.invalidateQueries({
              queryKey: ['inventory-quantity-history', materialCode],
            });
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === 'delete' ? (
        <DeleteMaterialDialog
          loading={deleteMutation.isPending}
          material={material}
          onCancel={() => setDialog(null)}
          onConfirm={() => deleteMutation.mutate(material)}
        />
      ) : null}
      {editUnit ? (
        <UnitDialog
          material={material}
          onCancel={() => setEditUnit(null)}
          onSaved={async (updated) => {
            await updateCached(updated);
            await queryClient.invalidateQueries({ queryKey: ['asset-units', materialCode] });
            setEditUnit(null);
          }}
          unit={editUnit}
        />
      ) : null}
    </div>
  );
}

function QuantityStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[10px] bg-[var(--color-surface-tint)] px-2 py-3">
      <dt className="text-[11px] font-bold text-[var(--color-text-muted)]">{label}</dt>
      <dd className="mt-1 text-lg font-extrabold text-[var(--color-primary-strong)]">{value}</dd>
    </div>
  );
}

function stockHealth(material: Material): {
  label: string;
  description: string;
  className: string;
} {
  if (material.status === 'ARCHIVED') {
    return {
      label: 'Archived',
      description: 'Hidden from active issue workflows and retained for history.',
      className: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
    };
  }
  if (material.availableQuantity <= 0) {
    return {
      label: 'Out of stock',
      description: 'No available stock can be issued right now.',
      className: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
    };
  }
  if (material.availableQuantity < Math.max(2, Math.ceil(material.totalQuantity * 0.2))) {
    return {
      label: 'Low stock',
      description: 'Available stock is low compared with registered total.',
      className: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
    };
  }
  return {
    label: 'Ready',
    description: 'This material has available stock for issue workflows.',
    className: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
  };
}

function InventoryFlowPanel({ material }: { material: Material }) {
  const health = stockHealth(material);
  const inactiveQuantity =
    material.totalQuantity - material.availableQuantity - material.issuedQuantity;
  return (
    <AppCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
            <Workflow aria-hidden="true" size={21} />
          </span>
          <div>
            <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
              Inventory flow
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Full inventory lifecycle from registration to issue, return and closure.
            </p>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${health.className}`}>
          {health.label}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <FlowStep
          active
          detail={`${material.trackingMode === 'SERIALIZED' ? 'Serial-numbered assets' : (material.unitLabel ?? 'Units')} tracked`}
          label="1. Register"
        />
        <FlowStep
          active={material.availableQuantity > 0}
          detail={`${material.availableQuantity} available`}
          label="2. Available"
        />
        <FlowStep
          active={material.issuedQuantity > 0}
          detail={`${material.issuedQuantity} currently issued`}
          label="3. Issued"
        />
        <FlowStep
          active={material.status === 'ARCHIVED'}
          detail={
            material.status === 'ARCHIVED' ? 'Record closed' : 'Archive when no stock is issued'
          }
          label="4. Close"
        />
      </div>

      <div className="mt-5 overflow-hidden rounded-[12px] border border-[var(--color-border)]">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Inventory stock position</caption>
          <thead className="bg-[var(--color-surface-tint)] text-xs text-[var(--color-text-muted)]">
            <tr>
              <th className="h-10 px-3 font-bold">Stock bucket</th>
              <th className="h-10 px-3 font-bold">Quantity</th>
              <th className="h-10 px-3 font-bold">Meaning</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)] text-sm">
            <StockRow
              label="Total registered"
              note="All stock recorded in AssetDesk."
              value={material.totalQuantity}
            />
            <StockRow
              label="Available"
              note="Can be issued right now."
              value={material.availableQuantity}
            />
            <StockRow
              label="Issued"
              note="Currently with receivers."
              value={material.issuedQuantity}
            />
            <StockRow
              label="Repair/damaged/lost/scrapped"
              note="Registered but not issue-ready."
              value={Math.max(0, inactiveQuantity)}
            />
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">{health.description}</p>
    </AppCard>
  );
}

function FlowStep({ label, detail, active }: { label: string; detail: string; active: boolean }) {
  return (
    <div className="rounded-[12px] border border-[var(--color-border)] bg-white p-3">
      <p className="flex items-center gap-2 text-sm font-extrabold text-[var(--color-text-strong)]">
        <CheckCircle2
          aria-hidden="true"
          className={active ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'}
          size={17}
        />
        {label}
      </p>
      <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">{detail}</p>
    </div>
  );
}

function StockRow({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <tr>
      <td className="px-3 py-3 font-bold text-[var(--color-text-strong)]">{label}</td>
      <td className="px-3 py-3 font-extrabold text-[var(--color-primary-strong)]">{value}</td>
      <td className="px-3 py-3 text-[var(--color-text-muted)]">{note}</td>
    </tr>
  );
}

function actionLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function QuantityHistoryPanel({
  entries,
  filters,
  loading,
  unavailable,
  onRetry,
  onFiltersChange,
}: {
  entries: InventoryQuantityEntry[];
  filters: QuantityHistoryFilters;
  loading: boolean;
  unavailable: boolean;
  onRetry: () => void;
  onFiltersChange: (filters: QuantityHistoryFilters) => void;
}) {
  const activeCount = [filters.from, filters.to, filters.vendorName, filters.action].filter(
    Boolean,
  ).length;
  const updateFilter = <K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) =>
    onFiltersChange({ ...filters, [key]: value });

  return (
    <AppCard>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
            <SlidersHorizontal aria-hidden="true" size={21} />
          </span>
          <div>
            <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
              Stock entry history
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Complete quantity additions and removals with the entry date and vendor.
            </p>
          </div>
        </div>
        <FilterPopover
          activeCount={activeCount}
          onClear={() => onFiltersChange({ from: '', to: '', vendorName: '', action: '' })}
          panelClassName="w-[min(94vw,520px)]"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="field-label" htmlFor="quantity-history-from">
                Entry date from
              </label>
              <input
                className="field-input"
                id="quantity-history-from"
                onChange={(event) => updateFilter('from', event.target.value)}
                type="date"
                value={filters.from}
              />
            </div>
            <div className="space-y-1.5">
              <label className="field-label" htmlFor="quantity-history-to">
                Entry date to
              </label>
              <input
                className="field-input"
                id="quantity-history-to"
                onChange={(event) => updateFilter('to', event.target.value)}
                type="date"
                value={filters.to}
              />
            </div>
          </div>
          <TextField
            label="Vendor"
            onChange={(event) => updateFilter('vendorName', event.target.value)}
            optional
            placeholder="Search vendor name"
            value={filters.vendorName}
          />
          <div className="space-y-1.5">
            <label className="field-label" htmlFor="quantity-history-action">
              Entry type
            </label>
            <select
              className="field-input"
              id="quantity-history-action"
              onChange={(event) =>
                updateFilter('action', event.target.value as InventoryQuantityEntryAction | '')
              }
              value={filters.action}
            >
              <option value="">All entry types</option>
              <option value="INITIAL">Initial stock</option>
              <option value="INCREASE">Stock added</option>
              <option value="DECREASE">Stock removed</option>
            </select>
          </div>
        </FilterPopover>
      </div>
      <div className="mt-5">
        {loading ? (
          <LoadingPanel label="Loading quantity history" />
        ) : unavailable ? (
          <ErrorState message="Quantity history could not be loaded." onRetry={onRetry} />
        ) : entries.length === 0 ? (
          <EmptyState
            message="New additions and adjustments will appear here with their date and vendor."
            title="No stock entries found"
          />
        ) : (
          <div className="overflow-x-auto rounded-[12px] border border-[var(--color-border)]">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <caption className="sr-only">Complete material stock entry history</caption>
              <thead className="bg-[var(--color-surface-tint)] text-xs text-[var(--color-text-muted)]">
                <tr>
                  <th className="h-10 px-3 font-bold">Entry date</th>
                  <th className="h-10 px-3 font-bold">Change</th>
                  <th className="h-10 px-3 font-bold">Total after</th>
                  <th className="h-10 px-3 font-bold">Vendor</th>
                  <th className="h-10 px-3 font-bold">Entry type</th>
                  <th className="h-10 px-3 font-bold">Reason</th>
                  <th className="h-10 px-3 font-bold">Added by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)] text-sm">
                {entries.map((entry) => {
                  const positive = entry.quantityDelta >= 0;
                  return (
                    <tr key={entry.id}>
                      <td className="px-3 py-3 text-xs text-[var(--color-text-muted)]">
                        {formatIstDateTime(entry.entryDate)}
                      </td>
                      <td
                        className={`px-3 py-3 font-extrabold ${
                          positive ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
                        }`}
                      >
                        {entry.quantityDelta > 0 ? '+' : ''}
                        {entry.quantityDelta}
                      </td>
                      <td className="px-3 py-3 font-extrabold text-[var(--color-primary-strong)]">
                        {entry.totalQuantity}
                      </td>
                      <td className="px-3 py-3 text-[var(--color-text-muted)]">
                        {entry.vendorName ?? 'Not provided'}
                      </td>
                      <td className="px-3 py-3 font-bold">
                        {entry.action === 'INITIAL'
                          ? 'Initial stock'
                          : entry.action === 'INCREASE'
                            ? 'Stock added'
                            : 'Stock removed'}
                      </td>
                      <td className="max-w-xs px-3 py-3 text-[var(--color-text-muted)]">
                        {entry.reason ?? 'No reason recorded'}
                      </td>
                      <td className="px-3 py-3 text-[var(--color-text-muted)]">
                        {entry.actorWorkerId ?? 'System'}
                        {entry.actorRole ? ` · ${entry.actorRole}` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppCard>
  );
}

function InventoryActivityPanel({
  events,
  loading,
  unavailable,
  onRetry,
}: {
  events: AuditEvent[];
  loading: boolean;
  unavailable: boolean;
  onRetry: () => void;
}) {
  return (
    <AppCard>
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
          <FileClock aria-hidden="true" size={21} />
        </span>
        <div>
          <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
            Inventory log
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Recent material changes, stock adjustments and protected actions.
          </p>
        </div>
      </div>
      <div className="mt-5">
        {loading ? (
          <LoadingPanel label="Loading inventory log" />
        ) : unavailable ? (
          <ErrorState message="Inventory log could not be loaded." onRetry={onRetry} />
        ) : events.length === 0 ? (
          <EmptyState
            message="New material edits, stock changes and unit actions will appear here."
            title="No inventory log entries"
          />
        ) : (
          <div className="overflow-hidden rounded-[12px] border border-[var(--color-border)]">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Material inventory activity log</caption>
              <thead className="bg-[var(--color-surface-tint)] text-xs text-[var(--color-text-muted)]">
                <tr>
                  <th className="h-10 px-3 font-bold">Time</th>
                  <th className="h-10 px-3 font-bold">Action</th>
                  <th className="h-10 px-3 font-bold">Actor</th>
                  <th className="h-10 px-3 font-bold">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)] text-sm">
                {events.slice(0, 10).map((event) => (
                  <ActivityRow event={event} key={event.id} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppCard>
  );
}

function ActivityRow({ event }: { event: AuditEvent }) {
  return (
    <tr className="align-top">
      <td className="px-3 py-3 text-xs text-[var(--color-text-muted)]">
        {formatIstDateTime(event.timestampUtc)}
      </td>
      <td className="px-3 py-3 font-bold text-[var(--color-text-strong)]">
        {actionLabel(event.action)}
      </td>
      <td className="px-3 py-3 text-[var(--color-text-muted)]">
        {event.actorWorkerId ?? 'System'}
      </td>
      <td className="px-3 py-3 text-xs text-[var(--color-text-muted)]">
        {event.reasonCode ? <p className="font-bold">{event.reasonCode}</p> : null}
        {event.metadata ? JSON.stringify(event.metadata) : event.requestId}
      </td>
    </tr>
  );
}

function editMaterialMessage(
  form: {
    name: string;
    category: string;
    typeModelName: string;
    store: string;
    department: string;
    unitLabel: string;
  },
  material: Material,
): string | null {
  if (form.category.trim().length < 2) return 'Choose an asset type, or add a new asset type.';
  if (form.typeModelName.trim().length < 2)
    return 'Enter a type/model name with at least 2 characters.';
  if (form.store.trim().length < 1) return 'Choose a store from Add asset details.';
  if (form.department.trim().length < 1) return 'Choose a department from Add asset details.';
  if (material.trackingMode === 'QUANTITY' && form.unitLabel.trim().length < 1) {
    return 'Enter a unit label, for example units, boxes, meters, or pieces.';
  }
  return null;
}

function EditMaterialForm({
  material,
  onSaved,
  onCancel,
}: {
  material: Material;
  onSaved: (material: Material) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: material.name,
    category: material.category,
    typeModelName: material.typeModelName ?? material.name,
    store: material.store ?? material.locationBlock ?? material.location ?? '',
    department: material.department ?? '',
    vendorName: material.vendorName ?? '',
    entryDate: material.entryDate
      ? toIstDateTimeInput(new Date(material.entryDate)).slice(0, 10)
      : dateDaysAgo(0),
    description: material.description ?? '',
    returnPolicy: material.returnPolicy,
    unitLabel: material.unitLabel ?? '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const detailsQuery = useQuery({
    queryKey: ['asset-details'],
    queryFn: ({ signal }) => getAssetDetails(undefined, signal),
  });
  const stores = detailsQuery.data?.filter((detail) => detail.kind === 'STORE') ?? [];
  const departments = detailsQuery.data?.filter((detail) => detail.kind === 'DEPARTMENT') ?? [];
  const modelsQuery = useQuery({
    queryKey: ['inventory-models', form.category, material.trackingMode],
    queryFn: ({ signal }) => getInventoryModels(form.category, material.trackingMode, signal),
    enabled: Boolean(form.category),
  });
  const categoryKind = material.trackingMode === 'SERIALIZED' ? 'ASSET_TYPE' : 'CONSUMABLE_TYPE';
  const cachedModelNames =
    detailsQuery.data?.find(
      (detail) =>
        detail.kind === categoryKind &&
        detail.name.toLocaleUpperCase('en-US') === form.category.toLocaleUpperCase('en-US'),
    )?.models ?? [];
  const modelOptions = inventoryModelOptions(
    modelsQuery.data ?? [],
    cachedModelNames,
    form.typeModelName,
  );
  const selectedModelName = resolveCatalogOption(form.typeModelName, modelOptions);
  const mutation = useMutation({
    mutationFn: (input: UpdateMaterialRequest) => updateMaterial(material.materialCode, input),
    onSuccess: onSaved,
    onError: (error) =>
      setMessage(isApiError(error) ? error.message : 'Changes could not be saved.'),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formMessage = editMaterialMessage(form, material);
    if (formMessage) {
      setMessage(formMessage);
      return;
    }
    const result = UpdateMaterialRequestSchema.safeParse({
      name: selectedModelName,
      category: form.category,
      typeModelName: selectedModelName,
      store: form.store,
      department: form.department,
      vendorName: form.vendorName.trim() || null,
      entryDate: form.entryDate,
      description: form.description.trim() || null,
      returnPolicy: form.returnPolicy,
      ...(material.trackingMode === 'QUANTITY' ? { unitLabel: form.unitLabel } : {}),
    });
    if (!result.success) {
      setMessage(result.error.issues[0]?.message ?? 'Check the material details.');
      return;
    }
    mutation.mutate(result.data);
  }
  return (
    <form className="mt-5 space-y-5" noValidate onSubmit={submit}>
      {message ? <ErrorSummary message={message} /> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          disabled={!form.category || (modelsQuery.isPending && modelOptions.length === 0)}
          hint={
            modelsQuery.isError
              ? cachedModelNames.length > 0
                ? 'Showing the last Model Master values saved with this category.'
                : 'Models could not be loaded. Refresh the page or check Model Master.'
              : form.category && !modelsQuery.isPending && modelOptions.length === 0
                ? 'No models are registered for this category and material type.'
                : undefined
          }
          id="edit-material-model"
          label="Type/model name"
          onChange={(typeModelName) =>
            setForm((value) => ({ ...value, name: typeModelName, typeModelName }))
          }
          value={selectedModelName}
        >
          <option value="">
            {!form.category
              ? 'Choose category first'
              : modelsQuery.isPending && modelOptions.length === 0
                ? 'Loading registered models…'
                : 'Choose registered model'}
          </option>
          {modelOptions.map((modelName) => (
            <option key={modelName.toLocaleUpperCase('en-US')} value={modelName}>
              {modelName}
            </option>
          ))}
        </SelectField>
        <MaterialCategoryField
          id="edit-material-category"
          onChange={(category) =>
            setForm((value) => ({ ...value, category, name: '', typeModelName: '' }))
          }
          trackingMode={material.trackingMode}
          value={form.category}
        />
        <SelectField
          id="edit-material-store"
          label="Store"
          onChange={(store) => setForm((value) => ({ ...value, store }))}
          value={form.store}
        >
          <option value="">Choose store</option>
          {stores.map((store) => (
            <option key={store.id} value={store.name}>
              {store.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="edit-material-department"
          label="Department"
          onChange={(department) => setForm((value) => ({ ...value, department }))}
          value={form.department}
        >
          <option value="">Choose department</option>
          {departments.map((department) => (
            <option key={department.id} value={department.name}>
              {department.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Vendor name (optional)"
          maxLength={120}
          onChange={(event) => setForm((value) => ({ ...value, vendorName: event.target.value }))}
          value={form.vendorName}
        />
        <TextField
          label="Entry date"
          onChange={(event) => setForm((value) => ({ ...value, entryDate: event.target.value }))}
          required
          type="date"
          value={form.entryDate}
        />
      </div>
      <div className="space-y-1.5">
        <label className="field-label" htmlFor="edit-material-description">
          Description <span className="font-medium text-[var(--color-text-muted)]">(optional)</span>
        </label>
        <textarea
          className="field-input min-h-24 resize-y"
          id="edit-material-description"
          onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))}
          value={form.description}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          disabled={material.trackingMode === 'SERIALIZED'}
          id="edit-material-return-policy"
          label="Return policy"
          onChange={(value) =>
            setForm((current) => ({ ...current, returnPolicy: value as ReturnPolicy }))
          }
          value={form.returnPolicy}
        >
          <option value="REUSABLE">Reusable</option>
          <option value="CONSUMABLE">Consumable</option>
        </SelectField>
        {material.trackingMode === 'QUANTITY' ? (
          <TextField
            label="Unit label"
            onChange={(event) => setForm((value) => ({ ...value, unitLabel: event.target.value }))}
            value={form.unitLabel}
          />
        ) : null}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button disabled={mutation.isPending} onClick={onCancel} type="button" variant="secondary">
          Cancel
        </Button>
        <Button loading={mutation.isPending} type="submit">
          {mutation.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}

function SerializedUnits({
  material,
  canAdd,
  canEdit,
  page,
  status,
  onPage,
  onAdd,
  onEdit,
  onStatusChange,
  query,
}: {
  material: Material;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManage: boolean;
  page: number;
  status: AssetUnitStatus | '';
  onPage: (page: number) => void;
  onAdd: () => void;
  onEdit: (unit: AssetUnit) => void;
  onStatusChange: (status: AssetUnitStatus | '') => void;
  query: ReturnType<typeof useQuery<AssetUnitsListResponse>>;
}) {
  return (
    <AppCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
            IT Asset units
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Each physical item has its own serial number, asset tag, condition and status.
          </p>
        </div>
        {canAdd && material.status === 'ACTIVE' ? (
          <Button onClick={onAdd}>
            <Plus aria-hidden="true" size={18} />
            Add IT Asset
          </Button>
        ) : null}
      </div>
      <div className="mt-4 grid gap-3 sm:max-w-xs">
        <SelectField
          id="asset-unit-status-filter"
          label="Asset status"
          onChange={(value) => onStatusChange(value as AssetUnitStatus | '')}
          value={status}
        >
          <option value="">All statuses</option>
          <option value="AVAILABLE">Available</option>
          <option value="ISSUED">Issued</option>
          <option value="OUTSIDE">Outside university</option>
          <option value="RETURNED">Returned</option>
          <option value="UNDER_REPAIR">Under repair</option>
          <option value="DAMAGED">Damaged</option>
          <option value="LOST">Lost</option>
          <option value="SCRAPPED">Scrapped</option>
        </SelectField>
      </div>
      <div className="mt-5">
        {query.isPending ? (
          <LoadingPanel label="Loading IT Asset units" />
        ) : query.isError ? (
          <ErrorState
            message="IT Asset units could not be loaded."
            onRetry={() => void query.refetch()}
          />
        ) : !query.data?.data.length ? (
          <EmptyState
            action={
              canAdd ? (
                <Button onClick={onAdd}>
                  <PackagePlus aria-hidden="true" size={18} />
                  Add first unit
                </Button>
              ) : undefined
            }
            message={
              canAdd
                ? 'Add each physical item to begin tracking availability.'
                : 'No available IT Asset units are shown.'
            }
            title="No IT Asset units"
          />
        ) : (
          <>
            <div className="space-y-3 min-[840px]:hidden">
              {query.data.data.map((unit) => (
                <UnitCard canEdit={canEdit} key={unit.assetTag} onEdit={onEdit} unit={unit} />
              ))}
            </div>
            <UnitTable canEdit={canEdit} onEdit={onEdit} units={query.data.data} />
            {query.data.meta.totalPages > 1 ? (
              <nav
                aria-label="Serialized unit pages"
                className="mt-5 flex items-center justify-between gap-3"
              >
                <Button disabled={page <= 1} onClick={() => onPage(page - 1)} variant="secondary">
                  Previous
                </Button>
                <p className="text-sm font-semibold text-[var(--color-text-muted)]">
                  Page {page} of {query.data.meta.totalPages}
                </p>
                <Button
                  disabled={page >= query.data.meta.totalPages}
                  onClick={() => onPage(page + 1)}
                  variant="secondary"
                >
                  Next
                </Button>
              </nav>
            ) : null}
          </>
        )}
      </div>
    </AppCard>
  );
}

function UnitCard({
  unit,
  canEdit,
  onEdit,
}: {
  unit: AssetUnit;
  canEdit: boolean;
  onEdit: (unit: AssetUnit) => void;
}) {
  return (
    <article className="rounded-[12px] border border-[var(--color-border)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-extrabold text-[var(--color-text-strong)]">{unit.assetTag}</h3>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {unit.serialNumber ?? 'No serial number'}
          </p>
        </div>
        <CatalogBadge value={unit.status} />
      </div>
      <p className="mt-3 text-sm text-[var(--color-text-muted)]">
        Condition:{' '}
        <span className="font-bold text-[var(--color-text-strong)]">{unit.condition}</span>
      </p>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
        Registered {formatIstDateTime(unit.createdAt)}
      </p>
      {canEdit && unit.status !== 'OUTSIDE' ? (
        <Button className="mt-3 w-full" onClick={() => onEdit(unit)} variant="secondary">
          <Pencil aria-hidden="true" size={17} />
          Edit unit
        </Button>
      ) : null}
    </article>
  );
}

function UnitTable({
  units,
  canEdit,
  onEdit,
}: {
  units: AssetUnit[];
  canEdit: boolean;
  onEdit: (unit: AssetUnit) => void;
}) {
  return (
    <div className="hidden overflow-hidden rounded-[12px] border border-[var(--color-border)] min-[840px]:block">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Serialized asset units</caption>
        <thead className="bg-[var(--color-surface-tint)] text-xs text-[var(--color-text-muted)]">
          <tr>
            <th className="h-11 px-4 font-bold" scope="col">
              Asset tag
            </th>
            <th className="h-11 px-4 font-bold" scope="col">
              Serial number
            </th>
            <th className="h-11 px-4 font-bold" scope="col">
              Condition
            </th>
            <th className="h-11 px-4 font-bold" scope="col">
              Status
            </th>
            <th className="h-11 px-4 font-bold" scope="col">
              Registered
            </th>
            {canEdit ? (
              <th className="h-11 px-4 text-right font-bold" scope="col">
                Action
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {units.map((unit) => (
            <tr className="h-[58px]" key={unit.assetTag}>
              <td className="px-4 text-sm font-bold text-[var(--color-text-strong)]">
                {unit.assetTag}
              </td>
              <td className="px-4 text-sm text-[var(--color-text-muted)]">
                {unit.serialNumber ?? 'Not provided'}
              </td>
              <td className="px-4 text-sm text-[var(--color-text-muted)]">{unit.condition}</td>
              <td className="px-4">
                <CatalogBadge value={unit.status} />
              </td>
              <td className="px-4 text-sm text-[var(--color-text-muted)]">
                {formatIstDateTime(unit.createdAt)}
              </td>
              {canEdit && unit.status !== 'OUTSIDE' ? (
                <td className="px-4 text-right">
                  <Button onClick={() => onEdit(unit)} variant="quiet">
                    Edit
                  </Button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const reference = useRef<HTMLDialogElement>(null);
  useEffect(() => reference.current?.showModal(), []);
  return (
    <dialog
      aria-labelledby="inventory-dialog-title"
      className="w-[min(92vw,520px)] rounded-[18px] border border-[var(--color-border)] bg-white p-0 text-[var(--color-text)] shadow-[var(--shadow-overlay)]"
      onCancel={onClose}
      onClose={onClose}
      ref={reference}
    >
      <div className="p-5 sm:p-6">
        <h2
          className="text-lg font-extrabold text-[var(--color-primary-strong)]"
          id="inventory-dialog-title"
        >
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}

function ConfirmStatusDialog({
  material,
  status,
  loading,
  onConfirm,
  onStatusChange,
  onCancel,
}: {
  material: Material;
  status: MaterialStatus;
  loading: boolean;
  onConfirm: (status: MaterialStatus) => void;
  onStatusChange: (status: MaterialStatus) => void;
  onCancel: () => void;
}) {
  return (
    <Dialog onClose={onCancel} title="Change inventory status">
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
        Choose the new status for {material.name}. Non-active statuses are blocked while stock is
        issued.
      </p>
      <label className="mt-5 block space-y-1.5">
        <span className="field-label">Inventory status</span>
        <select
          className="field-input"
          onChange={(event) => onStatusChange(event.target.value as MaterialStatus)}
          value={status}
        >
          <option value="ACTIVE">Active / in use</option>
          <option value="UNDER_MAINTENANCE">Under maintenance</option>
          <option value="SCRAP">Faulty (scrap)</option>
          <option value="NOT_IN_USE">Outdated (not in use)</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </label>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button disabled={loading} onClick={onCancel} variant="secondary">
          Cancel
        </Button>
        <Button
          disabled={status === material.status}
          loading={loading}
          onClick={() => onConfirm(status)}
        >
          {loading ? 'Saving…' : 'Save status'}
        </Button>
      </div>
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
    <Dialog onClose={onCancel} title="Delete material?">
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
        {material.name} will be permanently removed from Inventory. Delete is allowed only when
        there is no issue history and no stock is currently issued.
      </p>
      <dl className="mt-5 grid gap-2 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-tint)] p-3 text-sm">
        {material.trackingMode === 'SERIALIZED' ? (
          <div className="flex justify-between gap-3">
            <dt className="font-bold text-[var(--color-text-muted)]">Material code</dt>
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
    </Dialog>
  );
}

function QuantityDialog({
  material,
  onSaved,
  onCancel,
}: {
  material: Material;
  onSaved: (material: Material) => Promise<void>;
  onCancel: () => void;
}) {
  const [direction, setDirection] = useState<QuantityAdjustmentDirection>('INCREASE');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [entryDate, setEntryDate] = useState(dateDaysAgo(0));
  const [vendorName, setVendorName] = useState(material.vendorName ?? '');
  const [serialNumbers, setSerialNumbers] = useState<string[]>([]);
  const [selectedAssetTags, setSelectedAssetTags] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const parsedAmount = Number(amount);
  const contractMaximum = quantityAdjustmentMaximum(material, direction);
  const maximum =
    material.trackingMode === 'SERIALIZED'
      ? Math.min(contractMaximum, direction === 'INCREASE' ? 1_000 : 100)
      : contractMaximum;
  const quantityDelta = signedQuantityDelta(direction, amount);
  const availableUnitsQuery = useQuery({
    queryKey: ['asset-units-removable', material.materialCode],
    queryFn: ({ signal }) =>
      getAssetUnits(material.materialCode, 1, { status: 'AVAILABLE', pageSize: 100 }, signal),
    enabled:
      material.trackingMode === 'SERIALIZED' &&
      direction === 'DECREASE' &&
      Number.isInteger(parsedAmount) &&
      parsedAmount > 0,
  });
  const mutation = useMutation({
    mutationFn: async (input: {
      quantityDelta: number;
      reason: string;
      entryDate?: string | undefined;
      vendorName?: string | undefined;
    }) => {
      if (material.trackingMode === 'QUANTITY') {
        return adjustMaterialQuantity(material.materialCode, input);
      }
      if (input.quantityDelta > 0) {
        let latest = material;
        for (const serialNumber of serialNumbers.slice(0, input.quantityDelta)) {
          const result = await addAssetUnit(material.materialCode, {
            serialNumber: serialNumber.trim(),
            condition: 'Good',
            ...(input.entryDate ? { entryDate: input.entryDate } : {}),
            ...(input.vendorName ? { vendorName: input.vendorName } : {}),
          });
          latest = result.material;
        }
        return latest;
      }
      let latest = material;
      for (const assetTag of selectedAssetTags.slice(0, Math.abs(input.quantityDelta))) {
        const result = await deleteAssetUnit(material.materialCode, assetTag);
        latest = result.material;
      }
      return latest;
    },
    onSuccess: onSaved,
    onError: (error) =>
      setMessage(isApiError(error) ? error.message : 'The quantity could not be adjusted.'),
  });
  function setSerializedAmount(rawValue: string) {
    setAmount(rawValue);
    const next = Number(rawValue);
    if (material.trackingMode !== 'SERIALIZED') return;
    if (direction === 'INCREASE' && Number.isInteger(next) && next > 0 && next <= maximum) {
      setSerialNumbers((current) =>
        Array.from({ length: next }, (_, index) => current[index] ?? ''),
      );
    } else {
      setSerialNumbers([]);
    }
    setSelectedAssetTags([]);
  }

  function changeDirection(value: QuantityAdjustmentDirection) {
    setDirection(value);
    setAmount('');
    setSerialNumbers([]);
    setSelectedAssetTags([]);
    setMessage(null);
  }
  function toggleAssetTag(assetTag: string) {
    setSelectedAssetTags((current) =>
      current.includes(assetTag)
        ? current.filter((value) => value !== assetTag)
        : [...current, assetTag],
    );
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!amount.trim() || !Number.isInteger(parsedAmount) || parsedAmount < 1) {
      setMessage('Enter a whole-number quantity greater than zero.');
      return;
    }
    if (parsedAmount > maximum) {
      setMessage(
        direction === 'DECREASE'
          ? `You can remove at most ${maximum} available ${material.trackingMode === 'SERIALIZED' ? 'IT Assets in one change' : (material.unitLabel ?? 'units')}.`
          : `You can add at most ${maximum} ${material.trackingMode === 'SERIALIZED' ? 'IT Assets in one change' : (material.unitLabel ?? 'units')}.`,
      );
      return;
    }
    const result = AdjustQuantityRequestSchema.safeParse({
      quantityDelta,
      reason,
      entryDate,
      ...(vendorName.trim() ? { vendorName: vendorName.trim() } : {}),
    });
    if (!result.success) {
      setMessage(result.error.issues[0]?.message ?? 'Check the adjustment.');
      return;
    }
    if (material.trackingMode === 'SERIALIZED') {
      if (result.data.quantityDelta > 0) {
        const prepared = serialNumbers.map((value) => value.trim());
        if (prepared.length !== result.data.quantityDelta || prepared.some((value) => !value)) {
          setMessage(
            `Enter one serial number for each of the ${result.data.quantityDelta} IT Assets.`,
          );
          return;
        }
        const unique = new Set(prepared.map((value) => value.toLocaleUpperCase('en-US')));
        if (unique.size !== prepared.length) {
          setMessage('Serial numbers must be unique.');
          return;
        }
      }
      if (
        result.data.quantityDelta < 0 &&
        selectedAssetTags.length !== Math.abs(result.data.quantityDelta)
      ) {
        setMessage(
          `Select ${Math.abs(result.data.quantityDelta)} available IT Asset units to remove.`,
        );
        return;
      }
    }
    mutation.mutate(result.data);
  }
  const title =
    material.trackingMode === 'SERIALIZED' ? 'Change IT Asset quantity' : 'Adjust quantity';
  return (
    <Dialog onClose={onCancel} title={title}>
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
        {material.trackingMode === 'SERIALIZED'
          ? 'Add IT Assets with serial numbers, or remove available units that have never been issued.'
          : 'Choose Increase or Decrease, then enter a positive whole number. Issued stock cannot be removed.'}
      </p>
      {message ? (
        <div className="mt-4">
          <ErrorSummary message={message} />
        </div>
      ) : null}
      <form className="mt-5 space-y-5" onSubmit={submit}>
        <fieldset>
          <legend className="field-label">Adjustment type</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {(
              [
                ['INCREASE', 'Increase stock', Plus],
                ['DECREASE', 'Decrease stock', Minus],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                aria-pressed={direction === value}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-[8px] border px-3 text-sm font-extrabold transition ${
                  direction === value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]'
                    : 'border-[var(--color-border-control)] bg-white text-[var(--color-text-muted)] hover:border-[var(--color-primary-border)]'
                }`}
                key={value}
                onClick={() => changeDirection(value)}
                type="button"
              >
                <Icon aria-hidden="true" size={17} />
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <TextField
          hint={`Current: ${material.totalQuantity} total · ${material.availableQuantity} available${material.trackingMode === 'SERIALIZED' && direction === 'DECREASE' ? ' · maximum 100 removals per change' : ''}.`}
          inputMode="numeric"
          label={direction === 'INCREASE' ? 'Quantity to add' : 'Quantity to remove'}
          max={String(maximum)}
          min="1"
          onChange={(event) =>
            material.trackingMode === 'SERIALIZED'
              ? setSerializedAmount(event.target.value)
              : setAmount(event.target.value)
          }
          placeholder="Enter a positive whole number"
          required
          step="1"
          type="number"
          value={amount}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Entry date"
            onChange={(event) => setEntryDate(event.target.value)}
            required
            type="date"
            value={entryDate}
          />
          <TextField
            label="Vendor name"
            onChange={(event) => setVendorName(event.target.value)}
            optional
            placeholder="Supplier or vendor"
            value={vendorName}
          />
        </div>
        {material.trackingMode === 'SERIALIZED' && quantityDelta > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {serialNumbers.map((serialNumber, index) => (
              <TextField
                key={index}
                label={`New asset ${index + 1} serial number`}
                maxLength={120}
                onChange={(event) =>
                  setSerialNumbers((current) =>
                    current.map((value, currentIndex) =>
                      currentIndex === index ? event.target.value : value,
                    ),
                  )
                }
                required
                value={serialNumber}
              />
            ))}
          </div>
        ) : null}
        {material.trackingMode === 'SERIALIZED' && quantityDelta < 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-bold text-[var(--color-text-strong)]">
              Select {Math.abs(quantityDelta)} available IT Asset units
            </p>
            {availableUnitsQuery.isPending ? (
              <LoadingPanel label="Loading available IT Assets" />
            ) : availableUnitsQuery.isError ? (
              <ErrorSummary message="Available IT Assets could not be loaded." />
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-[12px] border border-[var(--color-border)] p-2">
                {(availableUnitsQuery.data?.data ?? []).map((unit) => (
                  <label
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-[10px] p-2 hover:bg-[var(--color-surface-tint)]"
                    key={unit.assetTag}
                  >
                    <span>
                      <span className="block text-sm font-extrabold text-[var(--color-text-strong)]">
                        {unit.assetTag}
                      </span>
                      <span className="block text-xs text-[var(--color-text-muted)]">
                        {unit.serialNumber ?? 'No serial number'}
                      </span>
                    </span>
                    <input
                      checked={selectedAssetTags.includes(unit.assetTag)}
                      disabled={
                        !selectedAssetTags.includes(unit.assetTag) &&
                        selectedAssetTags.length >= Math.abs(quantityDelta)
                      }
                      onChange={() => toggleAssetTag(unit.assetTag)}
                      type="checkbox"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        ) : null}
        <div className="space-y-1.5">
          <label className="field-label" htmlFor="quantity-reason">
            Reason
          </label>
          <textarea
            className="field-input min-h-24 resize-y"
            id="quantity-reason"
            maxLength={500}
            minLength={5}
            onChange={(event) => setReason(event.target.value)}
            required
            value={reason}
          />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            disabled={mutation.isPending}
            onClick={onCancel}
            type="button"
            variant="secondary"
          >
            Cancel
          </Button>
          <Button loading={mutation.isPending} type="submit">
            {mutation.isPending
              ? 'Saving…'
              : direction === 'INCREASE'
                ? 'Increase quantity'
                : 'Decrease quantity'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function validStatuses(unit: AssetUnit): ManualAssetUnitStatus[] {
  if (unit.status === 'OUTSIDE') return [];
  if (unit.status === 'AVAILABLE') {
    return ['AVAILABLE', 'UNDER_REPAIR', 'DAMAGED', 'LOST', 'SCRAPPED'];
  }
  if (unit.status === 'RETURNED') {
    return ['RETURNED', 'AVAILABLE', 'UNDER_REPAIR', 'DAMAGED', 'LOST', 'SCRAPPED'];
  }
  if (unit.status === 'UNDER_REPAIR' || unit.status === 'DAMAGED' || unit.status === 'LOST') {
    return ['AVAILABLE', 'UNDER_REPAIR', 'DAMAGED', 'LOST', 'SCRAPPED'];
  }
  return ['SCRAPPED'];
}

function UnitDialog({
  material,
  unit,
  onSaved,
  onCancel,
}: {
  material: Material;
  unit?: AssetUnit;
  onSaved: (material: Material) => Promise<void>;
  onCancel: () => void;
}) {
  const [serialNumber, setSerialNumber] = useState(unit?.serialNumber ?? '');
  const [condition, setCondition] = useState(unit?.condition ?? 'Good');
  const [status, setStatus] = useState<ManualAssetUnitStatus>(
    unit?.status === 'ISSUED' || unit?.status === 'OUTSIDE'
      ? 'AVAILABLE'
      : (unit?.status ?? 'AVAILABLE'),
  );
  const [reason, setReason] = useState('');
  const [entryDate, setEntryDate] = useState(
    unit?.entryDate ? toIstDateTimeInput(new Date(unit.entryDate)).slice(0, 10) : dateDaysAgo(0),
  );
  const [vendorName, setVendorName] = useState(unit?.vendorName ?? material.vendorName ?? '');
  const statusOptions = unit ? validStatuses(unit) : [];
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      if (unit) {
        const result = UpdateAssetUnitRequestSchema.safeParse({
          ...(!['ISSUED', 'OUTSIDE'].includes(unit.status)
            ? { serialNumber: serialNumber.trim() }
            : {}),
          condition,
          ...(!['ISSUED', 'OUTSIDE'].includes(unit.status) ? { status } : {}),
          entryDate,
          vendorName: vendorName.trim() || null,
          reason,
        });
        if (!result.success)
          throw new Error(result.error.issues[0]?.message ?? 'Check the unit details.');
        return updateAssetUnit(material.materialCode, unit.assetTag, result.data);
      }
      const result = CreateAssetUnitRequestSchema.safeParse({
        serialNumber: serialNumber.trim(),
        condition,
        entryDate,
        ...(vendorName.trim() ? { vendorName: vendorName.trim() } : {}),
      });
      if (!result.success)
        throw new Error(result.error.issues[0]?.message ?? 'Check the unit details.');
      return addAssetUnit(material.materialCode, result.data);
    },
    onSuccess: (result) => onSaved(result.material),
    onError: (error) =>
      setMessage(
        isApiError(error) || error instanceof Error
          ? error.message
          : 'The unit could not be saved.',
      ),
  });
  return (
    <Dialog onClose={onCancel} title={unit ? `Repair / edit ${unit.assetTag}` : 'Add IT Asset'}>
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
        {unit
          ? 'Update condition and service status. Changes are written to the inventory log.'
          : 'An Asset tag will be generated automatically.'}
      </p>
      {message ? (
        <div className="mt-4">
          <ErrorSummary message={message} />
        </div>
      ) : null}
      <form
        className="mt-5 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <TextField
          disabled={unit?.status === 'ISSUED'}
          hint={
            unit?.status === 'ISSUED'
              ? 'Serial number is locked while this IT Asset is issued.'
              : undefined
          }
          label="Serial number"
          onChange={(event) => setSerialNumber(event.target.value)}
          required
          value={serialNumber}
        />
        <TextField
          label="Condition"
          onChange={(event) => setCondition(event.target.value)}
          placeholder="Good, repaired, keyboard replaced..."
          required
          value={condition}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Entry date"
            onChange={(event) => setEntryDate(event.target.value)}
            required
            type="date"
            value={entryDate}
          />
          <TextField
            label="Vendor name"
            onChange={(event) => setVendorName(event.target.value)}
            optional
            placeholder="Supplier or vendor"
            value={vendorName}
          />
        </div>
        {unit && unit.status !== 'ISSUED' ? (
          <SelectField
            id="unit-status"
            label="Unit status"
            onChange={(value) => setStatus(value as ManualAssetUnitStatus)}
            value={status}
          >
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                {humanizeCatalogValue(value)}
              </option>
            ))}
          </SelectField>
        ) : unit ? (
          <p className="rounded-[10px] bg-[var(--color-warning-soft)] p-3 text-sm text-[var(--color-warning)]">
            An issued unit’s status is managed through Return workflows.
          </p>
        ) : null}
        {unit ? (
          <div className="space-y-1.5">
            <label className="field-label" htmlFor="unit-update-reason">
              Log reason
            </label>
            <textarea
              className="field-input min-h-20 resize-y"
              id="unit-update-reason"
              maxLength={500}
              minLength={5}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Example: repaired display and verified working"
              required
              value={reason}
            />
          </div>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            disabled={mutation.isPending}
            onClick={onCancel}
            type="button"
            variant="secondary"
          >
            Cancel
          </Button>
          <Button loading={mutation.isPending} type="submit">
            {mutation.isPending ? 'Saving…' : unit ? 'Save repair log' : 'Add IT Asset'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
