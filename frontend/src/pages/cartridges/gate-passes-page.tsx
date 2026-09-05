import { useState, type ReactNode } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Clock3,
  Database,
  PackagePlus,
  Printer,
  Plus,
} from 'lucide-react';
import {
  AppCard,
  Button,
  ErrorSummary,
  LoadingPanel,
  PageHeader,
  TextField,
} from '../../components/ui';
import {
  createGatePass,
  getCartridges,
  getGatePass,
  getGatePasses,
} from '../../lib/cartridges-api';

const gatePassEligibleStatuses = ['EMPTY', 'DEFECTIVE', 'REFILL_FAILED'] as const;

const gatePassEligibleLabels: Record<(typeof gatePassEligibleStatuses)[number], string> = {
  EMPTY: 'Empty',
  DEFECTIVE: 'Defective',
  REFILL_FAILED: 'Refill failed',
};

export function GatePassesPage() {
  const query = useQuery({ queryKey: ['cartridge-gate-passes'], queryFn: getGatePasses });
  const passes = query.data?.data ?? [];
  const outCount = passes.filter((pass) => pass.status === 'GATE_OUT').length;
  const returnedCount = passes.filter((pass) =>
    ['PARTIALLY_RETURNED', 'QC_PENDING'].includes(pass.status),
  ).length;
  const completedCount = passes.filter((pass) => pass.status === 'CLOSED').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gate Pass Out"
        description="Create a pass for cartridges leaving the store. Every new pass is recorded as Gate Out automatically."
        actions={
          <>
            <Link className="button-primary" to="/cartridges/gate-passes/new">
              <Plus size={18} />
              Create Gate Pass Out
            </Link>
            <Link className="button-secondary" to="/cartridges/gate-passes/database">
              <Database size={18} />
              Gate Pass Database
            </Link>
          </>
        }
      />
      {query.isPending ? (
        <LoadingPanel />
      ) : query.isError ? (
        <ErrorSummary message="Gate Pass register could not be loaded." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard
              icon={<ArrowUpFromLine size={19} />}
              label="With vendor"
              value={outCount}
            />
            <SummaryCard icon={<Clock3 size={19} />} label="Partially returned" value={returnedCount} />
            <SummaryCard
              icon={<CheckCircle2 size={19} />}
              label="Completed"
              value={completedCount}
            />
          </div>
          <AppCard className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
                  Recent Gate Pass Out
                </h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  {passes.length} {passes.length === 1 ? 'pass' : 'passes'} recorded
                </p>
              </div>
              <Link className="button-quiet" to="/cartridges/gate-in">
                Open Gate Pass In
              </Link>
            </div>
            {passes.length === 0 ? (
              <EmptyState
                icon={<PackagePlus size={24} />}
                title="No Gate Pass Out records yet"
                message="Create the first pass to send returned cartridges to a vendor."
                action={
                  <Link className="button-primary" to="/cartridges/gate-passes/new">
                    <Plus size={17} />
                    Create Gate Pass Out
                  </Link>
                }
              />
            ) : (
              <div className="grid gap-3">
                {passes.map((pass) => (
                  <GatePassOutCard key={pass._id} pass={pass} />
                ))}
              </div>
            )}
          </AppCard>
        </>
      )}
    </div>
  );
}

export function GatePassDatabasePage() {
  const query = useQuery({ queryKey: ['cartridge-gate-passes'], queryFn: getGatePasses });
  const passes = query.data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gate Pass Database"
        description="One register for every cartridge Gate Out and Gate In record."
        actions={
          <>
            <Link className="button-secondary" to="/cartridges/gate-in">
              <ArrowDownToLine size={18} />
              Gate Pass In
            </Link>
            <Link className="button-primary" to="/cartridges/gate-passes/new">
              <Plus size={18} />
              Create Gate Pass Out
            </Link>
          </>
        }
      />
      {query.isPending ? <LoadingPanel /> : null}
      {query.isError ? <ErrorSummary message="Gate Pass database could not be loaded." /> : null}
      {!query.isPending && !query.isError ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <SummaryCard icon={<Database size={19} />} label="All passes" value={passes.length} />
            <SummaryCard
              icon={<ArrowUpFromLine size={19} />}
              label="Gate Out"
              value={passes.filter((pass) => pass.status === 'GATE_OUT').length}
            />
            <SummaryCard
              icon={<ArrowDownToLine size={19} />}
              label="Gate In successful"
              value={
                passes.filter((pass) => ['PARTIALLY_RETURNED', 'QC_PENDING'].includes(pass.status))
                  .length
              }
            />
            <SummaryCard
              icon={<CheckCircle2 size={19} />}
              label="Gate In complete"
              value={passes.filter((pass) => pass.status === 'CLOSED').length}
            />
          </div>
          <AppCard className="overflow-hidden p-0">
            {passes.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<Database size={24} />}
                  title="No Gate Pass records"
                  message="Created Gate Pass Out records will appear here automatically."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left">
                  <thead className="bg-[var(--color-surface-tint)] text-xs uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                    <tr>
                      <th className="px-5 py-3 font-extrabold">Gate Pass</th>
                      <th className="px-5 py-3 font-extrabold">Vendor</th>
                      <th className="px-5 py-3 font-extrabold">Cartridges</th>
                      <th className="px-5 py-3 font-extrabold">Gate Out</th>
                      <th className="px-5 py-3 font-extrabold">Gate In</th>
                      <th className="px-5 py-3 font-extrabold">Status</th>
                      <th className="px-5 py-3 font-extrabold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {passes.map((pass) => (
                      <tr className="border-t border-[var(--color-border)]" key={pass._id}>
                        <td className="px-5 py-4">
                          <Link
                            className="font-extrabold text-[var(--color-primary)] hover:underline"
                            to={`/cartridges/gate-passes/${pass._id}`}
                          >
                            {pass.gatePassNumber}
                          </Link>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                            {formatDate(pass.createdAt)}
                          </p>
                        </td>
                        <td className="px-5 py-4 font-bold">{pass.vendorName}</td>
                        <td className="px-5 py-4 font-bold">{pass.quantity}</td>
                        <td className="px-5 py-4 text-sm font-semibold text-[var(--color-text-muted)]">
                          {formatDate(pass.gateOutAt ?? pass.createdAt)}
                        </td>
                        <td className="px-5 py-4 text-sm font-semibold text-[var(--color-text-muted)]">
                          {pass.gateInEvents.length
                            ? formatDate(pass.gateInEvents.at(-1)?.at)
                            : 'Not received'}
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge status={pass.status} />
                        </td>
                        <td className="px-5 py-4">
                          {isGateOutStatus(pass.status) ? (
                            <Link
                              className="button-quiet whitespace-nowrap"
                              to={`/cartridges/gate-passes/${pass._id}/print`}
                            >
                              <Printer size={16} />
                              Out receipt
                            </Link>
                          ) : (
                            <span className="text-sm font-bold text-[var(--color-text-muted)]">
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AppCard>
        </>
      ) : null}
    </div>
  );
}

function GatePassOutCard({
  pass,
}: {
  pass: Awaited<ReturnType<typeof getGatePasses>>['data'][number];
}) {
  const gateInCount = new Set(
    pass.gateInEvents.flatMap((event) => event.serialNumbers.map((serial) => serial.toUpperCase())),
  ).size;
  return (
    <div className="flex flex-col gap-4 rounded-[12px] border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between">
      <Link className="min-w-0 flex-1" to={`/cartridges/gate-passes/${pass._id}`}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-extrabold text-[var(--color-primary-strong)]">{pass.gatePassNumber}</p>
          <StatusBadge status={pass.status} />
        </div>
        <p className="mt-1 text-sm font-bold text-[var(--color-text-muted)]">
          {pass.vendorName} · {pass.quantity} cartridges · Created {formatDate(pass.createdAt)}
        </p>
        <p className="mt-2 text-xs font-bold text-[var(--color-text-muted)]">
          {gateInCount} of {pass.quantity} received at Gate In
        </p>
      </Link>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Link className="button-secondary" to={`/cartridges/gate-passes/${pass._id}`}>
          View details
        </Link>
        {isGateOutStatus(pass.status) ? (
          <Link className="button-quiet" to={`/cartridges/gate-passes/${pass._id}/print`}>
            <Printer size={16} />
            Out receipt
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <AppCard className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
        {icon}
      </span>
      <span>
        <span className="block text-xl font-extrabold text-[var(--color-primary-strong)]">
          {value}
        </span>
        <span className="block text-sm font-bold text-[var(--color-text-muted)]">{label}</span>
      </span>
    </AppCard>
  );
}

function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid justify-items-center gap-2 rounded-[12px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-tint)] p-8 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
        {icon}
      </span>
      <h3 className="font-extrabold text-[var(--color-primary-strong)]">{title}</h3>
      <p className="max-w-md text-sm text-[var(--color-text-muted)]">{message}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${statusClass(status)}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function statusLabel(status: string) {
  return (
    {
      GATE_OUT: 'Gate Out',
      PARTIALLY_RETURNED: 'Partially received',
      QC_PENDING: 'Gate In successful',
      CLOSED: 'Gate In successful',
      CANCELLED: 'Cancelled',
      DRAFT: 'Draft',
      AWAITING_VERIFICATION: 'Awaiting verification',
      VERIFIED: 'Verified',
    }[status] ?? status.replaceAll('_', ' ')
  );
}

function statusClass(status: string) {
  if (status === 'CLOSED' || status === 'QC_PENDING') return 'bg-emerald-50 text-emerald-700';
  if (status === 'CANCELLED') return 'bg-red-50 text-red-700';
  if (status === 'PARTIALLY_RETURNED') {
    return 'bg-amber-50 text-amber-700';
  }
  return 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]';
}

function isGateOutStatus(status: string) {
  return ['GATE_OUT', 'PARTIALLY_RETURNED', 'QC_PENDING', 'CLOSED'].includes(status);
}

function formatDate(value: string | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export function CreateGatePassPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [confirm, setConfirm] = useState<ConfirmDialogState>(null);
  const [form, setForm] = useState({
    vendorName: '',
    personTakingMaterial: '',
    serials: [] as string[],
    remarks: '',
  });
  const eligibleQueries = useQueries({
    queries: gatePassEligibleStatuses.map((status) => ({
      queryKey: ['cartridges', { status, page: 1, pageSize: 100 }],
      queryFn: () => getCartridges({ status, page: 1, pageSize: 100 }),
    })),
  });
  const eligibleCartridges = eligibleQueries
    .flatMap((query) => query.data?.data ?? [])
    .sort((left, right) => left.serialNumber.localeCompare(right.serialNumber));
  const eligibleLoading = eligibleQueries.some((query) => query.isPending);
  const eligibleError = eligibleQueries.some((query) => query.isError);

  function setSerial(serialNumber: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      serials: checked
        ? [...new Set([...current.serials, serialNumber])]
        : current.serials.filter((item) => item !== serialNumber),
    }));
  }

  const mutation = useMutation({
    mutationFn: () =>
      createGatePass({
        vendorName: form.vendorName,
        personTakingMaterial: form.personTakingMaterial,
        cartridgeSerialNumbers: form.serials,
        remarks: form.remarks,
        submitForVerification: false,
      }),
    onSuccess: async (r) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['cartridges'] }),
        client.invalidateQueries({ queryKey: ['cartridge-gate-passes'] }),
        client.invalidateQueries({ queryKey: ['cartridge-dashboard'] }),
      ]);
      navigate(`/cartridges/gate-passes/${r.data._id}`);
    },
  });
  return (
    <div className="space-y-6">
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      <PageHeader
        title="Create Gate Pass Out"
        description="Select cartridges leaving the store for refill or vendor work. Gate In will happen against this same pass when they return."
      />
      {mutation.isError ? <ErrorSummary message={(mutation.error as Error).message} /> : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setConfirm({
            title: 'Create Gate Pass Out',
            message: `${form.serials.length} cartridge(s) will be sent to vendor now.`,
            actionLabel: 'Create Gate Pass Out',
            onConfirm: () => mutation.mutate(),
          });
        }}
      >
        <AppCard className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Vendor name"
              value={form.vendorName}
              onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
            />
            <TextField
              label="Person taking material"
              value={form.personTakingMaterial}
              onChange={(e) => setForm({ ...form, personTakingMaterial: e.target.value })}
            />
          </div>
          <label className="block space-y-1.5">
            <span className="field-label">Cartridge serial numbers</span>
            <div className="rounded-[8px] border border-[var(--color-border)]">
              <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-tint)] px-3 py-2 text-sm font-bold text-[var(--color-text-muted)]">
                {eligibleLoading
                  ? 'Loading eligible serial numbers...'
                  : `${form.serials.length} selected from ${eligibleCartridges.length} eligible cartridges`}
              </div>
              {eligibleError ? (
                <p className="p-3 text-sm font-bold text-[var(--color-danger)]">
                  Eligible serial numbers could not be loaded.
                </p>
              ) : eligibleCartridges.length === 0 && !eligibleLoading ? (
                <p className="p-3 text-sm font-bold text-[var(--color-text-muted)]">
                  No cartridges are ready for Gate Pass. Issue a filled cartridge first, then record
                  it as Empty, Defective, or Refill failed when it returns.
                </p>
              ) : (
                <div className="max-h-72 overflow-auto p-2">
                  {eligibleCartridges.map((item) => (
                    <label
                      className="flex cursor-pointer items-start gap-3 rounded-[8px] px-3 py-2 hover:bg-[var(--color-surface-tint)]"
                      key={item.id}
                    >
                      <input
                        checked={form.serials.includes(item.serialNumber)}
                        className="mt-1"
                        onChange={(event) => setSerial(item.serialNumber, event.target.checked)}
                        type="checkbox"
                      />
                      <span>
                        <span className="block font-extrabold text-[var(--color-text-strong)]">
                          {item.serialNumber}
                        </span>
                        <span className="block text-xs font-bold text-[var(--color-text-muted)]">
                          {item.model} ·{' '}
                          {
                            gatePassEligibleLabels[
                              item.status as keyof typeof gatePassEligibleLabels
                            ]
                          }{' '}
                          · {item.location}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </label>
          <div className="flex justify-end">
            <Button
              disabled={form.serials.length === 0 || eligibleLoading}
              loading={mutation.isPending}
            >
              Create Gate Pass Out
            </Button>
          </div>
        </AppCard>
      </form>
    </div>
  );
}

export function GatePassDetailPage() {
  const { gatePassId = '' } = useParams();
  const query = useQuery({
    queryKey: ['cartridge-gate-pass', gatePassId],
    queryFn: () => getGatePass(gatePassId),
  });
  if (query.isPending) return <LoadingPanel />;
  if (query.isError || !query.data)
    return <ErrorSummary message="Gate Pass could not be loaded." />;
  const p = query.data.data;
  const gateInRecorded = new Set(
    p.gateInEvents.flatMap((event) => event.serialNumbers.map((serial) => serial.toUpperCase())),
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title={p.gatePassNumber}
        description={`Gate Pass Out · ${p.vendorName} · ${p.quantity} cartridges`}
        actions={
          <>
            <Link className="button-secondary" to="/cartridges/gate-passes">
              Back to Gate Pass Out
            </Link>
            {isGateOutStatus(p.status) ? (
              <Link className="button-primary" to={`/cartridges/gate-passes/${p._id}/print`}>
                <Printer size={18} />
                Out receipt
              </Link>
            ) : null}
          </>
        }
      />
      <AppCard className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4">
          <div>
            <p className="text-sm font-bold text-[var(--color-text-muted)]">Current pass status</p>
            <div className="mt-2">
              <StatusBadge status={p.status} />
            </div>
          </div>
          <div className="rounded-[10px] bg-[var(--color-surface-tint)] px-4 py-3 text-sm font-bold text-[var(--color-text-muted)]">
            {gateInRecorded.size} of {p.quantity} cartridges received at Gate In
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Vendor" value={p.vendorName} />
          <Info label="Person taking material" value={p.personTakingMaterial} />
          <Info label="Prepared by" value={`${p.preparedByName} (${p.preparedByWorkerId})`} />
          <Info label="Gate Out date" value={formatDate(p.gateOutAt ?? p.createdAt)} />
        </div>
      </AppCard>
      <AppCard>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-extrabold text-[var(--color-primary-strong)]">
              Cartridges on pass
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Gate In is recorded from the separate Gate Pass In page.
            </p>
          </div>
          {['GATE_OUT', 'PARTIALLY_RETURNED'].includes(p.status) ? (
            <Link className="button-secondary" to="/cartridges/gate-in">
              Open Gate Pass In
            </Link>
          ) : null}
        </div>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2">
          {p.cartridgeSerialNumbers.map((x, i) => (
            <li
              className="flex items-center justify-between gap-3 rounded-[8px] bg-[var(--color-surface-tint)] px-3 py-2 text-sm font-bold"
              key={x}
            >
              <span>
                {i + 1}. {x}
              </span>
              <span
                className={
                  gateInRecorded.has(x.toUpperCase())
                    ? 'text-emerald-700'
                    : 'text-[var(--color-text-muted)]'
                }
              >
                {gateInRecorded.has(x.toUpperCase()) ? 'Received' : 'With vendor'}
              </span>
            </li>
          ))}
        </ol>
      </AppCard>
      {p.gateInEvents.length ? (
        <AppCard className="space-y-3">
          <div>
            <h2 className="font-extrabold text-[var(--color-primary-strong)]">Gate In history</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Each entry is saved when cartridges are received back.
            </p>
          </div>
          <div className="grid gap-2">
            {p.gateInEvents.map((event, index) => (
              <div
                className="rounded-[10px] bg-[var(--color-surface-tint)] p-3 text-sm"
                key={`${event.at}-${index}`}
              >
                <div className="flex flex-wrap justify-between gap-2 font-extrabold text-[var(--color-primary-strong)]">
                  <span>{event.serialNumbers.length} cartridge(s) received</span>
                  <span>{formatDate(event.at)}</span>
                </div>
                <p className="mt-1 text-xs font-bold text-[var(--color-text-muted)]">
                  Recorded by {event.byName}
                </p>
                {event.remarks ? (
                  <p className="mt-2 text-sm text-[var(--color-text-muted)]">{event.remarks}</p>
                ) : null}
              </div>
            ))}
          </div>
        </AppCard>
      ) : null}
    </div>
  );
}

type ConfirmDialogState = {
  title: string;
  message: string;
  actionLabel: string;
  onConfirm: () => void;
} | null;

function ConfirmDialog({ state, onClose }: { state: ConfirmDialogState; onClose: () => void }) {
  if (!state) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4">
      <div
        aria-modal="true"
        className="w-full max-w-md rounded-[12px] border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-overlay)]"
        role="dialog"
      >
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
            <AlertCircle size={21} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
              {state.title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{state.message}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button onClick={onClose} type="button" variant="secondary">
            Cancel
          </Button>
          <Button
            onClick={() => {
              state.onConfirm();
              onClose();
            }}
            type="button"
          >
            {state.actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}
export function GatePassPrintPage() {
  const { gatePassId = '' } = useParams();
  const query = useQuery({
    queryKey: ['cartridge-gate-pass', gatePassId],
    queryFn: () => getGatePass(gatePassId),
  });
  if (query.isPending) return <LoadingPanel />;
  if (!query.data) return <ErrorSummary message="Gate Pass could not be loaded." />;
  const p = query.data.data;
  return (
    <div className="mx-auto max-w-[800px] bg-white p-8 text-black print:max-w-none print:p-0">
      <div className="mb-4 text-right print:hidden">
        <Button onClick={() => window.print()}>
          <Printer size={18} />
          Print
        </Button>
      </div>
      <div className="border-2 border-black p-5">
        <div className="mb-6 flex items-start justify-between gap-4 border-b-2 border-black pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <img
              alt="Graphic Era University crest"
              className="h-14 w-14 shrink-0 object-contain"
              src="/graphic-era-mark.png"
            />
            <div className="min-w-0">
              <p className="text-xl font-black leading-tight">AssetDesk</p>
              <p className="mt-1 max-w-[220px] text-[11px] font-extrabold uppercase leading-snug">
                Graphic Era Asset Management System
              </p>
            </div>
          </div>
          <div className="text-right text-xs font-bold leading-relaxed">
            <p>Graphic Era Deemed to be University</p>
            <p>Dehradun</p>
          </div>
        </div>
        <h1 className="text-center text-2xl font-extrabold">
          Toner Cartridge Refilling
          <br />
          <u>Returnable Gate Pass</u>
        </h1>
        <div className="mt-6 grid grid-cols-2 border border-black text-sm">
          <b className="border-b border-r border-black p-2">Gate Pass No: {p.gatePassNumber}</b>
          <b className="border-b border-black p-2">
            Date: {new Date(p.createdAt).toLocaleDateString('en-IN')}
          </b>
          <b className="border-r border-black p-2">Vendor Name: {p.vendorName}</b>
          <b className="p-2">Person Taking Material: {p.personTakingMaterial}</b>
        </div>
        <table className="mt-5 w-full border-collapse border border-black">
          <thead>
            <tr>
              <th className="border border-black p-2">Sr. No.</th>
              <th className="border border-black p-2">Cartridge Number</th>
              <th className="border border-black p-2">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {p.cartridgeSerialNumbers.map((x, i) => (
              <tr key={x}>
                <td className="border border-black p-2 text-center">{i + 1}</td>
                <td className="border border-black p-2">{x}</td>
                <td className="border border-black p-2 text-center">1</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-5 grid grid-cols-2 border border-black">
          <div className="min-h-24 border-r border-black p-3">
            <b>Prepared by:</b>
            <p className="mt-3">{p.preparedByName}</p>
          </div>
          <div className="min-h-24 p-3">
            <b>Verified by:</b>
            <p className="mt-3">{p.verifiedByName ?? ''}</p>
          </div>
        </div>
        <div className="mt-6">
          <b>General Instructions:-</b>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            <li>Gate Pass is an authorization to allow the material to leave the premises.</li>
            <li>Security Department is to keep the record of Gate Pass.</li>
          </ol>
        </div>
        <div className="mt-16 flex justify-between font-bold">
          <span>Stamp (Gate IN)</span>
          <span>Stamp (Gate OUT)</span>
        </div>
      </div>
    </div>
  );
}
