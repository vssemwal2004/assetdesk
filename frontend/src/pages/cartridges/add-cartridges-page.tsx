import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Button, ErrorSummary, PageHeader, TextField, AppCard } from '../../components/ui';
import { addCartridges } from '../../lib/cartridges-api';
import { getAssetDetails } from '../../lib/inventory-api';
export function AddCartridgesPage() {
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
  const mutation = useMutation({
    mutationFn: () => {
      const serialNumbers = form.serials
        .split(/\r?\n|,/)
        .map((x) => x.trim())
        .filter(Boolean);
      return addCartridges({
        ...form,
        quantity: Number(form.quantity),
        serialNumbers,
        status: form.status as 'FILLED_AVAILABLE' | 'EMPTY',
        colour: form.colour as 'BLACK',
      });
    },
    onSuccess: (items) => setResult(items.length),
  });
  const serialCount = form.serials
    .split(/\r?\n|,/)
    .map((x) => x.trim())
    .filter(Boolean).length;
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
        description="Enter common details once, then paste one unique serial number per line."
      />
      {mutation.isError ? <ErrorSummary message={(mutation.error as Error).message} /> : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
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
            <span className="field-label">Serial numbers</span>
            <textarea
              className="field-input min-h-40"
              placeholder="CRT-0001&#10;CRT-0002"
              value={form.serials}
              onChange={(e) => setForm({ ...form, serials: e.target.value })}
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
                !form.model ||
                !form.location ||
                !form.department ||
                detailsQuery.isPending
              }
              loading={mutation.isPending}
              type="submit"
            >
              Add cartridges
            </Button>
          </div>
        </AppCard>
      </form>
    </div>
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
