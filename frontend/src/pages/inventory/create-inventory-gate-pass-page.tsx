import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Box,
  Check,
  CircleAlert,
  Minus,
  MonitorCog,
  PackagePlus,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
  Wrench,
} from 'lucide-react';
import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import type {
  InventoryGatePassAssetOption,
  InventoryGatePassMaterialCondition,
  InventoryGatePassMaterialOption,
} from '@assetdesk/contracts';

import {
  AppCard,
  Button,
  ErrorState,
  ErrorSummary,
  LoadingPanel,
  PageHeader,
  TextField,
} from '../../components/ui';
import {
  createInventoryGatePass,
  getInventoryGatePassAssetOptions,
  getInventoryGatePassMaterialOptions,
} from '../../lib/inventory-gate-pass-api';

type Purpose = 'REPAIR' | 'OTHER';
type MaterialType = 'SERIALIZED' | 'QUANTITY';
type ReturnRequirement = 'RETURNABLE' | 'NON_RETURNABLE';
type RepairConditionType = 'ANY' | 'UNDER_MAINTENANCE' | 'FAULTY' | 'NOT_WORKING' | 'DAMAGED';

interface DraftItem {
  key: string;
  trackingMode: MaterialType;
  materialCode: string;
  materialName: string;
  category: string;
  model: string | null;
  assetTag?: string;
  serialNumber?: string | null;
  quantity: number;
  maxAvailable: number;
  unitLabel: string | null;
  returnRequirement: ReturnRequirement;
  movementCondition?: InventoryGatePassMaterialCondition;
  faultDescription: string;
}

const assetStatusLabel: Record<InventoryGatePassAssetOption['status'], string> = {
  AVAILABLE: 'Available',
  RETURNED: 'Returned',
  UNDER_REPAIR: 'Under repair',
  DAMAGED: 'Damaged',
};
const movementConditionOptions: Array<{
  value: InventoryGatePassMaterialCondition;
  label: string;
}> = [
  { value: 'NOT_WORKING', label: 'Not working' },
  { value: 'FAULTY', label: 'Faulty' },
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'UNDER_REPAIR', label: 'Under repair' },
  { value: 'OTHER', label: 'Other' },
];
const movementConditionLabel = Object.fromEntries(
  movementConditionOptions.map((option) => [option.value, option.label]),
) as Record<InventoryGatePassMaterialCondition, string>;
const repairConditionOptions: Array<{ value: RepairConditionType; label: string }> = [
  { value: 'ANY', label: 'Any repair condition' },
  { value: 'UNDER_MAINTENANCE', label: 'Under maintenance' },
  { value: 'FAULTY', label: 'Faulty' },
  { value: 'NOT_WORKING', label: 'Not working' },
  { value: 'DAMAGED', label: 'Damaged' },
];

function FieldLabel({ children, optional = false }: { children: ReactNode; optional?: boolean }) {
  return (
    <span className="field-label flex items-center justify-between gap-2">
      <span>{children}</span>
      {optional ? (
        <span className="text-xs font-semibold text-[var(--color-text-muted)]">Optional</span>
      ) : null}
    </span>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Wrench;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-[var(--color-border)] pb-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
        <Icon size={20} />
      </span>
      <div>
        <h2 className="text-lg font-extrabold text-[var(--color-text-strong)]">{title}</h2>
        <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">{description}</p>
      </div>
    </div>
  );
}

function SegmentedButton({
  active,
  disabled = false,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  icon: typeof Wrench;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-extrabold transition ${
        active
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white shadow-sm'
          : 'border-[var(--color-border)] bg-white text-[var(--color-text-strong)] hover:border-[var(--color-primary-muted)]'
      } disabled:cursor-not-allowed disabled:opacity-50`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon size={17} /> {label}
    </button>
  );
}

export function CreateInventoryGatePassPage() {
  const navigate = useNavigate();
  const [purpose, setPurpose] = useState<Purpose>('REPAIR');
  const [materialType, setMaterialType] = useState<MaterialType>('SERIALIZED');
  const [materialPage, setMaterialPage] = useState(1);
  const [repairCondition, setRepairCondition] = useState<RepairConditionType>('ANY');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState<InventoryGatePassMaterialOption | null>(
    null,
  );
  const [assetSearch, setAssetSearch] = useState('');
  const [selectedAssets, setSelectedAssets] = useState<InventoryGatePassAssetOption[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [returnRequirement, setReturnRequirement] = useState<ReturnRequirement>('RETURNABLE');
  const [movementCondition, setMovementCondition] =
    useState<InventoryGatePassMaterialCondition>('NOT_WORKING');
  const [faultDescription, setFaultDescription] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [destination, setDestination] = useState('');
  const [organization, setOrganization] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [destinationContact, setDestinationContact] = useState('');
  const [carrier, setCarrier] = useState('');
  const [carrierContact, setCarrierContact] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [expectedGateInAt, setExpectedGateInAt] = useState('');
  const [remarks, setRemarks] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const deferredAssetSearch = useDeferredValue(assetSearch.trim());

  const materialsQuery = useQuery({
    queryKey: [
      'gate-pass-material-options',
      purpose,
      materialType,
      materialPage,
      repairCondition,
      category,
      deferredSearch,
    ],
    queryFn: ({ signal }) =>
      getInventoryGatePassMaterialOptions(
        {
          purpose,
          trackingMode: materialType,
          page: materialPage,
          pageSize: 20,
          ...(purpose === 'REPAIR' ? { conditionType: repairCondition } : {}),
          ...(category ? { category } : {}),
          ...(deferredSearch ? { search: deferredSearch } : {}),
        },
        signal,
      ),
  });
  const assetsQuery = useQuery({
    queryKey: [
      'gate-pass-asset-options',
      purpose,
      selectedMaterial?.materialCode,
      deferredAssetSearch,
      repairCondition,
    ],
    enabled: selectedMaterial?.trackingMode === 'SERIALIZED',
    queryFn: ({ signal }) =>
      getInventoryGatePassAssetOptions(
        selectedMaterial!.materialCode,
        {
          purpose,
          ...(purpose === 'REPAIR' ? { conditionType: repairCondition } : {}),
          ...(deferredAssetSearch ? { search: deferredAssetSearch } : {}),
        },
        signal,
      ),
  });

  const alreadyAddedQuantity = useMemo(
    () =>
      selectedMaterial
        ? items
            .filter((item) => item.materialCode === selectedMaterial.materialCode)
            .reduce((total, item) => total + item.quantity, 0)
        : 0,
    [items, selectedMaterial],
  );
  const remainingQuantity = selectedMaterial
    ? Math.max(0, selectedMaterial.availableQuantity - alreadyAddedQuantity)
    : 0;
  const totalUnits = items.reduce((total, item) => total + item.quantity, 0);

  function clearMaterialEditor() {
    setSelectedMaterial(null);
    setSelectedAssets([]);
    setAssetSearch('');
    setQuantity(1);
    setFaultDescription('');
  }

  function changeMaterialType(nextType: MaterialType) {
    setMaterialType(nextType);
    clearMaterialEditor();
    setCategory('');
    setSearch('');
    setMaterialPage(1);
  }

  function changePurpose(nextPurpose: Purpose) {
    if (nextPurpose === purpose || items.length) return;
    setPurpose(nextPurpose);
    setReturnRequirement('RETURNABLE');
    clearMaterialEditor();
  }

  function chooseMaterial(material: InventoryGatePassMaterialOption) {
    setSelectedMaterial(material);
    setSelectedAssets([]);
    setAssetSearch('');
    setQuantity(1);
    setFaultDescription('');
  }

  function toggleAsset(asset: InventoryGatePassAssetOption) {
    setSelectedAssets((current) =>
      current.some((entry) => entry.assetTag === asset.assetTag)
        ? current.filter((entry) => entry.assetTag !== asset.assetTag)
        : [...current, asset],
    );
  }

  function selectAllVisibleAssets() {
    const selectable = (assetsQuery.data?.data ?? []).filter(
      (asset) => !items.some((item) => item.assetTag === asset.assetTag),
    );
    setSelectedAssets((current) => [
      ...current,
      ...selectable.filter((asset) => !current.some((entry) => entry.assetTag === asset.assetTag)),
    ]);
  }

  const addError = useMemo(() => {
    if (!selectedMaterial) return 'Select a material first.';
    if (selectedMaterial.trackingMode === 'SERIALIZED' && !selectedAssets.length)
      return 'Select at least one asset.';
    if (
      selectedMaterial.trackingMode === 'QUANTITY' &&
      (!Number.isSafeInteger(quantity) || quantity < 1)
    )
      return 'Enter a valid whole quantity.';
    if (selectedMaterial.trackingMode === 'QUANTITY' && quantity > remainingQuantity)
      return `Only ${remainingQuantity} ${selectedMaterial.unitLabel ?? 'units'} remain available.`;
    if (purpose === 'REPAIR' && faultDescription.trim().length < 2)
      return 'Describe the fault or required repair work.';
    return null;
  }, [
    faultDescription,
    purpose,
    quantity,
    remainingQuantity,
    selectedAssets.length,
    selectedMaterial,
  ]);

  function addItems() {
    if (!selectedMaterial || addError) return;
    const common = {
      materialCode: selectedMaterial.materialCode,
      materialName: selectedMaterial.name,
      category: selectedMaterial.category,
      model: selectedMaterial.model,
      unitLabel: selectedMaterial.unitLabel,
      returnRequirement: (purpose === 'REPAIR' || selectedMaterial.trackingMode === 'SERIALIZED'
        ? 'RETURNABLE'
        : returnRequirement) as ReturnRequirement,
      ...(purpose === 'REPAIR' ? { movementCondition } : {}),
      faultDescription: faultDescription.trim(),
    };
    if (selectedMaterial.trackingMode === 'SERIALIZED') {
      setItems((current) => [
        ...current,
        ...selectedAssets.map((asset) => ({
          key: crypto.randomUUID(),
          trackingMode: 'SERIALIZED' as const,
          ...common,
          assetTag: asset.assetTag,
          serialNumber: asset.serialNumber,
          quantity: 1,
          maxAvailable: 1,
        })),
      ]);
      setSelectedAssets([]);
    } else {
      const existing = items.find(
        (item) =>
          item.trackingMode === 'QUANTITY' &&
          item.materialCode === selectedMaterial.materialCode &&
          item.returnRequirement === common.returnRequirement &&
          item.movementCondition === common.movementCondition &&
          item.faultDescription === common.faultDescription,
      );
      if (existing) {
        setItems((current) =>
          current.map((item) =>
            item.key === existing.key ? { ...item, quantity: item.quantity + quantity } : item,
          ),
        );
      } else {
        setItems((current) => [
          ...current,
          {
            key: crypto.randomUUID(),
            trackingMode: 'QUANTITY',
            ...common,
            quantity,
            maxAvailable: selectedMaterial.availableQuantity,
          },
        ]);
      }
      setQuantity(1);
    }
    setFaultDescription('');
  }

  function updateQuantity(item: DraftItem, requested: number) {
    const usedByOtherLines = items
      .filter((entry) => entry.key !== item.key && entry.materialCode === item.materialCode)
      .reduce((total, entry) => total + entry.quantity, 0);
    const maximum = Math.max(1, item.maxAvailable - usedByOtherLines);
    const next = Math.min(
      maximum,
      Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 1),
    );
    setItems((current) =>
      current.map((entry) => (entry.key === item.key ? { ...entry, quantity: next } : entry)),
    );
  }

  const formIssues = useMemo(() => {
    const issues: string[] = [];
    if (!destination.trim()) issues.push('Destination');
    if (!carrier.trim()) issues.push('Person carrying material');
    if (!items.length) issues.push('At least one material');
    return issues;
  }, [carrier, destination, items.length]);

  const mutation = useMutation({
    mutationFn: () =>
      createInventoryGatePass({
        purpose,
        destination: {
          name: destination.trim(),
          ...(organization.trim() ? { organization: organization.trim() } : {}),
          ...(destinationAddress.trim() ? { address: destinationAddress.trim() } : {}),
          ...(destinationContact.trim() ? { contact: destinationContact.trim() } : {}),
        },
        carrier: {
          name: carrier.trim(),
          ...(carrierContact.trim() ? { contact: carrierContact.trim() } : {}),
          ...(vehicleNumber.trim() ? { vehicleNumber: vehicleNumber.trim().toUpperCase() } : {}),
        },
        items: items.map((item) =>
          item.trackingMode === 'SERIALIZED'
            ? {
                trackingMode: 'SERIALIZED' as const,
                materialCode: item.materialCode,
                assetTag: item.assetTag!,
                returnRequirement: item.returnRequirement,
                ...(item.movementCondition ? { movementCondition: item.movementCondition } : {}),
                ...(item.faultDescription ? { faultDescription: item.faultDescription } : {}),
              }
            : {
                trackingMode: 'QUANTITY' as const,
                materialCode: item.materialCode,
                quantity: item.quantity,
                returnRequirement: item.returnRequirement,
                ...(item.movementCondition ? { movementCondition: item.movementCondition } : {}),
                ...(item.faultDescription ? { faultDescription: item.faultDescription } : {}),
              },
        ),
        ...(expectedGateInAt ? { expectedGateInAt: new Date(expectedGateInAt).toISOString() } : {}),
        ...(remarks.trim() ? { remarks: remarks.trim() } : {}),
      }),
    onSuccess: (pass) => navigate(`/inventory/gate-passes/${pass.gatePassNumber}`),
  });

  return (
    <div className="space-y-5 pb-24">
      <PageHeader
        title="Create Gate Pass Out"
        description="Record the movement, add one or more materials, and create a printable Gate Pass."
        actions={
          <Link className="button-secondary" to="/inventory/gate-passes/out">
            <ArrowLeft size={18} /> Back
          </Link>
        }
      />
      {mutation.isError ? <ErrorSummary message={(mutation.error as Error).message} /> : null}

      <AppCard className="space-y-5">
        <SectionHeading
          icon={Truck}
          title="Movement details"
          description="Required destination and carrier information for security verification."
        />
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div>
            <FieldLabel>Movement purpose *</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              <SegmentedButton
                active={purpose === 'REPAIR'}
                disabled={items.length > 0}
                icon={Wrench}
                label="Repair"
                onClick={() => changePurpose('REPAIR')}
              />
              <SegmentedButton
                active={purpose === 'OTHER'}
                disabled={items.length > 0}
                icon={Truck}
                label="Other"
                onClick={() => changePurpose('OTHER')}
              />
            </div>
            {items.length ? (
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                Remove added items to change purpose.
              </p>
            ) : null}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Destination *"
              onChange={(event) => setDestination(event.target.value)}
              placeholder="Service centre, office or campus"
              value={destination}
            />
            <TextField
              label="Person carrying material *"
              onChange={(event) => setCarrier(event.target.value)}
              placeholder="Full name"
              value={carrier}
            />
          </div>
        </div>
        <details className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-tint)] px-4 py-3">
          <summary className="cursor-pointer list-none text-sm font-extrabold text-[var(--color-primary)] [&::-webkit-details-marker]:hidden">
            Additional details{' '}
            <span className="font-semibold text-[var(--color-text-muted)]">(optional)</span>
          </summary>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <TextField
              label="Organization / vendor"
              onChange={(event) => setOrganization(event.target.value)}
              placeholder="Vendor or department"
              value={organization}
            />
            <TextField
              label="Destination contact"
              onChange={(event) => setDestinationContact(event.target.value)}
              placeholder="Phone or contact person"
              value={destinationContact}
            />
            <TextField
              label="Carrier contact"
              onChange={(event) => setCarrierContact(event.target.value)}
              placeholder="Phone number"
              value={carrierContact}
            />
            <TextField
              label="Vehicle number"
              onChange={(event) => setVehicleNumber(event.target.value)}
              placeholder="UK 07 AB 1234"
              value={vehicleNumber}
            />
            <label>
              <FieldLabel optional>Expected Gate In</FieldLabel>
              <input
                className="field-input w-full"
                onChange={(event) => setExpectedGateInAt(event.target.value)}
                type="datetime-local"
                value={expectedGateInAt}
              />
            </label>
            <TextField
              label="Destination address"
              onChange={(event) => setDestinationAddress(event.target.value)}
              placeholder="Complete address"
              value={destinationAddress}
            />
          </div>
        </details>
      </AppCard>

      <AppCard className="space-y-5">
        <SectionHeading
          icon={PackagePlus}
          title="Materials"
          description="Filter inventory, select multiple assets or set a consumable quantity, then review the final list."
        />
        <div className="grid gap-3 lg:grid-cols-[280px_minmax(260px,1fr)_220px]">
          <div className="grid grid-cols-2 gap-2">
            <SegmentedButton
              active={materialType === 'SERIALIZED'}
              icon={MonitorCog}
              label="IT Assets"
              onClick={() => changeMaterialType('SERIALIZED')}
            />
            <SegmentedButton
              active={materialType === 'QUANTITY'}
              icon={Box}
              label="IT Consumables"
              onClick={() => changeMaterialType('QUANTITY')}
            />
          </div>
          <label className="search-shell">
            <Search className="search-shell-icon" size={18} />
            <input
              className="field-input field-input-search w-full"
              onChange={(event) => {
                setSearch(event.target.value);
                setMaterialPage(1);
                clearMaterialEditor();
              }}
              placeholder="Search material name, code, category or model"
              value={search}
            />
          </label>
          <select
            aria-label="Filter by category"
            className="field-input w-full"
            onChange={(event) => {
              setCategory(event.target.value);
              setMaterialPage(1);
              clearMaterialEditor();
            }}
            value={category}
          >
            <option value="">All categories</option>
            {materialsQuery.data?.meta.categories.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
          {purpose === 'REPAIR' ? (
            <select
              aria-label="Filter repair condition"
              className="field-input w-full lg:col-span-3"
              onChange={(event) => {
                setRepairCondition(event.target.value as RepairConditionType);
                setMaterialPage(1);
                clearMaterialEditor();
              }}
              value={repairCondition}
            >
              {repairConditionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <div className="grid min-h-72 overflow-hidden rounded-xl border border-[var(--color-border)] lg:grid-cols-[minmax(280px,0.8fr)_minmax(420px,1.2fr)]">
          <div className="border-b border-[var(--color-border)] bg-white lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
              <strong className="text-sm">Available materials</strong>
              <span className="text-xs font-bold text-[var(--color-text-muted)]">
                {materialsQuery.data?.meta.total ?? 0} found
              </span>
            </div>
            {materialsQuery.isPending ? (
              <LoadingPanel label="Loading materials" />
            ) : materialsQuery.isError ? (
              <ErrorState
                message={(materialsQuery.error as Error).message}
                onRetry={() => void materialsQuery.refetch()}
              />
            ) : materialsQuery.data.data.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <CircleAlert className="mx-auto text-[var(--color-text-muted)]" />
                <p className="mt-2 font-extrabold">No material found</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Choose a repair condition or change the category/search.
                </p>
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {materialsQuery.data.data.map((material) => {
                  const active = selectedMaterial?.materialCode === material.materialCode;
                  return (
                    <button
                      aria-pressed={active}
                      className={`flex w-full items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3 text-left last:border-b-0 ${active ? 'bg-[var(--color-primary-soft)]' : 'hover:bg-[var(--color-surface-tint)]'}`}
                      key={material.materialCode}
                      onClick={() => chooseMaterial(material)}
                      type="button"
                    >
                      <span className="min-w-0">
                        <strong className="block truncate text-sm">{material.name}</strong>
                        <span className="mt-0.5 block truncate text-xs text-[var(--color-text-muted)]">
                          {material.materialCode} · {material.category}
                          {material.model ? ` · ${material.model}` : ''}
                        </span>
                      </span>
                      {active ? (
                        <Check className="shrink-0 text-[var(--color-primary)]" size={18} />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
            {materialsQuery.data && materialsQuery.data.meta.totalPages > 1 ? (
              <div className="flex items-center justify-between border-t border-[var(--color-border)] px-3 py-2">
                <button
                  className="rounded-md px-2 py-1 text-xs font-bold text-[var(--color-primary)] disabled:opacity-35"
                  disabled={materialPage <= 1}
                  onClick={() => {
                    setMaterialPage((current) => Math.max(1, current - 1));
                    clearMaterialEditor();
                  }}
                  type="button"
                >
                  Previous
                </button>
                <span className="text-xs text-[var(--color-text-muted)]">
                  Page {materialsQuery.data.meta.page} of {materialsQuery.data.meta.totalPages}
                </span>
                <button
                  className="rounded-md px-2 py-1 text-xs font-bold text-[var(--color-primary)] disabled:opacity-35"
                  disabled={materialPage >= materialsQuery.data.meta.totalPages}
                  onClick={() => {
                    setMaterialPage((current) => current + 1);
                    clearMaterialEditor();
                  }}
                  type="button"
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>

          <div className="bg-[var(--color-surface-tint)]/55 p-4 sm:p-5">
            {!selectedMaterial ? (
              <div className="grid h-full min-h-56 place-items-center text-center">
                <div>
                  <PackagePlus className="mx-auto text-[var(--color-text-muted)]" />
                  <p className="mt-3 font-extrabold">Select a material</p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    Its available assets or quantity controls will appear here.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-primary)]">
                      Adding to Gate Pass
                    </p>
                    <h3 className="mt-1 font-extrabold">{selectedMaterial.name}</h3>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {selectedMaterial.materialCode} · {selectedMaterial.category}
                    </p>
                  </div>
                  <button
                    className="text-sm font-bold text-[var(--color-primary)]"
                    onClick={clearMaterialEditor}
                    type="button"
                  >
                    Clear
                  </button>
                </div>

                {selectedMaterial.trackingMode === 'SERIALIZED' ? (
                  <div className="space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <label className="search-shell flex-1">
                        <Search className="search-shell-icon" size={18} />
                        <input
                          className="field-input field-input-search w-full"
                          onChange={(event) => setAssetSearch(event.target.value)}
                          placeholder="Search asset tag, serial or condition"
                          value={assetSearch}
                        />
                      </label>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs font-extrabold text-[var(--color-primary)]">
                          {selectedAssets.length} selected
                        </span>
                        <button
                          className="text-xs font-bold text-[var(--color-primary)] disabled:opacity-35"
                          disabled={!assetsQuery.data?.data.length}
                          onClick={selectAllVisibleAssets}
                          type="button"
                        >
                          Select visible
                        </button>
                        {selectedAssets.length ? (
                          <button
                            className="text-xs font-bold text-[var(--color-text-muted)]"
                            onClick={() => setSelectedAssets([])}
                            type="button"
                          >
                            Clear
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Select every asset required on this pass. Each selected asset adds one unit.
                    </p>
                    {assetsQuery.isPending ? (
                      <LoadingPanel label="Loading assets" />
                    ) : assetsQuery.isError ? (
                      <ErrorState
                        message={(assetsQuery.error as Error).message}
                        onRetry={() => void assetsQuery.refetch()}
                      />
                    ) : assetsQuery.data.data.length === 0 ? (
                      <p className="rounded-lg bg-white p-4 text-sm text-[var(--color-text-muted)]">
                        No eligible units remain for this material and repair filter. The material
                        must have serialized units that are not already on an active Gate Pass.
                      </p>
                    ) : (
                      <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
                        {assetsQuery.data.data.map((asset) => {
                          const selected = selectedAssets.some(
                            (entry) => entry.assetTag === asset.assetTag,
                          );
                          const added = items.some((item) => item.assetTag === asset.assetTag);
                          return (
                            <label
                              className={`flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-3 ${selected ? 'border-[var(--color-primary)] shadow-sm' : 'border-[var(--color-border)]'} ${added ? 'cursor-not-allowed opacity-45' : ''}`}
                              key={asset.assetTag}
                            >
                              <input
                                aria-label={`Select asset ${asset.assetTag}`}
                                checked={selected}
                                className="mt-0.5 size-4 accent-[var(--color-primary)]"
                                disabled={added}
                                onChange={() => toggleAsset(asset)}
                                type="checkbox"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center justify-between gap-2">
                                  <strong className="text-sm">{asset.assetTag}</strong>
                                  <span className="text-[10px] font-bold text-[var(--color-primary)]">
                                    {added ? 'Added' : assetStatusLabel[asset.status]}
                                  </span>
                                </span>
                                <span className="mt-1 block truncate text-xs text-[var(--color-text-muted)]">
                                  {asset.serialNumber ?? 'No serial'} · {asset.condition}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <FieldLabel>Quantity *</FieldLabel>
                    <div className="flex items-center gap-3">
                      <div className="inline-flex items-center overflow-hidden rounded-lg border border-[var(--color-border)] bg-white">
                        <button
                          aria-label="Decrease quantity"
                          className="grid size-11 place-items-center text-[var(--color-primary)] disabled:opacity-35"
                          disabled={quantity <= 1}
                          onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                          type="button"
                        >
                          <Minus size={17} />
                        </button>
                        <input
                          aria-label="Material quantity"
                          className="h-11 w-20 border-x border-[var(--color-border)] text-center font-extrabold outline-none"
                          max={remainingQuantity}
                          min={1}
                          onChange={(event) => setQuantity(Number(event.target.value))}
                          type="number"
                          value={quantity}
                        />
                        <button
                          aria-label="Increase quantity"
                          className="grid size-11 place-items-center text-[var(--color-primary)] disabled:opacity-35"
                          disabled={quantity >= remainingQuantity}
                          onClick={() =>
                            setQuantity((current) => Math.min(remainingQuantity, current + 1))
                          }
                          type="button"
                        >
                          <Plus size={17} />
                        </button>
                      </div>
                      <span className="text-sm text-[var(--color-text-muted)]">
                        {remainingQuantity} {selectedMaterial.unitLabel ?? 'units'} available
                      </span>
                    </div>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  {purpose === 'REPAIR' ? (
                    <label>
                      <FieldLabel>Condition / reason *</FieldLabel>
                      <select
                        className="field-input w-full"
                        onChange={(event) =>
                          setMovementCondition(
                            event.target.value as InventoryGatePassMaterialCondition,
                          )
                        }
                        value={movementCondition}
                      >
                        {movementConditionOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : selectedMaterial.trackingMode === 'QUANTITY' ? (
                    <label>
                      <FieldLabel>Return requirement *</FieldLabel>
                      <select
                        className="field-input w-full"
                        onChange={(event) =>
                          setReturnRequirement(event.target.value as ReturnRequirement)
                        }
                        value={returnRequirement}
                      >
                        <option value="RETURNABLE">Returnable</option>
                        <option value="NON_RETURNABLE">Non-returnable</option>
                      </select>
                    </label>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-[var(--color-primary)]">
                      <ShieldCheck size={18} />
                      Asset must return through Gate Pass In
                    </div>
                  )}
                  <label
                    className={
                      purpose === 'OTHER' && selectedMaterial.trackingMode === 'SERIALIZED'
                        ? 'md:col-span-2'
                        : ''
                    }
                  >
                    <FieldLabel optional={purpose !== 'REPAIR'}>
                      {purpose === 'REPAIR' ? 'Fault / repair work *' : 'Movement note'}
                    </FieldLabel>
                    <input
                      className="field-input w-full"
                      onChange={(event) => setFaultDescription(event.target.value)}
                      placeholder={
                        purpose === 'REPAIR'
                          ? 'Briefly describe the fault and required work'
                          : 'Optional item instructions'
                      }
                      value={faultDescription}
                    />
                  </label>
                </div>
                {addError &&
                ((selectedMaterial.trackingMode === 'SERIALIZED' && selectedAssets.length) ||
                  selectedMaterial.trackingMode === 'QUANTITY') ? (
                  <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-danger)]">
                    <CircleAlert size={16} />
                    {addError}
                  </p>
                ) : null}
                <Button disabled={Boolean(addError)} onClick={addItems} type="button">
                  <PackagePlus size={18} />
                  {selectedMaterial.trackingMode === 'SERIALIZED'
                    ? `Add ${selectedAssets.length || ''} asset${selectedAssets.length === 1 ? '' : 's'}`
                    : `Add ${quantity} ${selectedMaterial.unitLabel ?? 'units'}`}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-[var(--color-border)] pt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-extrabold">Added materials</h3>
              <p className="text-xs text-[var(--color-text-muted)]">
                {items.length} line{items.length === 1 ? '' : 's'} · {totalUnits} total unit
                {totalUnits === 1 ? '' : 's'}
              </p>
            </div>
            {items.length ? (
              <span className="rounded-full bg-[var(--color-success-soft)] px-3 py-1 text-xs font-extrabold text-[var(--color-success)]">
                Ready for review
              </span>
            ) : null}
          </div>
          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--color-border)] px-5 py-7 text-center text-sm text-[var(--color-text-muted)]">
              No material added yet. Select a material above to begin.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-[var(--color-surface-tint)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                  <tr>
                    <th className="px-4 py-3">Material</th>
                    <th className="px-4 py-3">Asset / details</th>
                    <th className="px-4 py-3">Condition</th>
                    <th className="px-4 py-3 text-center">Quantity</th>
                    <th className="w-16 px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {items.map((item) => (
                    <tr key={item.key}>
                      <td className="px-4 py-3">
                        <strong className="block">{item.materialName}</strong>
                        <span className="text-xs text-[var(--color-text-muted)]">
                          {item.materialCode} · {item.category}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block">
                          {item.assetTag ??
                            (item.returnRequirement === 'RETURNABLE'
                              ? 'Returnable'
                              : 'Non-returnable')}
                        </span>
                        <span className="block text-xs text-[var(--color-text-muted)]">
                          {item.serialNumber ?? item.unitLabel ?? '—'}
                        </span>
                        {item.faultDescription ? (
                          <span className="mt-1 block text-xs text-[var(--color-text-muted)]">
                            {item.faultDescription}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {item.movementCondition
                          ? movementConditionLabel[item.movementCondition]
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center">
                          {item.trackingMode === 'QUANTITY' ? (
                            <div className="inline-flex items-center overflow-hidden rounded-lg border border-[var(--color-border)]">
                              <button
                                aria-label={`Decrease ${item.materialName} quantity`}
                                className="grid size-8 place-items-center"
                                onClick={() => updateQuantity(item, item.quantity - 1)}
                                type="button"
                              >
                                <Minus size={14} />
                              </button>
                              <input
                                aria-label={`${item.materialName} quantity`}
                                className="h-8 w-14 border-x border-[var(--color-border)] text-center font-bold outline-none"
                                min={1}
                                onChange={(event) =>
                                  updateQuantity(item, Number(event.target.value))
                                }
                                type="number"
                                value={item.quantity}
                              />
                              <button
                                aria-label={`Increase ${item.materialName} quantity`}
                                className="grid size-8 place-items-center"
                                onClick={() => updateQuantity(item, item.quantity + 1)}
                                type="button"
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                          ) : (
                            <span className="font-extrabold">1</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          aria-label={`Remove ${item.materialName}${item.assetTag ? ` ${item.assetTag}` : ''}`}
                          className="grid size-8 place-items-center rounded-lg text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
                          onClick={() =>
                            setItems((current) => current.filter((entry) => entry.key !== item.key))
                          }
                          type="button"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <label>
          <FieldLabel optional>Overall Gate Pass remarks</FieldLabel>
          <textarea
            className="field-input min-h-20 w-full resize-y"
            onChange={(event) => setRemarks(event.target.value)}
            placeholder="Instructions for security, vendor, or receiving team"
            value={remarks}
          />
        </label>
      </AppCard>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-border)] bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:left-[72px]">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <div>
            <p className="font-extrabold">
              {totalUnits} unit{totalUnits === 1 ? '' : 's'} on Gate Pass
            </p>
            <p className="hidden text-xs text-[var(--color-text-muted)] sm:block">
              {formIssues.length
                ? `Required: ${formIssues.join(', ')}`
                : 'All required information is complete.'}
            </p>
          </div>
          <div className="flex gap-3">
            <Link className="button-secondary" to="/inventory/gate-passes/out">
              Cancel
            </Link>
            <Button
              disabled={formIssues.length > 0 || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Creating…' : 'Create Gate Pass Out'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
