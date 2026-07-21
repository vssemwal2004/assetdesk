import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, MoreVertical, PackagePlus, PackageSearch, Pencil, Search, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';

import type {
  AssignmentType,
  Material,
  MaterialStatus,
  ReturnPolicy,
  TrackingMode,
} from '@assetdesk/contracts';

import { useAuth } from '../../auth/auth-context';
import { CatalogBadge, PageCount } from '../../components/catalog-ui';
import {
  Button,
  EmptyState,
  ErrorState,
  ErrorSummary,
  LoadingPanel,
  PageHeader,
} from '../../components/ui';
import { deleteMaterial, getInventory } from '../../lib/inventory-api';
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

function assignmentType(value: string): AssignmentType | undefined {
  return value === 'LONG_TERM' || value === 'SHORT_TERM' ? value : undefined;
}

function stockState(value: string): 'IN_STOCK' | 'OUT_OF_STOCK' | undefined {
  return value === 'IN_STOCK' || value === 'OUT_OF_STOCK' ? value : undefined;
}

function quantityLabel(material: Material): string {
  if (material.trackingMode === 'SERIALIZED') {
    return `${material.availableQuantity} of ${material.totalQuantity} units available`;
  }
  return `${material.availableQuantity} of ${material.totalQuantity} ${material.unitLabel ?? 'units'} available`;
}

function assignmentLabel(material: Material): string {
  if (material.assignmentTypes.length === 2) return 'Long + Short';
  return material.assignmentTypes[0] === 'LONG_TERM' ? 'Long-Term' : 'Short-Term';
}

export function InventoryPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [parameters, setParameters] = useSearchParams();
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);
  const [viewMaterial, setViewMaterial] = useState<Material | null>(null);
  const page = Math.max(1, Number(parameters.get('page')) || 1);
  const search = parameters.get('search') ?? '';
  const category = parameters.get('category') ?? '';
  const status = materialStatus(parameters.get('status') ?? '');
  const mode = trackingMode(parameters.get('trackingMode') ?? '');
  const policy = returnPolicy(parameters.get('returnPolicy') ?? '');
  const assignment = assignmentType(parameters.get('assignmentType') ?? '');
  const stock = stockState(parameters.get('stockState') ?? '');
  const admin = user?.role === 'ADMIN';

  const query = useQuery({
    queryKey: ['inventory', { page, search, category, status, mode, policy, assignment, stock }],
    queryFn: ({ signal }) =>
      getInventory(
        {
          page,
          ...(search ? { search } : {}),
          ...(category ? { category } : {}),
          ...(status ? { status } : {}),
          ...(mode ? { trackingMode: mode } : {}),
          ...(policy ? { returnPolicy: policy } : {}),
          ...(assignment ? { assignmentType: assignment } : {}),
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
  const filtered = Boolean(search || category || status || mode || policy || assignment || stock);
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

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          admin ? (
            <Link className="button-primary" to="/inventory/new">
              <PackagePlus aria-hidden="true" size={18} />
              Add material
            </Link>
          ) : undefined
        }
        description={
          admin
            ? 'Track asset quantities, assignment eligibility, and stock health in a compact table.'
            : 'Search current university material availability.'
        }
        title="Inventory"
      />
      {actionError ? <ErrorSummary message={actionError} title="Action failed" /> : null}

      <section className="rounded-[14px] border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-card)] sm:p-4">
        <InventorySearch
          category={category}
          key={`${search}-${category}`}
          onApply={(values) => updateParameters(values)}
          search={search}
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(5,190px)_auto]">
          {admin ? (
            <FilterSelect
              id="inventory-status-filter"
              label="Filter by status"
              onChange={(value) => updateParameters({ status: value })}
              value={status ?? ''}
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </FilterSelect>
          ) : null}
          <FilterSelect
            id="inventory-assignment-filter"
            label="Filter by assignment type"
            onChange={(value) => updateParameters({ assignmentType: value })}
            value={assignment ?? ''}
          >
            <option value="">All assignment types</option>
            <option value="LONG_TERM">Long-Term Assignment</option>
            <option value="SHORT_TERM">Short-Term Assignment</option>
          </FilterSelect>
          <FilterSelect
            id="inventory-stock-filter"
            label="Filter by stock state"
            onChange={(value) => updateParameters({ stockState: value })}
            value={stock ?? ''}
          >
            <option value="">All stock states</option>
            <option value="IN_STOCK">In Stock</option>
            <option value="OUT_OF_STOCK">Out of Stock</option>
          </FilterSelect>
          <FilterSelect
            id="inventory-mode-filter"
            label="Filter by tracking mode"
            onChange={(value) => updateParameters({ trackingMode: value })}
            value={mode ?? ''}
          >
            <option value="">All tracking modes</option>
            <option value="SERIALIZED">Serialized</option>
            <option value="QUANTITY">Quantity tracked</option>
          </FilterSelect>
          <FilterSelect
            id="inventory-policy-filter"
            label="Filter by return policy"
            onChange={(value) => updateParameters({ returnPolicy: value })}
            value={policy ?? ''}
          >
            <option value="">All return policies</option>
            <option value="REUSABLE">Reusable</option>
            <option value="CONSUMABLE">Consumable</option>
          </FilterSelect>
          {filtered ? (
            <Button onClick={() => setParameters({ page: '1' })} type="button" variant="quiet">
              Clear filters
            </Button>
          ) : null}
        </div>
        {query.data ? <PageCount count={query.data.meta.total} noun="material" /> : null}
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
              ? 'Try a different material, category or filter.'
              : 'No catalog material is available. New Issues can be entered directly.'
          }
          title={filtered ? 'No material matches these filters' : 'No material added'}
        />
      ) : (
        <>
          <div className="space-y-3 min-[840px]:hidden">
            {materials.map((material) => (
              <MaterialCard
                admin={admin}
                key={material.materialCode}
                material={material}
                onDelete={confirmDelete}
              />
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
            <dt className="font-bold text-[var(--color-text-muted)]">Material code</dt>
            <dd className="font-extrabold text-[var(--color-text-strong)]">{material.materialCode}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="font-bold text-[var(--color-text-muted)]">Total stock</dt>
            <dd className="font-extrabold text-[var(--color-text-strong)]">{material.totalQuantity}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="font-bold text-[var(--color-text-muted)]">Issued stock</dt>
            <dd className="font-extrabold text-[var(--color-text-strong)]">{material.issuedQuantity}</dd>
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
          <DetailItem label="Return policy" value={humanizeCatalogValue(material.returnPolicy)} />
          <DetailItem label="Use" value={assignmentLabel(material)} />
          <DetailItem label="Availability" value={quantityLabel(material)} />
          <DetailItem label="Total stock" value={material.totalQuantity} />
          <DetailItem label="Issued stock" value={material.issuedQuantity} />
          <DetailItem label="Available stock" value={material.availableQuantity} />
          <DetailItem label="Unit label" value={material.unitLabel ?? 'Not applicable'} />
        </DetailGrid>
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

function InventorySearch({
  search,
  category,
  onApply,
}: {
  search: string;
  category: string;
  onApply: (values: Record<string, string>) => void;
}) {
  const [searchDraft, setSearchDraft] = useState(search);
  const [categoryDraft, setCategoryDraft] = useState(category);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onApply({ search: searchDraft.trim(), category: categoryDraft.trim() });
  }
  return (
    <form
      className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_260px_auto]"
      onSubmit={submit}
      role="search"
    >
      <div className="relative">
        <label className="sr-only" htmlFor="inventory-search">
          Search Inventory
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
          size={18}
        />
        <input
          className="field-input field-input-search"
          id="inventory-search"
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="Material name or code"
          value={searchDraft}
        />
      </div>
      <div>
        <label className="sr-only" htmlFor="inventory-category-filter">
          Filter by material group
        </label>
        <input
          className="field-input"
          id="inventory-category-filter"
          onChange={(event) => setCategoryDraft(event.target.value)}
          placeholder="Material group"
          value={categoryDraft}
        />
      </div>
      <Button type="submit" variant="secondary">
        Apply
      </Button>
    </form>
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
          <p className="mt-1 text-xs font-bold text-[var(--color-text-muted)]">
            {assignmentLabel(material)}
          </p>
        </div>
      </div>
      <Link className="button-secondary mt-4 w-full" to={`/inventory/${material.materialCode}`}>
        View material details
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
  return (
    <div className="hidden overflow-visible rounded-[14px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)] min-[840px]:block">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Inventory materials</caption>
        <thead className="bg-[var(--color-surface-tint)] text-xs text-[var(--color-text-muted)]">
          <tr>
            <th className="h-11 px-4 font-bold" scope="col">
              Material
            </th>
            <th className="h-11 px-4 font-bold" scope="col">
              Tracking
            </th>
            <th className="h-11 px-4 font-bold" scope="col">
              Availability
            </th>
            <th className="h-11 px-4 font-bold" scope="col">
              Use
            </th>
            <th className="h-11 px-4 font-bold" scope="col">
              Status
            </th>
            <th className="h-11 px-4 text-right font-bold" scope="col">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {materials.map((material) => (
            <tr
              className="h-[64px] cursor-pointer hover:bg-[var(--color-surface-tint)]"
              key={material.materialCode}
              onClick={() => onView(material)}
              tabIndex={0}
            >
              <td className="px-4">
                <p className="text-sm font-bold text-[var(--color-text-strong)]">{material.name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {material.materialCode} · {material.category}
                </p>
              </td>
              <td className="px-4">
                <CatalogBadge value={material.trackingMode} />
              </td>
              <td className="px-4 text-sm text-[var(--color-text-muted)]">
                {quantityLabel(material)}
              </td>
              <td className="px-4 text-xs font-bold text-[var(--color-text-muted)]">
                {assignmentLabel(material)}
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
        </tbody>
      </table>
    </div>
  );
}
