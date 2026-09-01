import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, CheckCircle2, ClipboardCheck, PackageCheck } from 'lucide-react';
import {
  AppCard,
  Button,
  ErrorSummary,
  LoadingPanel,
  PageHeader,
  TextField,
} from '../../components/ui';
import { getGatePasses, recordGateIn, type GatePass } from '../../lib/cartridges-api';

const receivingStatuses = new Set(['VERIFIED', 'GATE_OUT', 'PARTIALLY_RETURNED']);

export function CartridgeQcPage() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const passes = useQuery({
    queryKey: ['cartridge-gate-passes', 'gate-in-queue'],
    queryFn: getGatePasses,
  });
  const [selectedPassId, setSelectedPassId] = useState('');
  const [selectedSerials, setSelectedSerials] = useState<string[]>([]);
  const [remarks, setRemarks] = useState('');
  const gateInMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPassId) throw new Error('Choose a Gate Pass Out record.');
      return recordGateIn(selectedPassId, selectedSerials, remarks.trim() || undefined);
    },
    onSuccess: async () => {
      const completedPassId = selectedPassId;
      setSelectedPassId('');
      setSelectedSerials([]);
      setRemarks('');
      await client.invalidateQueries({ queryKey: ['cartridge-gate-passes'] });
      await client.invalidateQueries({ queryKey: ['cartridges'] });
      await client.invalidateQueries({ queryKey: ['cartridge-dashboard'] });
      void passes.refetch();
      navigate(`/cartridges/gate-passes/${completedPassId}`);
    },
  });
  const gateInPasses =
    passes.data?.data.filter((pass) => receivingStatuses.has(pass.status)) ??
    [];
  const qcPendingPasses = passes.data?.data.filter((pass) => pass.status === 'QC_PENDING') ?? [];
  const selectedPass = gateInPasses.find((pass) => pass._id === selectedPassId) ?? null;
  const availableSerials = selectedPass ? pendingGateInSerials(selectedPass) : [];
  const totalPendingSerials = gateInPasses.reduce(
    (total, pass) => total + pendingGateInSerials(pass).length,
    0,
  );

  function selectPass(pass: GatePass) {
    setSelectedPassId(pass._id);
    setSelectedSerials(pendingGateInSerials(pass));
  }

  function toggleSerial(serialNumber: string, checked: boolean) {
    setSelectedSerials((current) =>
      checked
        ? [...new Set([...current, serialNumber])]
        : current.filter((serial) => serial !== serialNumber),
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gate Pass In"
        description="Receive cartridges that already went out to the vendor, then send them to QC."
        actions={
          <Link className="button-secondary" to="/cartridges/gate-passes">
            Gate Pass Out
          </Link>
        }
      />
      {gateInMutation.isError ? (
        <ErrorSummary message={(gateInMutation.error as Error).message} />
      ) : null}
      {passes.isPending ? <LoadingPanel label="Loading Gate Pass In queue" /> : null}
      {passes.isError ? <ErrorSummary message="Gate Pass In queue could not be loaded." /> : null}
      {!passes.isPending && !passes.isError ? (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <QueueStat
              icon={<PackageCheck size={20} />}
          label="Ready for Gate In"
              value={gateInPasses.length}
            />
            <QueueStat
              icon={<ClipboardCheck size={20} />}
              label="Cartridges due in"
              value={totalPendingSerials}
            />
            <QueueStat
              icon={<CheckCircle2 size={20} />}
              label="Waiting QC"
              value={qcPendingPasses.length}
            />
          </div>
          <AppCard className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
              Ready for Gate In
                </h2>
                <p className="text-sm text-[var(--color-text-muted)]">
                  These Gate Pass Out records are with the vendor now. Select one to record the
                  returned cartridges.
                </p>
              </div>
            </div>
            <div className="grid gap-3">
              {gateInPasses.length === 0 ? (
                <p className="rounded-[10px] bg-[var(--color-surface-tint)] p-3 text-sm font-bold text-[var(--color-text-muted)]">
                  No Gate Pass Out records are ready for Gate In. Passes already received are
                  listed below under Waiting QC.
                </p>
              ) : (
                gateInPasses.map((pass) => (
                  <button
                    className={`rounded-[10px] border bg-white p-3 text-left transition hover:border-[var(--color-primary-border)] hover:bg-[var(--color-primary-soft)] ${
                      selectedPassId === pass._id
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]'
                        : 'border-[var(--color-border)]'
                    }`}
                    key={pass._id}
                    onClick={() => selectPass(pass)}
                    type="button"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <strong className="text-[var(--color-primary-strong)]">
                      {pass.gatePassNumber}
                    </strong>
                        <span className="rounded-full bg-[var(--color-primary-soft)] px-2.5 py-1 text-xs font-bold text-[var(--color-primary)]">
                          {pendingGateInSerials(pass).length} due in
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs font-extrabold text-[var(--color-primary)]">
                    Gate Pass In <ArrowRight size={15} />
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-text-muted)]">
                      {pass.vendorName} · {pass.quantity} cartridges · Gate out{' '}
                      {pass.gateOutAt
                        ? new Date(pass.gateOutAt).toLocaleString('en-IN')
                        : 'recorded'}
                    </p>
                  </button>
                ))
              )}
            </div>
          </AppCard>
          {selectedPass ? (
            <AppCard className="space-y-4">
              <div>
                <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
              Complete Gate Pass In
                </h2>
                <p className="text-sm text-[var(--color-text-muted)]">
                  {selectedPass.gatePassNumber} selected. Tick only the cartridges physically
                  received.
                </p>
              </div>
              <>
                <div className="grid max-h-72 gap-2 overflow-auto rounded-[8px] border border-[var(--color-border)] p-2 sm:grid-cols-2">
                  {availableSerials.map((serialNumber) => (
                    <label
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[8px] px-3 py-2 text-sm font-bold hover:bg-[var(--color-surface-tint)]"
                      key={serialNumber}
                    >
                      <input
                        checked={selectedSerials.includes(serialNumber)}
                        onChange={(event) => toggleSerial(serialNumber, event.target.checked)}
                        type="checkbox"
                      />
                      {serialNumber}
                    </label>
                  ))}
                </div>
                <TextField
                  label="Gate In remarks"
                  optional
                  placeholder="Received by security, receipt note, or vendor remark"
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                />
                <div className="flex justify-end">
                  <Button
                    disabled={selectedSerials.length === 0}
                    loading={gateInMutation.isPending}
                    onClick={() => gateInMutation.mutate()}
                  >
                    Save Gate In
                  </Button>
                </div>
              </>
            </AppCard>
          ) : null}
          {qcPendingPasses.length > 0 ? (
            <AppCard className="space-y-4">
              <div>
                <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
                  Waiting QC
                </h2>
                <p className="text-sm text-[var(--color-text-muted)]">
                  These Gate Passes are already received. Complete cartridge QC from the pass
                  details.
                </p>
              </div>
              <div className="grid gap-3">
                {qcPendingPasses.map((pass) => (
                  <Link
                    className="rounded-[10px] border border-[var(--color-border)] bg-white p-3 transition hover:border-[var(--color-primary-border)] hover:bg-[var(--color-surface-tint)]"
                    key={pass._id}
                    to={`/cartridges/gate-passes/${pass._id}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-[var(--color-primary-strong)]">
                        {pass.gatePassNumber}
                      </strong>
                      <span className="rounded-full bg-[var(--color-primary-soft)] px-2.5 py-1 text-xs font-bold text-[var(--color-primary)]">
                        QC pending
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-text-muted)]">
                      {pass.vendorName} · {pass.quantity} cartridges
                    </p>
                  </Link>
                ))}
              </div>
            </AppCard>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function QueueStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <AppCard className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-[8px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
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

function pendingGateInSerials(pass: GatePass): string[] {
  const received = new Set(
    pass.gateInEvents.flatMap((event) =>
      event.serialNumbers.map((serialNumber) => serialNumber.toUpperCase()),
    ),
  );
  return pass.cartridgeSerialNumbers.filter(
    (serialNumber) => !received.has(serialNumber.toUpperCase()),
  );
}
