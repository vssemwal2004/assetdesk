import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { AppCard, Button, ErrorSummary, PageHeader } from '../../components/ui';
import { getGatePasses, recordGateIn, type GatePass } from '../../lib/cartridges-api';
export function CartridgeQcPage() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const passes = useQuery({
    queryKey: ['cartridge-gate-passes', 'gate-in-queue'],
    queryFn: getGatePasses,
  });
  const [selectedPassId, setSelectedPassId] = useState('');
  const [selectedSerials, setSelectedSerials] = useState<string[]>([]);
  const gateInMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPassId) throw new Error('Choose a Gate Pass Out record.');
      return recordGateIn(selectedPassId, selectedSerials);
    },
    onSuccess: async () => {
      const completedPassId = selectedPassId;
      setSelectedPassId('');
      setSelectedSerials([]);
      await client.invalidateQueries({ queryKey: ['cartridge-gate-passes'] });
      await client.invalidateQueries({ queryKey: ['cartridges'] });
      await client.invalidateQueries({ queryKey: ['cartridge-dashboard'] });
      void passes.refetch();
      navigate(`/cartridges/gate-passes/${completedPassId}/print`);
    },
  });
  const gateInPasses =
    passes.data?.data.filter((pass) => ['GATE_OUT', 'PARTIALLY_RETURNED'].includes(pass.status)) ??
    [];
  const selectedPass = gateInPasses.find((pass) => pass._id === selectedPassId) ?? null;
  const availableSerials = selectedPass ? pendingGateInSerials(selectedPass) : [];

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
        description="Select an outward Gate Pass, confirm returned cartridges, then print the receipt."
      />
      {gateInMutation.isError ? (
        <ErrorSummary message={(gateInMutation.error as Error).message} />
      ) : null}
      <AppCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
              Waiting for Gate In
            </h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              These Gate Pass Out records have cartridges currently with the vendor.
            </p>
          </div>
          <Link className="button-secondary" to="/cartridges/gate-passes">
            Gate Pass Out
          </Link>
        </div>
        <div className="mt-4 grid gap-3">
          {gateInPasses.length === 0 ? (
            <p className="rounded-[10px] bg-[var(--color-surface-tint)] p-3 text-sm font-bold text-[var(--color-text-muted)]">
              No Gate Pass Out records are waiting for Gate In.
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
                  <strong className="text-[var(--color-primary-strong)]">
                    {pass.gatePassNumber}
                  </strong>
                  <span className="rounded-full bg-[var(--color-primary-soft)] px-2.5 py-1 text-xs font-bold text-[var(--color-primary)]">
                    {pass.status.replaceAll('_', ' ')}
                  </span>
                </div>
                <p className="mt-1 text-sm font-semibold text-[var(--color-text-muted)]">
                  {pass.vendorName} · {pass.quantity} cartridges
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
              Complete Gate In
            </h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              {selectedPass.gatePassNumber} selected. Tick only the cartridges physically received.
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
            <div className="flex justify-end">
              <Button
                disabled={selectedSerials.length === 0}
                loading={gateInMutation.isPending}
                onClick={() => gateInMutation.mutate()}
              >
                Complete Gate In & Print
              </Button>
            </div>
          </>
        </AppCard>
      ) : null}
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
