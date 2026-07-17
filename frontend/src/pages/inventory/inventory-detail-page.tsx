import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowLeft,
  Boxes,
  PackagePlus,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';

import {
  AdjustQuantityRequestSchema,
  CreateAssetUnitRequestSchema,
  UpdateAssetUnitRequestSchema,
  UpdateMaterialRequestSchema,
  type AssignmentType,
  type AssetUnit,
  type AssetUnitsListResponse,
  type ManualAssetUnitStatus,
  type Material,
  type ReturnPolicy,
  type UpdateMaterialRequest,
} from '@assetdesk/contracts';

import { useAuth } from '../../auth/auth-context';
import { CatalogBadge, DetailRow, SelectField } from '../../components/catalog-ui';
import {
  AppCard,
  Button,
  EmptyState,
  ErrorState,
  ErrorSummary,
  LoadingPanel,
  PageHeader,
  TextField,
} from '../../components/ui';
import { isApiError } from '../../lib/api-client';
import { humanizeCatalogValue } from '../../lib/catalog-format';
import {
  addAssetUnit,
  adjustMaterialQuantity,
  getAssetUnits,
  getMaterial,
  setMaterialStatus,
  updateAssetUnit,
  updateMaterial,
} from '../../lib/inventory-api';
import { MaterialCategoryField } from './material-category-field';

export function InventoryDetailPage() {
  const { materialCode = '' } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [parameters, setParameters] = useSearchParams();
  const unitPage = Math.max(1, Number(parameters.get('unitPage')) || 1);
  const [editing, setEditing] = useState(parameters.get('edit') === '1');
  const [dialog, setDialog] = useState<'status' | 'quantity' | 'add-unit' | null>(null);
  const [editUnit, setEditUnit] = useState<AssetUnit | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const notice = (location.state as { notice?: string } | null)?.notice;
  const admin = user?.role === 'ADMIN';

  const query = useQuery({
    queryKey: ['material', materialCode],
    queryFn: ({ signal }) => getMaterial(materialCode, signal),
    enabled: Boolean(materialCode),
  });

  const unitsQuery = useQuery({
    queryKey: ['asset-units', materialCode, unitPage],
    queryFn: ({ signal }) => getAssetUnits(materialCode, unitPage, signal),
    enabled: query.data?.trackingMode === 'SERIALIZED',
    placeholderData: (previous) => previous,
  });

  async function updateCached(material: Material) {
    queryClient.setQueryData(['material', materialCode], material);
    await queryClient.invalidateQueries({ queryKey: ['inventory'] });
  }

  const statusMutation = useMutation({
    mutationFn: (material: Material) =>
      setMaterialStatus(
        material.materialCode,
        material.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE',
      ),
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
        description={`${material.materialCode} · ${material.category}`}
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
                  Material information
                </h2>
                <CatalogBadge value={material.status} />
              </div>
            </div>
            {admin && !editing ? (
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
              <DetailRow label="Material code" value={material.materialCode} />
              <DetailRow label="Material group" value={material.category} />
              <DetailRow
                label="Tracking mode"
                value={<CatalogBadge value={material.trackingMode} />}
              />
              <DetailRow
                label="Return policy"
                value={<CatalogBadge value={material.returnPolicy} />}
              />
              <DetailRow label="Assignment types" value={assignmentLabel(material.assignmentTypes)} />
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
            {admin && material.status === 'ACTIVE' && material.trackingMode === 'QUANTITY' ? (
              <Button
                className="mt-4 w-full"
                onClick={() => setDialog('quantity')}
                variant="secondary"
              >
                <SlidersHorizontal aria-hidden="true" size={18} />
                Adjust quantity
              </Button>
            ) : null}
          </AppCard>
          <AppCard>
            <h2 className="font-extrabold text-[var(--color-primary-strong)]">Record status</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
              {material.status === 'ACTIVE'
                ? 'This material appears in active inventory searches.'
                : 'This material is archived and retained for history.'}
            </p>
            {admin ? (
              <Button
                className="mt-4 w-full"
                onClick={() => setDialog('status')}
                variant={material.status === 'ACTIVE' ? 'danger' : 'secondary'}
              >
                {material.status === 'ACTIVE' ? (
                  <Archive aria-hidden="true" size={18} />
                ) : (
                  <RotateCcw aria-hidden="true" size={18} />
                )}
                {material.status === 'ACTIVE' ? 'Archive material' : 'Restore material'}
              </Button>
            ) : (
              <p className="mt-3 rounded-[10px] bg-[var(--color-surface-tint)] p-3 text-xs font-semibold text-[var(--color-text-muted)]">
                Inventory records are read-only for Worker accounts.
              </p>
            )}
          </AppCard>
        </div>
      </div>

      {material.trackingMode === 'SERIALIZED' ? (
        <SerializedUnits
          admin={admin && material.status === 'ACTIVE'}
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
        />
      ) : null}

      {dialog === 'status' ? (
        <ConfirmStatusDialog
          material={material}
          loading={statusMutation.isPending}
          onCancel={() => setDialog(null)}
          onConfirm={() => statusMutation.mutate(material)}
        />
      ) : null}
      {dialog === 'quantity' ? (
        <QuantityDialog
          material={material}
          onCancel={() => setDialog(null)}
          onSaved={async (updated) => {
            await updateCached(updated);
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
            setDialog(null);
          }}
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

function assignmentLabel(types: AssignmentType[]): string {
  if (types.length === 2) return 'Long-Term + Short-Term';
  return types[0] === 'LONG_TERM' ? 'Long-Term Assignment' : 'Short-Term Assignment';
}

function QuantityStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[10px] bg-[var(--color-surface-tint)] px-2 py-3">
      <dt className="text-[11px] font-bold text-[var(--color-text-muted)]">{label}</dt>
      <dd className="mt-1 text-lg font-extrabold text-[var(--color-primary-strong)]">{value}</dd>
    </div>
  );
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
    description: material.description ?? '',
    returnPolicy: material.returnPolicy,
    unitLabel: material.unitLabel ?? '',
    longTerm: material.assignmentTypes.includes('LONG_TERM'),
    shortTerm: material.assignmentTypes.includes('SHORT_TERM'),
  });
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (input: UpdateMaterialRequest) => updateMaterial(material.materialCode, input),
    onSuccess: onSaved,
    onError: (error) =>
      setMessage(isApiError(error) ? error.message : 'Changes could not be saved.'),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = UpdateMaterialRequestSchema.safeParse({
      name: form.name,
      category: form.category,
      description: form.description.trim() || null,
      returnPolicy: form.returnPolicy,
      assignmentTypes: [
        ...(form.longTerm ? (['LONG_TERM'] as const) : []),
        ...(form.shortTerm ? (['SHORT_TERM'] as const) : []),
      ],
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
        <TextField
          label="Material name"
          onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))}
          value={form.name}
        />
        <MaterialCategoryField
          id="edit-material-category"
          onChange={(category) => setForm((value) => ({ ...value, category }))}
          value={form.category}
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
      <fieldset className="space-y-2">
        <legend className="field-label">Allowed assignment type</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex min-h-11 items-center gap-3 rounded-[10px] border border-[var(--color-border)] px-3 text-sm font-semibold text-[var(--color-text-strong)]">
            <input
              checked={form.longTerm}
              className="size-4 accent-[var(--color-primary)]"
              onChange={(event) =>
                setForm((value) => ({ ...value, longTerm: event.target.checked }))
              }
              type="checkbox"
            />
            Long-Term Assignment
          </label>
          <label className="flex min-h-11 items-center gap-3 rounded-[10px] border border-[var(--color-border)] px-3 text-sm font-semibold text-[var(--color-text-strong)]">
            <input
              checked={form.shortTerm}
              className="size-4 accent-[var(--color-primary)]"
              onChange={(event) =>
                setForm((value) => ({ ...value, shortTerm: event.target.checked }))
              }
              type="checkbox"
            />
            Short-Term Assignment
          </label>
        </div>
      </fieldset>
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
  admin,
  page,
  onPage,
  onAdd,
  onEdit,
  query,
}: {
  material: Material;
  admin: boolean;
  page: number;
  onPage: (page: number) => void;
  onAdd: () => void;
  onEdit: (unit: AssetUnit) => void;
  query: ReturnType<typeof useQuery<AssetUnitsListResponse>>;
}) {
  return (
    <AppCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
            Serialized units
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Each physical device has its own Asset tag, condition and status.
          </p>
        </div>
        {admin && material.status === 'ACTIVE' ? (
          <Button onClick={onAdd}>
            <Plus aria-hidden="true" size={18} />
            Add unit
          </Button>
        ) : null}
      </div>
      <div className="mt-5">
        {query.isPending ? (
          <LoadingPanel label="Loading serialized units" />
        ) : query.isError ? (
          <ErrorState
            message="Serialized units could not be loaded."
            onRetry={() => void query.refetch()}
          />
        ) : !query.data?.data.length ? (
          <EmptyState
            action={
              admin ? (
                <Button onClick={onAdd}>
                  <PackagePlus aria-hidden="true" size={18} />
                  Add first unit
                </Button>
              ) : undefined
            }
            message={
              admin
                ? 'Add each physical device to begin tracking availability.'
                : 'No available serialized units are shown.'
            }
            title="No available units"
          />
        ) : (
          <>
            <div className="space-y-3 min-[840px]:hidden">
              {query.data.data.map((unit) => (
                <UnitCard admin={admin} key={unit.assetTag} onEdit={onEdit} unit={unit} />
              ))}
            </div>
            <UnitTable admin={admin} onEdit={onEdit} units={query.data.data} />
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
  admin,
  onEdit,
}: {
  unit: AssetUnit;
  admin: boolean;
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
      {admin ? (
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
  admin,
  onEdit,
}: {
  units: AssetUnit[];
  admin: boolean;
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
            {admin ? (
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
              {admin ? (
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
  loading,
  onConfirm,
  onCancel,
}: {
  material: Material;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const active = material.status === 'ACTIVE';
  return (
    <Dialog onClose={onCancel} title={active ? 'Archive material?' : 'Restore material?'}>
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
        {active
          ? 'It will be removed from active inventory searches. Existing history and stock records are preserved.'
          : 'It will become available in active inventory searches again.'}
      </p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button disabled={loading} onClick={onCancel} variant="secondary">
          Cancel
        </Button>
        <Button loading={loading} onClick={onConfirm} variant={active ? 'danger' : 'primary'}>
          {loading ? 'Working…' : active ? 'Archive material' : 'Restore material'}
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
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (input: { quantityDelta: number; reason: string }) =>
      adjustMaterialQuantity(material.materialCode, input),
    onSuccess: onSaved,
    onError: (error) =>
      setMessage(isApiError(error) ? error.message : 'The quantity could not be adjusted.'),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = AdjustQuantityRequestSchema.safeParse({ quantityDelta: Number(delta), reason });
    if (!result.success) {
      setMessage(result.error.issues[0]?.message ?? 'Check the adjustment.');
      return;
    }
    mutation.mutate(result.data);
  }
  return (
    <Dialog onClose={onCancel} title="Adjust quantity">
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
        Use a positive number to add stock or a negative number to correct a stock reduction. Issued
        stock cannot be removed.
      </p>
      {message ? (
        <div className="mt-4">
          <ErrorSummary message={message} />
        </div>
      ) : null}
      <form className="mt-5 space-y-5" onSubmit={submit}>
        <TextField
          hint={`Current total: ${material.totalQuantity} ${material.unitLabel ?? 'units'}`}
          inputMode="numeric"
          label="Quantity change"
          onChange={(event) => setDelta(event.target.value)}
          placeholder="For example: 10 or -2"
          required
          step="1"
          type="number"
          value={delta}
        />
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
            {mutation.isPending ? 'Saving…' : 'Save adjustment'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function validStatuses(unit: AssetUnit): ManualAssetUnitStatus[] {
  if (unit.status === 'AVAILABLE') {
    return ['AVAILABLE', 'UNDER_REPAIR', 'DAMAGED', 'LOST', 'SCRAPPED'];
  }
  if (unit.status === 'RETURNED') {
    return ['RETURNED', 'AVAILABLE', 'UNDER_REPAIR', 'DAMAGED', 'LOST', 'SCRAPPED'];
  }
  if (unit.status === 'UNDER_REPAIR' || unit.status === 'DAMAGED' || unit.status === 'LOST') {
    return [unit.status, 'AVAILABLE', 'SCRAPPED'];
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
    unit?.status === 'ISSUED' ? 'AVAILABLE' : (unit?.status ?? 'AVAILABLE'),
  );
  const statusOptions = unit ? validStatuses(unit) : [];
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      if (unit) {
        const result = UpdateAssetUnitRequestSchema.safeParse({
          serialNumber: serialNumber.trim() || null,
          condition,
          ...(unit.status !== 'ISSUED' ? { status } : {}),
        });
        if (!result.success)
          throw new Error(result.error.issues[0]?.message ?? 'Check the unit details.');
        return updateAssetUnit(material.materialCode, unit.assetTag, result.data);
      }
      const result = CreateAssetUnitRequestSchema.safeParse({
        ...(serialNumber.trim() ? { serialNumber } : {}),
        condition,
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
    <Dialog onClose={onCancel} title={unit ? `Edit ${unit.assetTag}` : 'Add serialized unit'}>
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
        {unit
          ? 'Update this physical device record.'
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
          label="Serial number"
          onChange={(event) => setSerialNumber(event.target.value)}
          optional
          value={serialNumber}
        />
        <TextField
          label="Condition"
          onChange={(event) => setCondition(event.target.value)}
          required
          value={condition}
        />
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
            {mutation.isPending ? 'Saving…' : unit ? 'Save unit' : 'Add unit'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
