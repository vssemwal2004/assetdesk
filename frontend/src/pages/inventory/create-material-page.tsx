import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  MonitorCog,
  Package,
  PackagePlus,
} from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';

import {
  CreateMaterialRequestSchema,
  type CreateMaterialRequest,
  type MaterialStatus,
  type ReturnPolicy,
  type TrackingMode,
} from '@assetdesk/contracts';

import { SelectField } from '../../components/catalog-ui';
import { AppCard, Button, ErrorSummary, PageHeader, TextField, cn } from '../../components/ui';
import { isApiError } from '../../lib/api-client';
import { createMaterial, getAssetDetails, getInventoryModels } from '../../lib/inventory-api';
import { inventoryStatusLabel } from '../../lib/inventory-status';
import {
  inventoryModelOptions,
  materialRequestName,
  resolveCatalogOption,
} from './inventory-form-utils';
import { MaterialCategoryField } from './material-category-field';

export interface MaterialForm {
  name: string;
  category: string;
  typeModelName: string;
  configuration: string;
  location: string;
  block: string;
  department: string;
  vendorName: string;
  description: string;
  trackingMode: TrackingMode;
  returnPolicy: ReturnPolicy;
  status: Exclude<MaterialStatus, 'ARCHIVED'>;
  totalQuantity: string;
  unitLabel: string;
  serialNumbers: string[];
}

const initialForm: MaterialForm = {
  name: '',
  category: '',
  typeModelName: '',
  configuration: '',
  location: '',
  block: '',
  department: '',
  vendorName: '',
  description: '',
  trackingMode: 'SERIALIZED',
  returnPolicy: 'REUSABLE',
  status: 'ACTIVE',
  totalQuantity: '1',
  unitLabel: 'units',
  serialNumbers: [''],
};

function firstIssueMessage(error: unknown): string {
  const fallback = 'Check the material details before saving.';
  if (!error || typeof error !== 'object' || !('issues' in error)) return fallback;
  const issues = (error as { issues?: Array<{ message?: string }> }).issues;
  return issues?.[0]?.message ?? fallback;
}

function normalizedSerialNumbers(values: string[]): string[] {
  return values.map((serialNumber) => serialNumber.trim());
}

export function serialFieldsForQuantity(current: string[], rawQuantity: string): string[] {
  const quantity = Number(rawQuantity);
  return Number.isInteger(quantity) && quantity > 0 && quantity <= 1000
    ? Array.from({ length: quantity }, (_, index) => current[index] ?? '')
    : current;
}

function materialFormMessage(form: MaterialForm): string | null {
  if (form.category.trim().length < 2) return 'Choose an asset type, or add a new asset type.';
  if (form.typeModelName.trim().length < 2)
    return 'Enter a type/model name with at least 2 characters.';
  if (form.trackingMode === 'SERIALIZED' && !form.configuration.trim())
    return 'Enter the IT Asset configuration.';
  if (form.location.trim().length < 1) return 'Choose a location from Add asset details.';
  if (form.block.trim().length < 1) return 'Choose a block from Add asset details.';
  if (form.trackingMode === 'SERIALIZED') {
    const quantity = Number(form.totalQuantity);
    const serialNumbers = normalizedSerialNumbers(form.serialNumbers);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return 'Enter the number of IT Assets being registered.';
    }
    if (quantity > 1000) return 'Register 1000 or fewer IT Assets at one time.';
    if (serialNumbers.length !== quantity || serialNumbers.some((serialNumber) => !serialNumber))
      return `Enter one serial number for each of the ${quantity} IT Assets.`;
    const uniqueSerials = new Set(
      serialNumbers.map((serialNumber) => serialNumber.toLocaleUpperCase('en-US')),
    );
    if (uniqueSerials.size !== serialNumbers.length) return 'Serial numbers must be unique.';
  }
  if (form.trackingMode === 'QUANTITY' && form.unitLabel.trim().length < 1) {
    return 'Enter a unit label, for example units, boxes, meters, or pieces.';
  }
  if (form.trackingMode === 'QUANTITY') {
    const quantity = Number(form.totalQuantity);
    if (!form.totalQuantity.trim() || !Number.isInteger(quantity) || quantity < 0) {
      return 'Enter an initial quantity of zero or more.';
    }
    if (quantity > 1_000_000_000) {
      return 'Initial quantity cannot exceed 1,000,000,000.';
    }
  }
  return null;
}

function MaterialTypeCard({
  title,
  description,
  icon,
  active,
  disabled,
  onClick,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        'group relative flex min-h-32 items-start gap-4 rounded-[10px] border bg-white p-4 text-left shadow-sm transition',
        'hover:-translate-y-0.5 hover:border-[var(--color-primary)] hover:shadow-[var(--shadow-card)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
        active &&
          'border-[var(--color-primary)] bg-[var(--color-primary-soft)] shadow-[var(--shadow-card)]',
        disabled && 'cursor-not-allowed opacity-70 hover:translate-y-0 hover:shadow-sm',
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-[10px] bg-[var(--color-surface-tint)] text-[var(--color-primary)] transition',
          active && 'bg-white text-[var(--color-primary-strong)]',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-extrabold text-[var(--color-primary-strong)]">{title}</span>
        <span className="mt-1 block text-sm leading-6 text-[var(--color-text-muted)]">
          {description}
        </span>
      </span>
      {active ? (
        <CheckCircle2
          aria-hidden="true"
          className="absolute right-4 top-4 text-[var(--color-primary)]"
          size={20}
        />
      ) : null}
    </button>
  );
}

export function buildCreateMaterialDraft(
  form: MaterialForm,
  selectedModelName = form.typeModelName,
): unknown {
  const base = {
    name: materialRequestName(form.category, selectedModelName),
    category: form.category,
    typeModelName: selectedModelName,
    location: form.location,
    block: form.block,
    ...(form.department.trim() ? { department: form.department } : {}),
    ...(form.vendorName.trim() ? { vendorName: form.vendorName } : {}),
    ...(form.description.trim() ? { description: form.description } : {}),
    status: form.status,
    assignmentTypes:
      form.trackingMode === 'SERIALIZED' ? (['LONG_TERM'] as const) : (['SHORT_TERM'] as const),
  };

  return form.trackingMode === 'SERIALIZED'
    ? {
        ...base,
        trackingMode: 'SERIALIZED',
        returnPolicy: 'REUSABLE',
        configuration: form.configuration,
        serialNumbers: normalizedSerialNumbers(form.serialNumbers),
      }
    : {
        ...base,
        trackingMode: 'QUANTITY',
        returnPolicy: form.returnPolicy,
        totalQuantity: Number(form.totalQuantity),
        unitLabel: form.unitLabel,
      };
}

export function CreateMaterialPage() {
  const navigate = useNavigate();
  const [parameters] = useSearchParams();
  const categoryPreset = Boolean(parameters.get('category'));
  const modePreset = Boolean(parameters.get('trackingMode'));
  const queryClient = useQueryClient();
  const [form, setForm] = useState<MaterialForm>(() => {
    const requestedMode = parameters.get('trackingMode');
    const trackingMode: TrackingMode = requestedMode === 'QUANTITY' ? 'QUANTITY' : 'SERIALIZED';
    return {
      ...initialForm,
      category: parameters.get('category')?.trim() ?? '',
      typeModelName: parameters.get('typeModelName')?.trim() ?? '',
      trackingMode,
      returnPolicy: trackingMode === 'QUANTITY' ? 'CONSUMABLE' : 'REUSABLE',
    };
  });
  const [materialTypeSelected, setMaterialTypeSelected] = useState(modePreset || categoryPreset);
  const [message, setMessage] = useState<string | null>(null);
  const detailsQuery = useQuery({
    queryKey: ['asset-details'],
    queryFn: ({ signal }) => getAssetDetails(undefined, signal),
  });
  const locations = detailsQuery.data?.filter((detail) => detail.kind === 'LOCATION') ?? [];
  const blocks = detailsQuery.data?.filter((detail) => detail.kind === 'BLOCK') ?? [];
  const departments = detailsQuery.data?.filter((detail) => detail.kind === 'DEPARTMENT') ?? [];
  const modelsQuery = useQuery({
    queryKey: ['inventory-models', form.category, form.trackingMode],
    queryFn: ({ signal }) => getInventoryModels(form.category, form.trackingMode, signal),
    enabled: Boolean(form.category),
  });
  const categoryKind = form.trackingMode === 'SERIALIZED' ? 'ASSET_TYPE' : 'CONSUMABLE_TYPE';
  const cachedModelNames =
    detailsQuery.data?.find(
      (detail) =>
        detail.kind === categoryKind &&
        detail.name.toLocaleUpperCase('en-US') === form.category.toLocaleUpperCase('en-US'),
    )?.models ?? [];
  const modelOptions = inventoryModelOptions(
    modelsQuery.data ?? [],
    cachedModelNames,
    form.typeModelName,
  );
  const selectedModelName = resolveCatalogOption(form.typeModelName, modelOptions);

  const mutation = useMutation({
    mutationFn: (input: CreateMaterialRequest) => createMaterial(input),
    onSuccess: async (material) => {
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
      navigate(`/inventory/${material.materialCode}`, {
        replace: true,
        state: { notice: `${material.name} was added to Inventory.` },
      });
    },
    onError: (error) => {
      setMessage(isApiError(error) ? error.message : 'The material could not be added.');
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const formMessage = materialFormMessage(form);
    if (formMessage) {
      setMessage(formMessage);
      return;
    }

    const result = CreateMaterialRequestSchema.safeParse(
      buildCreateMaterialDraft(form, selectedModelName),
    );
    if (!result.success) {
      setMessage(firstIssueMessage(result.error));
      return;
    }
    mutation.mutate(result.data);
  }

  function setTrackingMode(value: TrackingMode) {
    setMaterialTypeSelected(true);
    setForm((current) => ({
      ...current,
      category: '',
      typeModelName: '',
      name: '',
      trackingMode: value,
      returnPolicy: value === 'SERIALIZED' ? 'REUSABLE' : 'CONSUMABLE',
      totalQuantity: '1',
      serialNumbers: [''],
    }));
  }

  function setAssetQuantity(rawQuantity: string) {
    setForm((current) => ({
      ...current,
      totalQuantity: rawQuantity,
      serialNumbers: serialFieldsForQuantity(current.serialNumbers, rawQuantity),
    }));
  }

  function setSerialNumber(index: number, serialNumber: string) {
    setForm((current) => ({
      ...current,
      serialNumbers: current.serialNumbers.map((value, currentIndex) =>
        currentIndex === index ? serialNumber : value,
      ),
    }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Link className="button-quiet" to="/inventory">
            <ArrowLeft aria-hidden="true" size={18} />
            Back to Inventory
          </Link>
        }
        description="Create IT Assets or IT Consumables by asset type, model, and stock details."
        title="Add material"
      />

      <AppCard className="max-w-7xl">
        <div className="mb-5 grid grid-cols-2 gap-2">
          <Button type="button">
            <PackagePlus aria-hidden="true" size={18} />
            Individual
          </Button>
          <Button
            onClick={() => void navigate('/inventory/import')}
            type="button"
            variant="secondary"
          >
            <FileSpreadsheet aria-hidden="true" size={18} />
            Bulk upload
          </Button>
        </div>
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
            <PackagePlus aria-hidden="true" size={22} />
          </span>
          <div>
            <h2 className="font-extrabold text-[var(--color-primary-strong)]">Inventory setup</h2>
            <p className="text-sm leading-6 text-[var(--color-text-muted)]">
              Choose IT Assets for serialized stock, or IT Consumables for quantity stock.
            </p>
          </div>
        </div>
        {message ? <ErrorSummary message={message} /> : null}

        <form className="mt-5 space-y-5" noValidate onSubmit={submit}>
          <section className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-tint)] p-3 sm:p-4">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--color-primary)]">
                  Inventory layer
                </p>
                <h3 className="font-extrabold text-[var(--color-primary-strong)]">
                  Select inventory type
                </h3>
              </div>
              <p className="text-sm font-semibold text-[var(--color-text-muted)]">
                Categories will match the selected type.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <MaterialTypeCard
                active={materialTypeSelected && form.trackingMode === 'SERIALIZED'}
                description="Serialized devices and equipment such as CPU, laptop, printer, UPS, or monitor."
                disabled={modePreset}
                icon={<MonitorCog aria-hidden="true" size={22} />}
                onClick={() => setTrackingMode('SERIALIZED')}
                title="IT Asset"
              />
              <MaterialTypeCard
                active={materialTypeSelected && form.trackingMode === 'QUANTITY'}
                description="Quantity stock such as cable, cartridge, connector, lead, adapter, or stationery item."
                disabled={modePreset}
                icon={<Package aria-hidden="true" size={22} />}
                onClick={() => setTrackingMode('QUANTITY')}
                title="IT Consumable"
              />
            </div>
          </section>

          {materialTypeSelected ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <SelectField
                  disabled={form.trackingMode === 'SERIALIZED'}
                  {...(form.trackingMode === 'SERIALIZED'
                    ? { hint: 'IT Assets are always reusable.' }
                    : {})}
                  id="material-return-policy"
                  label="Return policy"
                  onChange={(value) =>
                    setForm((current) => ({ ...current, returnPolicy: value as ReturnPolicy }))
                  }
                  value={form.returnPolicy}
                >
                  <option value="REUSABLE">Reusable</option>
                  <option value="CONSUMABLE">Consumable</option>
                </SelectField>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <MaterialCategoryField
                  disabled={categoryPreset}
                  id="material-category"
                  onChange={(category) =>
                    setForm((value) => ({ ...value, category, typeModelName: '', name: '' }))
                  }
                  trackingMode={form.trackingMode}
                  value={form.category}
                />
                <SelectField
                  disabled={!form.category || (modelsQuery.isPending && modelOptions.length === 0)}
                  hint={
                    modelsQuery.isError
                      ? cachedModelNames.length > 0
                        ? 'Showing the last Model Master values saved with this category.'
                        : 'Models could not be loaded. Refresh the page or check Model Master.'
                      : form.category && !modelsQuery.isPending && modelOptions.length === 0
                        ? 'No models are registered for this category and material type.'
                        : undefined
                  }
                  id="material-model"
                  label="Model"
                  onChange={(typeModelName) =>
                    setForm((value) => ({ ...value, typeModelName, name: typeModelName }))
                  }
                  value={selectedModelName}
                >
                  <option value="">
                    {!form.category
                      ? 'Choose category first'
                      : modelsQuery.isPending && modelOptions.length === 0
                        ? 'Loading registered models…'
                        : 'Choose registered model'}
                  </option>
                  {modelOptions.map((modelName) => (
                    <option key={modelName.toLocaleUpperCase('en-US')} value={modelName}>
                      {modelName}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  id="material-location"
                  label="Location"
                  onChange={(location) => setForm((value) => ({ ...value, location }))}
                  value={form.location}
                >
                  <option value="">Choose location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.name}>
                      {location.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  id="material-block"
                  label="Block"
                  onChange={(block) => setForm((value) => ({ ...value, block }))}
                  value={form.block}
                >
                  <option value="">Choose block</option>
                  {blocks.map((block) => (
                    <option key={block.id} value={block.name}>
                      {block.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  id="material-department"
                  label="Department"
                  onChange={(department) => setForm((value) => ({ ...value, department }))}
                  value={form.department}
                >
                  <option value="">Choose department (optional)</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.name}>
                      {department.name}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  label="Vendor name (optional)"
                  maxLength={120}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, vendorName: event.target.value }))
                  }
                  value={form.vendorName}
                />
                {form.trackingMode === 'SERIALIZED' ? (
                  <TextField
                    label="Configuration"
                    maxLength={1000}
                    onChange={(event) =>
                      setForm((value) => ({ ...value, configuration: event.target.value }))
                    }
                    required
                    value={form.configuration}
                  />
                ) : null}
              </div>

              <div className="space-y-1.5">
                <label className="field-label" htmlFor="material-description">
                  Description{' '}
                  <span className="font-medium text-[var(--color-text-muted)]">(optional)</span>
                </label>
                <textarea
                  className="field-input min-h-24 resize-y"
                  id="material-description"
                  maxLength={1000}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, description: event.target.value }))
                  }
                  value={form.description}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <SelectField
                  id="material-status"
                  label="Inventory status"
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      status: value as Exclude<MaterialStatus, 'ARCHIVED'>,
                    }))
                  }
                  value={form.status}
                >
                  <option value="ACTIVE">{inventoryStatusLabel('ACTIVE')}</option>
                  <option value="UNDER_MAINTENANCE">
                    {inventoryStatusLabel('UNDER_MAINTENANCE')}
                  </option>
                  <option value="SCRAP">{inventoryStatusLabel('SCRAP')}</option>
                  <option value="NOT_IN_USE">{inventoryStatusLabel('NOT_IN_USE')}</option>
                </SelectField>
              </div>

              {form.trackingMode === 'QUANTITY' ? (
                <div className="grid gap-4 md:grid-cols-3">
                  <TextField
                    inputMode="numeric"
                    label="Initial quantity"
                    min="0"
                    onChange={(event) =>
                      setForm((value) => ({ ...value, totalQuantity: event.target.value }))
                    }
                    required
                    step="1"
                    type="number"
                    value={form.totalQuantity}
                  />
                  <TextField
                    label="Unit label"
                    onChange={(event) =>
                      setForm((value) => ({ ...value, unitLabel: event.target.value }))
                    }
                    placeholder="items, meters, boxes"
                    required
                    value={form.unitLabel}
                  />
                </div>
              ) : null}

              {form.trackingMode === 'SERIALIZED' ? (
                <div className="space-y-4">
                  <TextField
                    hint="Each IT Asset must have one unique serial number."
                    inputMode="numeric"
                    label="Quantity"
                    min="1"
                    onChange={(event) => setAssetQuantity(event.target.value)}
                    required
                    step="1"
                    type="number"
                    value={form.totalQuantity}
                  />
                  <div className="space-y-3">
                    <div>
                      <h3 className="field-label">Serial numbers</h3>
                      <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
                        Enter the unique serial number printed on each individual IT Asset.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {form.serialNumbers.map((serialNumber, index) => (
                        <TextField
                          key={index}
                          label={`Asset ${index + 1} serial number`}
                          maxLength={120}
                          onChange={(event) => setSerialNumber(index, event.target.value)}
                          placeholder={`Serial number ${index + 1}`}
                          required
                          value={serialNumber}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Link className="button-secondary" to="/inventory">
                  Cancel
                </Link>
                <Button loading={mutation.isPending} type="submit">
                  {mutation.isPending ? 'Adding material...' : 'Add material'}
                </Button>
              </div>
            </>
          ) : null}
        </form>
      </AppCard>
    </div>
  );
}
