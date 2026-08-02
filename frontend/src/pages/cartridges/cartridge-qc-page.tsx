import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AppCard, Button, ErrorSummary, PageHeader, TextField } from '../../components/ui';
import { getCartridges, recordCartridgeQc } from '../../lib/cartridges-api';
export function CartridgeQcPage() {
  const queue = useQuery({
    queryKey: ['cartridges', { status: 'QC_PENDING' }],
    queryFn: () => getCartridges({ status: 'QC_PENDING' }),
  });
  const [serialNumber, setSerial] = useState('');
  const [result, setResult] = useState('PASS');
  const mutation = useMutation({
    mutationFn: () => recordCartridgeQc({ serialNumber, result }),
    onSuccess: () => {
      setSerial('');
      void queue.refetch();
    },
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Gate In & QC"
        description="Verify refilled cartridges after Gate In before making them available."
      />
      {mutation.isError ? <ErrorSummary message={(mutation.error as Error).message} /> : null}
      <AppCard className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <TextField
          label="Cartridge serial number"
          value={serialNumber}
          onChange={(e) => setSerial(e.target.value)}
        />
        <label className="space-y-1.5">
          <span className="field-label">QC result</span>
          <select
            className="field-input"
            value={result}
            onChange={(e) => setResult(e.target.value)}
          >
            <option value="PASS">Working / Pass</option>
            <option value="REFILL_FAILED">Refill failed</option>
            <option value="DAMAGED">Damaged</option>
          </select>
        </label>
        <Button loading={mutation.isPending} onClick={() => mutation.mutate()}>
          Save QC
        </Button>
      </AppCard>
      <AppCard>
        <h2 className="font-extrabold">Awaiting QC ({queue.data?.meta.total ?? 0})</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {queue.data?.data.map((item) => (
            <button
              className="rounded-[8px] border p-3 text-left hover:border-[var(--color-primary)]"
              key={item.id}
              onClick={() => setSerial(item.serialNumber)}
            >
              <b>{item.serialNumber}</b>
              <span className="mt-1 block text-xs text-[var(--color-text-muted)]">
                {item.model}
              </span>
            </button>
          ))}
        </div>
      </AppCard>
    </div>
  );
}
