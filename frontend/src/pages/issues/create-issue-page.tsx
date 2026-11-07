import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  ClipboardCheck,
  ListChecks,
  MapPin,
  Minus,
  PackagePlus,
  PencilLine,
  Plus,
  Printer,
  Search,
  ShoppingBasket,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';

import {
  CreateIssueRequestSchema,
  type AssetUnit,
  type AssignmentType,
  type CreateIssueRequest,
  type Issue,
  type IssueTarget,
  type Material,
  type ReceiverType,
  type TrackingMode,
} from '@assetdesk/contracts';

import {
  AppCard,
  Button,
  EmptyState,
  ErrorSummary,
  LoadingPanel,
  PageHeader,
  SuccessMark,
  cn,
} from '../../components/ui';
import { StickyWorkflowActions, WorkflowSteps } from '../../components/workflow-ui';
import { isApiError } from '../../lib/api-client';
import { calculatePresetReturnInIst, formatIstDateTime } from '../../lib/date-time';
import { createPendingSubmission } from '../../lib/idempotent-submission';
import { getAssetDetails, getAvailableAssetUnits, getInventory } from '../../lib/inventory-api';
import { createIssue } from '../../lib/issues-api';
import { getReceivers } from '../../lib/receivers-api';
import { useAuth } from '../../auth/auth-context';
import { hasPermission } from '../../auth/permissions';

type DuePreset = NonNullable<CreateIssueRequest['due']>['preset'];
type StoreFilter = string;
type TypeFilter = TrackingMode | '';
type IssueStep = 1 | 2 | 3;

interface LineDraft {
  id: string;
  materialCode: string;
  quantity: string;
  assetTags: string[];
}

// Mirrors CreateCatalogIssueRequestSchema limits so the cart fails early with a clear message.
export const MAX_ISSUE_LINES = 50;
export const MAX_ISSUE_ASSETS = 100;
const PICK_LIST_PAGE_SIZE = 60;
const issueSteps = ['Select materials', 'Add to quantity', 'Issue details'] as const;

const cartLine = (materialCode: string): LineDraft => ({
  id: crypto.randomUUID(),
  materialCode,
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

const typeTabs: Array<{ value: TypeFilter; label: string }> = [
  { value: '', label: 'All materials' },
  { value: 'SERIALIZED', label: 'IT Assets' },
  { value: 'QUANTITY', label: 'IT Consumables' },
];

export function CreateIssuePage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canIssueToLab = hasPermission(user, 'LAB_ISSUE_CREATE');
  const [issueTarget, setIssueTarget] = useState<IssueTarget>('PERSON');
  const [labCode, setLabCode] = useState('');
  const [step, setStep] = useState<IssueStep>(1);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState<StoreFilter>('');
  const [materialSearch, setMaterialSearch] = useState('');
  const deferredSearch = useDeferredValue(materialSearch.trim());
  const [visibleCount, setVisibleCount] = useState(PICK_LIST_PAGE_SIZE);
  const [lines, setLines] = useState<LineDraft[]>([]);
  // Snapshot of each selected material so cart rows survive filter and search changes.
  const [cartMaterials, setCartMaterials] = useState<Record<string, Material>>({});
  const [assignmentType, setAssignmentType] = useState<AssignmentType>('LONG_TERM');
  const [issuedTo, setIssuedTo] = useState({
    fullName: '',
    universityId: '',
    type: 'STUDENT' as ReceiverType,
    department: '',
    contact: '',
    email: '',
  });
  const [issueBlock, setIssueBlock] = useState('');
  const [issueLocation, setIssueLocation] = useState('');
  const [duePreset, setDuePreset] = useState<DuePreset>('ONE_WEEK');
  const [customReturnAt, setCustomReturnAt] = useState('');
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
  const [outsideUniversity, setOutsideUniversity] = useState(false);
  const [gatePass, setGatePass] = useState({
    destination: '',
    organization: '',
    personCarryingMaterial: '',
    contact: '',
    vehicleNumber: '',
    expectedGateInAt: '',
    remarks: '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [created, setCreated] = useState<Issue | null>(null);

  const inventoryQuery = useQuery({
    queryKey: [
      'inventory',
      { materialSearch: deferredSearch, issueable: true, scope: 'issue-cart' },
    ],
    queryFn: ({ signal }) =>
      getInventory(
        {
          page: 1,
          pageSize: 500,
          issueable: true,
          ...(deferredSearch ? { search: deferredSearch } : {}),
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
  const blockQuery = useQuery({
    queryKey: ['asset-details', 'BLOCK'],
    queryFn: ({ signal }) => getAssetDetails('BLOCK', signal),
  });
  const locationQuery = useQuery({
    queryKey: ['asset-details', 'LOCATION'],
    queryFn: ({ signal }) => getAssetDetails('LOCATION', signal),
  });
  const labQuery = useQuery({
    queryKey: ['receivers', 'labs'],
    queryFn: ({ signal }) =>
      getReceivers({ page: 1, pageSize: 100, type: 'LAB', status: 'ACTIVE' }, signal),
    enabled: canIssueToLab,
  });
  const labs = labQuery.data?.data ?? [];
  const selectedLab = labs.find((lab) => lab.receiverCode === labCode) ?? null;
  const departments = departmentQuery.data ?? [];
  const storeNames = useMemo(
    () => (storeQuery.data ?? []).map((store) => store.name),
    [storeQuery.data],
  );
  const locationNames = useMemo(
    () => (locationQuery.data ?? []).map((location) => location.name),
    [locationQuery.data],
  );
  const blockNames = useMemo(
    () => (blockQuery.data ?? []).map((block) => block.name),
    [blockQuery.data],
  );
  const issueableMaterials = useMemo(
    () =>
      (inventoryQuery.data?.data ?? [])
        .filter((material) => isIssueableInventoryMaterial(material, '', storeNames))
        .sort(compareIssueableMaterials),
    [inventoryQuery.data?.data, storeNames],
  );
  const storeFilterOptions = useMemo(
    () =>
      storeNames.map((store) => ({
        value: store,
        label: store,
        count: issueableMaterials.filter((material) => matchesStoreSource(store, material)).length,
      })),
    [issueableMaterials, storeNames],
  );
  const storeScopedMaterials = useMemo(
    () =>
      issueableMaterials.filter(
        (material) => !storeFilter || matchesStoreSource(storeFilter, material),
      ),
    [issueableMaterials, storeFilter],
  );
  const typeCounts = useMemo(
    () => ({
      '': storeScopedMaterials.length,
      SERIALIZED: storeScopedMaterials.filter((material) => material.trackingMode === 'SERIALIZED')
        .length,
      QUANTITY: storeScopedMaterials.filter((material) => material.trackingMode === 'QUANTITY')
        .length,
    }),
    [storeScopedMaterials],
  );
  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          storeScopedMaterials
            .filter((material) => !typeFilter || material.trackingMode === typeFilter)
            .map((material) => material.category),
        ),
      ).sort((first, second) => first.localeCompare(second)),
    [storeScopedMaterials, typeFilter],
  );
  const pickableMaterials = useMemo(
    () =>
      storeScopedMaterials.filter(
        (material) =>
          (!typeFilter || material.trackingMode === typeFilter) &&
          (!categoryFilter || material.category === categoryFilter),
      ),
    [categoryFilter, storeScopedMaterials, typeFilter],
  );
  const selectedCodes = useMemo(() => new Set(lines.map((line) => line.materialCode)), [lines]);
  const materialByCode = useMemo(() => {
    const fresh = new Map(
      (inventoryQuery.data?.data ?? []).map((material) => [material.materialCode, material]),
    );
    const entries: Array<[string, Material]> = [];
    for (const line of lines) {
      const material = fresh.get(line.materialCode) ?? cartMaterials[line.materialCode];
      if (material) entries.push([line.materialCode, material]);
    }
    return new Map(entries);
  }, [cartMaterials, inventoryQuery.data?.data, lines]);
  const cartTotals = useMemo(() => summarizeCart(lines, materialByCode), [lines, materialByCode]);
  const inventoryTruncated =
    (inventoryQuery.data?.meta.total ?? 0) > (inventoryQuery.data?.data.length ?? 0);

  const mutation = useMutation({
    mutationFn: ({ input, key }: { input: CreateIssueRequest; key: string }) =>
      createIssue(input, key),
    onSuccess: async (response) => {
      setCreated(response.data.issue);
      window.scrollTo({ top: 0 });
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
    onError: (error) => {
      setMessage(
        isApiError(error)
          ? (firstIssueApiMessage(error.fields) ?? error.message)
          : 'The assignment could not be created.',
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // Stock may have changed while the cart was open; refresh availability shown in the cart.
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['asset-units'] });
    },
  });

  function toggleMaterial(material: Material) {
    setMessage(null);
    if (selectedCodes.has(material.materialCode)) {
      removeMaterial(material.materialCode);
      return;
    }
    if (lines.length >= MAX_ISSUE_LINES) {
      setMessage(`One issue can contain up to ${MAX_ISSUE_LINES} materials.`);
      return;
    }
    setLines((current) => [...current, cartLine(material.materialCode)]);
    setCartMaterials((current) => ({ ...current, [material.materialCode]: material }));
  }

  function removeMaterial(materialCode: string) {
    setLines((current) => current.filter((line) => line.materialCode !== materialCode));
  }

  function updateLine(next: LineDraft) {
    setLines((current) => current.map((line) => (line.id === next.id ? next : line)));
  }

  function resetPickList() {
    setVisibleCount(PICK_LIST_PAGE_SIZE);
  }

  function goToStep(next: IssueStep) {
    setMessage(null);
    if (next > 1 && lines.length === 0) {
      setMessage('Select at least one material to continue.');
      setStep(1);
    } else if (next === 3) {
      const stockIssue = firstStockIssue(lines, materialByCode);
      if (stockIssue) setMessage(stockIssue);
      else setStep(3);
    } else {
      setStep(next);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

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
      setStep(2);
      return null;
    }
    const toLab = issueTarget === 'LAB';
    const receiverIssue = toLab
      ? selectedLab
        ? null
        : 'Choose the lab that will receive this material.'
      : firstReceiverIssue(issuedTo);
    if (receiverIssue) {
      setMessage(receiverIssue);
      return null;
    }
    if (!issueLocation.trim()) {
      setMessage('Choose the issue location.');
      return null;
    }
    const effectiveAssignmentType: AssignmentType = assignmentType;
    const candidate = {
      mode: 'CATALOG' as const,
      assignmentType: effectiveAssignmentType,
      ...(toLab
        ? { issueTarget: 'LAB' as const, receiverCode: labCode }
        : {
            receiver: {
              fullName: issuedTo.fullName,
              ...(issuedTo.universityId.trim() ? { universityId: issuedTo.universityId } : {}),
              type: issuedTo.type,
              ...(issuedTo.department.trim() ? { department: issuedTo.department } : {}),
              ...(issuedTo.contact.trim() ? { contact: issuedTo.contact } : {}),
              ...(issuedTo.email.trim() ? { email: issuedTo.email } : {}),
            },
          }),
      destinationLocation: issueLocation,
      ...(issueBlock ? { destinationBlock: issueBlock } : {}),
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
      ...(outsideUniversity
        ? {
            outsideUniversity: {
              destination: gatePass.destination,
              ...(gatePass.organization.trim() ? { organization: gatePass.organization } : {}),
              personCarryingMaterial: gatePass.personCarryingMaterial,
              ...(gatePass.contact.trim() ? { contact: gatePass.contact } : {}),
              ...(gatePass.vehicleNumber.trim() ? { vehicleNumber: gatePass.vehicleNumber } : {}),
              ...(gatePass.expectedGateInAt
                ? { expectedGateInAt: new Date(gatePass.expectedGateInAt).toISOString() }
                : {}),
              ...(gatePass.remarks.trim() ? { remarks: gatePass.remarks } : {}),
            },
          }
        : {}),
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
    if (!input) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const submission = createPendingSubmission(input);
    mutation.mutate({ input: submission.input, key: submission.key });
  }

  if (created) {
    return (
      <div className="mx-auto max-w-3xl">
        <AppCard>
          <SuccessMark label="Assignment saved" />
          <h1 className="mt-4 text-2xl font-extrabold text-[var(--color-primary-strong)]">
            Material issued on one receipt
          </h1>
          <dl className="mt-5 divide-y divide-[var(--color-border)] rounded-[12px] border border-[var(--color-border)] px-4">
            <Summary label="Receipt / Issue No." value={created.issueId} />
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
            <Summary
              label="Materials"
              value={`${created.lines.length} material${created.lines.length === 1 ? '' : 's'} · ${created.totalIssuedQuantity} unit${created.totalIssuedQuantity === 1 ? '' : 's'}`}
            />
          </dl>
          <ul className="mt-4 space-y-2">
            {created.lines.map((line) => (
              <li
                className="flex items-center justify-between gap-3 rounded-[10px] bg-[var(--color-surface-tint)] px-3 py-2 text-sm"
                key={line.lineId}
              >
                <span className="min-w-0">
                  <strong className="block truncate text-[var(--color-text-strong)]">
                    {line.material.name}
                  </strong>
                  <span className="text-xs font-bold text-[var(--color-text-muted)]">
                    {line.material.category} · {line.material.materialCode}
                  </span>
                </span>
                <span className="shrink-0 font-extrabold text-[var(--color-primary-strong)]">
                  {line.issuedQuantity} {unitName(line.material, line.issuedQuantity)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link className="button-primary" to={`/bills/${created.issueId}`}>
              <Printer aria-hidden="true" size={18} />
              Print common receipt
            </Link>
            <Link className="button-secondary" to={`/issues/${created.issueId}`}>
              <ClipboardCheck aria-hidden="true" size={18} />
              View Assignment
            </Link>
            <Button onClick={() => window.location.reload()} variant="secondary">
              <PackagePlus aria-hidden="true" size={18} />
              New issue
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
        description="Select assets and consumables from any category or store, set quantities, and issue them together on one common receipt."
        title="Issue Material"
      />
      <AppCard className="issue-panel">
        <WorkflowSteps current={step} labels={issueSteps} />
      </AppCard>
      {message ? <ErrorSummary message={message} /> : null}

      {step === 1 ? (
        <>
          <AppCard className="issue-panel issue-control-panel">
            <div>
              <SectionTitle
                marker={<Search aria-hidden="true" size={16} />}
                title="Find material"
              />
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                Tick every material this person needs. You can mix IT Assets and IT Consumables from
                any category or store; your selection is kept while you change filters.
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_240px]">
              <label className="space-y-1.5">
                <span className="field-label">Search inventory</span>
                <span className="search-shell">
                  <Search aria-hidden="true" className="search-shell-icon" size={17} />
                  <input
                    className="field-input field-input-compact field-input-search"
                    onChange={(event) => {
                      setMaterialSearch(event.target.value);
                      resetPickList();
                    }}
                    placeholder="Search model, category, code"
                    value={materialSearch}
                  />
                </span>
              </label>
              <label className="space-y-1.5">
                <span className="field-label">Category</span>
                <select
                  className="field-input field-input-compact"
                  onChange={(event) => {
                    setCategoryFilter(event.target.value);
                    resetPickList();
                  }}
                  value={categoryFilter}
                >
                  <option value="">All categories</option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="field-label">Store</span>
                <select
                  className="field-input field-input-compact"
                  onChange={(event) => {
                    setStoreFilter(event.target.value);
                    setCategoryFilter('');
                    resetPickList();
                  }}
                  value={storeFilter}
                >
                  <option value="">All stores</option>
                  {storeFilterOptions.map((store) => (
                    <option key={store.value} value={store.value}>
                      {store.label} ({store.count})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div aria-label="Material type" className="issue-type-tabs" role="group">
              {typeTabs.map((tab) => (
                <button
                  aria-pressed={typeFilter === tab.value}
                  className="issue-type-tab"
                  key={tab.value || 'ALL'}
                  onClick={() => {
                    setTypeFilter(tab.value);
                    setCategoryFilter('');
                    resetPickList();
                  }}
                  type="button"
                >
                  {tab.label}
                  <em>{typeCounts[tab.value]}</em>
                </button>
              ))}
            </div>
          </AppCard>

          <AppCard className="issue-panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-extrabold text-[var(--color-text-strong)]">
                {pickableMaterials.length} material{pickableMaterials.length === 1 ? '' : 's'}{' '}
                available to issue
              </p>
              {lines.length ? (
                <p className="text-xs font-bold text-[var(--color-primary)]">
                  {lines.length} of {MAX_ISSUE_LINES} selected
                </p>
              ) : null}
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
            {!inventoryQuery.isPending &&
            !inventoryQuery.isError &&
            pickableMaterials.length === 0 ? (
              <p className="mt-4 rounded-[10px] bg-[var(--color-warning-soft)] px-3 py-2 text-sm font-bold text-[var(--color-warning)]">
                {storeNames.length === 0
                  ? 'No stores are configured. Add Store records from Asset details before issuing material.'
                  : 'No issueable material matches these filters. Clear the search or choose another type, category, or store.'}
              </p>
            ) : null}
            <ul className="issue-pick-list">
              {pickableMaterials.slice(0, visibleCount).map((material) => {
                const selected = selectedCodes.has(material.materialCode);
                return (
                  <PickRow
                    disabled={!selected && lines.length >= MAX_ISSUE_LINES}
                    key={material.materialCode}
                    material={material}
                    onToggle={() => toggleMaterial(material)}
                    selected={selected}
                  />
                );
              })}
            </ul>
            {pickableMaterials.length > visibleCount ? (
              <div className="mt-3 flex justify-center">
                <Button
                  onClick={() => setVisibleCount((current) => current + PICK_LIST_PAGE_SIZE)}
                  variant="secondary"
                >
                  Show more ({pickableMaterials.length - visibleCount} remaining)
                </Button>
              </div>
            ) : null}
            {inventoryTruncated ? (
              <p className="mt-3 text-xs font-bold text-[var(--color-text-muted)]">
                Showing the first {inventoryQuery.data?.data.length} inventory records. Use search
                to find other materials.
              </p>
            ) : null}
          </AppCard>

          <div aria-live="polite" className="issue-cart-bar">
            <div className="issue-cart-bar-summary">
              <ShoppingBasket aria-hidden="true" size={22} />
              <span>
                <strong>
                  {lines.length} material{lines.length === 1 ? '' : 's'} selected
                </strong>
                <small>
                  {cartTotals.assets} IT Asset{cartTotals.assets === 1 ? '' : 's'} ·{' '}
                  {cartTotals.consumables} IT Consumable{cartTotals.consumables === 1 ? '' : 's'}
                </small>
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {lines.length ? (
                <Button onClick={() => setLines([])} variant="quiet">
                  Clear
                </Button>
              ) : null}
              <Button disabled={!lines.length} onClick={() => goToStep(2)}>
                Add to Quantity
                <ArrowRight aria-hidden="true" size={18} />
              </Button>
            </div>
          </div>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <AppCard className="issue-panel">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle
                marker={<ListChecks aria-hidden="true" size={16} />}
                title="Add to quantity"
              />
              <Button onClick={() => goToStep(1)} variant="secondary">
                <Plus aria-hidden="true" size={17} />
                Add more materials
              </Button>
            </div>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Set how many of each material to issue. For IT Assets, also pick the serial numbers
              being handed over.
            </p>
            <CartTotals totals={cartTotals} />
            {lines.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  action={<Button onClick={() => goToStep(1)}>Select materials</Button>}
                  message="All materials were removed. Go back and select what you want to issue."
                  title="No materials selected"
                />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {lines.map((line, index) => (
                  <CartLineEditor
                    index={index}
                    key={line.id}
                    line={line}
                    material={materialByCode.get(line.materialCode) ?? null}
                    onChange={updateLine}
                    onRemove={() => removeMaterial(line.materialCode)}
                  />
                ))}
              </div>
            )}
          </AppCard>
          <StickyWorkflowActions>
            <Button onClick={() => goToStep(1)} variant="secondary">
              <ArrowLeft aria-hidden="true" size={18} />
              Back to selection
            </Button>
            <Button disabled={!lines.length} onClick={() => goToStep(3)}>
              Continue to issue details
              <ArrowRight aria-hidden="true" size={18} />
            </Button>
          </StickyWorkflowActions>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <AppCard className="issue-panel">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle
                marker={<ShoppingBasket aria-hidden="true" size={16} />}
                title="Materials in this issue"
              />
              <Button onClick={() => goToStep(2)} variant="quiet">
                <PencilLine aria-hidden="true" size={17} />
                Edit quantities
              </Button>
            </div>
            <CartSummaryTable lines={lines} materialByCode={materialByCode} />
          </AppCard>

          <AppCard className="issue-panel">
            <SectionTitle marker="1" title="Issued To" />
            {canIssueToLab ? (
              <div
                aria-label="Issue to"
                className="mt-3 grid grid-cols-2 gap-1.5 rounded-[12px] bg-[var(--color-surface-tint)] p-1"
                role="group"
              >
                {(
                  [
                    { value: 'PERSON', label: 'Person / department' },
                    { value: 'LAB', label: 'Lab' },
                  ] as const
                ).map((option) => (
                  <button
                    aria-pressed={issueTarget === option.value}
                    className={cn(
                      'search-segment',
                      issueTarget === option.value && 'search-segment-active',
                    )}
                    key={option.value}
                    onClick={() => {
                      setIssueTarget(option.value);
                      setMessage(null);
                    }}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
            {issueTarget === 'LAB' ? (
              <div className="mt-3 space-y-3">
                <label className="block space-y-1.5">
                  <span className="field-label">Lab</span>
                  <select
                    className="field-input field-input-compact"
                    onChange={(event) => {
                      const code = event.target.value;
                      setLabCode(code);
                      setMessage(null);
                      const lab = labs.find((item) => item.receiverCode === code);
                      // Labs are usually also a saved location, so pre-select it when names match.
                      const sameName = locationNames.find(
                        (name) => name.trim().toLowerCase() === lab?.fullName.trim().toLowerCase(),
                      );
                      if (sameName) setIssueLocation(sameName);
                    }}
                    value={labCode}
                  >
                    <option value="">
                      {labQuery.isPending ? 'Loading labs…' : 'Choose lab'}
                    </option>
                    {labs.map((lab) => (
                      <option key={lab.receiverCode} value={lab.receiverCode}>
                        {lab.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                {labQuery.isSuccess && labs.length === 0 ? (
                  <p className="text-sm font-semibold text-[var(--color-text-muted)]">
                    No labs are registered yet.{' '}
                    <Link className="font-extrabold text-[var(--color-primary)]" to="/receivers/new">
                      Register a lab
                    </Link>{' '}
                    with its in-charge first.
                  </p>
                ) : null}
                {selectedLab ? (
                  <dl className="grid gap-3 rounded-[12px] bg-[var(--color-surface-tint)] p-4 sm:grid-cols-3">
                    {[
                      ['Lab in-charge', selectedLab.inChargeName],
                      ['In-charge contact', selectedLab.inChargeContact],
                      ['In-charge email', selectedLab.inChargeEmail],
                    ].map(([label, value]) => (
                      <div className="min-w-0" key={label}>
                        <dt className="text-xs font-bold text-[var(--color-text-muted)]">{label}</dt>
                        <dd className="mt-1 break-words text-sm font-extrabold text-[var(--color-text-strong)]">
                          {value ?? '—'}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            ) : null}
            <div className={cn('mt-3 grid gap-3 sm:grid-cols-2', issueTarget === 'LAB' && 'hidden')}>
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
                    setIssuedTo((current) => ({
                      ...current,
                      type: event.target.value as ReceiverType,
                    }))
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
                onChange={(value) =>
                  setIssuedTo((current) => ({ ...current, universityId: value }))
                }
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
            <SectionTitle marker="2" title="Issue Location" />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="field-label">Block (optional)</span>
                <select
                  className="field-input field-input-compact"
                  onChange={(event) => {
                    setIssueBlock(event.target.value);
                    setMessage(null);
                  }}
                  value={issueBlock}
                >
                  <option value="">Choose block</option>
                  {blockNames.map((block) => (
                    <option key={block} value={block}>
                      {block}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="field-label">Location</span>
                <select
                  className="field-input field-input-compact"
                  onChange={(event) => {
                    setIssueLocation(event.target.value);
                    setMessage(null);
                  }}
                  value={issueLocation}
                >
                  <option value="">Choose location</option>
                  {locationNames.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </AppCard>

          <AppCard className="issue-panel">
            <SectionTitle marker="3" title="Issue duration" />
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
                  <p className="text-xs font-bold text-[var(--color-text-muted)]">
                    Expected return
                  </p>
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
                    <p className="text-xs font-bold text-[var(--color-text-muted)]">
                      Expected return
                    </p>
                    <p className="mt-1 text-sm font-extrabold text-[var(--color-primary-strong)]">
                      {formatIstDateTime(expectedReturn())}
                    </p>
                  </div>
                )}
              </div>
            ) : null}
            {cartTotals.consumables > 0 ? (
              <p className="mt-3 text-xs font-bold text-[var(--color-text-muted)]">
                Consumable materials issued permanently are deducted from stock; with “Return by
                date” they stay outstanding until returned.
              </p>
            ) : null}
          </AppCard>

          <AppCard className="issue-panel">
            <SectionTitle marker="4" title="Notes" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <TextArea label="Purpose" onChange={setPurpose} value={purpose} />
              <TextArea label="Notes" onChange={setNotes} value={notes} />
            </div>
          </AppCard>

          <AppCard className="issue-panel">
            <div className="flex items-start gap-3">
              <input
                checked={outsideUniversity}
                className="mt-1 size-5 accent-[var(--color-primary)]"
                id="outside-university"
                onChange={(event) => setOutsideUniversity(event.target.checked)}
                type="checkbox"
              />
              <label htmlFor="outside-university">
                <span className="block font-extrabold text-[var(--color-text-strong)]">
                  Material is leaving the university
                </span>
                <span className="mt-1 block text-sm text-[var(--color-text-muted)]">
                  Create a linked Gate Pass automatically when this assignment is submitted.
                </span>
              </label>
            </div>
            {outsideUniversity ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Destination"
                  onChange={(value) =>
                    setGatePass((current) => ({ ...current, destination: value }))
                  }
                  value={gatePass.destination}
                />
                <Field
                  label="Organization / vendor (optional)"
                  onChange={(value) =>
                    setGatePass((current) => ({ ...current, organization: value }))
                  }
                  value={gatePass.organization}
                />
                <Field
                  label="Person carrying material"
                  onChange={(value) =>
                    setGatePass((current) => ({ ...current, personCarryingMaterial: value }))
                  }
                  value={gatePass.personCarryingMaterial}
                />
                <Field
                  label="Contact (optional)"
                  onChange={(value) => setGatePass((current) => ({ ...current, contact: value }))}
                  value={gatePass.contact}
                />
                <Field
                  label="Vehicle number (optional)"
                  onChange={(value) =>
                    setGatePass((current) => ({ ...current, vehicleNumber: value }))
                  }
                  value={gatePass.vehicleNumber}
                />
                <Field
                  label="Expected Gate In (optional)"
                  onChange={(value) =>
                    setGatePass((current) => ({ ...current, expectedGateInAt: value }))
                  }
                  type="datetime-local"
                  value={gatePass.expectedGateInAt}
                />
                <div className="sm:col-span-2">
                  <TextArea
                    label="Gate Pass remarks (optional)"
                    onChange={(value) => setGatePass((current) => ({ ...current, remarks: value }))}
                    value={gatePass.remarks}
                  />
                </div>
              </div>
            ) : null}
          </AppCard>

          <StickyWorkflowActions>
            <Button disabled={mutation.isPending} onClick={() => goToStep(2)} variant="secondary">
              <ArrowLeft aria-hidden="true" size={18} />
              Back to quantities
            </Button>
            <Button loading={mutation.isPending} onClick={submit}>
              {mutation.isPending
                ? 'Issuing...'
                : `Issue ${lines.length} material${lines.length === 1 ? '' : 's'}`}
            </Button>
          </StickyWorkflowActions>
        </>
      ) : null}
    </div>
  );
}

function PickRow({
  material,
  selected,
  disabled,
  onToggle,
}: {
  material: Material;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <label
        className={cn(
          'issue-pick-row',
          selected && 'issue-pick-row-selected',
          disabled && 'issue-pick-row-disabled',
        )}
      >
        <input
          checked={selected}
          className="size-5 accent-[var(--color-primary)]"
          disabled={disabled}
          onChange={onToggle}
          type="checkbox"
        />
        <span className="min-w-0">
          <strong className="issue-pick-name">{material.name}</strong>
          <span className="issue-pick-meta">
            {material.category} · {material.materialCode}
          </span>
          <span className="issue-pick-meta">
            <MapPin aria-hidden="true" size={12} />
            {materialStoreLabel(material)}
          </span>
        </span>
        <span className="issue-pick-side">
          <TrackingBadge mode={material.trackingMode} />
          <em className="issue-pick-stock">
            {material.availableQuantity} {unitName(material, material.availableQuantity)}
          </em>
        </span>
      </label>
    </li>
  );
}

function CartLineEditor({
  line,
  index,
  material,
  onChange,
  onRemove,
}: {
  line: LineDraft;
  index: number;
  material: Material | null;
  onChange: (line: LineDraft) => void;
  onRemove: () => void;
}) {
  if (!material) return null;
  const availability = stockMessage(line, material);
  const serialized = material.trackingMode === 'SERIALIZED';

  return (
    <div className="issue-line-card">
      <div className="issue-cart-line-head">
        <span className="issue-cart-line-index">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-extrabold text-[var(--color-primary-strong)]">
            {material.name}
          </h3>
          <p className="mt-0.5 text-xs font-bold text-[var(--color-text-muted)]">
            {material.category} · {material.materialCode} · {materialStoreLabel(material)}
          </p>
        </div>
        <TrackingBadge mode={material.trackingMode} />
        <button
          aria-label={`Remove ${material.name}`}
          className="icon-button text-[var(--color-danger)]"
          onClick={onRemove}
          type="button"
        >
          <Trash2 aria-hidden="true" size={17} />
        </button>
      </div>
      <div
        className={cn(
          'mt-3 grid gap-4',
          serialized && 'lg:grid-cols-[minmax(200px,240px)_minmax(0,1fr)]',
        )}
      >
        <QuantityStepper
          available={material.availableQuantity}
          label={serialized ? 'IT Asset quantity' : `Quantity (${material.unitLabel ?? 'units'})`}
          onChange={(value) => {
            if (!serialized) {
              onChange({ ...line, quantity: value });
              return;
            }
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
          value={line.quantity}
        />
        {serialized ? (
          <SerializedPicker line={line} material={material} onChange={onChange} />
        ) : null}
      </div>
      {availability?.tone === 'warn' ? (
        <p
          className="mt-3 rounded-[10px] bg-[var(--color-danger-soft)] px-3 py-2 text-xs font-bold text-[var(--color-danger)]"
          role="alert"
        >
          {availability.text}
        </p>
      ) : null}
    </div>
  );
}

function QuantityStepper({
  label,
  value,
  available,
  onChange,
}: {
  label: string;
  value: string;
  available: number;
  onChange: (value: string) => void;
}) {
  const parsed = Number(value);
  const current = Number.isInteger(parsed) ? parsed : 0;
  return (
    <div className="space-y-1.5">
      <span className="field-label block">{label}</span>
      <div className="issue-stepper">
        <button
          aria-label={`Decrease ${label}`}
          disabled={current <= 1}
          onClick={() => onChange(String(Math.max(1, current - 1)))}
          type="button"
        >
          <Minus aria-hidden="true" size={16} />
        </button>
        <input
          aria-label={label}
          inputMode="numeric"
          onChange={(event) => onChange(event.target.value.replace(/\D/g, ''))}
          value={value}
        />
        <button
          aria-label={`Increase ${label}`}
          disabled={current >= available}
          onClick={() => onChange(String(Math.min(available, current + 1)))}
          type="button"
        >
          <Plus aria-hidden="true" size={16} />
        </button>
      </div>
      <p className="text-xs font-bold text-[var(--color-text-muted)]">{available} available</p>
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
  const required = Number.isInteger(quantity) && quantity > 0 ? quantity : 0;
  const complete = required > 0 && line.assetTags.length === required;

  function autoSelect() {
    const picked = [...line.assetTags];
    for (const unit of units) {
      if (picked.length >= required) break;
      if (!picked.includes(unit.assetTag)) picked.push(unit.assetTag);
    }
    onChange({ ...line, assetTags: picked });
  }

  return (
    <fieldset className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <legend className="field-label">Serial numbers</legend>
        <Button
          disabled={complete || required === 0 || units.length === 0}
          onClick={autoSelect}
          variant="quiet"
        >
          <WandSparkles aria-hidden="true" size={14} />
          Auto-select {required || ''}
        </Button>
      </div>
      <p
        className={cn(
          'text-xs font-bold',
          complete ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]',
        )}
        role="status"
      >
        Selected {line.assetTags.length} of {required}
      </p>
      <div className="max-h-52 space-y-1 overflow-y-auto rounded-[8px] border border-[var(--color-border)] p-2">
        {query.isPending ? (
          <p className="px-2 py-1 text-xs text-[var(--color-text-muted)]">
            Loading serial numbers...
          </p>
        ) : null}
        {query.isError ? (
          <p className="px-2 py-1 text-xs font-bold text-[var(--color-danger)]">
            Serial numbers could not be loaded.
          </p>
        ) : null}
        {!query.isPending && !query.isError && units.length === 0 ? (
          <p className="px-2 py-1 text-xs text-[var(--color-text-muted)]">
            No available serial numbers for this material.
          </p>
        ) : null}
        {units.map((unit: AssetUnit) => {
          const checked = line.assetTags.includes(unit.assetTag);
          const selectionFull = required > 0 && line.assetTags.length >= required;
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

function CartTotals({ totals }: { totals: CartSummary }) {
  return (
    <dl className="issue-cart-summary mt-4">
      <div>
        <dt>Materials</dt>
        <dd>{totals.lines}</dd>
      </div>
      <div>
        <dt>Total units</dt>
        <dd>{totals.units}</dd>
      </div>
      <div>
        <dt>IT Assets</dt>
        <dd>{totals.assets}</dd>
      </div>
      <div>
        <dt>IT Consumables</dt>
        <dd>{totals.consumables}</dd>
      </div>
    </dl>
  );
}

function CartSummaryTable({
  lines,
  materialByCode,
}: {
  lines: LineDraft[];
  materialByCode: Map<string, Material>;
}) {
  const totals = summarizeCart(lines, materialByCode);
  return (
    <div className="mt-4 overflow-x-auto rounded-[10px] border border-[var(--color-border)]">
      <table className="issue-cart-table">
        <thead>
          <tr>
            <th scope="col">S.No.</th>
            <th scope="col">Material</th>
            <th scope="col">Type</th>
            <th scope="col">Store</th>
            <th scope="col">Serial numbers</th>
            <th scope="col">Qty</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const material = materialByCode.get(line.materialCode);
            if (!material) return null;
            const quantity = Number(line.quantity);
            return (
              <tr key={line.id}>
                <td>{index + 1}</td>
                <td>
                  <strong className="block text-[var(--color-text-strong)]">{material.name}</strong>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {material.category} · {material.materialCode}
                  </span>
                </td>
                <td>
                  <TrackingBadge mode={material.trackingMode} />
                </td>
                <td>{materialStoreLabel(material)}</td>
                <td className="text-xs">
                  {material.trackingMode === 'SERIALIZED' ? line.assetTags.join(', ') : '—'}
                </td>
                <td className="whitespace-nowrap font-extrabold">
                  {line.quantity} {unitName(material, quantity)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5}>Total</td>
            <td>{totals.units}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function TrackingBadge({ mode }: { mode: TrackingMode }) {
  return (
    <span
      className={cn(
        'issue-type-badge',
        mode === 'SERIALIZED' ? 'issue-type-badge-asset' : 'issue-type-badge-consumable',
      )}
    >
      {mode === 'SERIALIZED' ? 'IT Asset' : 'IT Consumable'}
    </span>
  );
}

interface CartSummary {
  lines: number;
  units: number;
  assets: number;
  consumables: number;
}

export function summarizeCart(
  lines: LineDraft[],
  materialByCode: Map<string, Material>,
): CartSummary {
  return lines.reduce<CartSummary>(
    (total, line) => {
      const material = materialByCode.get(line.materialCode);
      const quantity = Number(line.quantity);
      return {
        lines: total.lines + 1,
        units: total.units + (Number.isInteger(quantity) && quantity > 0 ? quantity : 0),
        assets: total.assets + (material?.trackingMode === 'SERIALIZED' ? 1 : 0),
        consumables: total.consumables + (material?.trackingMode === 'QUANTITY' ? 1 : 0),
      };
    },
    { lines: 0, units: 0, assets: 0, consumables: 0 },
  );
}

export function firstStockIssue(
  lines: LineDraft[],
  materialByCode: Map<string, Material>,
): string | null {
  if (lines.length === 0) return 'Select at least one material to issue.';
  if (lines.length > MAX_ISSUE_LINES) {
    return `One issue can contain up to ${MAX_ISSUE_LINES} materials. Remove ${lines.length - MAX_ISSUE_LINES}.`;
  }
  const totalAssets = lines.reduce((total, line) => total + line.assetTags.length, 0);
  if (totalAssets > MAX_ISSUE_ASSETS) {
    return `One issue can contain up to ${MAX_ISSUE_ASSETS} IT Asset serial numbers. Split this issue into two.`;
  }
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
      return `${material.name} is out of stock. Remove it from this issue.`;
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
  if (path === 'receiver.contact')
    return 'Enter a valid receiver contact number with at least 5 digits.';
  if (path === 'receiver.email') return 'Enter a valid receiver email address.';
  if (path === 'lines') return 'Check the materials added to this issue.';
  if (path.startsWith('lines.')) {
    const lineIndex = Number(first.path[1]);
    const item = Number.isInteger(lineIndex) ? lineIndex + 1 : 1;
    return `Choose inventory material and serial numbers for item ${item}.`;
  }
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

function materialStoreLabel(material: Material): string {
  return material.store || inventoryStoreSourceLabel(material);
}

function unitName(
  material: Pick<Material, 'trackingMode' | 'unitLabel'>,
  quantity: number,
): string {
  if (material.trackingMode === 'QUANTITY') return material.unitLabel ?? 'units';
  return quantity === 1 ? 'unit' : 'units';
}

function compareIssueableMaterials(first: Material, second: Material): number {
  return (
    first.category.localeCompare(second.category) ||
    first.name.localeCompare(second.name) ||
    (first.location ?? '').localeCompare(second.location ?? '') ||
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
  const requested = Number(line.quantity);
  if (Number.isFinite(requested) && requested > material.availableQuantity) {
    return {
      tone: 'warn',
      text: `Only ${material.availableQuantity} IT ${material.availableQuantity === 1 ? 'Asset' : 'Assets'} available. Reduce quantity.`,
    };
  }
  return {
    tone: 'ok',
    text: `${material.availableQuantity} IT ${material.availableQuantity === 1 ? 'Asset' : 'Assets'} available. Select the required serial numbers.`,
  };
}

function SectionTitle({ marker, title }: { marker: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-8 place-items-center rounded-[9px] bg-[var(--color-primary)] text-sm font-extrabold text-white">
        {marker}
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
