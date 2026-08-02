import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation } from 'react-router';
import { AppCard, Button, ErrorSummary, PageHeader, TextField } from '../../components/ui';
import { issueCartridge, returnCartridge } from '../../lib/cartridges-api';
export function IssueCartridgePage() {
  const preset = new URLSearchParams(useLocation().search).get('serial') ?? '';
  const [form, setForm] = useState({
    serialNumber: preset,
    employeeName: '',
    employeeId: '',
    department: '',
    printerLocation: '',
    remarks: '',
  });
  const [done, setDone] = useState(false);
  const mutation = useMutation({
    mutationFn: () => issueCartridge(form),
    onSuccess: () => setDone(true),
  });
  return (
    <Operation
      title="Issue Cartridge"
      description="Issue a filled cartridge independently; an empty return is not required."
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
  submit,
  children,
}: {
  title: string;
  description: string;
  error: Error | null;
  done: boolean;
  pending: boolean;
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
                <Button loading={pending} type="submit">
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
