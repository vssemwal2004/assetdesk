import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router';
import { AppCard, Button, ErrorSummary, PageHeader, TextField } from '../../components/ui';
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
      description="Issue a filled cartridge independently; an empty return is not required."
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
  const [form, setForm] = useState({
    serialNumber: preset,
    returnedByName: '',
    condition: 'EMPTY',
    defectReason: '',
    remarks: '',
  });
  const [done, setDone] = useState(false);
  const mutation = useMutation({
    mutationFn: () => returnCartridge(form),
    onSuccess: () => setDone(true),
  });
  return (
    <Operation
      title="Return Cartridge"
      description="Record empty, defective, unused, damaged, or incompatible returns at any time."
      error={mutation.error}
      done={done}
      pending={mutation.isPending}
      submit={() => mutation.mutate()}
    >
      <TextField
        label="Cartridge serial number"
        value={form.serialNumber}
        onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
      />
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
          <option value="FILLED_UNUSED">Filled and unused</option>
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
    </Operation>
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
          <p className="font-bold text-green-700">Transaction recorded successfully.</p>
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
