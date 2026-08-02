import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { MoreVertical, Plus, Printer } from 'lucide-react';
import {
  AppCard,
  Button,
  ErrorSummary,
  LoadingPanel,
  PageHeader,
  TextField,
} from '../../components/ui';
import {
  createGatePass,
  gatePassAction,
  getGatePass,
  getGatePasses,
  recordGateIn,
} from '../../lib/cartridges-api';
export function GatePassesPage() {
  const query = useQuery({ queryKey: ['cartridge-gate-passes'], queryFn: getGatePasses });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Cartridge Gate Passes"
        description="One returnable document tracks both Gate Out and Gate In."
        actions={
          <>
            <Link className="button-primary" to="/cartridges/gate-passes/new">
              <Plus size={18} />
              Create Gate Pass
            </Link>
            <details className="relative">
              <summary className="button-secondary cursor-pointer list-none">
                <MoreVertical size={18} />
              </summary>
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-[8px] border bg-white p-1 shadow-lg">
                <button className="menu-item w-full" onClick={() => window.print()}>
                  <Printer size={16} />
                  Print register
                </button>
              </div>
            </details>
          </>
        }
      />
      {query.isPending ? (
        <LoadingPanel />
      ) : query.isError ? (
        <ErrorSummary message="Gate Pass register could not be loaded." />
      ) : (
        <div className="grid gap-3">
          {query.data?.data.map((pass) => (
            <Link key={pass._id} to={`/cartridges/gate-passes/${pass._id}`}>
              <AppCard className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-extrabold text-[var(--color-primary-strong)]">
                    {pass.gatePassNumber}
                  </p>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {pass.vendorName} · {pass.quantity} cartridges · Prepared by{' '}
                    {pass.preparedByName}
                  </p>
                </div>
                <span className="rounded-full bg-[var(--color-primary-soft)] px-3 py-1 text-xs font-bold text-[var(--color-primary)]">
                  {pass.status.replaceAll('_', ' ')}
                </span>
              </AppCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
export function CreateGatePassPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    vendorName: '',
    personTakingMaterial: '',
    serials: '',
    remarks: '',
    submitForVerification: true,
  });
  const mutation = useMutation({
    mutationFn: () =>
      createGatePass({
        vendorName: form.vendorName,
        personTakingMaterial: form.personTakingMaterial,
        cartridgeSerialNumbers: form.serials
          .split(/\r?\n|,/)
          .map((x) => x.trim())
          .filter(Boolean),
        remarks: form.remarks,
        submitForVerification: form.submitForVerification,
      }),
    onSuccess: (r) => navigate(`/cartridges/gate-passes/${r.data._id}`),
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Create Returnable Gate Pass"
        description="Select eligible serialized cartridges. Quantity and Prepared By are filled automatically."
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
              label="Vendor name"
              value={form.vendorName}
              onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
            />
            <TextField
              label="Person taking material"
              value={form.personTakingMaterial}
              onChange={(e) => setForm({ ...form, personTakingMaterial: e.target.value })}
            />
          </div>
          <label className="block space-y-1.5">
            <span className="field-label">Cartridge serial numbers</span>
            <textarea
              className="field-input min-h-44"
              placeholder="One serial number per line"
              value={form.serials}
              onChange={(e) => setForm({ ...form, serials: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              checked={form.submitForVerification}
              onChange={(e) => setForm({ ...form, submitForVerification: e.target.checked })}
              type="checkbox"
            />
            Send for verification immediately
          </label>
          <div className="flex justify-end">
            <Button loading={mutation.isPending}>Create Gate Pass</Button>
          </div>
        </AppCard>
      </form>
    </div>
  );
}
export function GatePassDetailPage() {
  const { gatePassId = '' } = useParams();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['cartridge-gate-pass', gatePassId],
    queryFn: () => getGatePass(gatePassId),
  });
  const [gateInSerials, setGateInSerials] = useState('');
  const action = useMutation({
    mutationFn: (name: 'verify' | 'gate-out') => gatePassAction(gatePassId, name),
    onSuccess: () => client.invalidateQueries({ queryKey: ['cartridge-gate-pass', gatePassId] }),
  });
  const gateIn = useMutation({
    mutationFn: () =>
      recordGateIn(
        gatePassId,
        gateInSerials
          .split(/\r?\n|,/)
          .map((x) => x.trim())
          .filter(Boolean),
      ),
    onSuccess: () => {
      setGateInSerials('');
      void client.invalidateQueries({ queryKey: ['cartridge-gate-pass', gatePassId] });
    },
  });
  if (query.isPending) return <LoadingPanel />;
  if (query.isError || !query.data)
    return <ErrorSummary message="Gate Pass could not be loaded." />;
  const p = query.data.data;
  return (
    <div className="space-y-6">
      <PageHeader
        title={p.gatePassNumber}
        description={`${p.vendorName} · ${p.quantity} cartridges`}
        actions={
          <Link className="button-secondary" to={`/cartridges/gate-passes/${p._id}/print`}>
            <Printer size={18} />
            Print Gate Pass
          </Link>
        }
      />
      <AppCard className="grid gap-4 md:grid-cols-2">
        <Info label="Person taking material" value={p.personTakingMaterial} />
        <Info label="Prepared By" value={`${p.preparedByName} (${p.preparedByWorkerId})`} />
        <Info label="Verified By" value={p.verifiedByName ?? 'Awaiting verification'} />
        <Info label="Status" value={p.status.replaceAll('_', ' ')} />
      </AppCard>
      <AppCard>
        <h2 className="font-extrabold text-[var(--color-primary-strong)]">Cartridge numbers</h2>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2">
          {p.cartridgeSerialNumbers.map((x, i) => (
            <li
              className="rounded-[8px] bg-[var(--color-surface-tint)] px-3 py-2 text-sm font-bold"
              key={x}
            >
              {i + 1}. {x}
            </li>
          ))}
        </ol>
      </AppCard>
      <div className="flex flex-wrap gap-2">
        {['DRAFT', 'AWAITING_VERIFICATION'].includes(p.status) ? (
          <Button loading={action.isPending} onClick={() => action.mutate('verify')}>
            Verify Gate Pass
          </Button>
        ) : null}
        {p.status === 'VERIFIED' ? (
          <Button loading={action.isPending} onClick={() => action.mutate('gate-out')}>
            Confirm Gate Out
          </Button>
        ) : null}
      </div>
      {['GATE_OUT', 'PARTIALLY_RETURNED'].includes(p.status) ? (
        <AppCard className="space-y-3">
          <h2 className="font-extrabold">Record Gate In</h2>
          <textarea
            className="field-input min-h-28"
            placeholder="Returned serial numbers, one per line"
            value={gateInSerials}
            onChange={(e) => setGateInSerials(e.target.value)}
          />
          <Button loading={gateIn.isPending} onClick={() => gateIn.mutate()}>
            Save Gate In
          </Button>
        </AppCard>
      ) : null}
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}
export function GatePassPrintPage() {
  const { gatePassId = '' } = useParams();
  const query = useQuery({
    queryKey: ['cartridge-gate-pass', gatePassId],
    queryFn: () => getGatePass(gatePassId),
  });
  if (query.isPending) return <LoadingPanel />;
  if (!query.data) return <ErrorSummary message="Gate Pass could not be loaded." />;
  const p = query.data.data;
  return (
    <div className="mx-auto max-w-[800px] bg-white p-8 text-black print:max-w-none print:p-0">
      <div className="mb-4 text-right print:hidden">
        <Button onClick={() => window.print()}>
          <Printer size={18} />
          Print
        </Button>
      </div>
      <div className="border-2 border-black p-5">
        <h1 className="text-center text-2xl font-extrabold">
          Toner Cartridge Refilling
          <br />
          <u>Returnable Gate Pass</u>
        </h1>
        <div className="mt-6 grid grid-cols-2 border border-black text-sm">
          <b className="border-b border-r border-black p-2">Gate Pass No: {p.gatePassNumber}</b>
          <b className="border-b border-black p-2">
            Date: {new Date(p.createdAt).toLocaleDateString('en-IN')}
          </b>
          <b className="border-r border-black p-2">Vendor Name: {p.vendorName}</b>
          <b className="p-2">Person Taking Material: {p.personTakingMaterial}</b>
        </div>
        <table className="mt-5 w-full border-collapse border border-black">
          <thead>
            <tr>
              <th className="border border-black p-2">Sr. No.</th>
              <th className="border border-black p-2">Cartridge Number</th>
              <th className="border border-black p-2">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {p.cartridgeSerialNumbers.map((x, i) => (
              <tr key={x}>
                <td className="border border-black p-2 text-center">{i + 1}</td>
                <td className="border border-black p-2">{x}</td>
                <td className="border border-black p-2 text-center">1</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-5 grid grid-cols-2 border border-black">
          <div className="min-h-24 border-r border-black p-3">
            <b>Prepared by:</b>
            <p className="mt-3">{p.preparedByName}</p>
          </div>
          <div className="min-h-24 p-3">
            <b>Verified by:</b>
            <p className="mt-3">{p.verifiedByName ?? ''}</p>
          </div>
        </div>
        <div className="mt-6">
          <b>General Instructions:-</b>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            <li>Gate Pass is an authorization to allow the material to leave the premises.</li>
            <li>Security Department is to keep the record of Gate Pass.</li>
          </ol>
        </div>
        <div className="mt-16 flex justify-between font-bold">
          <span>Stamp (Gate IN)</span>
          <span>Stamp (Gate OUT)</span>
        </div>
      </div>
    </div>
  );
}
