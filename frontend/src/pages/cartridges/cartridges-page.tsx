import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router';
import { MoreVertical, Plus, Printer, Send, RotateCcw, Eye, Trash2, Pencil, X } from 'lucide-react';
import type { Cartridge, UpdateCartridgeRequest } from '@assetdesk/contracts';
import {
  AppCard,
  ErrorSummary,
  FilterPopover,
  FloatingActionMenu,
  LoadingPanel,
  PageHeader,
  SearchForm,
  Button,
  TextField,
} from '../../components/ui';
import { useAuth } from '../../auth/auth-context';
import { hasPermission } from '../../auth/permissions';
import { deleteCartridge, getAllCartridges, updateCartridge } from '../../lib/cartridges-api';
import { getAssetDetails } from '../../lib/inventory-api';

const statusLabels: Record<string, string> = {
  FILLED_AVAILABLE: 'Filled available',
  ISSUED: 'Issued',
  EMPTY: 'Empty',
  DEFECTIVE: 'Defective',
  READY_FOR_GATE_OUT: 'Ready for Gate Out',
  WITH_VENDOR: 'With vendor',
  REFILL_FAILED: 'Refill failed',
  DAMAGED: 'Damaged',
  SCRAP_PENDING: 'Scrap pending',
  SCRAPPED: 'Scrapped',
};
export function CartridgesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [search, setSearch] = useState(new URLSearchParams(location.search).get('search') ?? '');
  const [status, setStatus] = useState(new URLSearchParams(location.search).get('status') ?? '');
  const [editTarget, setEditTarget] = useState<Cartridge | null>(null);
  useEffect(() => {
    const next = new URLSearchParams(location.search);
    // Route filter links must refresh the controlled search fields without remounting this page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearch(next.get('search') ?? '');
    setStatus(next.get('status') ?? '');
  }, [location.search]);
  const query = useQuery({
    queryKey: ['cartridges', { search, status }],
    queryFn: () => getAllCartridges({ search, status }),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteCartridge,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cartridges'] }),
        queryClient.invalidateQueries({ queryKey: ['cartridge-dashboard'] }),
      ]);
    },
  });
  const detailsQuery = useQuery({
    queryKey: ['asset-details'],
    queryFn: ({ signal }) => getAssetDetails(undefined, signal),
    enabled: Boolean(editTarget),
  });
  const updateMutation = useMutation({
    mutationFn: ({
      serialNumber,
      input,
    }: {
      serialNumber: string;
      input: UpdateCartridgeRequest;
    }) => updateCartridge(serialNumber, input),
    onSuccess: async () => {
      setEditTarget(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cartridges'] }),
        queryClient.invalidateQueries({ queryKey: ['cartridge-dashboard'] }),
      ]);
    },
  });
  const canDelete = hasPermission(user, 'CARTRIDGES_DELETE');
  const canEdit = hasPermission(user, 'CARTRIDGES_EDIT');
  const canAdd = hasPermission(user, 'CARTRIDGES_ADD');
  const canIssue = hasPermission(user, 'CARTRIDGES_ISSUE');
  const canReturn = hasPermission(user, 'CARTRIDGES_RETURN');
  const canCreateGatePass = hasPermission(user, 'CARTRIDGE_GATE_PASSES_CREATE');
  return (
    <div className="space-y-6">
      <PageHeader
        title="All Cartridges"
        description="Track every serialized cartridge, its current holder, condition, refill cycle, and latest movement."
        actions={
          <>
            {canAdd ? (
              <Link className="button-primary" to="/cartridges/new">
                <Plus size={18} />
                Add cartridges
              </Link>
            ) : null}
            <GlobalActions canCreateGatePass={canCreateGatePass} />
          </>
        }
      />
      {editTarget ? (
        <EditCartridgeDialog
          cartridge={editTarget}
          details={detailsQuery.data ?? []}
          error={updateMutation.isError ? updateMutation.error.message : null}
          loading={updateMutation.isPending || detailsQuery.isPending}
          onClose={() => {
            setEditTarget(null);
            updateMutation.reset();
          }}
          onSave={(input) =>
            updateMutation.mutate({ serialNumber: editTarget.serialNumber, input })
          }
        />
      ) : null}
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
      {deleteMutation.isError ? <ErrorSummary message={deleteMutation.error.message} /> : null}
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
                    <RowActions
                      canDelete={canDelete}
                      canEdit={canEdit}
                      canIssue={canIssue}
                      canReturn={canReturn}
                      serial={item.serialNumber}
                      status={item.status}
                      onEdit={() => setEditTarget(item)}
                      onDelete={(serialNumber) => {
                        if (
                          window.confirm(
                            `Delete cartridge ${serialNumber}? Only cartridges without operational history can be deleted.`,
                          )
                        )
                          deleteMutation.mutate(serialNumber);
                      }}
                    />
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
function RowActions({
  serial,
  status,
  canDelete,
  canEdit,
  canIssue,
  canReturn,
  onDelete,
  onEdit,
}: {
  serial: string;
  status: string;
  canDelete: boolean;
  canEdit: boolean;
  canIssue: boolean;
  canReturn: boolean;
  onDelete: (serial: string) => void;
  onEdit: () => void;
}) {
  return (
    <FloatingActionMenu
      label={`Actions for ${serial}`}
      icon={<MoreVertical size={18} />}
      panelClassName="w-52 p-1"
      triggerClassName="button-quiet p-2"
    >
      <Link className="menu-item" to={`/cartridges/${encodeURIComponent(serial)}`}>
        <Eye size={16} />
        View details
      </Link>
      {canEdit ? (
        <button className="menu-item w-full" onClick={onEdit} type="button">
          <Pencil size={16} />
          Edit cartridge
        </button>
      ) : null}
      {canIssue && status === 'FILLED_AVAILABLE' ? (
        <Link
          className="menu-item"
          to={`/cartridges/issues/new?serial=${encodeURIComponent(serial)}`}
        >
          <Send size={16} />
          Issue cartridge
        </Link>
      ) : null}
      {canReturn && status === 'ISSUED' ? (
        <Link
          className="menu-item"
          to={`/cartridges/returns/new?serial=${encodeURIComponent(serial)}`}
        >
          <RotateCcw size={16} />
          Record return
        </Link>
      ) : null}
      {canDelete ? (
        <button
          className="menu-item w-full text-[var(--color-danger)]"
          onClick={() => onDelete(serial)}
          type="button"
        >
          <Trash2 size={16} />
          Delete cartridge
        </button>
      ) : null}
    </FloatingActionMenu>
  );
}

function EditCartridgeDialog({
  cartridge,
  details,
  loading,
  error,
  onClose,
  onSave,
}: {
  cartridge: Cartridge;
  details: Array<{ kind: string; name: string }>;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (input: UpdateCartridgeRequest) => void;
}) {
  const [form, setForm] = useState({
    serialNumber: cartridge.serialNumber,
    model: cartridge.model,
    colour: cartridge.colour,
    location: cartridge.location,
    department: cartridge.department,
    compatiblePrinter: cartridge.compatiblePrinter ?? '',
    vendorName: cartridge.vendorName ?? '',
    notes: cartridge.notes ?? '',
  });
  const locations = details
    .filter((detail) => detail.kind === 'LOCATION')
    .map((detail) => detail.name)
    .sort();
  const departments = details
    .filter((detail) => detail.kind === 'DEPARTMENT')
    .map((detail) => detail.name)
    .sort();
  return (
    <div className="fixed inset-0 z-[250] overflow-y-auto bg-slate-950/45 p-4 sm:p-8">
      <form
        aria-modal="true"
        className="mx-auto w-full max-w-2xl rounded-[16px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-overlay)]"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            ...form,
            compatiblePrinter: form.compatiblePrinter || null,
            vendorName: form.vendorName || null,
            notes: form.notes || null,
          });
        }}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <h2 className="text-xl font-extrabold text-[var(--color-primary-strong)]">
              Edit cartridge
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Update the serial number and cartridge master details.
            </p>
          </div>
          <button
            aria-label="Close edit cartridge"
            className="icon-button shrink-0"
            onClick={onClose}
            type="button"
          >
            <X size={19} />
          </button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {error ? (
            <div className="sm:col-span-2">
              <ErrorSummary message={error} />
            </div>
          ) : null}
          <TextField
            label="Serial number"
            required
            value={form.serialNumber}
            onChange={(event) => setForm({ ...form, serialNumber: event.target.value })}
          />
          <TextField
            label="Cartridge model"
            required
            value={form.model}
            onChange={(event) => setForm({ ...form, model: event.target.value })}
          />
          <label className="space-y-1.5">
            <span className="field-label">Colour</span>
            <select
              className="field-input"
              value={form.colour}
              onChange={(event) =>
                setForm({ ...form, colour: event.target.value as Cartridge['colour'] })
              }
            >
              {['BLACK', 'CYAN', 'MAGENTA', 'YELLOW', 'OTHER'].map((colour) => (
                <option key={colour} value={colour}>
                  {colour}
                </option>
              ))}
            </select>
          </label>
          <EditDetailSelect
            label="Storage location"
            options={locations}
            value={form.location}
            onChange={(location) => setForm({ ...form, location })}
          />
          <EditDetailSelect
            label="Department"
            options={departments}
            value={form.department}
            onChange={(department) => setForm({ ...form, department })}
          />
          <TextField
            label="Compatible printer"
            optional
            value={form.compatiblePrinter}
            onChange={(event) => setForm({ ...form, compatiblePrinter: event.target.value })}
          />
          <TextField
            label="Vendor"
            optional
            value={form.vendorName}
            onChange={(event) => setForm({ ...form, vendorName: event.target.value })}
          />
          <label className="space-y-1.5 sm:col-span-2">
            <span className="field-label">
              Notes <span className="font-normal">(optional)</span>
            </span>
            <textarea
              className="field-input min-h-24"
              maxLength={500}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-tint)] px-5 py-4">
          <Button onClick={onClose} type="button" variant="secondary">
            Cancel
          </Button>
          <Button loading={loading} type="submit">
            Save changes
          </Button>
        </div>
      </form>
    </div>
  );
}

function EditDetailSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const allOptions = options.includes(value) ? options : [value, ...options];
  return (
    <label className="space-y-1.5">
      <span className="field-label">{label}</span>
      <select
        className="field-input"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {allOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
function GlobalActions({ canCreateGatePass }: { canCreateGatePass: boolean }) {
  return (
    <FloatingActionMenu
      label="Cartridge page actions"
      icon={<MoreVertical size={18} />}
      panelClassName="w-56 p-1"
      triggerClassName="button-secondary"
    >
      {canCreateGatePass ? (
        <Link className="menu-item" to="/cartridges/gate-passes/new">
          <Printer size={16} />
          Create Gate Pass
        </Link>
      ) : null}
      <button className="menu-item w-full" onClick={() => window.print()} type="button">
        <Printer size={16} />
        Print current view
      </button>
    </FloatingActionMenu>
  );
}
