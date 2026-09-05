import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardCheck, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'react-router';
import {
  AppCard,
  Button,
  EmptyState,
  ErrorSummary,
  LoadingPanel,
  PageHeader,
  TextField,
} from '../../components/ui';
import { getCartridges, issueCartridge, returnCartridge } from '../../lib/cartridges-api';
export function IssueCartridgePage() {
  const preset = new URLSearchParams(useLocation().search).get('serial') ?? '';
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    serialNumber: preset,
    employeeName: '',
    employeeId: '',
    department: '',
    printerLocation: '',
    remarks: '',
  });
  const [done, setDone] = useState(false);
  const availableQuery = useQuery({
    queryKey: ['cartridges', { status: 'FILLED_AVAILABLE', page: 1, pageSize: 100 }],
    queryFn: () => getCartridges({ status: 'FILLED_AVAILABLE', page: 1, pageSize: 100 }),
  });
  const availableCartridges = availableQuery.data?.data ?? [];
  const mutation = useMutation({
    mutationFn: () => issueCartridge(form),
    onSuccess: async () => {
      setDone(true);
      await queryClient.invalidateQueries({ queryKey: ['cartridges'] });
      await queryClient.invalidateQueries({ queryKey: ['cartridge-dashboard'] });
    },
  });
  return (
    <Operation
      title="Issue Cartridge"
      description="Select a filled cartridge and assign it. Only ready-to-issue cartridges appear here."
      error={mutation.error}
      done={done}
      pending={mutation.isPending}
      submitDisabled={availableQuery.isPending || !form.serialNumber}
      submit={() => mutation.mutate()}
    >
      <label className="space-y-1.5">
        <span className="field-label">Cartridge serial number</span>
        <select
          className="field-input"
          disabled={availableQuery.isPending || availableCartridges.length === 0}
          onChange={(event) => setForm({ ...form, serialNumber: event.target.value })}
          value={form.serialNumber}
        >
          <option value="">
            {availableQuery.isPending
              ? 'Loading available serial numbers...'
              : availableCartridges.length === 0
                ? 'No filled cartridges available'
                : 'Select serial number'}
          </option>
          {preset && !availableCartridges.some((item) => item.serialNumber === preset) ? (
            <option value={preset}>{preset}</option>
          ) : null}
          {availableCartridges.map((item) => (
            <option key={item.id} value={item.serialNumber}>
              {item.serialNumber} - {item.model} - {item.location}
            </option>
          ))}
        </select>
      </label>
      {availableQuery.isError ? (
        <p className="text-sm font-bold text-[var(--color-danger)]">
          Serial numbers could not be loaded.
        </p>
      ) : null}
      <TextField
        label="Employee name"
        value={form.employeeName}
        onChange={(e) => setForm({ ...form, employeeName: e.target.value })}
      />
      <TextField
        label="Employee ID"
        optional
        value={form.employeeId}
        onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
      />
      <TextField
        label="Department"
        optional
        value={form.department}
        onChange={(e) => setForm({ ...form, department: e.target.value })}
      />
      <TextField
        label="Printer / location"
        optional
        value={form.printerLocation}
        onChange={(e) => setForm({ ...form, printerLocation: e.target.value })}
      />
    </Operation>
  );
}
export function ReturnCartridgePage() {
  const preset = new URLSearchParams(useLocation().search).get('serial') ?? '';
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    serialNumber: preset,
    returnedByName: '',
    condition: 'EMPTY',
    defectReason: '',
    remarks: '',
  });
  const [done, setDone] = useState(false);
  const issuedQuery = useQuery({
    queryKey: ['cartridges', { status: 'ISSUED', page: 1, pageSize: 100 }],
    queryFn: () => getCartridges({ status: 'ISSUED', page: 1, pageSize: 100 }),
  });
  const issuedCartridges = issuedQuery.data?.data ?? [];
  const selectedCartridge = issuedCartridges.find(
    (item) => item.serialNumber === form.serialNumber,
  );
  const mutation = useMutation({
    mutationFn: () => returnCartridge(form),
    onSuccess: async () => {
      setDone(true);
      await queryClient.invalidateQueries({ queryKey: ['cartridges'] });
      await queryClient.invalidateQueries({ queryKey: ['cartridge-dashboard'] });
    },
  });

  if (done) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Return Cartridge"
          description="Record returns only for cartridges that are currently issued."
        />
        <AppCard className="max-w-3xl">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-[var(--color-success-soft)] text-[var(--color-success)]">
              <CheckCircle2 aria-hidden="true" size={24} />
            </span>
            <div>
              <h2 className="font-extrabold text-[var(--color-primary-strong)]">Return recorded</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                The cartridge has been removed from the issued queue and the movement log was
                updated.
              </p>
            </div>
          </div>
        </AppCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Return Cartridge"
        description="Only cartridges currently marked as issued can be returned."
      />
      {mutation.error ? <ErrorSummary message={mutation.error.message} /> : null}
      <form
        className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <AppCard className="max-w-none p-0 sm:p-0">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-tint)] px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-white text-[var(--color-primary)] shadow-sm">
                <RotateCcw aria-hidden="true" size={22} />
              </span>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--color-primary)]">
                  Issued queue
                </p>
                <h2 className="mt-1 text-lg font-extrabold text-[var(--color-primary-strong)]">
                  Select the cartridge being returned
                </h2>
                <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                  This list only contains cartridges with issued status.
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-5 p-5">
            {issuedQuery.isPending ? (
              <LoadingPanel label="Loading issued cartridges" />
            ) : issuedQuery.isError ? (
              <ErrorSummary message="Issued cartridges could not be loaded." />
            ) : issuedCartridges.length === 0 ? (
              <EmptyState
                message="There are no cartridges currently issued, so there is nothing available to return."
                title="No issued cartridges"
              />
            ) : (
              <label className="space-y-1.5">
                <span className="field-label">Issued cartridge</span>
                <select
                  className="field-input"
                  onChange={(event) => setForm({ ...form, serialNumber: event.target.value })}
                  required
                  value={selectedCartridge ? form.serialNumber : ''}
                >
                  <option value="">Select issued cartridge</option>
                  {preset && !issuedCartridges.some((item) => item.serialNumber === preset) ? (
                    <option disabled value={preset}>
                      {preset} is not currently issued
                    </option>
                  ) : null}
                  {issuedCartridges.map((item) => (
                    <option key={item.id} value={item.serialNumber}>
                      {item.serialNumber} - {item.model} - {item.currentHolderName ?? 'Issued'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {selectedCartridge ? (
              <div className="rounded-[12px] border border-[var(--color-border)] bg-white">
                <div className="border-b border-[var(--color-border)] px-4 py-3">
                  <p className="text-sm font-extrabold text-[var(--color-primary-strong)]">
                    Issued cartridge details
                  </p>
                </div>
                <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
                  <ReturnDetail label="Serial" value={selectedCartridge.serialNumber} />
                  <ReturnDetail label="Model" value={selectedCartridge.model} />
                  <ReturnDetail
                    label="Issued to"
                    value={selectedCartridge.currentHolderName ?? 'Issued'}
                  />
                  <ReturnDetail label="Location" value={selectedCartridge.location} />
                </div>
              </div>
            ) : null}
          </div>
        </AppCard>

        <AppCard className="max-w-none p-0 sm:p-0">
          <div className="border-b border-[var(--color-border)] px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                <ClipboardCheck aria-hidden="true" size={20} />
              </span>
              <div>
                <h2 className="font-extrabold text-[var(--color-primary-strong)]">
                  Return details
                </h2>
                <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                  Capture who returned it and the condition received.
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-4 p-5">
            <TextField
              label="Returned by"
              value={form.returnedByName}
              onChange={(e) => setForm({ ...form, returnedByName: e.target.value })}
            />
            <label className="space-y-1.5">
              <span className="field-label">Return condition</span>
              <select
                className="field-input"
                value={form.condition}
                onChange={(e) => setForm({ ...form, condition: e.target.value })}
              >
                <option value="EMPTY">Empty</option>
                <option value="DEFECTIVE">Defective / not working</option>
                <option value="FILLED_UNUSED">Filled and unused · ready to issue again</option>
                <option value="DAMAGED">Damaged</option>
                <option value="WRONG_MODEL">Wrong model</option>
              </select>
            </label>
            {['DEFECTIVE', 'DAMAGED', 'WRONG_MODEL'].includes(form.condition) ? (
              <TextField
                label="Problem details"
                value={form.defectReason}
                onChange={(e) => setForm({ ...form, defectReason: e.target.value })}
              />
            ) : null}
            <div className="border-t border-[var(--color-border)] pt-4">
              <Button
                className="w-full"
                disabled={
                  issuedQuery.isPending || !selectedCartridge || !form.returnedByName.trim()
                }
                loading={mutation.isPending}
                type="submit"
              >
                Save return
              </Button>
            </div>
          </div>
        </AppCard>
      </form>
    </div>
  );
}

function ReturnDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-extrabold text-[var(--color-primary-strong)]">
        {value}
      </p>
    </div>
  );
}
function Operation({
  title,
  description,
  error,
  done,
  pending,
  submitDisabled = false,
  submit,
  children,
}: {
  title: string;
  description: string;
  error: Error | null;
  done: boolean;
  pending: boolean;
  submitDisabled?: boolean;
  submit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      {done ? (
        <AppCard>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-[10px] bg-[var(--color-success-soft)] text-[var(--color-success)]">
              <CheckCircle2 aria-hidden="true" size={22} />
            </span>
            <p className="font-bold text-green-700">Transaction recorded successfully.</p>
          </div>
        </AppCard>
      ) : (
        <>
          {error ? <ErrorSummary message={error.message} /> : null}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <AppCard className="grid gap-4 md:grid-cols-2">
              {children}
              <div className="md:col-span-2 flex justify-end">
                <Button disabled={submitDisabled} loading={pending} type="submit">
                  Save transaction
                </Button>
              </div>
            </AppCard>
          </form>
        </>
      )}
    </div>
  );
}
