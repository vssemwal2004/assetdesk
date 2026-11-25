import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { Link } from 'react-router';
import { ReviewDrawer } from '../../components/review-drawer';
import { reviewRows } from '../../lib/review-rows';
import { Button, ErrorSummary, PageHeader, TextField, AppCard } from '../../components/ui';
import { isApiError, isUncertainWriteFailure } from '../../lib/api-client';
import { addCartridges, getCartridge, getCartridgeDashboard } from '../../lib/cartridges-api';
import { getAssetDetails } from '../../lib/inventory-api';
export function AddCartridgesPage() {
  const queryClient = useQueryClient();
  const dashboardQuery = useQuery({
    queryKey: ['cartridge-dashboard'],
    queryFn: getCartridgeDashboard,
  });
  const detailsQuery = useQuery({
    queryKey: ['asset-details'],
    queryFn: ({ signal }) => getAssetDetails(undefined, signal),
  });
  const locations = (detailsQuery.data ?? [])
    .filter((detail) => detail.kind === 'LOCATION')
    .map((detail) => detail.name)
    .sort((left, right) => left.localeCompare(right));
  const departments = (detailsQuery.data ?? [])
    .filter((detail) => detail.kind === 'DEPARTMENT')
    .map((detail) => detail.name)
    .sort((left, right) => left.localeCompare(right));
  const [form, setForm] = useState({
    model: '',
    colour: 'BLACK',
    location: '',
    department: '',
    compatiblePrinter: '',
    vendorName: '',
    quantity: 1,
    serials: '',
    status: 'FILLED_AVAILABLE',
  });
  const [result, setResult] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const serialNumbers = form.serials
    .split(/\r?\n|,/)
    .map((value) => value.trim())
    .filter(Boolean);
  const duplicateSerials = [
    ...new Set(
      serialNumbers.filter(
        (serial, index) =>
          serialNumbers.findIndex(
            (other) => other.toLocaleUpperCase('en-US') === serial.toLocaleUpperCase('en-US'),
          ) !== index,
      ),
    ),
  ];
  const mutation = useMutation({
    mutationFn: async () => {
      try {
        return await addCartridges({
          ...form,
          quantity: Number(form.quantity),
          serialNumbers,
          status: form.status as 'FILLED_AVAILABLE' | 'EMPTY',
          colour: form.colour as 'BLACK',
        });
      } catch (error) {
        // The save may have succeeded even though the reply was lost. Cartridges are added
        // all together, so finding the first and last serial means the batch was saved.
        if (!isUncertainWriteFailure(error)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        const edges = [serialNumbers[0], serialNumbers.at(-1)].filter((serial): serial is string =>
          Boolean(serial),
        );
        const found = await Promise.all(
          edges.map((serial) =>
            getCartridge(serial).then(
              () => true,
              () => false,
            ),
          ),
        );
        if (found.length && found.every(Boolean)) return serialNumbers;
        throw error;
      }
    },
    onSuccess: async (items) => {
      setResult(items.length);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cartridges'] }),
        queryClient.invalidateQueries({ queryKey: ['cartridge-dashboard'] }),
      ]);
    },
  });
  const serialCount = serialNumbers.length;
  const errorMessage = mutation.isError
    ? isApiError(mutation.error)
      ? mutation.error.message
      : 'The cartridges could not be added.'
    : null;
  if (result)
    return (
      <div className="space-y-6">
        <PageHeader
          title={`${result} cartridges added`}
          description="Serial numbers are now available in the cartridge register."
        />
        <Link className="button-primary" to="/cartridges">
          View cartridges
        </Link>
      </div>
    );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Add Cartridges"
        description="Enter common details once, then add the unique serial number printed on each cartridge."
      />
      {dashboardQuery.data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <CartridgeStat
            label="All cartridges"
            value={Object.values(dashboardQuery.data.data.counts).reduce(
              (total, count) => total + count,
              0,
            )}
          />
          <CartridgeStat
            label="Filled / ready"
            value={dashboardQuery.data.data.counts.FILLED_AVAILABLE ?? 0}
          />
          <CartridgeStat label="Issued" value={dashboardQuery.data.data.counts.ISSUED ?? 0} />
          <CartridgeStat label="Empty" value={dashboardQuery.data.data.counts.EMPTY ?? 0} />
          <CartridgeStat label="Refilled" value={dashboardQuery.data.data.refilled ?? 0} />
        </div>
      ) : null}
      {errorMessage && !reviewOpen ? <ErrorSummary message={errorMessage} /> : null}
      {duplicateSerials.length ? (
        <ErrorSummary
          message={`These serial numbers are entered more than once: ${duplicateSerials.join(', ')}`}
        />
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.reset();
          setReviewOpen(true);
        }}
      >
        <AppCard className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Cartridge model"
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
            />
            <label className="space-y-1.5">
              <span className="field-label">Colour</span>
              <select
                className="field-input"
                value={form.colour}
                onChange={(e) => setForm({ ...form, colour: e.target.value })}
              >
                {['BLACK', 'CYAN', 'MAGENTA', 'YELLOW', 'OTHER'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <SavedDetailSelect
              label="Storage location"
              loading={detailsQuery.isPending}
              options={locations}
              value={form.location}
              onChange={(location) => setForm({ ...form, location })}
            />
            <SavedDetailSelect
              label="Department"
              loading={detailsQuery.isPending}
              options={departments}
              value={form.department}
              onChange={(department) => setForm({ ...form, department })}
            />
            <TextField
              label="Compatible printer"
              optional
              value={form.compatiblePrinter}
              onChange={(e) => setForm({ ...form, compatiblePrinter: e.target.value })}
            />
            <TextField
              label="Vendor"
              optional
              value={form.vendorName}
              onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
            />
            <TextField
              label="Quantity"
              min={1}
              max={500}
              type="number"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
            />
          </div>
          <label className="block space-y-1.5">
            <span className="field-label">Cartridge serial numbers</span>
            <textarea
              className="field-input min-h-40"
              placeholder="Enter one serial number per line"
              value={form.serials}
              onChange={(event) => setForm({ ...form, serials: event.target.value })}
            />
            <span
              className={
                serialCount === form.quantity
                  ? 'text-xs font-bold text-green-700'
                  : 'text-xs font-bold text-[var(--color-text-muted)]'
              }
            >
              {serialCount} of {form.quantity} serial numbers entered
            </span>
          </label>
          <div className="flex justify-end">
            <Button
              disabled={
                serialCount !== form.quantity ||
                duplicateSerials.length > 0 ||
                !form.model ||
                !form.location ||
                !form.department ||
                detailsQuery.isPending
              }
              loading={mutation.isPending}
              type="submit"
            >
              <Eye aria-hidden="true" size={18} />
              Preview &amp; add
            </Button>
          </div>
        </AppCard>
      </form>
      {reviewOpen ? (
        <ReviewDrawer
          confirmLabel={`Confirm & add ${serialCount} cartridge${serialCount === 1 ? '' : 's'}`}
          description="This is exactly what will be added to the cartridge register."
          error={errorMessage}
          onClose={() => {
            setReviewOpen(false);
            mutation.reset();
          }}
          onConfirm={() => mutation.mutate()}
          pending={mutation.isPending}
          pendingLabel="Adding cartridges…"
          sections={[
            {
              title: 'Cartridge details',
              rows: reviewRows([
                { label: 'Model', value: form.model.trim() },
                { label: 'Colour', value: form.colour },
                { label: 'Condition', value: form.status === 'EMPTY' ? 'Empty' : 'Filled / ready' },
                { label: 'Compatible printer', value: form.compatiblePrinter.trim() },
                { label: 'Quantity', value: String(serialCount) },
              ]),
            },
            {
              title: 'Where and from whom',
              rows: reviewRows([
                { label: 'Storage location', value: form.location },
                { label: 'Department', value: form.department },
                { label: 'Vendor', value: form.vendorName.trim() },
              ]),
            },
            {
              title: `Serial numbers (${serialCount})`,
              content: (
                <ol className="flex flex-wrap gap-1.5">
                  {serialNumbers.map((serial, index) => (
                    <li className="review-chip" key={`${index}:${serial}`}>
                      <span className="mr-1.5 text-[var(--color-text-muted)]">{index + 1}.</span>
                      {serial}
                    </li>
                  ))}
                </ol>
              ),
            },
          ]}
          title="Review new cartridges"
        />
      ) : null}
    </div>
  );
}

function CartridgeStat({ label, value }: { label: string; value: number }) {
  return (
    <AppCard className="p-4 sm:p-4">
      <p className="text-xs font-bold text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-[var(--color-primary-strong)]">{value}</p>
    </AppCard>
  );
}

function SavedDetailSelect({
  label,
  value,
  options,
  loading,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  loading: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="field-label">{label}</span>
      <select
        className="field-input"
        disabled={loading}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">
          {loading ? 'Loading saved values…' : `Choose ${label.toLowerCase()}`}
        </option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {!loading && options.length === 0 ? (
        <span className="text-xs font-semibold text-[var(--color-danger)]">
          Add values from Inventory → Add asset details first.
        </span>
      ) : null}
    </label>
  );
}
