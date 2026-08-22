import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Download,
  Pencil,
  Plus,
  Printer,
  Search,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import type { InventoryGatePass, InventoryGatePassStatus } from '@assetdesk/contracts';
import { useAuth } from '../../auth/auth-context';
import { hasPermission } from '../../auth/permissions';
import {
  AppCard,
  Button,
  ErrorState,
  ErrorSummary,
  LoadingPanel,
  PageHeader,
} from '../../components/ui';
import {
  getInventoryGatePass,
  getInventoryGatePasses,
  cancelInventoryGatePass,
  downloadInventoryGatePassCsv,
  recordInventoryGateIn,
  recordInventoryGateOut,
  updateInventoryGatePass,
} from '../../lib/inventory-gate-pass-api';

const statusLabel: Record<InventoryGatePassStatus, string> = {
  READY_FOR_OUT: 'Ready for Gate Out',
  OUTSIDE: 'Outside University',
  PARTIALLY_IN: 'Partially Received',
  GATE_IN_COMPLETED: 'Gate In Completed',
  CLOSED_NON_RETURNABLE: 'Completed — No Gate In Required',
  CANCELLED: 'Cancelled',
};
const purposeLabel = {
  ISSUE_PERMANENT: 'Permanent Issue',
  ISSUE_RETURNABLE: 'Returnable Issue',
  REPAIR: 'Repair / Service',
  OTHER: 'Other Movement',
} as const;
const movementConditionLabel = {
  NOT_WORKING: 'Not working',
  FAULTY: 'Faulty',
  DAMAGED: 'Damaged',
  UNDER_REPAIR: 'Under repair',
  OTHER: 'Other',
} as const;
const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata',
      }).format(new Date(value))
    : 'Not set';
const dateTimeLocalValue = (value: string | null) =>
  value ? new Date(value).toISOString().slice(0, 16) : '';

function Register({ mode }: { mode: 'OUT' | 'IN' | 'DATA' }) {
  const auth = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [purpose, setPurpose] = useState('');
  const [trackingMode, setTrackingMode] = useState('');
  const [status, setStatus] = useState('');
  const query = useQuery({
    queryKey: ['inventory-gate-passes', mode, page, search, purpose, trackingMode, status],
    queryFn: ({ signal }) =>
      getInventoryGatePasses(
        {
          page,
          pageSize: 25,
          ...(mode === 'OUT' ? { status: 'READY_FOR_OUT' as const } : {}),
          ...(mode === 'IN'
            ? { statuses: ['OUTSIDE', 'PARTIALLY_IN'] as InventoryGatePassStatus[] }
            : {}),
          ...(mode === 'DATA' && status ? { status: status as InventoryGatePassStatus } : {}),
          ...(purpose
            ? {
                purpose: purpose as 'ISSUE_PERMANENT' | 'ISSUE_RETURNABLE' | 'REPAIR' | 'OTHER',
              }
            : {}),
          ...(trackingMode ? { trackingMode: trackingMode as 'SERIALIZED' | 'QUANTITY' } : {}),
          ...(search ? { search } : {}),
        },
        signal,
      ),
  });
  const exportMutation = useMutation({
    mutationFn: () =>
      downloadInventoryGatePassCsv({
        ...(mode === 'DATA' && status ? { status: status as InventoryGatePassStatus } : {}),
        ...(purpose
          ? { purpose: purpose as 'ISSUE_PERMANENT' | 'ISSUE_RETURNABLE' | 'REPAIR' | 'OTHER' }
          : {}),
        ...(trackingMode ? { trackingMode: trackingMode as 'SERIALIZED' | 'QUANTITY' } : {}),
        ...(search ? { search } : {}),
      }),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inventory-gate-passes-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    },
  });
  const records = query.data?.data ?? [];
  const title =
    mode === 'OUT' ? 'Gate Pass Out' : mode === 'IN' ? 'Gate Pass In' : 'Gate Pass Data';
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={
          mode === 'OUT'
            ? 'Create passes and confirm material leaving the university.'
            : mode === 'IN'
              ? 'Receive material only against an existing Gate Pass Out.'
              : 'Search the complete inventory Gate Pass register.'
        }
        actions={
          <>
            {mode === 'OUT' && hasPermission(auth.user, 'GATE_PASS_CREATE') ? (
              <Link className="button-primary" to="/inventory/gate-passes/out/new">
                <Plus size={18} />
                Create Gate Pass
              </Link>
            ) : null}
            {mode === 'DATA' && hasPermission(auth.user, 'GATE_PASS_EXPORT') ? (
              <Button
                disabled={exportMutation.isPending}
                onClick={() => exportMutation.mutate()}
                variant="secondary"
              >
                <Download size={18} />
                {exportMutation.isPending ? 'Exporting…' : 'Export CSV'}
              </Button>
            ) : null}
          </>
        }
      />
      {exportMutation.isError ? (
        <ErrorSummary message={(exportMutation.error as Error).message} />
      ) : null}
      <AppCard className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_220px_200px_220px]">
        <label className="search-shell">
          <Search className="search-shell-icon" size={18} />
          <input
            className="field-input field-input-search w-full"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Gate Pass, Issue, asset tag, serial, destination or carrier"
            value={search}
          />
        </label>
        <select
          aria-label="Filter by purpose"
          className="field-input w-full"
          onChange={(event) => {
            setPurpose(event.target.value);
            setPage(1);
          }}
          value={purpose}
        >
          <option value="">All purposes</option>
          <option value="REPAIR">Repair / Service</option>
          <option value="OTHER">Other Movement</option>
          <option value="ISSUE_RETURNABLE">Returnable Issue</option>
          <option value="ISSUE_PERMANENT">Permanent Issue</option>
        </select>
        <select
          aria-label="Filter by material type"
          className="field-input w-full"
          onChange={(event) => {
            setTrackingMode(event.target.value);
            setPage(1);
          }}
          value={trackingMode}
        >
          <option value="">All material types</option>
          <option value="SERIALIZED">IT Assets</option>
          <option value="QUANTITY">IT Consumables</option>
        </select>
        {mode === 'DATA' ? (
          <select
            aria-label="Filter by status"
            className="field-input w-full"
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            value={status}
          >
            <option value="">All statuses</option>
            {Object.entries(statusLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ) : (
          <div className="hidden lg:block" />
        )}
      </AppCard>
      {query.isPending ? (
        <LoadingPanel label="Loading Gate Passes" />
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />
      ) : records.length === 0 ? (
        <AppCard>
          <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">
            No Gate Pass records match this view.
          </p>
        </AppCard>
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)]">
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full border-collapse text-left">
              <thead className="bg-[var(--color-surface-tint)] text-xs text-[var(--color-text-muted)]">
                <tr>
                  <th className="p-4">Gate Pass</th>
                  <th>Purpose</th>
                  <th>Destination</th>
                  <th>Material</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {records.map((pass) => (
                  <tr className="hover:bg-[var(--color-surface-tint)]" key={pass.id}>
                    <td className="p-4">
                      <Link
                        className="font-extrabold text-[var(--color-primary)]"
                        to={`/inventory/gate-passes/${pass.gatePassNumber}`}
                      >
                        {pass.gatePassNumber}
                      </Link>
                    </td>
                    <td>{purposeLabel[pass.purpose]}</td>
                    <td>{pass.destination.name}</td>
                    <td>{pass.materialComposition.replaceAll('_', ' ')}</td>
                    <td>
                      <span className="rounded-full bg-[var(--color-primary-soft)] px-2.5 py-1 text-xs font-bold text-[var(--color-primary)]">
                        {statusLabel[pass.status]}
                      </span>
                    </td>
                    <td>{formatDate(pass.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-3 text-sm">
            <span className="text-[var(--color-text-muted)]">
              Page {query.data?.meta.page ?? page} of{' '}
              {Math.max(1, query.data?.meta.totalPages ?? 0)} · {query.data?.meta.total ?? 0}{' '}
              records
            </span>
            <div className="flex gap-2">
              <Button
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                variant="secondary"
              >
                Previous
              </Button>
              <Button
                disabled={page >= (query.data?.meta.totalPages ?? 0)}
                onClick={() => setPage((current) => current + 1)}
                variant="secondary"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export const InventoryGatePassOutPage = () => <Register mode="OUT" />;
export const InventoryGatePassInPage = () => <Register mode="IN" />;
export const InventoryGatePassDataPage = () => <Register mode="DATA" />;

export { CreateInventoryGatePassPage } from './create-inventory-gate-pass-page';

type GateInDraft = {
  selected: boolean;
  quantity: number;
  condition: string;
  outcome: 'RECEIVED' | 'REPAIRED' | 'STILL_FAULTY' | 'DAMAGED' | 'REPLACED';
  replacementSerialNumber: string;
  remarks: string;
};

export function InventoryGatePassDetailPage() {
  const { gatePassNumber = '' } = useParams();
  const auth = useAuth();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['inventory-gate-pass', gatePassNumber],
    queryFn: ({ signal }) => getInventoryGatePass(gatePassNumber, signal),
  });
  const [gateInDraft, setGateInDraft] = useState<Record<string, GateInDraft>>({});
  const [personReturning, setPersonReturning] = useState('');
  const [gateInRemarks, setGateInRemarks] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [editDraft, setEditDraft] = useState<null | {
    destination: string;
    organization: string;
    address: string;
    destinationContact: string;
    carrier: string;
    carrierContact: string;
    vehicleNumber: string;
    expectedGateInAt: string;
    remarks: string;
  }>(null);
  const out = useMutation({
    mutationFn: () => recordInventoryGateOut(gatePassNumber),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['inventory-gate-pass'] });
      await client.invalidateQueries({ queryKey: ['inventory-gate-passes'] });
    },
  });
  const inside = useMutation({
    mutationFn: (pass: InventoryGatePass) =>
      recordInventoryGateIn(gatePassNumber, {
        items: pass.items
          .filter((item) => gateInDraft[item.itemId]?.selected && item.remainingOutsideQuantity > 0)
          .map((item) => {
            const draft = gateInDraft[item.itemId]!;
            return {
              itemId: item.itemId,
              quantity: item.trackingMode === 'SERIALIZED' ? 1 : draft.quantity,
              condition: draft.condition.trim(),
              outcome: draft.outcome,
              ...(draft.replacementSerialNumber.trim()
                ? { replacementSerialNumber: draft.replacementSerialNumber.trim() }
                : {}),
              ...(draft.remarks.trim() ? { remarks: draft.remarks.trim() } : {}),
            };
          }),
        ...(personReturning.trim() ? { personReturning: personReturning.trim() } : {}),
        ...(gateInRemarks.trim() ? { remarks: gateInRemarks.trim() } : {}),
      }),
    onSuccess: async () => {
      setGateInDraft({});
      setPersonReturning('');
      setGateInRemarks('');
      await client.invalidateQueries({ queryKey: ['inventory-gate-pass'] });
      await client.invalidateQueries({ queryKey: ['inventory-gate-passes'] });
    },
  });
  const cancel = useMutation({
    mutationFn: () => cancelInventoryGatePass(gatePassNumber, cancelReason.trim()),
    onSuccess: async () => {
      setCancelReason('');
      await client.invalidateQueries({ queryKey: ['inventory-gate-pass'] });
      await client.invalidateQueries({ queryKey: ['inventory-gate-passes'] });
    },
  });
  const update = useMutation({
    mutationFn: () =>
      updateInventoryGatePass(gatePassNumber, {
        destination: {
          name: editDraft!.destination.trim(),
          ...(editDraft!.organization.trim()
            ? { organization: editDraft!.organization.trim() }
            : {}),
          ...(editDraft!.address.trim() ? { address: editDraft!.address.trim() } : {}),
          ...(editDraft!.destinationContact.trim()
            ? { contact: editDraft!.destinationContact.trim() }
            : {}),
        },
        carrier: {
          name: editDraft!.carrier.trim(),
          ...(editDraft!.carrierContact.trim()
            ? { contact: editDraft!.carrierContact.trim() }
            : {}),
          ...(editDraft!.vehicleNumber.trim()
            ? { vehicleNumber: editDraft!.vehicleNumber.trim().toUpperCase() }
            : {}),
        },
        expectedGateInAt: editDraft!.expectedGateInAt
          ? new Date(editDraft!.expectedGateInAt).toISOString()
          : null,
        remarks: editDraft!.remarks.trim() || null,
      }),
    onSuccess: async () => {
      setEditDraft(null);
      await client.invalidateQueries({ queryKey: ['inventory-gate-pass'] });
      await client.invalidateQueries({ queryKey: ['inventory-gate-passes'] });
    },
  });
  if (query.isPending) return <LoadingPanel />;
  if (query.isError || !query.data)
    return (
      <ErrorState message={(query.error as Error)?.message ?? 'Gate Pass could not be loaded.'} />
    );
  const pass = query.data;
  const canGateOut = hasPermission(auth.user, 'GATE_PASS_GATE_OUT');
  const canGateIn = hasPermission(auth.user, 'GATE_PASS_GATE_IN');
  const canCancel = hasPermission(auth.user, 'GATE_PASS_CANCEL');
  const canEdit = hasPermission(auth.user, 'GATE_PASS_EDIT_READY');
  const canPrint = hasPermission(auth.user, 'GATE_PASS_PRINT');
  const pendingItems = pass.items.filter(
    (item) => item.returnRequirement === 'RETURNABLE' && item.remainingOutsideQuantity > 0,
  );
  const selectedDrafts = pendingItems
    .map((item) => ({ item, draft: gateInDraft[item.itemId] }))
    .filter((entry): entry is { item: (typeof pendingItems)[number]; draft: GateInDraft } =>
      Boolean(entry.draft?.selected),
    );
  const gateInInvalid =
    selectedDrafts.length === 0 ||
    selectedDrafts.some(
      ({ item, draft }) =>
        draft.condition.trim().length < 2 ||
        draft.quantity < 1 ||
        draft.quantity > item.remainingOutsideQuantity ||
        (draft.outcome === 'REPLACED' && !draft.replacementSerialNumber.trim()),
    );

  function updateGateInDraft(
    item: InventoryGatePass['items'][number],
    patch: Partial<GateInDraft>,
  ) {
    setGateInDraft((current) => ({
      ...current,
      [item.itemId]: {
        selected: false,
        quantity: item.trackingMode === 'SERIALIZED' ? 1 : item.remainingOutsideQuantity,
        condition: item.conditionOut ?? 'Received in good condition',
        outcome: pass.purpose === 'REPAIR' ? 'REPAIRED' : 'RECEIVED',
        replacementSerialNumber: '',
        remarks: '',
        ...current[item.itemId],
        ...patch,
      },
    }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={pass.gatePassNumber}
        description={`${purposeLabel[pass.purpose]} · ${statusLabel[pass.status]}`}
        actions={
          <>
            {canPrint ? (
              <Link
                className="button-secondary"
                to={`/inventory/gate-passes/${pass.gatePassNumber}/print`}
              >
                <Printer size={18} /> Print
              </Link>
            ) : null}
            {pass.status === 'READY_FOR_OUT' && canEdit ? (
              <Button
                onClick={() =>
                  setEditDraft({
                    destination: pass.destination.name,
                    organization: pass.destination.organization ?? '',
                    address: pass.destination.address ?? '',
                    destinationContact: pass.destination.contact ?? '',
                    carrier: pass.carrier.name,
                    carrierContact: pass.carrier.contact ?? '',
                    vehicleNumber: pass.carrier.vehicleNumber ?? '',
                    expectedGateInAt: dateTimeLocalValue(pass.expectedGateInAt),
                    remarks: pass.remarks ?? '',
                  })
                }
                variant="secondary"
              >
                <Pencil size={17} /> Edit
              </Button>
            ) : null}
            {pass.status === 'READY_FOR_OUT' && canGateOut ? (
              <Button disabled={out.isPending} onClick={() => out.mutate()}>
                <ArrowUpFromLine size={18} />
                {out.isPending ? 'Recording…' : 'Record Gate Out'}
              </Button>
            ) : null}
          </>
        }
      />
      {out.isError || inside.isError || cancel.isError || update.isError ? (
        <ErrorSummary
          message={
            (out.error as Error)?.message ??
            (inside.error as Error)?.message ??
            (cancel.error as Error)?.message ??
            (update.error as Error)?.message
          }
        />
      ) : null}
      {editDraft ? (
        <AppCard className="space-y-4 border-[var(--color-primary-muted)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-extrabold">Edit Gate Pass details</h2>
              <p className="text-sm text-[var(--color-text-muted)]">
                Material lines cannot be changed after creation. Cancel and recreate the pass if the
                material is incorrect.
              </p>
            </div>
            <button
              className="font-bold text-[var(--color-primary)]"
              onClick={() => setEditDraft(null)}
              type="button"
            >
              Close
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label>
              <span className="field-label">Destination *</span>
              <input
                className="field-input w-full"
                onChange={(event) =>
                  setEditDraft((current) =>
                    current ? { ...current, destination: event.target.value } : current,
                  )
                }
                value={editDraft.destination}
              />
            </label>
            <label>
              <span className="field-label">Person carrying material *</span>
              <input
                className="field-input w-full"
                onChange={(event) =>
                  setEditDraft((current) =>
                    current ? { ...current, carrier: event.target.value } : current,
                  )
                }
                value={editDraft.carrier}
              />
            </label>
            <label>
              <span className="field-label">Organization / vendor</span>
              <input
                className="field-input w-full"
                onChange={(event) =>
                  setEditDraft((current) =>
                    current ? { ...current, organization: event.target.value } : current,
                  )
                }
                value={editDraft.organization}
              />
            </label>
            <label>
              <span className="field-label">Destination contact</span>
              <input
                className="field-input w-full"
                onChange={(event) =>
                  setEditDraft((current) =>
                    current ? { ...current, destinationContact: event.target.value } : current,
                  )
                }
                value={editDraft.destinationContact}
              />
            </label>
            <label className="md:col-span-2">
              <span className="field-label">Destination address</span>
              <input
                className="field-input w-full"
                onChange={(event) =>
                  setEditDraft((current) =>
                    current ? { ...current, address: event.target.value } : current,
                  )
                }
                value={editDraft.address}
              />
            </label>
            <label>
              <span className="field-label">Carrier contact</span>
              <input
                className="field-input w-full"
                onChange={(event) =>
                  setEditDraft((current) =>
                    current ? { ...current, carrierContact: event.target.value } : current,
                  )
                }
                value={editDraft.carrierContact}
              />
            </label>
            <label>
              <span className="field-label">Vehicle number</span>
              <input
                className="field-input w-full"
                onChange={(event) =>
                  setEditDraft((current) =>
                    current ? { ...current, vehicleNumber: event.target.value } : current,
                  )
                }
                value={editDraft.vehicleNumber}
              />
            </label>
            <label>
              <span className="field-label">Expected Gate In</span>
              <input
                className="field-input w-full"
                onChange={(event) =>
                  setEditDraft((current) =>
                    current ? { ...current, expectedGateInAt: event.target.value } : current,
                  )
                }
                type="datetime-local"
                value={editDraft.expectedGateInAt}
              />
            </label>
            <label>
              <span className="field-label">Remarks</span>
              <input
                className="field-input w-full"
                onChange={(event) =>
                  setEditDraft((current) =>
                    current ? { ...current, remarks: event.target.value } : current,
                  )
                }
                value={editDraft.remarks}
              />
            </label>
          </div>
          <Button
            disabled={
              !editDraft.destination.trim() || !editDraft.carrier.trim() || update.isPending
            }
            onClick={() => update.mutate()}
          >
            {update.isPending ? 'Saving…' : 'Save Gate Pass details'}
          </Button>
        </AppCard>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <AppCard>
          <p className="text-xs font-bold text-[var(--color-text-muted)]">Destination</p>
          <p className="mt-1 font-extrabold">{pass.destination.name}</p>
          <p className="text-sm">{pass.destination.organization}</p>
        </AppCard>
        <AppCard>
          <p className="text-xs font-bold text-[var(--color-text-muted)]">Carrier</p>
          <p className="mt-1 font-extrabold">{pass.carrier.name}</p>
          <p className="text-sm">{pass.carrier.vehicleNumber}</p>
        </AppCard>
        <AppCard>
          <p className="text-xs font-bold text-[var(--color-text-muted)]">Gate Out</p>
          <p className="mt-1 font-extrabold">{formatDate(pass.gateOut?.at ?? null)}</p>
        </AppCard>
      </div>
      <AppCard className="space-y-4">
        <h2 className="font-extrabold">Material details</h2>
        <div className="divide-y divide-[var(--color-border)]">
          {pass.items.map((item) => (
            <div className="flex items-start gap-3 py-4" key={item.itemId}>
              {canGateIn &&
              ['OUTSIDE', 'PARTIALLY_IN'].includes(pass.status) &&
              item.returnRequirement === 'RETURNABLE' &&
              item.remainingOutsideQuantity > 0 ? (
                <input
                  aria-label={`Select ${item.materialName} for Gate In`}
                  checked={Boolean(gateInDraft[item.itemId]?.selected)}
                  className="mt-1 size-4 accent-[var(--color-primary)]"
                  onChange={(e) => updateGateInDraft(item, { selected: e.target.checked })}
                  type="checkbox"
                />
              ) : null}
              <span className="min-w-0 flex-1">
                <strong>{item.materialName}</strong>
                <span className="block text-sm text-[var(--color-text-muted)]">
                  {item.materialCode} ·{' '}
                  {item.assetTag ?? `${item.quantity} ${item.unitLabel ?? 'units'}`} ·{' '}
                  {item.returnRequirement.replace('_', ' ')}
                  {pass.gateOut ? ` · ${item.remainingOutsideQuantity} pending Gate In` : ''}
                </span>
                {item.movementCondition ? (
                  <span className="mt-1 block text-sm font-bold text-[var(--color-text-strong)]">
                    Gate Out condition: {movementConditionLabel[item.movementCondition]}
                  </span>
                ) : null}
                {item.faultDescription ? (
                  <span className="mt-1 block text-sm text-[var(--color-text-muted)]">
                    {item.faultDescription}
                  </span>
                ) : null}
                {gateInDraft[item.itemId]?.selected ? (
                  <div className="mt-4 grid gap-3 rounded-xl bg-[var(--color-surface-tint)] p-4 md:grid-cols-2 xl:grid-cols-4">
                    {item.trackingMode === 'QUANTITY' ? (
                      <label>
                        <span className="field-label">Receiving quantity</span>
                        <input
                          className="field-input w-full"
                          max={item.remainingOutsideQuantity}
                          min={1}
                          onChange={(event) =>
                            updateGateInDraft(item, { quantity: Number(event.target.value) })
                          }
                          type="number"
                          value={gateInDraft[item.itemId]!.quantity}
                        />
                      </label>
                    ) : null}
                    <label>
                      <span className="field-label">Outcome</span>
                      <select
                        className="field-input w-full"
                        onChange={(event) =>
                          updateGateInDraft(item, {
                            outcome: event.target.value as GateInDraft['outcome'],
                          })
                        }
                        value={gateInDraft[item.itemId]!.outcome}
                      >
                        <option value="RECEIVED">Received</option>
                        <option value="REPAIRED">Repaired</option>
                        <option value="STILL_FAULTY">Still faulty</option>
                        <option value="DAMAGED">Damaged</option>
                        <option value="REPLACED">Replaced</option>
                      </select>
                    </label>
                    <label className={item.trackingMode === 'QUANTITY' ? '' : 'md:col-span-1'}>
                      <span className="field-label">Condition received</span>
                      <input
                        className="field-input w-full"
                        onChange={(event) =>
                          updateGateInDraft(item, { condition: event.target.value })
                        }
                        value={gateInDraft[item.itemId]!.condition}
                      />
                    </label>
                    {gateInDraft[item.itemId]!.outcome === 'REPLACED' ? (
                      <label>
                        <span className="field-label">Replacement serial number</span>
                        <input
                          className="field-input w-full"
                          onChange={(event) =>
                            updateGateInDraft(item, {
                              replacementSerialNumber: event.target.value,
                            })
                          }
                          value={gateInDraft[item.itemId]!.replacementSerialNumber}
                        />
                      </label>
                    ) : null}
                    <label className="md:col-span-2 xl:col-span-4">
                      <span className="field-label">Item remarks (optional)</span>
                      <input
                        className="field-input w-full"
                        onChange={(event) =>
                          updateGateInDraft(item, { remarks: event.target.value })
                        }
                        value={gateInDraft[item.itemId]!.remarks}
                      />
                    </label>
                  </div>
                ) : null}
              </span>
            </div>
          ))}
        </div>
        {canGateIn && ['OUTSIDE', 'PARTIALLY_IN'].includes(pass.status) ? (
          <div className="space-y-4 border-t border-[var(--color-border)] pt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="field-label">Person returning (optional)</span>
                <input
                  className="field-input w-full"
                  onChange={(event) => setPersonReturning(event.target.value)}
                  value={personReturning}
                />
              </label>
              <label>
                <span className="field-label">Gate In remarks (optional)</span>
                <input
                  className="field-input w-full"
                  onChange={(event) => setGateInRemarks(event.target.value)}
                  value={gateInRemarks}
                />
              </label>
            </div>
            <Button
              disabled={gateInInvalid || inside.isPending}
              onClick={() => inside.mutate(pass)}
            >
              <ArrowDownToLine size={18} />
              {inside.isPending ? 'Recording Gate In…' : 'Record selected Gate In'}
            </Button>
          </div>
        ) : null}
      </AppCard>
      {pass.gateInEvents.length ? (
        <AppCard className="space-y-4">
          <h2 className="font-extrabold">Gate In history</h2>
          <div className="divide-y divide-[var(--color-border)]">
            {pass.gateInEvents.map((event, index) => (
              <div
                className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
                key={event.eventId}
              >
                <div>
                  <p className="font-extrabold">Gate In #{index + 1}</p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    {formatDate(event.receivedAt)} · {event.items.length} line
                    {event.items.length === 1 ? '' : 's'} · Recorded by {event.receivedBy.name}
                  </p>
                </div>
                {canPrint ? (
                  <Link
                    className="button-secondary"
                    to={`/inventory/gate-passes/${pass.gatePassNumber}/print?movement=IN&eventId=${event.eventId}`}
                  >
                    <Printer size={17} /> Print Gate In receipt
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </AppCard>
      ) : null}
      {pass.status === 'READY_FOR_OUT' && canCancel ? (
        <AppCard className="space-y-3 border-[var(--color-danger-muted)]">
          <h2 className="font-extrabold">Cancel Gate Pass</h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            Cancellation is available only before Gate Out and is permanently audited.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              className="field-input min-w-0 flex-1"
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Cancellation reason (minimum 5 characters)"
              value={cancelReason}
            />
            <Button
              disabled={cancelReason.trim().length < 5 || cancel.isPending}
              onClick={() => cancel.mutate()}
              variant="secondary"
            >
              {cancel.isPending ? 'Cancelling…' : 'Cancel Gate Pass'}
            </Button>
          </div>
        </AppCard>
      ) : null}
    </div>
  );
}

export function InventoryGatePassPrintPage() {
  const { gatePassNumber = '' } = useParams();
  const [searchParameters] = useSearchParams();
  const query = useQuery({
    queryKey: ['inventory-gate-pass', gatePassNumber],
    queryFn: () => getInventoryGatePass(gatePassNumber),
  });
  if (!query.data) return <LoadingPanel />;
  const pass = query.data;
  const movement = searchParameters.get('movement') === 'IN' ? 'IN' : 'OUT';
  const requestedEventId = searchParameters.get('eventId');
  const gateInEvent =
    movement === 'IN'
      ? (pass.gateInEvents.find((event) => event.eventId === requestedEventId) ??
        pass.gateInEvents.at(-1))
      : null;
  if (movement === 'IN' && !gateInEvent) {
    return <ErrorState message="No completed Gate In event is available for this receipt." />;
  }
  const printItems = gateInEvent
    ? gateInEvent.items.map((eventItem) => ({
        eventItem,
        item: pass.items.find((item) => item.itemId === eventItem.itemId)!,
      }))
    : pass.items.map((item) => ({ eventItem: null, item }));
  const materialLabel =
    pass.materialComposition === 'ASSET_ONLY'
      ? 'IT ASSET'
      : pass.materialComposition === 'CONSUMABLE_ONLY'
        ? 'IT CONSUMABLE'
        : 'IT ASSET & CONSUMABLE';
  return (
    <article className="bill-sheet">
      <div className="mb-4 text-right print:hidden">
        <Button onClick={() => window.print()}>
          <Printer size={18} />
          Print
        </Button>
      </div>
      <header className="bill-header">
        <div className="bill-brand-block">
          <img alt="Graphic Era University" className="bill-logo" src="/graphic-era-mark.png" />
          <div>
            <p className="bill-brand-name">AssetDesk</p>
            <p className="bill-brand-tagline">Graphic Era Deemed to be University</p>
          </div>
        </div>
        <div className="bill-title-block">
          <h1>
            {materialLabel} GATE PASS {movement}
          </h1>
          <p className="bill-muted">Computer Centre · {purposeLabel[pass.purpose]}</p>
        </div>
        <div className="bill-id-box">
          <span>Gate Pass No.</span>
          <strong>{pass.gatePassNumber}</strong>
        </div>
      </header>
      <section className="bill-grid bill-summary-grid">
        <div className="bill-field">
          <span>Date</span>
          <strong>
            {formatDate(gateInEvent?.receivedAt ?? pass.gateOut?.at ?? pass.createdAt)}
          </strong>
        </div>
        <div className="bill-field">
          <span>Destination</span>
          <strong>{pass.destination.name}</strong>
        </div>
        <div className="bill-field">
          <span>{movement === 'IN' ? 'Returned by' : 'Carrier'}</span>
          <strong>{gateInEvent?.personReturning ?? pass.carrier.name}</strong>
        </div>
      </section>
      <h2>
        {movement === 'IN' ? 'Following Items Were Received' : 'Following Items Are Going Out'}
      </h2>
      <table className="bill-table">
        <thead>
          <tr>
            <th>S.No.</th>
            <th>Item Name</th>
            <th>QTY</th>
            <th>Details</th>
            <th>Remark</th>
          </tr>
        </thead>
        <tbody>
          {printItems.map(({ item, eventItem }, index) => (
            <tr key={item.itemId}>
              <td>{index + 1}</td>
              <td>{item.materialName}</td>
              <td>{eventItem?.quantity ?? item.quantity}</td>
              <td>
                {item.assetTag
                  ? `${item.assetTag}${item.serialNumber ? ` / ${item.serialNumber}` : ''}`
                  : item.materialCode}
              </td>
              <td>
                {eventItem
                  ? `${eventItem.outcome.replaceAll('_', ' ')} · ${eventItem.condition}${eventItem.remarks ? ` · ${eventItem.remarks}` : ''}`
                  : [
                      item.movementCondition
                        ? movementConditionLabel[item.movementCondition]
                        : null,
                      item.faultDescription,
                      !item.movementCondition && !item.faultDescription
                        ? item.returnRequirement.replace('_', ' ')
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <section className="bill-two-column bill-signatures">
        <div>
          <span>
            {movement === 'IN'
              ? `Received by: ${gateInEvent!.receivedBy.name}`
              : `Created by: ${pass.createdBy.name}`}
          </span>
        </div>
        <div>
          <span>I/C Computer Centre</span>
        </div>
      </section>
      <footer className="bill-footer">
        {movement === 'IN'
          ? `Gate In: ${formatDate(gateInEvent!.receivedAt)}`
          : `Gate Out: ${formatDate(pass.gateOut?.at ?? null)}`}{' '}
        · Status: {statusLabel[pass.status]}
      </footer>
    </article>
  );
}
