import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardCheck, Eye, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'react-router';
import type { Cartridge } from '@assetdesk/contracts';
import { ReviewDrawer } from '../../components/review-drawer';
import { reviewRows } from '../../lib/review-rows';
import { isApiError, isUncertainWriteFailure } from '../../lib/api-client';
import {
  AppCard,
  Button,
  EmptyState,
  ErrorSummary,
  LoadingPanel,
  PageHeader,
  TextField,
} from '../../components/ui';
import {
  getAllCartridges,
  getCartridge,
  issueCartridge,
  returnCartridge,
} from '../../lib/cartridges-api';
export function IssueCartridgePage() {
  const preset = new URLSearchParams(useLocation().search).get('serial') ?? '';
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    serialNumbers: preset ? [preset] : ([] as string[]),
    employeeName: '',
    employeeId: '',
    department: '',
    printerLocation: '',
    remarks: '',
  });
  const [done, setDone] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const availableQuery = useQuery({
    queryKey: ['cartridges', { status: 'FILLED_AVAILABLE', page: 1, pageSize: 100 }],
    queryFn: () => getAllCartridges({ status: 'FILLED_AVAILABLE' }),
  });
  const availableCartridges = availableQuery.data?.data ?? [];
  const mutation = useMutation({
    mutationFn: () =>
      withOutcomeCheck(
        () => issueCartridge(form),
        form.serialNumbers,
        (status) => status === 'ISSUED',
      ),
    onSuccess: async () => {
      setDone(true);
      setReviewOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['cartridges'] });
      await queryClient.invalidateQueries({ queryKey: ['cartridge-dashboard'] });
    },
  });
  const selected = availableCartridges.filter((item) =>
    form.serialNumbers.includes(item.serialNumber),
  );
  return (
    <Operation
      title="Issue Cartridge"
      description="Select a filled cartridge and assign it. Only ready-to-issue cartridges appear here."
      error={reviewOpen ? null : mutation.error}
      done={done}
      pending={mutation.isPending}
      submitDisabled={availableQuery.isPending || form.serialNumbers.length === 0}
      submit={() => {
        mutation.reset();
        setReviewOpen(true);
      }}
      review={
        reviewOpen ? (
          <ReviewDrawer
            confirmLabel={`Confirm & issue ${form.serialNumbers.length} cartridge${form.serialNumbers.length === 1 ? '' : 's'}`}
            description="Check who receives the cartridges before issuing."
            error={operationError(mutation.error)}
            onClose={() => {
              setReviewOpen(false);
              mutation.reset();
            }}
            onConfirm={() => mutation.mutate()}
            pending={mutation.isPending}
            pendingLabel="Issuing…"
            sections={[
              {
                title: 'Issued to',
                rows: reviewRows([
                  { label: 'Employee name', value: form.employeeName.trim() },
                  { label: 'Employee ID', value: form.employeeId.trim() },
                  { label: 'Department', value: form.department.trim() },
                  { label: 'Printer / location', value: form.printerLocation.trim() },
                  { label: 'Remarks', value: form.remarks.trim() },
                ]),
              },
              {
                title: `Cartridges (${form.serialNumbers.length})`,
                content: <SelectedCartridgeChips items={selected} serials={form.serialNumbers} />,
              },
            ]}
            title="Review cartridge issue"
          />
        ) : null
      }
    >
      <CartridgeMultiSelect
        items={availableCartridges}
        label="Filled cartridges"
        loading={availableQuery.isPending}
        selected={form.serialNumbers}
        onChange={(serialNumbers) => setForm({ ...form, serialNumbers })}
      />
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
    serialNumbers: preset ? [preset] : ([] as string[]),
    returnedByName: '',
    condition: 'EMPTY',
    defectReason: '',
    remarks: '',
  });
  const [done, setDone] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const issuedQuery = useQuery({
    queryKey: ['cartridges', { status: 'ISSUED', page: 1, pageSize: 100 }],
    queryFn: () => getAllCartridges({ status: 'ISSUED' }),
  });
  const issuedCartridges = issuedQuery.data?.data ?? [];
  const selectedCartridges = issuedCartridges.filter((item) =>
    form.serialNumbers.includes(item.serialNumber),
  );
  const mutation = useMutation({
    mutationFn: () =>
      withOutcomeCheck(
        () => returnCartridge(form),
        form.serialNumbers,
        (status) => status !== 'ISSUED',
      ),
    onSuccess: async () => {
      setDone(true);
      setReviewOpen(false);
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
      {mutation.error && !reviewOpen ? (
        <ErrorSummary message={operationError(mutation.error) ?? ''} />
      ) : null}
      {reviewOpen ? (
        <ReviewDrawer
          confirmLabel={`Confirm return of ${selectedCartridges.length} cartridge${selectedCartridges.length === 1 ? '' : 's'}`}
          description="Check the cartridges and their condition before saving the return."
          error={operationError(mutation.error)}
          onClose={() => {
            setReviewOpen(false);
            mutation.reset();
          }}
          onConfirm={() => mutation.mutate()}
          pending={mutation.isPending}
          pendingLabel="Saving return…"
          sections={[
            {
              title: 'Return details',
              rows: reviewRows([
                { label: 'Returned by', value: form.returnedByName.trim() },
                { label: 'Condition', value: RETURN_CONDITIONS[form.condition] ?? form.condition },
                ['DEFECTIVE', 'DAMAGED', 'WRONG_MODEL'].includes(form.condition) && {
                  label: 'Problem details',
                  value: form.defectReason.trim(),
                },
                { label: 'Remarks', value: form.remarks.trim() },
              ]),
            },
            {
              title: `Cartridges (${selectedCartridges.length})`,
              content: (
                <SelectedCartridgeChips items={selectedCartridges} serials={form.serialNumbers} />
              ),
            },
          ]}
          title="Review cartridge return"
        />
      ) : null}
      <form
        className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.reset();
          setReviewOpen(true);
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
              <CartridgeMultiSelect
                items={issuedCartridges}
                label="Issued cartridges"
                selected={form.serialNumbers}
                onChange={(serialNumbers) => setForm({ ...form, serialNumbers })}
              />
            )}
            {selectedCartridges.length ? (
              <div className="rounded-[12px] border border-[var(--color-border)] bg-white">
                <div className="border-b border-[var(--color-border)] px-4 py-3">
                  <p className="text-sm font-extrabold text-[var(--color-primary-strong)]">
                    {selectedCartridges.length} selected cartridge
                    {selectedCartridges.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="grid max-h-56 gap-2 overflow-auto p-3 sm:grid-cols-2">
                  {selectedCartridges.map((item) => (
                    <div className="rounded-[9px] bg-[var(--color-surface-tint)] p-3" key={item.id}>
                      <ReturnDetail
                        label="Serial / model"
                        value={`${item.serialNumber} · ${item.model}`}
                      />
                      <p className="mt-1 text-xs font-bold text-[var(--color-text-muted)]">
                        {item.currentHolderName ?? 'Issued'} · {item.location}
                      </p>
                    </div>
                  ))}
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
                  issuedQuery.isPending ||
                  selectedCartridges.length === 0 ||
                  !form.returnedByName.trim()
                }
                loading={mutation.isPending}
                type="submit"
              >
                <Eye aria-hidden="true" size={18} />
                Preview &amp; save return
              </Button>
            </div>
          </div>
        </AppCard>
      </form>
    </div>
  );
}

function CartridgeMultiSelect({
  items,
  selected,
  label,
  loading = false,
  onChange,
}: {
  items: Cartridge[];
  selected: string[];
  label: string;
  loading?: boolean;
  onChange: (serialNumbers: string[]) => void;
}) {
  const allSelected =
    items.length > 0 && items.every((item) => selected.includes(item.serialNumber));
  function toggle(serialNumber: string, checked: boolean) {
    onChange(
      checked
        ? [...new Set([...selected, serialNumber])]
        : selected.filter((item) => item !== serialNumber),
    );
  }
  return (
    <fieldset className="space-y-1.5 md:col-span-2">
      <legend className="field-label">{label}</legend>
      <div className="overflow-hidden rounded-[12px] border border-[var(--color-border)] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-tint)] px-3 py-2">
          <span className="text-sm font-extrabold text-[var(--color-text-muted)]">
            {loading ? 'Loading cartridges…' : `${selected.length} of ${items.length} selected`}
          </span>
          <div className="flex gap-2">
            <button
              className="text-xs font-extrabold text-[var(--color-primary)] hover:underline"
              disabled={loading || items.length === 0 || allSelected}
              onClick={() => onChange(items.map((item) => item.serialNumber))}
              type="button"
            >
              Select all
            </button>
            <button
              className="text-xs font-extrabold text-[var(--color-text-muted)] hover:underline"
              disabled={selected.length === 0}
              onClick={() => onChange([])}
              type="button"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="max-h-72 overflow-auto p-2">
          {!loading && items.length === 0 ? (
            <p className="p-3 text-sm font-bold text-[var(--color-text-muted)]">
              No eligible cartridges are available.
            </p>
          ) : (
            items.map((item) => (
              <label
                className="flex cursor-pointer items-start gap-3 rounded-[9px] px-3 py-2 hover:bg-[var(--color-surface-tint)]"
                key={item.id}
              >
                <input
                  checked={selected.includes(item.serialNumber)}
                  className="mt-1"
                  onChange={(event) => toggle(item.serialNumber, event.target.checked)}
                  type="checkbox"
                />
                <span className="min-w-0">
                  <span className="block font-extrabold text-[var(--color-text-strong)]">
                    {item.serialNumber} · {item.model}
                  </span>
                  <span className="block text-xs font-bold text-[var(--color-text-muted)]">
                    {item.currentHolderName ?? item.location}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>
      </div>
    </fieldset>
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
const RETURN_CONDITIONS: Record<string, string> = {
  EMPTY: 'Empty',
  DEFECTIVE: 'Defective / not working',
  FILLED_UNUSED: 'Filled and unused · ready to issue again',
  DAMAGED: 'Damaged',
  WRONG_MODEL: 'Wrong model',
};

function operationError(error: Error | null): string | null {
  if (!error) return null;
  return isApiError(error) ? error.message : 'The transaction could not be saved.';
}

/**
 * Runs a cartridge write. If the reply is lost (dropped connection, proxy timeout), checks
 * whether the cartridges already reached the expected state before reporting a failure.
 */
async function withOutcomeCheck<T>(
  write: () => Promise<T>,
  serials: string[],
  reachedExpectedState: (status: string) => boolean,
): Promise<T | null> {
  try {
    return await write();
  } catch (error) {
    if (!isUncertainWriteFailure(error) || serials.length === 0) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const statuses = await Promise.all(
      serials.map((serial) =>
        getCartridge(serial).then(
          (result) => result.data.cartridge.status as string,
          () => null,
        ),
      ),
    );
    if (statuses.every((status) => status !== null && reachedExpectedState(status))) return null;
    throw error;
  }
}

function SelectedCartridgeChips({ items, serials }: { items: Cartridge[]; serials: string[] }) {
  const bySerial = new Map(items.map((item) => [item.serialNumber, item]));
  return (
    <ul className="flex flex-wrap gap-1.5">
      {serials.map((serial) => {
        const item = bySerial.get(serial);
        return (
          <li className="review-chip" key={serial}>
            {serial}
            {item ? (
              <span className="ml-1.5 text-[var(--color-text-muted)]">{item.model}</span>
            ) : null}
          </li>
        );
      })}
    </ul>
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
  review,
  children,
}: {
  title: string;
  description: string;
  error: Error | null;
  done: boolean;
  pending: boolean;
  submitDisabled?: boolean;
  submit: () => void;
  review?: React.ReactNode;
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
          {error ? <ErrorSummary message={operationError(error) ?? ''} /> : null}
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
                  <Eye aria-hidden="true" size={18} />
                  Preview &amp; save
                </Button>
              </div>
            </AppCard>
          </form>
          {review}
        </>
      )}
    </div>
  );
}
