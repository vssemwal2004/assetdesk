import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ClipboardCheck, PackagePlus, Plus, Printer, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import {
  CreateIssueRequestSchema,
  type AssetUnit,
  type AssignmentType,
  type CreateIssueRequest,
  type Issue,
  type Material,
  type ReceiverType,
} from '@assetdesk/contracts';

import { CatalogBadge } from '../../components/catalog-ui';
import {
  AppCard,
  Button,
  ErrorSummary,
  LoadingPanel,
  PageHeader,
  SuccessMark,
  cn,
} from '../../components/ui';
import { StickyWorkflowActions } from '../../components/workflow-ui';
import { isApiError } from '../../lib/api-client';
import { calculatePresetReturnInIst, formatIstDateTime } from '../../lib/date-time';
import { createPendingSubmission } from '../../lib/idempotent-submission';
import { getAvailableAssetUnits, getInventory } from '../../lib/inventory-api';
import { createIssue } from '../../lib/issues-api';

type DuePreset = NonNullable<CreateIssueRequest['due']>['preset'];

interface LineDraft {
  id: string;
  materialCode: string;
  quantity: string;
  assetTags: string[];
}

const blankLine = (): LineDraft => ({
  id: crypto.randomUUID(),
  materialCode: '',
  quantity: '1',
  assetTags: [],
});

const receiverTypes: ReceiverType[] = [
  'STUDENT',
  'FACULTY',
  'STAFF',
  'DEPARTMENT',
  'AUTHORIZED_EXTERNAL',
];

export function CreateIssuePage() {
  const queryClient = useQueryClient();
  const [assignmentType, setAssignmentType] = useState<AssignmentType>('LONG_TERM');
  const [issuedTo, setIssuedTo] = useState({
    fullName: '',
    universityId: '',
    type: 'STUDENT' as ReceiverType,
    department: '',
    contact: '',
    email: '',
  });
  const [materialSearch, setMaterialSearch] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([blankLine()]);
  const [duePreset, setDuePreset] = useState<DuePreset>('ONE_WEEK');
  const [customReturnAt, setCustomReturnAt] = useState('');
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [created, setCreated] = useState<Issue | null>(null);

  const inventoryQuery = useQuery({
    queryKey: ['inventory', { assignmentType, materialSearch }],
    queryFn: ({ signal }) =>
      getInventory(
        {
          page: 1,
          pageSize: 100,
          status: 'ACTIVE',
          assignmentType,
          ...(materialSearch ? { search: materialSearch } : {}),
        },
        signal,
      ),
  });

  const materials = useMemo(() => inventoryQuery.data?.data ?? [], [inventoryQuery.data?.data]);
  const materialByCode = useMemo(
    () => new Map(materials.map((material) => [material.materialCode, material])),
    [materials],
  );

  const mutation = useMutation({
    mutationFn: ({ input, key }: { input: CreateIssueRequest; key: string }) =>
      createIssue(input, key),
    onSuccess: async (response) => {
      setCreated(response.data.issue);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['issues'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['asset-units'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
    onError: (error) =>
      setMessage(isApiError(error) ? error.message : 'The assignment could not be created.'),
  });

  function expectedReturn(): Date | null {
    if (assignmentType === 'LONG_TERM') return null;
    if (duePreset === 'CUSTOM') {
      return customReturnAt ? new Date(`${customReturnAt}:00+05:30`) : null;
    }
    return calculatePresetReturnInIst(new Date(), duePreset);
  }

function buildInput(): CreateIssueRequest | null {
    const expected = expectedReturn();
    const stockIssue = firstStockIssue(lines, materialByCode);
    if (stockIssue) {
      setMessage(stockIssue);
      return null;
    }
    const candidate = {
      mode: 'CATALOG' as const,
      assignmentType,
      receiver: {
        fullName: issuedTo.fullName,
        ...(issuedTo.universityId.trim() ? { universityId: issuedTo.universityId } : {}),
        type: issuedTo.type,
        ...(issuedTo.department.trim() ? { department: issuedTo.department } : {}),
        contact: issuedTo.contact,
        email: issuedTo.email,
      },
      lines: lines.map((line) => {
        const material = materialByCode.get(line.materialCode);
        if (material?.trackingMode === 'SERIALIZED') {
          return {
            trackingMode: 'SERIALIZED' as const,
            materialCode: line.materialCode,
            assetTags: line.assetTags,
          };
        }
        return {
          trackingMode: 'QUANTITY' as const,
          materialCode: line.materialCode,
          quantity: Number(line.quantity),
        };
      }),
      ...(assignmentType === 'SHORT_TERM'
        ? {
            due:
              duePreset === 'CUSTOM'
                ? { preset: 'CUSTOM' as const, expectedReturnAt: expected?.toISOString() ?? '' }
                : { preset: duePreset },
          }
        : {}),
      ...(purpose.trim() ? { purpose } : {}),
      ...(notes.trim() ? { notes } : {}),
    };
    const parsed = CreateIssueRequestSchema.safeParse(candidate);
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? 'Check the assignment details.');
      return null;
    }
    if (assignmentType === 'SHORT_TERM' && (!expected || expected <= new Date())) {
      setMessage('Choose a future expected return date and time.');
      return null;
    }
    return parsed.data;
  }

  function submit() {
    setMessage(null);
    const input = buildInput();
    if (!input) return;
    const submission = createPendingSubmission(input);
    mutation.mutate({ input: submission.input, key: submission.key });
  }

  if (created) {
    return (
      <div className="mx-auto max-w-2xl">
        <AppCard>
          <SuccessMark label="Assignment saved" />
          <h1 className="mt-4 text-2xl font-extrabold text-[var(--color-primary-strong)]">
            Asset assignment created
          </h1>
          <dl className="mt-5 divide-y divide-[var(--color-border)] rounded-[12px] border border-[var(--color-border)] px-4">
            <Summary label="Assignment ID" value={created.issueId} />
            <Summary label="Issued To" value={created.receiver.fullName} />
            <Summary label="Type" value={created.assignmentType === 'LONG_TERM' ? 'Long-Term Assignment' : 'Short-Term Assignment'} />
            <Summary label="Expected Return" value={created.expectedReturnAt ? formatIstDateTime(created.expectedReturnAt) : 'No fixed return date'} />
          </dl>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link className="button-primary" to={`/issues/${created.issueId}`}>
              <ClipboardCheck aria-hidden="true" size={18} />
              View Assignment
            </Link>
            <Link className="button-secondary" to={`/bills/${created.issueId}`}>
              <Printer aria-hidden="true" size={18} />
              Generate bill
            </Link>
            <Button onClick={() => window.location.reload()} variant="secondary">
              <PackagePlus aria-hidden="true" size={18} />
              New assignment
            </Button>
          </div>
        </AppCard>
      </div>
    );
  }

  return (
    <div className="issue-flow space-y-4">
      <PageHeader
        actions={
          <Link className="button-quiet" to="/issues">
            <ArrowLeft aria-hidden="true" size={18} />
            Back
          </Link>
        }
        description="Create assignments only from tracked inventory."
        title="Create Asset Assignment"
      />
      {message ? <ErrorSummary message={message} /> : null}

      <AppCard className="issue-panel">
        <h2 className="text-base font-extrabold text-[var(--color-primary-strong)]">Assignment type</h2>
        <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-[10px] bg-[var(--color-surface-tint)] p-1">
          <TypeButton active={assignmentType === 'LONG_TERM'} label="Long-Term" onClick={() => setAssignmentType('LONG_TERM')} />
          <TypeButton active={assignmentType === 'SHORT_TERM'} label="Short-Term" onClick={() => setAssignmentType('SHORT_TERM')} />
        </div>
      </AppCard>

      <AppCard className="issue-panel">
        <SectionTitle number="1" title="Issued To" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            label="Name / Department"
            onChange={(value) => setIssuedTo((current) => ({ ...current, fullName: value }))}
            value={issuedTo.fullName}
          />
          <label className="space-y-1.5">
            <span className="field-label">Type</span>
            <select
              className="field-input field-input-compact"
              onChange={(event) =>
                setIssuedTo((current) => ({ ...current, type: event.target.value as ReceiverType }))
              }
              value={issuedTo.type}
            >
              {receiverTypes.map((type) => (
                <option key={type} value={type}>
                  {type.toLowerCase().replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="University ID"
            onChange={(value) => setIssuedTo((current) => ({ ...current, universityId: value }))}
            value={issuedTo.universityId}
          />
          <Field
            label="Department"
            onChange={(value) => setIssuedTo((current) => ({ ...current, department: value }))}
            value={issuedTo.department}
          />
          <Field
            label="Contact"
            onChange={(value) => setIssuedTo((current) => ({ ...current, contact: value }))}
            type="tel"
            value={issuedTo.contact}
          />
          <Field
            label="Email"
            onChange={(value) => setIssuedTo((current) => ({ ...current, email: value }))}
            type="email"
            value={issuedTo.email}
          />
        </div>
      </AppCard>

      <AppCard className="issue-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle number="2" title="Inventory assets" />
          <Button onClick={() => setLines((current) => [...current, blankLine()])} variant="secondary">
            <Plus aria-hidden="true" size={17} />
            Add item
          </Button>
        </div>
        <div className="mt-4 max-w-sm">
          <Field label="Search inventory" onChange={setMaterialSearch} value={materialSearch} />
        </div>
        {inventoryQuery.isPending ? <LoadingPanel label="Loading inventory" /> : null}
        <div className="mt-4 space-y-3">
          {lines.map((line, index) => (
            <LineEditor
              index={index}
              key={line.id}
              line={line}
              material={materialByCode.get(line.materialCode) ?? null}
              materials={materials}
              onChange={(next) =>
                setLines((current) => current.map((candidate) => (candidate.id === line.id ? next : candidate)))
              }
              onRemove={() => setLines((current) => current.filter((candidate) => candidate.id !== line.id))}
              removable={lines.length > 1}
            />
          ))}
        </div>
      </AppCard>

      {assignmentType === 'SHORT_TERM' ? (
        <AppCard className="issue-panel">
          <SectionTitle number="3" title="Return schedule" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="field-label">Return period</span>
              <select className="field-input field-input-compact" onChange={(event) => setDuePreset(event.target.value as DuePreset)} value={duePreset}>
                <option value="ONE_DAY">1 day</option>
                <option value="ONE_WEEK">1 week</option>
                <option value="ONE_MONTH">1 month</option>
                <option value="SIX_MONTHS">6 months</option>
                <option value="ONE_YEAR">1 year</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </label>
            {duePreset === 'CUSTOM' ? (
              <Field label="Expected return (IST)" onChange={setCustomReturnAt} type="datetime-local" value={customReturnAt} />
            ) : (
              <div className="rounded-[12px] bg-[var(--color-surface-tint)] p-4">
                <p className="text-xs font-bold text-[var(--color-text-muted)]">Expected return</p>
                <p className="mt-1 text-sm font-extrabold text-[var(--color-primary-strong)]">{formatIstDateTime(expectedReturn())}</p>
              </div>
            )}
          </div>
        </AppCard>
      ) : null}

      <AppCard className="issue-panel">
        <SectionTitle number={assignmentType === 'SHORT_TERM' ? '4' : '3'} title="Notes" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextArea label="Purpose" onChange={setPurpose} value={purpose} />
          <TextArea label="Notes" onChange={setNotes} value={notes} />
        </div>
      </AppCard>

      <StickyWorkflowActions>
        <Link className="button-secondary" to="/issues">Cancel</Link>
        <Button loading={mutation.isPending} onClick={submit}>
          {mutation.isPending ? 'Saving...' : 'Create assignment'}
        </Button>
      </StickyWorkflowActions>
    </div>
  );
}

function TypeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={`min-h-10 rounded-[9px] px-3 text-sm font-extrabold transition ${active ? 'bg-white text-[var(--color-primary)] shadow-[var(--shadow-card)]' : 'text-[var(--color-text-muted)]'}`}
      onClick={onClick}
      type="button"
    >
      {active ? <Check aria-hidden="true" className="mr-1 inline" size={16} /> : null}
      {label}
    </button>
  );
}

function LineEditor({
  line,
  index,
  material,
  materials,
  removable,
  onChange,
  onRemove,
}: {
  line: LineDraft;
  index: number;
  material: Material | null;
  materials: Material[];
  removable: boolean;
  onChange: (line: LineDraft) => void;
  onRemove: () => void;
}) {
  const availability = stockMessage(line, material);
  return (
    <div className="rounded-[10px] border border-[var(--color-border)] p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold text-[var(--color-primary-strong)]">Item {index + 1}</h3>
        {removable ? (
          <button aria-label={`Remove item ${index + 1}`} className="icon-button text-[var(--color-danger)]" onClick={onRemove} type="button">
            <Trash2 aria-hidden="true" size={17} />
          </button>
        ) : null}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_150px]">
        <label className="space-y-1.5">
          <span className="field-label">Material</span>
          <select
            className="field-input field-input-compact"
            onChange={(event) => onChange({ ...line, materialCode: event.target.value, assetTags: [], quantity: '1' })}
            value={line.materialCode}
          >
            <option value="">Choose inventory material</option>
            {materials.map((item) => (
              <option disabled={item.availableQuantity <= 0} key={item.materialCode} value={item.materialCode}>
                {item.name} · {item.availableQuantity > 0 ? `${item.availableQuantity} available` : 'out of stock'}
              </option>
            ))}
          </select>
        </label>
        {material?.trackingMode === 'QUANTITY' ? (
          <Field
            label="Quantity"
            max={String(material.availableQuantity)}
            min="1"
            onChange={(value) => onChange({ ...line, quantity: value })}
            type="number"
            value={line.quantity}
          />
        ) : material?.trackingMode === 'SERIALIZED' ? (
          <SerializedPicker line={line} material={material} onChange={onChange} />
        ) : null}
      </div>
      {material ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2 text-xs">
            <CatalogBadge value={material.trackingMode} />
            <span className="rounded-full bg-[var(--color-surface-tint)] px-2.5 py-1 font-bold text-[var(--color-text-muted)]">
              {material.availableQuantity} of {material.totalQuantity} available
            </span>
          </div>
          {availability ? (
            <p
              className={`rounded-[10px] px-3 py-2 text-xs font-bold ${
                availability.tone === 'ok'
                  ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
                  : 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
              }`}
              role={availability.tone === 'warn' ? 'alert' : 'status'}
            >
              {availability.text}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SerializedPicker({ line, material, onChange }: { line: LineDraft; material: Material; onChange: (line: LineDraft) => void }) {
  const query = useQuery({
    queryKey: ['asset-units', material.materialCode, 'available'],
    queryFn: ({ signal }) => getAvailableAssetUnits(material.materialCode, '', signal),
  });
  const units = query.data?.data ?? [];
  return (
    <label className="space-y-1.5">
      <span className="field-label">Asset tags</span>
      <select
        className="field-input field-input-compact min-h-11"
        multiple
        onChange={(event) =>
          onChange({
            ...line,
            assetTags: Array.from(event.target.selectedOptions).map((option) => option.value),
          })
        }
        value={line.assetTags}
      >
        {units.map((unit: AssetUnit) => (
          <option key={unit.assetTag} value={unit.assetTag}>
            {unit.assetTag} · {unit.serialNumber ?? 'No serial'}
          </option>
        ))}
      </select>
    </label>
  );
}

function firstStockIssue(
  lines: LineDraft[],
  materialByCode: Map<string, Material>,
): string | null {
  const seenMaterials = new Set<string>();
  const seenAssetTags = new Set<string>();
  for (const [index, line] of lines.entries()) {
    const material = materialByCode.get(line.materialCode);
    if (!material) return `Choose an inventory material for item ${index + 1}.`;
    if (seenMaterials.has(material.materialCode)) {
      return `${material.name} is already added. Increase quantity in the same item instead.`;
    }
    seenMaterials.add(material.materialCode);
    if (material.availableQuantity <= 0) {
      return `${material.name} is out of stock. Select another material.`;
    }
    if (material.trackingMode === 'QUANTITY') {
      const requested = Number(line.quantity);
      if (!Number.isInteger(requested) || requested < 1) {
        return `Enter a valid quantity for ${material.name}.`;
      }
      if (requested > material.availableQuantity) {
        return `${material.name} has only ${material.availableQuantity} ${material.unitLabel ?? 'units'} available. Reduce item ${index + 1}.`;
      }
    }
    if (material.trackingMode === 'SERIALIZED') {
      if (line.assetTags.length < 1) {
        return `Select at least one asset tag for ${material.name}.`;
      }
      for (const assetTag of line.assetTags) {
        if (seenAssetTags.has(assetTag)) return `${assetTag} is selected more than once.`;
        seenAssetTags.add(assetTag);
      }
      if (line.assetTags.length > material.availableQuantity) {
        return `${material.name} has only ${material.availableQuantity} serialized units available.`;
      }
    }
  }
  return null;
}

function stockMessage(line: LineDraft, material: Material | null): { tone: 'ok' | 'warn'; text: string } | null {
  if (!material) return null;
  if (material.availableQuantity <= 0) {
    return { tone: 'warn', text: 'Out of stock. This material cannot be issued right now.' };
  }
  if (material.trackingMode === 'QUANTITY') {
    const requested = Number(line.quantity);
    if (Number.isFinite(requested) && requested > material.availableQuantity) {
      return {
        tone: 'warn',
        text: `Only ${material.availableQuantity} ${material.unitLabel ?? 'units'} available. Reduce quantity.`,
      };
    }
    return {
      tone: 'ok',
      text: `${material.availableQuantity} ${material.unitLabel ?? 'units'} available for issue.`,
    };
  }
  return {
    tone: 'ok',
    text: `${material.availableQuantity} serialized ${material.availableQuantity === 1 ? 'unit' : 'units'} available. Select exact asset tags.`,
  };
}

function SectionTitle({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-8 place-items-center rounded-[9px] bg-[var(--color-primary)] text-sm font-extrabold text-white">{number}</span>
      <h2 className="text-base font-extrabold text-[var(--color-primary-strong)]">{title}</h2>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  min,
  max,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  max?: string;
  className?: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="field-label">{label}</span>
      <input
        className={cn('field-input field-input-compact', className)}
        max={max}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1.5">
      <span className="field-label">{label} <span className="font-medium text-[var(--color-text-muted)]">(optional)</span></span>
      <textarea className="field-input field-input-compact min-h-20 resize-y" maxLength={2000} onChange={(event) => onChange(event.target.value)} value={value} />
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[150px_1fr]">
      <dt className="text-sm font-bold text-[var(--color-text-muted)]">{label}</dt>
      <dd className="text-sm font-bold text-[var(--color-text-strong)]">{value}</dd>
    </div>
  );
}
