import { useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { AlertCircle, LogIn, MoreVertical, Plus, Printer } from 'lucide-react';
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
  gatePassAction,
  getCartridges,
  getGatePass,
  getGatePasses,
  recordGateIn,
} from '../../lib/cartridges-api';

const gatePassEligibleStatuses = ['EMPTY', 'DEFECTIVE', 'REFILL_FAILED'] as const;

const gatePassEligibleLabels: Record<(typeof gatePassEligibleStatuses)[number], string> = {
  EMPTY: 'Empty',
  DEFECTIVE: 'Defective',
  REFILL_FAILED: 'Refill failed',
};

export function GatePassesPage() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['cartridge-gate-passes'], queryFn: getGatePasses });
  const [confirm, setConfirm] = useState<ConfirmDialogState>(null);
  const gateIn = useMutation({
    mutationFn: (pass: Awaited<ReturnType<typeof getGatePasses>>['data'][number]) =>
      recordGateIn(pass._id, pendingGateInSerials(pass)),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['cartridge-gate-passes'] }),
        client.invalidateQueries({ queryKey: ['cartridges'] }),
        client.invalidateQueries({ queryKey: ['cartridge-dashboard'] }),
      ]);
    },
  });

  function confirmGateIn(pass: Awaited<ReturnType<typeof getGatePasses>>['data'][number]) {
    const pendingSerials = pendingGateInSerials(pass);
    if (pendingSerials.length === 0) return;
    setConfirm({
      title: 'Confirm Gate Pass In',
      message: `${pass.gatePassNumber} will receive ${pendingSerials.length} cartridge(s).`,
      actionLabel: 'Gate Pass In',
      onConfirm: () => gateIn.mutate(pass),
    });
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      <PageHeader
        title="Gate Pass Out"
        description="Create and manage outward Gate Passes for cartridges going to the vendor."
        actions={
          <>
            <Link className="button-primary" to="/cartridges/gate-passes/new">
              <Plus size={18} />
              Create Gate Pass Out
            </Link>
            <Link className="button-secondary" to="/cartridges/gate-in">
              Gate Pass In
            </Link>
            <details className="relative" data-action-menu>
              <summary className="button-secondary cursor-pointer list-none">
                <MoreVertical size={18} />
              </summary>
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-[8px] border bg-white p-1 shadow-lg">
                <button className="menu-item w-full" onClick={() => window.print()}>
                  <Printer size={16} />
                  Print register
                </button>
              </div>
            </details>
          </>
        }
      />
      {query.isPending ? (
        <LoadingPanel />
      ) : query.isError ? (
        <ErrorSummary message="Gate Pass register could not be loaded." />
      ) : gateIn.isError ? (
        <ErrorSummary message={(gateIn.error as Error).message} />
      ) : (
        <>
          <AppCard className="grid gap-3 md:grid-cols-4">
            {['Create Gate Pass', 'Confirm Gate Out', 'Record Gate In', 'Complete QC'].map(
              (step, index) => (
                <div
                  className="rounded-[10px] bg-[var(--color-surface-tint)] px-3 py-2 text-sm font-bold text-[var(--color-primary-strong)]"
                  key={step}
                >
                  {index + 1}. {step}
                </div>
              ),
            )}
          </AppCard>
          <div className="grid gap-3">
            {query.data?.data.map((pass) => (
              <AppCard
                className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                key={pass._id}
              >
                <Link className="min-w-0 flex-1" to={`/cartridges/gate-passes/${pass._id}`}>
                  <div>
                    <p className="font-extrabold text-[var(--color-primary-strong)]">
                      {pass.gatePassNumber}
                    </p>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {pass.vendorName} · {pass.quantity} cartridges · Prepared by{' '}
                      {pass.preparedByName}
                    </p>
                  </div>
                </Link>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {['GATE_OUT', 'PARTIALLY_RETURNED'].includes(pass.status) ? (
                    <Button
                      loading={gateIn.isPending}
                      onClick={() => confirmGateIn(pass)}
                      variant="secondary"
                    >
                      <LogIn size={17} />
                      Gate Pass In
                    </Button>
                  ) : null}
                  <span className="rounded-full bg-[var(--color-primary-soft)] px-3 py-1 text-xs font-bold text-[var(--color-primary)]">
                    {pass.status.replaceAll('_', ' ')}
                  </span>
                </div>
              </AppCard>
            ))}
          </div>
        </>
      )}
    </div>
  );
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
  const client = useQueryClient();
  const [confirm, setConfirm] = useState<ConfirmDialogState>(null);
  const query = useQuery({
    queryKey: ['cartridge-gate-pass', gatePassId],
    queryFn: () => getGatePass(gatePassId),
  });
  const [gateInSerials, setGateInSerials] = useState('');
  const action = useMutation({
    mutationFn: (name: 'verify' | 'gate-out' | 'cancel') => gatePassAction(gatePassId, name),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['cartridge-gate-pass', gatePassId] }),
        client.invalidateQueries({ queryKey: ['cartridge-gate-passes'] }),
        client.invalidateQueries({ queryKey: ['cartridges'] }),
        client.invalidateQueries({ queryKey: ['cartridge-dashboard'] }),
      ]);
    },
  });
  const gateIn = useMutation({
    mutationFn: () =>
      recordGateIn(
        gatePassId,
        gateInSerials
          .split(/\r?\n|,/)
          .map((x) => x.trim())
          .filter(Boolean),
      ),
    onSuccess: async () => {
      setGateInSerials('');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['cartridge-gate-pass', gatePassId] }),
        client.invalidateQueries({ queryKey: ['cartridge-gate-passes'] }),
        client.invalidateQueries({ queryKey: ['cartridges'] }),
        client.invalidateQueries({ queryKey: ['cartridge-dashboard'] }),
      ]);
    },
  });
  if (query.isPending) return <LoadingPanel />;
  if (query.isError || !query.data)
    return <ErrorSummary message="Gate Pass could not be loaded." />;
  const p = query.data.data;
  const gateInRecorded = new Set(
    p.gateInEvents.flatMap((event) => event.serialNumbers.map((serial) => serial.toUpperCase())),
  );
  const pendingGateInSerials = p.cartridgeSerialNumbers.filter(
    (serial) => !gateInRecorded.has(serial.toUpperCase()),
  );
  const selectedGateInSerials = gateInSerials
    .split(/\r?\n|,/)
    .map((serial) => serial.trim())
    .filter(Boolean);
  function toggleGateInSerial(serialNumber: string, checked: boolean) {
    const selected = new Set(selectedGateInSerials);
    if (checked) selected.add(serialNumber);
    else selected.delete(serialNumber);
    setGateInSerials(Array.from(selected).join('\n'));
  }
  function confirmAllGateIn() {
    if (pendingGateInSerials.length === 0) return;
    setConfirm({
      title: 'Confirm Gate Pass In',
      message: `${p.gatePassNumber} will receive ${pendingGateInSerials.length} cartridge(s).`,
      actionLabel: 'Gate Pass In',
      onConfirm: () => {
        setGateInSerials(pendingGateInSerials.join('\n'));
        recordGateIn(p._id, pendingGateInSerials).then(async () => {
          await Promise.all([
            client.invalidateQueries({ queryKey: ['cartridge-gate-pass', gatePassId] }),
            client.invalidateQueries({ queryKey: ['cartridge-gate-passes'] }),
            client.invalidateQueries({ queryKey: ['cartridges'] }),
            client.invalidateQueries({ queryKey: ['cartridge-dashboard'] }),
          ]);
        });
      },
    });
  }
  return (
    <div className="space-y-6">
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      <PageHeader
        title={p.gatePassNumber}
        description={`${p.vendorName} · ${p.quantity} cartridges`}
        actions={
          <Link className="button-secondary" to={`/cartridges/gate-passes/${p._id}/print`}>
            <Printer size={18} />
            Print Gate Pass
          </Link>
        }
      />
      <AppCard className="grid gap-4 md:grid-cols-2">
        <Info label="Person taking material" value={p.personTakingMaterial} />
        <Info label="Prepared By" value={`${p.preparedByName} (${p.preparedByWorkerId})`} />
        <Info label="Verified By" value={p.verifiedByName ?? 'Awaiting verification'} />
        <Info label="Status" value={p.status.replaceAll('_', ' ')} />
      </AppCard>
      <AppCard>
        <h2 className="font-extrabold text-[var(--color-primary-strong)]">Cartridge numbers</h2>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2">
          {p.cartridgeSerialNumbers.map((x, i) => (
            <li
              className="rounded-[8px] bg-[var(--color-surface-tint)] px-3 py-2 text-sm font-bold"
              key={x}
            >
              {i + 1}. {x}
            </li>
          ))}
        </ol>
      </AppCard>
      <div className="flex flex-wrap gap-2">
        {['DRAFT', 'AWAITING_VERIFICATION', 'VERIFIED'].includes(p.status) ? (
          <Button
            loading={action.isPending}
            onClick={() => action.mutate('cancel')}
            variant="danger"
          >
            Cancel Gate Pass
          </Button>
        ) : null}
        {['GATE_OUT', 'PARTIALLY_RETURNED'].includes(p.status) ? (
          <Button loading={gateIn.isPending} onClick={confirmAllGateIn} variant="secondary">
            <LogIn size={17} />
            Gate Pass In
          </Button>
        ) : null}
      </div>
      {['GATE_OUT', 'PARTIALLY_RETURNED'].includes(p.status) ? (
        <AppCard className="space-y-3">
          <h2 className="font-extrabold">Record Gate In</h2>
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">
            Select only the cartridges physically returning from this Gate Pass.
          </p>
          <div className="grid max-h-72 gap-2 overflow-y-auto rounded-[8px] border border-[var(--color-border)] p-2 sm:grid-cols-2">
            {pendingGateInSerials.map((serialNumber) => (
              <label
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[8px] px-3 py-2 text-sm font-bold hover:bg-[var(--color-surface-tint)]"
                key={serialNumber}
              >
                <input
                  checked={selectedGateInSerials.includes(serialNumber)}
                  onChange={(event) => toggleGateInSerial(serialNumber, event.target.checked)}
                  type="checkbox"
                />
                {serialNumber}
              </label>
            ))}
            {pendingGateInSerials.length === 0 ? (
              <p className="px-3 py-2 text-sm font-bold text-[var(--color-success)]">
                All Gate Out cartridges have been received.
              </p>
            ) : null}
          </div>
          <Button
            disabled={selectedGateInSerials.length === 0}
            loading={gateIn.isPending}
            onClick={() => gateIn.mutate()}
          >
            Save Gate In
          </Button>
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

function ConfirmDialog({
  state,
  onClose,
}: {
  state: ConfirmDialogState;
  onClose: () => void;
}) {
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
            <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
              {state.message}
            </p>
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

function pendingGateInSerials(pass: {
  cartridgeSerialNumbers: string[];
  gateInEvents: Array<{ serialNumbers: string[] }>;
}): string[] {
  const received = new Set(
    pass.gateInEvents.flatMap((event) =>
      event.serialNumbers.map((serialNumber) => serialNumber.toUpperCase()),
    ),
  );
  return pass.cartridgeSerialNumbers.filter(
    (serialNumber) => !received.has(serialNumber.toUpperCase()),
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
