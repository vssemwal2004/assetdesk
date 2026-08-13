import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronDown,
  ClipboardCheck,
  MapPin,
  PackagePlus,
  Plus,
  Printer,
  Search,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import {
  CreateIssueRequestSchema,
  type AssetUnit,
  type AssignmentType,
  type CreateIssueRequest,
  type Issue,
  type Material,
  type ReceiverType,
  type TrackingMode,
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
import { getAssetDetails, getAvailableAssetUnits, getInventory } from '../../lib/inventory-api';
import { createIssue } from '../../lib/issues-api';

type DuePreset = NonNullable<CreateIssueRequest['due']>['preset'];
type StoreFilter = string;

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
  'MANAGEMENT',
  'GEHU',
];

export function CreateIssuePage() {
  const queryClient = useQueryClient();
  const [materialType, setMaterialType] = useState<TrackingMode>('SERIALIZED');
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
  const [storeFilter, setStoreFilter] = useState<StoreFilter>('');
  const [lines, setLines] = useState<LineDraft[]>([blankLine()]);
  const [duePreset, setDuePreset] = useState<DuePreset>('ONE_WEEK');
  const [customReturnAt, setCustomReturnAt] = useState('');
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [created, setCreated] = useState<Issue | null>(null);

  const inventoryQuery = useQuery({
    queryKey: ['inventory', { materialSearch, materialType, storeFilter, issueable: true }],
    queryFn: ({ signal }) =>
      getInventory(
        {
          page: 1,
          pageSize: 500,
          issueable: true,
          trackingMode: materialType,
          ...(materialSearch ? { search: materialSearch } : {}),
        },
        signal,
      ),
  });
  const departmentQuery = useQuery({
    queryKey: ['asset-details', 'DEPARTMENT'],
    queryFn: ({ signal }) => getAssetDetails('DEPARTMENT', signal),
  });
  const storeQuery = useQuery({
    queryKey: ['asset-details', 'STORE'],
    queryFn: ({ signal }) => getAssetDetails('STORE', signal),
  });
  const departments = departmentQuery.data ?? [];
  const storeNames = useMemo(
    () => (storeQuery.data ?? []).map((store) => store.name),
    [storeQuery.data],
  );
  const allIssueableMaterials = useMemo(
    () =>
      (inventoryQuery.data?.data ?? []).filter((material) =>
        isIssueableInventoryMaterial(material, '', storeNames),
      ),
    [inventoryQuery.data?.data, storeNames],
  );
  const storeAvailability = useMemo(
    () =>
      new Map(
        storeNames.map((store) => [
          store,
          allIssueableMaterials
            .filter((material) => matchesStoreSource(store, material))
            .reduce((total, material) => total + material.availableQuantity, 0),
        ]),
      ),
    [allIssueableMaterials, storeNames],
  );
  const storeFilterOptions = useMemo(
    () =>
      storeNames.map((store) => ({
        value: store,
        label: store,
        available: storeAvailability.get(store) ?? 0,
      })),
    [storeAvailability, storeNames],
  );
  useEffect(() => {
    if (storeFilter || inventoryQuery.isPending || storeQuery.isPending) return;
    const stockedStore = storeFilterOptions.find((store) => store.available > 0);
    setStoreFilter(stockedStore?.value ?? storeFilterOptions[0]?.value ?? '');
  }, [inventoryQuery.isPending, storeFilter, storeFilterOptions, storeQuery.isPending]);
  const selectedStoreLabel =
    storeFilterOptions.find((store) => store.value === storeFilter)?.label ?? 'Choose store';

  const materials = useMemo(
    () =>
      (inventoryQuery.data?.data ?? [])
        .filter((material) => isIssueableInventoryMaterial(material, storeFilter, storeNames))
        .sort(compareIssueableMaterials),
    [inventoryQuery.data?.data, storeFilter, storeNames],
  );
  const inventoryTotals = useMemo(
    () =>
      materials.reduce(
        (total, material) => ({
          variants: total.variants + 1,
          available: total.available + material.availableQuantity,
        }),
        { variants: 0, available: 0 },
      ),
    [materials],
  );
  const materialByCode = useMemo(
    () => new Map(materials.map((material) => [material.materialCode, material])),
    [materials],
  );
  const mutation = useMutation({
    mutationFn: ({ input, key }: { input: CreateIssueRequest; key: string }) =>
      createIssue(input, key),
    onSuccess: async (response) => {
      setCreated(response.data.issue);
      const materialCodes = new Set(
        response.data.issue.lines.map((line) => line.material.materialCode),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['issues'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['asset-units'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        ...Array.from(materialCodes).map((code) =>
          queryClient.invalidateQueries({ queryKey: ['material', code] }),
        ),
      ]);
    },
    onError: (error) =>
      setMessage(
        isApiError(error)
          ? firstIssueApiMessage(error.fields) ?? error.message
          : 'The assignment could not be created.',
      ),
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
    const receiverIssue = firstReceiverIssue(issuedTo);
    if (receiverIssue) {
      setMessage(receiverIssue);
      return null;
    }
    const stockIssue = firstStockIssue(lines, materialByCode);
    if (stockIssue) {
      setMessage(stockIssue);
      return null;
    }
    const effectiveAssignmentType: AssignmentType = assignmentType;
    const candidate = {
      mode: 'CATALOG' as const,
      assignmentType: effectiveAssignmentType,
      receiver: {
        fullName: issuedTo.fullName,
        ...(issuedTo.universityId.trim() ? { universityId: issuedTo.universityId } : {}),
        type: issuedTo.type,
        ...(issuedTo.department.trim() ? { department: issuedTo.department } : {}),
        ...(issuedTo.contact.trim() ? { contact: issuedTo.contact } : {}),
        ...(issuedTo.email.trim() ? { email: issuedTo.email } : {}),
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
      ...(effectiveAssignmentType === 'SHORT_TERM'
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
      setMessage(
        firstIssueSchemaMessage(
          parsed.error.issues.map((issue) => ({
            path: issue.path.map(String),
            message: issue.message,
          })),
        ) ?? 'Check the assignment details.',
      );
      return null;
    }
    if (effectiveAssignmentType === 'SHORT_TERM' && (!expected || expected <= new Date())) {
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
            <Summary
              label="Type"
              value={created.assignmentType === 'LONG_TERM' ? 'Permanent issue' : 'Return by date'}
            />
            <Summary
              label="Expected Return"
              value={
                created.expectedReturnAt
                  ? formatIstDateTime(created.expectedReturnAt)
                  : 'No fixed return date'
              }
            />
          </dl>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link className="button-primary" to={`/issues/${created.issueId}`}>
              <ClipboardCheck aria-hidden="true" size={18} />
              View Assignment
            </Link>
            <Link className="button-secondary" to={`/bills/${created.issueId}`}>
              <Printer aria-hidden="true" size={18} />
              Generate receipt
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

      <AppCard className="issue-panel issue-control-panel">
        <div>
          <p className="text-xs font-extrabold uppercase text-[var(--color-primary)]">
            Source inventory
          </p>
          <h2 className="mt-1 text-lg font-extrabold text-[var(--color-text-strong)]">
            Choose store stock for this assignment
          </h2>
        </div>
        <div className="grid gap-3 md:grid-cols-[220px_220px_minmax(180px,1fr)]">
          <label className="space-y-1.5">
            <span className="field-label">Material type</span>
            <select
              className="field-input field-input-compact"
              onChange={(event) => {
                setMaterialType(event.target.value as TrackingMode);
                setStoreFilter('');
                setLines([blankLine()]);
                setMessage(null);
              }}
              value={materialType}
            >
              <option value="SERIALIZED">IT Assets</option>
              <option value="QUANTITY">IT Consumables</option>
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="field-label">Store</span>
            <select
              className="field-input field-input-compact"
              onChange={(event) => {
                setStoreFilter(event.target.value as StoreFilter);
                setLines([blankLine()]);
                setMessage(null);
              }}
              value={storeFilter}
            >
              {!storeFilter ? <option value="">Choose store</option> : null}
              {storeFilterOptions.map((store) => (
                <option key={store.value} value={store.value}>
                  {store.label} ({store.available} available)
                </option>
              ))}
            </select>
          </label>
          <div className="issue-stock-summary">
            <span>{inventoryTotals.variants} variants</span>
            <strong>{inventoryTotals.available} available</strong>
          </div>
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
          <label className="space-y-1.5">
            <span className="field-label">Department</span>
            <select
              className="field-input field-input-compact"
              onChange={(event) =>
                setIssuedTo((current) => ({ ...current, department: event.target.value }))
              }
              value={issuedTo.department}
            >
              <option value="">Choose department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.name}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Contact (optional)"
            onChange={(value) => setIssuedTo((current) => ({ ...current, contact: value }))}
            type="tel"
            value={issuedTo.contact}
          />
          <Field
            label="Email (optional)"
            onChange={(value) => setIssuedTo((current) => ({ ...current, email: value }))}
            type="email"
            value={issuedTo.email}
          />
        </div>
      </AppCard>

      <AppCard className="issue-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle
            number="2"
            title={materialType === 'SERIALIZED' ? 'IT Assets' : 'IT Consumables'}
          />
          <Button
            onClick={() => setLines((current) => [...current, blankLine()])}
            variant="secondary"
          >
            <Plus aria-hidden="true" size={17} />
            Add item
          </Button>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <label className="space-y-1.5">
            <span className="field-label">Search inventory</span>
            <span className="search-shell">
              <Search aria-hidden="true" className="search-shell-icon" size={17} />
              <input
                className="field-input field-input-compact field-input-search"
                onChange={(event) => setMaterialSearch(event.target.value)}
                placeholder="Search model, category, code"
                value={materialSearch}
              />
            </span>
          </label>
          <div className="issue-store-chip">
            <MapPin aria-hidden="true" size={17} />
            <span>{selectedStoreLabel}</span>
          </div>
        </div>
        {inventoryQuery.isPending ? <LoadingPanel label="Loading inventory" /> : null}
        {inventoryQuery.isError ? (
          <ErrorSummary
            message={
              isApiError(inventoryQuery.error)
                ? inventoryQuery.error.message
                : 'Issueable inventory could not be loaded.'
            }
          />
        ) : null}
        {!inventoryQuery.isPending && !inventoryQuery.isError && materials.length === 0 ? (
          <p className="mt-4 rounded-[10px] bg-[var(--color-warning-soft)] px-3 py-2 text-sm font-bold text-[var(--color-warning)]">
            {storeFilter
              ? `No issueable ${materialType === 'SERIALIZED' ? 'IT Assets' : 'IT Consumables'} are available in ${selectedStoreLabel}.`
              : `No issueable ${materialType === 'SERIALIZED' ? 'IT Assets' : 'IT Consumables'} found.`}
            {storeNames.length === 0
              ? ' Add Store records from Asset details before issuing material.'
              : storeFilterOptions.some((store) => store.available > 0)
                ? ` Choose ${storeFilterOptions
                    .filter((store) => store.available > 0)
                    .map((store) => `${store.label} (${store.available})`)
                    .join(', ')} instead.`
                : ' Add available inventory to this material type in a configured store.'}
          </p>
        ) : null}
        <div className="mt-4 space-y-3">
          {lines.map((line, index) => (
            <LineEditor
              index={index}
              key={line.id}
              line={line}
              material={materialByCode.get(line.materialCode) ?? null}
              materials={materials}
              onChange={(next) =>
                setLines((current) =>
                  current.map((candidate) => (candidate.id === line.id ? next : candidate)),
                )
              }
              onRemove={() =>
                setLines((current) => current.filter((candidate) => candidate.id !== line.id))
              }
              removable={lines.length > 1}
            />
          ))}
        </div>
      </AppCard>

      <AppCard className="issue-panel">
        <SectionTitle number="3" title="Issue duration" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="field-label">Issue type</span>
            <select
              className="field-input field-input-compact"
              onChange={(event) => {
                setAssignmentType(event.target.value as AssignmentType);
                setMessage(null);
              }}
              value={assignmentType}
            >
              <option value="LONG_TERM">Permanent issue</option>
              <option value="SHORT_TERM">Return by date</option>
            </select>
          </label>
          {assignmentType === 'LONG_TERM' ? (
            <div className="rounded-[12px] bg-[var(--color-surface-tint)] p-4">
              <p className="text-xs font-bold text-[var(--color-text-muted)]">Expected return</p>
              <p className="mt-1 text-sm font-extrabold text-[var(--color-primary-strong)]">
                No fixed return date
              </p>
            </div>
          ) : null}
        </div>
        {assignmentType === 'SHORT_TERM' ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="field-label">Return period</span>
              <select
                className="field-input field-input-compact"
                onChange={(event) => setDuePreset(event.target.value as DuePreset)}
                value={duePreset}
              >
                <option value="ONE_DAY">1 day</option>
                <option value="ONE_WEEK">1 week</option>
                <option value="ONE_MONTH">1 month</option>
                <option value="SIX_MONTHS">6 months</option>
                <option value="ONE_YEAR">1 year</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </label>
            {duePreset === 'CUSTOM' ? (
              <Field
                label="Expected return (IST)"
                onChange={setCustomReturnAt}
                type="datetime-local"
                value={customReturnAt}
              />
            ) : (
              <div className="rounded-[12px] bg-[var(--color-surface-tint)] p-4">
                <p className="text-xs font-bold text-[var(--color-text-muted)]">Expected return</p>
                <p className="mt-1 text-sm font-extrabold text-[var(--color-primary-strong)]">
                  {formatIstDateTime(expectedReturn())}
                </p>
              </div>
            )}
          </div>
        ) : null}
      </AppCard>

      <AppCard className="issue-panel">
        <SectionTitle number="4" title="Notes" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextArea label="Purpose" onChange={setPurpose} value={purpose} />
          <TextArea label="Notes" onChange={setNotes} value={notes} />
        </div>
      </AppCard>

      <StickyWorkflowActions>
        <Link className="button-secondary" to="/issues">
          Cancel
        </Link>
        <Button loading={mutation.isPending} onClick={submit}>
          {mutation.isPending ? 'Saving...' : 'Create assignment'}
        </Button>
      </StickyWorkflowActions>
    </div>
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
  const selectedMaterialCode = line.materialCode;
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const visibleMaterials = materials.slice(0, 50);
  const hiddenMaterialCount = Math.max(materials.length - visibleMaterials.length, 0);

  function selectMaterial(item: Material) {
    onChange({
      ...line,
      materialCode: item.materialCode,
      assetTags: [],
      quantity: '1',
    });
    setMaterialPickerOpen(false);
  }

  return (
    <div className="issue-line-card">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-[var(--color-text-muted)]">Item {index + 1}</p>
          <h3 className="text-sm font-extrabold text-[var(--color-primary-strong)]">
            {material?.name ?? 'Select inventory material'}
          </h3>
        </div>
        {removable ? (
          <button
            aria-label={`Remove item ${index + 1}`}
            className="icon-button text-[var(--color-danger)]"
            onClick={onRemove}
            type="button"
          >
            <Trash2 aria-hidden="true" size={17} />
          </button>
        ) : null}
      </div>
      <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]">
        <div className="issue-material-picker">
          <button
            aria-expanded={materialPickerOpen}
            className="issue-material-trigger"
            onClick={() => setMaterialPickerOpen((current) => !current)}
            type="button"
          >
            <span className="min-w-0">
              <strong>{material?.name ?? 'Choose inventory material'}</strong>
              <span>
                {material
                  ? `${material.location ?? 'Store'} · ${material.materialCode}`
                  : 'Click to view available store stock'}
              </span>
            </span>
            <span className="issue-material-trigger-meta">
              {material ? <em>{material.availableQuantity}</em> : null}
              <ChevronDown aria-hidden="true" size={18} />
            </span>
          </button>
          {materialPickerOpen ? (
            <div className="issue-material-menu">
              <div className="issue-material-menu-header">
                <span>{materials.length} available options</span>
                {hiddenMaterialCount > 0 ? <strong>Showing first 50</strong> : null}
              </div>
              {materials.length === 0 ? (
                <p className="issue-material-empty">No available stock in the selected store.</p>
              ) : (
                visibleMaterials.map((item) => {
                  const active = item.materialCode === selectedMaterialCode;
                  return (
                    <button
                      className={cn(
                        'issue-material-option',
                        active && 'issue-material-option-active',
                      )}
                      key={item.materialCode}
                      onClick={() => selectMaterial(item)}
                      type="button"
                    >
                      <span className="min-w-0">
                        <strong>{item.name}</strong>
                        <span>
                          {item.location ?? 'Store'} · {item.materialCode}
                        </span>
                      </span>
                      <em>{item.availableQuantity}</em>
                    </button>
                  );
                })
              )}
              {hiddenMaterialCount > 0 ? (
                <p className="issue-material-more">
                  {hiddenMaterialCount} more hidden. Use search to narrow by model, category, or
                  code.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
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
          <div className="space-y-3">
            <Field
              label="IT Asset quantity"
              max={String(material.availableQuantity)}
              min="1"
              onChange={(value) => {
                const quantity = Number(value);
                onChange({
                  ...line,
                  quantity: value,
                  assetTags:
                    Number.isInteger(quantity) && quantity >= 0
                      ? line.assetTags.slice(0, quantity)
                      : line.assetTags,
                });
              }}
              type="number"
              value={line.quantity}
            />
            <SerializedPicker line={line} material={material} onChange={onChange} />
          </div>
        ) : null}
      </div>
      {material ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2 text-xs">
            <CatalogBadge value={material.trackingMode} />
            <CatalogBadge value={material.status} />
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

function SerializedPicker({
  line,
  material,
  onChange,
}: {
  line: LineDraft;
  material: Material;
  onChange: (line: LineDraft) => void;
}) {
  const query = useQuery({
    queryKey: ['asset-units', material.materialCode, 'available'],
    queryFn: ({ signal }) => getAvailableAssetUnits(material.materialCode, '', signal),
  });
  const units = query.data?.data ?? [];
  const quantity = Number(line.quantity);
  return (
    <fieldset className="space-y-2">
      <legend className="field-label">Select serial numbers</legend>
      <p className="text-xs text-[var(--color-text-muted)]">
        Select {Number.isInteger(quantity) && quantity > 0 ? quantity : 0}. Currently selected:{' '}
        {line.assetTags.length}.
      </p>
      <div className="max-h-52 space-y-1 overflow-y-auto rounded-[8px] border border-[var(--color-border)] p-2">
        {units.map((unit: AssetUnit) => {
          const checked = line.assetTags.includes(unit.assetTag);
          const selectionFull =
            Number.isInteger(quantity) && quantity > 0 && line.assetTags.length >= quantity;
          return (
            <label
              className="flex min-h-10 items-center gap-3 rounded-[6px] px-2 text-sm hover:bg-[var(--color-surface-tint)]"
              key={unit.assetTag}
            >
              <input
                checked={checked}
                disabled={!checked && selectionFull}
                onChange={(event) =>
                  onChange({
                    ...line,
                    assetTags: event.target.checked
                      ? [...line.assetTags, unit.assetTag]
                      : line.assetTags.filter((assetTag) => assetTag !== unit.assetTag),
                  })
                }
                type="checkbox"
              />
              <span className="font-bold text-[var(--color-text-strong)]">{unit.serialNumber}</span>
              <span className="text-xs text-[var(--color-text-muted)]">{unit.assetTag}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function firstStockIssue(
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
      const requested = Number(line.quantity);
      if (!Number.isInteger(requested) || requested < 1) {
        return `Enter a valid IT Asset quantity for ${material.name}.`;
      }
      if (line.assetTags.length !== requested) {
        return `Select exactly ${requested} serial number${requested === 1 ? '' : 's'} for ${material.name}.`;
      }
      for (const assetTag of line.assetTags) {
        if (seenAssetTags.has(assetTag)) return `${assetTag} is selected more than once.`;
        seenAssetTags.add(assetTag);
      }
      if (line.assetTags.length > material.availableQuantity) {
        return `${material.name} has only ${material.availableQuantity} IT Assets available.`;
      }
    }
  }
  return null;
}

export function firstReceiverIssue(receiver: {
  fullName: string;
  contact: string;
  email: string;
}): string | null {
  if (receiver.fullName.trim().length < 2) return 'Enter the receiver name or department.';
  const contactDigits = receiver.contact.match(/\d/g)?.length ?? 0;
  const contact = receiver.contact.trim();
  const email = receiver.email.trim();
  if (contact && (contact.length < 5 || contactDigits < 5)) {
    return 'Enter a valid receiver contact number with at least 5 digits.';
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Enter a valid receiver email address.';
  }
  return null;
}

export function firstIssueApiMessage(fields: Record<string, string>): string | null {
  const entries = Object.entries(fields);
  if (entries.length === 0) return null;
  return firstIssueSchemaMessage(
    entries.map(([path, message]) => ({ path: path.split('.'), message })),
  );
}

export function firstIssueSchemaMessage(
  issues: Array<{ path: string[]; message: string }>,
): string | null {
  const first = issues[0];
  if (!first) return null;
  const path = first.path.join('.');
  if (path === 'receiver.fullName') return 'Enter the receiver name or department.';
  if (path === 'receiver.contact') return 'Enter a valid receiver contact number with at least 5 digits.';
  if (path === 'receiver.email') return 'Enter a valid receiver email address.';
  if (path === 'lines' || path.startsWith('lines.')) return 'Choose inventory material and serial numbers for item 1.';
  if (path === 'due' || path.startsWith('due.')) return 'Choose a valid expected return date.';
  return first.message;
}

export function isIssueableInventoryMaterial(
  material: Material,
  storeFilter: StoreFilter = '',
  storeNames: string[] = [],
): boolean {
  const isConfiguredStore = storeNames.some((store) => matchesStoreSource(store, material));
  if (!(
    (material.status === 'ACTIVE' || material.status === 'NOT_IN_USE') &&
    material.availableQuantity > 0 &&
    isConfiguredStore
  )) {
    return false;
  }
  return storeFilter === '' || matchesStoreSource(storeFilter, material);
}

export function inventoryStoreSourceLabel(
  material: Pick<Material, 'location' | 'block' | 'locationBlock'>,
): string {
  return (
    material.locationBlock ||
    [material.location, material.block].filter(Boolean).join(' / ') ||
    material.location ||
    'Unassigned source'
  );
}

export function matchesStoreSource(
  store: string,
  material: Pick<Material, 'location' | 'block' | 'locationBlock'>,
): boolean {
  const normalizedStore = normalizeStoreSource(store);
  const source = normalizeStoreSource(inventoryStoreSourceLabel(material));
  const location = normalizeStoreSource(material.location ?? '');
  return normalizedStore === source || normalizedStore === location;
}

function normalizeStoreSource(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function compareIssueableMaterials(first: Material, second: Material): number {
  return (
    (first.location ?? '').localeCompare(second.location ?? '') ||
    first.category.localeCompare(second.category) ||
    first.name.localeCompare(second.name) ||
    first.materialCode.localeCompare(second.materialCode)
  );
}

function stockMessage(
  line: LineDraft,
  material: Material | null,
): { tone: 'ok' | 'warn'; text: string } | null {
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
    text: `${material.availableQuantity} IT ${material.availableQuantity === 1 ? 'Asset' : 'Assets'} available. Select the required serial numbers.`,
  };
}

function SectionTitle({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-8 place-items-center rounded-[9px] bg-[var(--color-primary)] text-sm font-extrabold text-white">
        {number}
      </span>
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

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="field-label">
        {label} <span className="font-medium text-[var(--color-text-muted)]">(optional)</span>
      </span>
      <textarea
        className="field-input field-input-compact min-h-20 resize-y"
        maxLength={2000}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
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
