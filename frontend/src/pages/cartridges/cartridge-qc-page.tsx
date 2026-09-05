import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ArrowRight, ClipboardCheck, Database, PackageCheck, X } from 'lucide-react';
import {
  AppCard,
  Button,
  ErrorSummary,
  LoadingPanel,
  PageHeader,
  TextField,
} from '../../components/ui';
import {
  getGatePasses,
  recordGateIn,
  type GatePass,
} from '../../lib/cartridges-api';

type GateInCondition = 'EMPTY' | 'DEFECTIVE' | 'FILLED_UNUSED' | 'DAMAGED' | 'WRONG_MODEL';

const receivingStatuses = new Set(['VERIFIED', 'GATE_OUT', 'PARTIALLY_RETURNED']);
const conditionOptions: Array<{ value: GateInCondition; label: string }> = [
  { value: 'FILLED_UNUSED', label: 'Refilled · ready to issue' },
  { value: 'EMPTY', label: 'Empty' },
  { value: 'DEFECTIVE', label: 'Not working · defective' },
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'WRONG_MODEL', label: 'Wrong model' },
];

export function CartridgeQcPage() {
  const client = useQueryClient();
  const passes = useQuery({
    queryKey: ['cartridge-gate-passes', 'gate-in-queue'],
    queryFn: getGatePasses,
  });
  const [selectedPass, setSelectedPass] = useState<GatePass | null>(null);
  const [selectedSerials, setSelectedSerials] = useState<string[]>([]);
  const [conditions, setConditions] = useState<Record<string, GateInCondition | ''>>({});
  const [remarks, setRemarks] = useState('');

  const gateInMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPass) throw new Error('Choose a Gate Pass Out record.');
      const selectedItems = selectedSerials.map((serialNumber) => {
        const condition = conditions[serialNumber];
        if (!condition) throw new Error(`Choose a return condition for ${serialNumber}.`);
        return { serialNumber, condition };
      });
      return recordGateIn(
        selectedPass._id,
        selectedSerials,
        remarks.trim() || undefined,
        selectedItems,
      );
    },
    onSuccess: async () => {
      closeModal();
      await Promise.all([
        client.invalidateQueries({ queryKey: ['cartridge-gate-passes'] }),
        client.invalidateQueries({ queryKey: ['cartridges'] }),
        client.invalidateQueries({ queryKey: ['cartridge-dashboard'] }),
      ]);
    },
  });
  const gateInPasses = passes.data?.data.filter((pass) => receivingStatuses.has(pass.status)) ?? [];
  const totalPendingSerials = gateInPasses.reduce(
    (total, pass) => total + pendingGateInSerials(pass).length,
    0,
  );
  const selectedConditionCount = selectedSerials.filter((serial) => conditions[serial]).length;

  function openModal(pass: GatePass) {
    const serials = pendingGateInSerials(pass);
    setSelectedPass(pass);
    setSelectedSerials(serials);
    setConditions(Object.fromEntries(serials.map((serial) => [serial, ''])));
    setRemarks('');
    gateInMutation.reset();
  }

  function closeModal() {
    setSelectedPass(null);
    setSelectedSerials([]);
    setConditions({});
    setRemarks('');
    gateInMutation.reset();
  }

  function toggleSerial(serialNumber: string, checked: boolean) {
    setSelectedSerials((current) =>
      checked
        ? [...new Set([...current, serialNumber])]
        : current.filter((serial) => serial !== serialNumber),
    );
    if (!checked) {
      setConditions((current) => ({ ...current, [serialNumber]: '' }));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gate Pass In"
        description="Receive vendor returns and record the condition of every cartridge in one step."
        actions={
          <>
            <Link className="button-secondary" to="/cartridges/gate-passes">
              Gate Pass Out
            </Link>
            <Link className="button-secondary" to="/cartridges/gate-passes/database">
              <Database size={18} />
              Database
            </Link>
          </>
        }
      />
      {passes.isError ? <ErrorSummary message="Gate Pass In queue could not be loaded." /> : null}
      {passes.isPending ? <LoadingPanel label="Loading Gate Pass In queue" /> : null}
      {!passes.isPending && !passes.isError ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <QueueStat
              icon={<PackageCheck size={20} />}
              label="Passes awaiting return"
              value={gateInPasses.length}
            />
            <QueueStat
              icon={<ClipboardCheck size={20} />}
              label="Cartridges due in"
              value={totalPendingSerials}
            />
          </div>

          <AppCard className="space-y-4">
            <div>
              <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
                Awaiting Gate Pass In
              </h2>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Select a pass to open the receiving form.
              </p>
            </div>
            {gateInPasses.length === 0 ? (
              <EmptyQueue
                title="No cartridges are waiting for Gate In"
                message="New Gate Pass Out records will appear here when they return from the vendor."
              />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {gateInPasses.map((pass) => (
                  <button
                    className="group rounded-[12px] border border-[var(--color-border)] bg-white p-4 text-left transition hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
                    key={pass._id}
                    onClick={() => openModal(pass)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-extrabold text-[var(--color-primary-strong)]">
                          {pass.gatePassNumber}
                        </p>
                        <p className="mt-1 text-sm font-bold text-[var(--color-text-muted)]">
                          {pass.vendorName} · {pass.quantity} cartridges
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-[var(--color-primary-soft)] px-2.5 py-1 text-xs font-extrabold text-[var(--color-primary)]">
                        {pendingGateInSerials(pass).length} due in
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3 text-xs font-bold text-[var(--color-text-muted)]">
                      <span>Gate Out {formatDate(pass.gateOutAt ?? pass.createdAt)}</span>
                      <span className="inline-flex items-center gap-1 font-extrabold text-[var(--color-primary)]">
                        Open Gate In <ArrowRight size={15} />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </AppCard>

        </>
      ) : null}

      {selectedPass ? (
        <GateInModal
          pass={selectedPass}
          selectedSerials={selectedSerials}
          conditions={conditions}
          remarks={remarks}
          selectedConditionCount={selectedConditionCount}
          loading={gateInMutation.isPending}
          error={gateInMutation.isError ? (gateInMutation.error as Error).message : null}
          onClose={closeModal}
          onRemarksChange={setRemarks}
          onSerialToggle={toggleSerial}
          onConditionChange={(serialNumber, condition) =>
            setConditions((current) => ({ ...current, [serialNumber]: condition }))
          }
          onSubmit={() => gateInMutation.mutate()}
        />
      ) : null}
    </div>
  );
}

function GateInModal({
  pass,
  selectedSerials,
  conditions,
  remarks,
  selectedConditionCount,
  loading,
  error,
  onClose,
  onRemarksChange,
  onSerialToggle,
  onConditionChange,
  onSubmit,
}: {
  pass: GatePass;
  selectedSerials: string[];
  conditions: Record<string, GateInCondition | ''>;
  remarks: string;
  selectedConditionCount: number;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRemarksChange: (value: string) => void;
  onSerialToggle: (serialNumber: string, checked: boolean) => void;
  onConditionChange: (serialNumber: string, condition: GateInCondition | '') => void;
  onSubmit: () => void;
}) {
  const pendingSerials = pendingGateInSerials(pass);
  const canSubmit = selectedSerials.length > 0 && selectedConditionCount === selectedSerials.length;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 px-4 py-6 sm:py-10">
      <div
        aria-labelledby="gate-in-modal-title"
        aria-modal="true"
        className="mx-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-[16px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-overlay)]"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--color-primary)]">
              Gate Pass In
            </p>
            <h2
              className="mt-1 text-xl font-extrabold text-[var(--color-primary-strong)]"
              id="gate-in-modal-title"
            >
              Receive {pass.gatePassNumber}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Choose the cartridges received and their current return condition.
            </p>
          </div>
          <button
            aria-label="Close Gate Pass In"
            className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-tint)] hover:text-[var(--color-primary)]"
            onClick={onClose}
            type="button"
          >
            <X size={19} />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-3 rounded-[10px] bg-[var(--color-surface-tint)] p-3 text-sm sm:grid-cols-3">
            <ModalInfo label="Vendor" value={pass.vendorName} />
            <ModalInfo label="Cartridges" value={`${pass.quantity} on pass`} />
            <ModalInfo label="Gate Out" value={formatDate(pass.gateOutAt ?? pass.createdAt)} />
          </div>
          {error ? <ErrorSummary message={error} /> : null}
          <div className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="font-extrabold text-[var(--color-primary-strong)]">
                  Returned cartridges
                </h3>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  A condition is required for every selected item.
                </p>
              </div>
              <span className="text-xs font-extrabold text-[var(--color-text-muted)]">
                {selectedSerials.length} of {pendingSerials.length} selected
              </span>
            </div>
            <div className="grid gap-2">
              {pendingSerials.map((serialNumber) => {
                const selected = selectedSerials.includes(serialNumber);
                return (
                  <div
                    className={`rounded-[10px] border p-3 transition ${
                      selected
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]'
                        : 'border-[var(--color-border)] bg-white'
                    }`}
                    key={serialNumber}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <label className="flex min-w-0 cursor-pointer items-center gap-3">
                        <input
                          checked={selected}
                          onChange={(event) => onSerialToggle(serialNumber, event.target.checked)}
                          type="checkbox"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-extrabold text-[var(--color-primary-strong)]">
                            {serialNumber}
                          </span>
                          <span className="mt-0.5 block text-xs font-bold text-[var(--color-text-muted)]">
                            Returned from {pass.vendorName}
                          </span>
                        </span>
                      </label>
                      <select
                        aria-label={`Return condition for ${serialNumber}`}
                        className="field-input sm:w-[250px]"
                        disabled={!selected}
                        value={conditions[serialNumber] ?? ''}
                        onChange={(event) =>
                          onConditionChange(
                            serialNumber,
                            event.target.value as GateInCondition | '',
                          )
                        }
                      >
                        <option value="">Select condition</option>
                        {conditionOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <TextField
            label="Gate In remarks"
            optional
            placeholder="Security note or vendor remark"
            value={remarks}
            onChange={(event) => onRemarksChange(event.target.value)}
          />
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-tint)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs font-bold text-[var(--color-text-muted)]">
            {selectedConditionCount === selectedSerials.length && selectedSerials.length > 0
              ? 'Ready to record Gate In.'
              : 'Select a condition for each returned cartridge.'}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={onClose} type="button" variant="secondary">
              Cancel
            </Button>
            <Button disabled={!canSubmit} loading={loading} onClick={onSubmit} type="button">
              Save Gate Pass In
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-1 truncate font-extrabold text-[var(--color-primary-strong)]">{value}</p>
    </div>
  );
}

function QueueStat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
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

function EmptyQueue({ title, message }: { title: string; message: string }) {
  return (
    <div className="grid justify-items-center gap-2 rounded-[12px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-tint)] p-8 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
        <PackageCheck size={23} />
      </span>
      <h3 className="font-extrabold text-[var(--color-primary-strong)]">{title}</h3>
      <p className="max-w-md text-sm text-[var(--color-text-muted)]">{message}</p>
    </div>
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

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}
