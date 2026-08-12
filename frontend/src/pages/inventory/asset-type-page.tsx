import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Database,
  Download,
  FileSpreadsheet,
  Layers3,
  ListFilter,
  PackagePlus,
  PackageSearch,
  Pencil,
  MoreVertical,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router';

import type { AssetDetail, AssetDetailKind } from '@assetdesk/contracts';

import { useAuth } from '../../auth/auth-context';
import { hasPermission } from '../../auth/permissions';
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
  commitAssetTypeImport,
  createAssetDetail,
  createAssetType,
  createInventoryModel,
  deleteAssetDetail,
  getAssetDetails,
  getInventoryModels,
  importInventoryModels,
  previewAssetTypeImport,
  syncInventoryModels,
  updateAssetDetail,
  type AssetTypeImportPreviewResponse,
  type AssetTypeImportResponse,
} from '../../lib/inventory-api';
import { isApiError } from '../../lib/api-client';
import {
  inventoryCategoryOptions,
  inventoryModelOptions,
  resolveCatalogOption,
} from './inventory-form-utils';

type Mode = 'individual' | 'bulk';
type AddWorkspace = 'REFERENCE' | 'MODELS';

const detailLabels: Record<AssetDetailKind, string> = {
  ASSET_TYPE: 'IT Asset',
  CONSUMABLE_TYPE: 'IT Consumable',
  LOCATION: 'Location',
  BLOCK: 'Block',
  STORE: 'Store',
  DEPARTMENT: 'Department',
};

const detailDescriptions: Record<AssetDetailKind, string> = {
  ASSET_TYPE: 'A serialized hardware category such as CPU, Laptop or Printer.',
  CONSUMABLE_TYPE: 'A quantity-based category such as Cable, Cartridge or Connector.',
  LOCATION: 'A reusable physical site or room used when recording inventory.',
  BLOCK: 'A building or campus block used to group locations.',
  STORE: 'A controlled inventory store that can issue available stock.',
  DEPARTMENT: 'An organizational department that owns or uses inventory.',
};

const detailPlaceholders: Record<AssetDetailKind, string> = {
  ASSET_TYPE: 'Example: Desktop computers',
  CONSUMABLE_TYPE: 'Example: Printer cartridges',
  LOCATION: 'Example: Computer Centre',
  BLOCK: 'Example: A Block',
  STORE: 'Example: Param Centre Store',
  DEPARTMENT: 'Example: IT Department',
};

const detailTemplates: Record<AssetDetailKind, { fileName: string; csv: string }> = {
  ASSET_TYPE: {
    fileName: 'assetdesk-it-asset-types-template.csv',
    csv: 'IT Asset\r\nComputer\r\nPrinter\r\nUPS\r\n',
  },
  CONSUMABLE_TYPE: {
    fileName: 'assetdesk-it-consumables-template.csv',
    csv: 'IT Consumable\r\nCable\r\nLead\r\nCartridge\r\n',
  },
  LOCATION: {
    fileName: 'assetdesk-locations-template.csv',
    csv: 'Location\r\nComputer Centre\r\nStore Room\r\nElectrical Room\r\n',
  },
  BLOCK: {
    fileName: 'assetdesk-blocks-template.csv',
    csv: 'Block\r\nA Block\r\nB Block\r\nC Block\r\n',
  },
  STORE: {
    fileName: 'assetdesk-stores-template.csv',
    csv: 'Store\r\nParam Centre Store\r\nAryabhatt Store\r\n',
  },
  DEPARTMENT: {
    fileName: 'assetdesk-departments-template.csv',
    csv: 'Department\r\nComputer Centre\r\nIT Department\r\nElectrical Department\r\n',
  },
};

function detailLabel(value: string | undefined): string {
  return value === 'LOCATION' ||
    value === 'BLOCK' ||
    value === 'STORE' ||
    value === 'ASSET_TYPE' ||
    value === 'CONSUMABLE_TYPE' ||
    value === 'DEPARTMENT'
    ? detailLabels[value]
    : 'IT Asset';
}

export function AssetTypePage() {
  const { user } = useAuth();
  const location = useLocation();
  const viewOnly = location.pathname.endsWith('/view');
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const modelFileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('individual');
  const [addWorkspace, setAddWorkspace] = useState<AddWorkspace>('REFERENCE');
  const [kind, setKind] = useState<AssetDetailKind>('ASSET_TYPE');
  const [bulkKind, setBulkKind] = useState<AssetDetailKind>('ASSET_TYPE');
  const [name, setName] = useState('');
  const [storeLocation, setStoreLocation] = useState('');
  const [storeBlock, setStoreBlock] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsSuccess, setMessageIsSuccess] = useState(false);
  const [savedSearch, setSavedSearch] = useState('');
  const [savedKind, setSavedKind] = useState<AssetDetailKind | 'ALL'>('ALL');
  const [directoryPage, setDirectoryPage] = useState(1);
  const [preview, setPreview] = useState<AssetTypeImportPreviewResponse['data'] | null>(null);
  const [result, setResult] = useState<AssetTypeImportResponse['data'] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AssetDetail | null>(null);
  const [editTarget, setEditTarget] = useState<AssetDetail | null>(null);
  const [editName, setEditName] = useState('');
  const [modelCategory, setModelCategory] = useState('');
  const [modelName, setModelName] = useState('');
  const [modelMode, setModelMode] = useState<Mode>('individual');
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [modelImportResult, setModelImportResult] = useState<{
    created: Array<{ rowNumber: number; category: string; name: string }>;
    failed: Array<{ rowNumber: number; category: string; name: string; reason: string }>;
  } | null>(null);
  const [modelTrackingMode, setModelTrackingMode] = useState<'SERIALIZED' | 'QUANTITY'>(
    'SERIALIZED',
  );
  const canAddAssetTypes = hasPermission(user, 'ASSET_TYPES_ADD');
  const canAddModels = hasPermission(user, 'INVENTORY_MODELS_ADD');
  const canDeleteAssetTypes = hasPermission(user, 'ASSET_TYPES_DELETE');
  const query = useQuery({
    queryKey: ['asset-details'],
    queryFn: ({ signal }) => getAssetDetails(undefined, signal),
  });
  const masterModelsQuery = useQuery({
    queryKey: ['inventory-models', 'model-master', modelTrackingMode],
    queryFn: ({ signal }) => getInventoryModels(undefined, modelTrackingMode, signal),
    enabled: !viewOnly && addWorkspace === 'MODELS',
  });
  const filteredDetails = useMemo(
    () =>
      (query.data ?? [])
        .filter((detail) => savedKind === 'ALL' || detail.kind === savedKind)
        .filter((detail) =>
          detail.name.toLocaleLowerCase().includes(savedSearch.trim().toLocaleLowerCase()),
        ),
    [query.data, savedKind, savedSearch],
  );
  const savedLocations = useMemo(
    () => (query.data ?? []).filter((detail) => detail.kind === 'LOCATION'),
    [query.data],
  );
  const savedBlocks = useMemo(
    () => (query.data ?? []).filter((detail) => detail.kind === 'BLOCK'),
    [query.data],
  );
  const directoryPageSize = 60;
  const directoryPages = Math.max(1, Math.ceil(filteredDetails.length / directoryPageSize));
  const effectiveDirectoryPage = Math.min(directoryPage, directoryPages);
  const visibleDetails = filteredDetails.slice(
    (effectiveDirectoryPage - 1) * directoryPageSize,
    effectiveDirectoryPage * directoryPageSize,
  );
  const directoryOverview = useMemo(() => {
    const details = query.data ?? [];
    return {
      total: details.length,
      assets: details.filter((detail) => detail.kind === 'ASSET_TYPE').length,
      consumables: details.filter((detail) => detail.kind === 'CONSUMABLE_TYPE').length,
      references: details.filter((detail) =>
        ['LOCATION', 'BLOCK', 'STORE', 'DEPARTMENT'].includes(detail.kind),
      ).length,
      models: details.reduce((count, detail) => count + (detail.models?.length ?? 0), 0),
    };
  }, [query.data]);
  const categoryKind = modelTrackingMode === 'SERIALIZED' ? 'ASSET_TYPE' : 'CONSUMABLE_TYPE';
  const cachedModels =
    query.data?.find(
      (detail) =>
        detail.kind === categoryKind &&
        detail.name.toLocaleUpperCase('en-US') === modelCategory.toLocaleUpperCase('en-US'),
    )?.models ?? [];
  const modelCategories = inventoryCategoryOptions(
    query.data ?? [],
    masterModelsQuery.data ?? [],
    modelTrackingMode,
    modelCategory,
  );
  const selectedModelCategory = resolveCatalogOption(modelCategory, modelCategories);
  const registeredModels = inventoryModelOptions(
    (masterModelsQuery.data ?? []).filter(
      (model) =>
        model.category.toLocaleUpperCase('en-US') ===
        selectedModelCategory.toLocaleUpperCase('en-US'),
    ),
    cachedModels,
  );
  const modelMutation = useMutation({
    mutationFn: () =>
      createInventoryModel({
        category: selectedModelCategory,
        name: modelName,
        trackingMode: modelTrackingMode,
      }),
    onSuccess: async (model) => {
      setModelName('');
      setMessageIsSuccess(true);
      setMessage(`${model.name} added under ${model.category}.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory-models'] }),
        queryClient.invalidateQueries({ queryKey: ['asset-details'] }),
      ]);
    },
    onError: (error) => {
      setMessageIsSuccess(false);
      setMessage(isApiError(error) ? error.message : 'The model could not be added.');
    },
  });
  const syncModelsMutation = useMutation({
    mutationFn: syncInventoryModels,
    onSuccess: async (syncResult) => {
      setMessageIsSuccess(true);
      setMessage(
        `${syncResult.discovered} inventory models found; ${syncResult.added} added to Model Master. ${syncResult.total} models are now registered.`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory-models'] }),
        queryClient.invalidateQueries({ queryKey: ['asset-details'] }),
      ]);
    },
    onError: (error) => {
      setMessageIsSuccess(false);
      setMessage(isApiError(error) ? error.message : 'Inventory models could not be synchronized.');
    },
  });
  const modelImportMutation = useMutation({
    mutationFn: () => importInventoryModels(modelFile!, modelTrackingMode),
    onSuccess: async (importResult) => {
      setModelImportResult(importResult);
      setMessageIsSuccess(importResult.failed.length === 0);
      setMessage(
        `${importResult.created.length} models added; ${importResult.failed.length} rows failed.`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory-models'] }),
        queryClient.invalidateQueries({ queryKey: ['asset-details'] }),
      ]);
    },
    onError: (error) => {
      setMessageIsSuccess(false);
      setMessage(isApiError(error) ? error.message : 'The model sheet could not be uploaded.');
    },
  });

  const createMutation = useMutation({
    mutationFn: ({ detailKind, detailName }: { detailKind: AssetDetailKind; detailName: string }) =>
      createAssetDetail(detailKind, detailName),
    onSuccess: async (detail) => {
      if (detail.kind === 'ASSET_TYPE' || detail.kind === 'CONSUMABLE_TYPE')
        await createAssetType(detail.name);
      setName('');
      setStoreLocation('');
      setStoreBlock('');
      setMessageIsSuccess(true);
      setMessage(`${detail.name} saved as ${detailLabels[detail.kind]}.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['asset-types'] }),
        queryClient.invalidateQueries({ queryKey: ['asset-details'] }),
      ]);
    },
    onError: (error) => {
      setMessageIsSuccess(false);
      setMessage(isApiError(error) ? error.message : 'The asset detail could not be saved.');
    },
  });

  const previewMutation = useMutation({
    mutationFn: ({ upload, detailKind }: { upload: File; detailKind: AssetDetailKind }) =>
      previewAssetTypeImport(upload, detailKind),
    onSuccess: (importPreview) => {
      setPreview(importPreview);
    },
    onError: (error) => {
      setMessageIsSuccess(false);
      setMessage(
        isApiError(error) ? error.message : 'The asset type sheet could not be validated.',
      );
    },
  });

  const commitMutation = useMutation({
    mutationFn: (importId: string) => commitAssetTypeImport(importId),
    onSuccess: async (importResult) => {
      setMessageIsSuccess(true);
      setMessage(
        `${importResult.created.length} asset detail${importResult.created.length === 1 ? '' : 's'} uploaded successfully.`,
      );
      setResult(importResult);
      setPreview(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['asset-types'] }),
        queryClient.invalidateQueries({ queryKey: ['asset-details'] }),
      ]);
    },
    onError: (error) => {
      setMessageIsSuccess(false);
      setMessage(isApiError(error) ? error.message : 'The asset type sheet could not be uploaded.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (assetDetail: AssetDetail) => deleteAssetDetail(assetDetail.id),
    onSuccess: async () => {
      setDeleteTarget(null);
      setMessageIsSuccess(true);
      setMessage('Asset detail deleted.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['asset-types'] }),
        queryClient.invalidateQueries({ queryKey: ['asset-details'] }),
      ]);
    },
    onError: (error) => {
      setMessageIsSuccess(false);
      setMessage(isApiError(error) ? error.message : 'The asset type could not be deleted.');
    },
  });
  const editMutation = useMutation({
    mutationFn: () => updateAssetDetail(editTarget?.id ?? '', editName.trim()),
    onSuccess: async (detail) => {
      setEditTarget(null);
      setEditName('');
      setMessageIsSuccess(true);
      setMessage(`${detail.name} updated successfully.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['asset-types'] }),
        queryClient.invalidateQueries({ queryKey: ['asset-details'] }),
      ]);
    },
    onError: (error) => {
      setMessageIsSuccess(false);
      setMessage(isApiError(error) ? error.message : 'The detail could not be updated.');
    },
  });

  function submitIndividual(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setMessageIsSuccess(false);
    setResult(null);
    setPreview(null);
    const trimmed =
      kind === 'STORE' ? [storeLocation, storeBlock].filter(Boolean).join(' / ') : name.trim();
    if (trimmed.length < 1) return setMessage('Enter a name.');
    if (kind === 'STORE' && (!storeLocation || !storeBlock)) {
      return setMessage('Choose a location and block for the store.');
    }
    createMutation.mutate({ detailKind: kind, detailName: trimmed });
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    setMessage(null);
    setMessageIsSuccess(false);
    setResult(null);
    const selected = event.target.files?.[0] ?? null;
    if (!selected) return setFile(null);
    const extension = selected.name.split('.').pop()?.toLowerCase();
    if (!extension || !['csv', 'xlsx'].includes(extension)) {
      event.target.value = '';
      setFile(null);
      return setMessage('Choose a CSV or XLSX file.');
    }
    if (selected.size > 5 * 1024 * 1024) {
      event.target.value = '';
      setFile(null);
      return setMessage('Choose a file no larger than 5 MB.');
    }
    setFile(selected);
  }

  function submitBulk(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setMessageIsSuccess(false);
    setResult(null);
    if (!file) {
      setMessage('Choose a CSV or XLSX file first.');
      return fileInput.current?.focus();
    }
    previewMutation.mutate({ upload: file, detailKind: bulkKind });
  }

  function commitBulk() {
    if (!preview || preview.validRows === 0) return;
    commitMutation.mutate(preview.importId);
  }

  function downloadTemplate() {
    const template = detailTemplates[bulkKind];
    const url = URL.createObjectURL(
      new Blob(['\uFEFF', template.csv], { type: 'text/csv;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = template.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadModelTemplate() {
    const categoryLabel = modelTrackingMode === 'SERIALIZED' ? 'IT Asset' : 'IT Consumable';
    const csv = `Category,Model Name\r\n${categoryLabel === 'IT Asset' ? 'CPU,Dell OptiPlex 7010\r\nPrinter,HP LaserJet Pro' : 'Cartridge,HP 05A\r\nCable,USB-C Cable'}`;
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download =
      modelTrackingMode === 'SERIALIZED'
        ? 'assetdesk-it-asset-models-template.csv'
        : 'assetdesk-it-consumable-models-template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function chooseModelFile(event: ChangeEvent<HTMLInputElement>) {
    setModelImportResult(null);
    setMessage(null);
    const selected = event.target.files?.[0] ?? null;
    const extension = selected?.name.split('.').pop()?.toLocaleLowerCase('en-US');
    if (selected && (!extension || !['csv', 'xlsx'].includes(extension))) {
      event.target.value = '';
      setModelFile(null);
      return setMessage('Choose a CSV or XLSX model file.');
    }
    if (selected && selected.size > 5 * 1024 * 1024) {
      event.target.value = '';
      setModelFile(null);
      return setMessage('Choose a model file no larger than 5 MB.');
    }
    setModelFile(selected);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!viewOnly ? (
              <Link className="button-secondary" to="/inventory/asset-types/view">
                <PackageSearch aria-hidden="true" size={18} />
                View directory
              </Link>
            ) : (
              <Link className="button-secondary" to="/inventory/asset-types/add">
                <PackagePlus aria-hidden="true" size={18} />
                Add asset types
              </Link>
            )}
            <Link className="button-quiet" to="/inventory">
              <ArrowLeft aria-hidden="true" size={18} />
              Inventory
            </Link>
          </div>
        }
        description={
          viewOnly
            ? 'Search, filter, edit, and delete controlled inventory values.'
            : 'Add categories, models, locations, blocks, and departments.'
        }
        title={viewOnly ? 'View asset types' : 'Add asset types'}
      />

      {message ? (
        messageIsSuccess ? (
          <div
            className="rounded-[12px] border border-emerald-200 bg-[var(--color-success-soft)] p-4 text-[var(--color-success)]"
            role="status"
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 aria-hidden="true" className="shrink-0" size={20} />
              <p className="font-bold">{message}</p>
            </div>
          </div>
        ) : (
          <ErrorSummary message={message} title="Asset details" />
        )
      ) : null}

      {!viewOnly ? (
        <section className="mx-auto max-w-5xl overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)]">
          <div className="border-b border-[var(--color-border)] bg-[linear-gradient(135deg,var(--color-primary-soft),white_65%)] px-5 py-5 sm:px-7">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[var(--color-primary)]">
              Setup workspace
            </p>
            <h2 className="mt-1 text-xl font-extrabold text-[var(--color-primary-strong)]">
              What would you like to add?
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-muted)]">
              Create the category or reference value first. Then register its allowed models.
            </p>
          </div>
          <nav aria-label="Asset setup sections" className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            <button
              aria-current={addWorkspace === 'REFERENCE' ? 'page' : undefined}
              className={`group flex min-h-28 items-start gap-4 rounded-[12px] border p-4 text-left transition ${
                addWorkspace === 'REFERENCE'
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] shadow-sm'
                  : 'border-[var(--color-border)] bg-white hover:border-[var(--color-primary-border)] hover:bg-[var(--color-surface-tint)]'
              }`}
              onClick={() => {
                setAddWorkspace('REFERENCE');
                setMessage(null);
              }}
              type="button"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-white text-[var(--color-primary)] shadow-sm">
                <Layers3 aria-hidden="true" size={21} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-primary)]">
                  Step 1
                </span>
                <span className="mt-1 block font-extrabold text-[var(--color-text-strong)]">
                  Categories & reference data
                </span>
                <span className="mt-1 block text-sm font-medium text-[var(--color-text-muted)]">
                  Asset types, consumables, locations, blocks and departments
                </span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="mt-2 shrink-0 text-[var(--color-primary)] transition group-hover:translate-x-0.5"
                size={19}
              />
            </button>
            <button
              aria-current={addWorkspace === 'MODELS' ? 'page' : undefined}
              className={`group flex min-h-28 items-start gap-4 rounded-[12px] border p-4 text-left transition ${
                addWorkspace === 'MODELS'
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] shadow-sm'
                  : 'border-[var(--color-border)] bg-white hover:border-[var(--color-primary-border)] hover:bg-[var(--color-surface-tint)]'
              } ${!canAddModels ? 'cursor-not-allowed opacity-60' : ''}`}
              disabled={!canAddModels}
              onClick={() => {
                setAddWorkspace('MODELS');
                setMessage(null);
              }}
              type="button"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-white text-[var(--color-primary)] shadow-sm">
                <Database aria-hidden="true" size={21} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-primary)]">
                  Step 2
                </span>
                <span className="mt-1 block font-extrabold text-[var(--color-text-strong)]">
                  Registered models
                </span>
                <span className="mt-1 block text-sm font-medium text-[var(--color-text-muted)]">
                  Control which model names can be used in inventory
                </span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="mt-2 shrink-0 text-[var(--color-primary)] transition group-hover:translate-x-0.5"
                size={19}
              />
            </button>
          </nav>
        </section>
      ) : null}

      {canAddModels && !viewOnly && addWorkspace === 'MODELS' ? (
        <AppCard className="mx-auto max-w-5xl">
          <div className="mb-5 flex flex-col gap-4 border-b border-[var(--color-border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                <Database aria-hidden="true" size={20} />
              </span>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--color-primary)]">
                  Model master
                </p>
                <h2 className="mt-1 text-xl font-extrabold text-[var(--color-primary-strong)]">
                  Add registered model
                </h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Choose a category first, then save the official model name. Materials and bulk
                  uploads can only use registered models.
                </p>
              </div>
            </div>
            {user?.role === 'ADMIN' ? (
              <Button
                className="shrink-0"
                loading={syncModelsMutation.isPending}
                onClick={() => syncModelsMutation.mutate()}
                type="button"
                variant="secondary"
              >
                <RefreshCw aria-hidden="true" size={17} />
                Sync all models from inventory
              </Button>
            ) : null}
          </div>
          <div className="mb-5 inline-flex rounded-[10px] bg-[var(--color-surface-tint)] p-1">
            <button
              className={`flex min-h-10 items-center gap-2 rounded-[8px] px-4 text-sm font-bold transition ${modelMode === 'individual' ? 'bg-white text-[var(--color-primary-strong)] shadow-sm' : 'text-[var(--color-text-muted)] hover:text-[var(--color-primary)]'}`}
              onClick={() => {
                setModelMode('individual');
                setModelImportResult(null);
                setMessage(null);
              }}
              type="button"
            >
              <PackagePlus aria-hidden="true" size={18} />
              Individual
            </button>
            <button
              className={`flex min-h-10 items-center gap-2 rounded-[8px] px-4 text-sm font-bold transition ${modelMode === 'bulk' ? 'bg-white text-[var(--color-primary-strong)] shadow-sm' : 'text-[var(--color-text-muted)] hover:text-[var(--color-primary)]'}`}
              onClick={() => {
                setModelMode('bulk');
                setMessage(null);
              }}
              type="button"
            >
              <FileSpreadsheet aria-hidden="true" size={18} />
              Bulk upload
            </button>
          </div>
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-end">
            <div>
              <label className="field-label" htmlFor="model-material-type">
                Model type
              </label>
              <select
                className="field-input mt-1.5"
                id="model-material-type"
                onChange={(event) => {
                  setModelTrackingMode(event.target.value as 'SERIALIZED' | 'QUANTITY');
                  setModelCategory('');
                  setModelName('');
                  setModelImportResult(null);
                }}
                value={modelTrackingMode}
              >
                <option value="SERIALIZED">IT Asset</option>
                <option value="QUANTITY">IT Consumable</option>
              </select>
            </div>
            {modelMode === 'bulk' ? (
              <Button onClick={downloadModelTemplate} type="button" variant="secondary">
                <Download aria-hidden="true" size={18} />
                Download accepted template
              </Button>
            ) : null}
          </div>
          {modelMode === 'individual' ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-end">
              <div className="min-w-0">
                <label className="field-label" htmlFor="model-category">
                  Category
                </label>
                <select
                  className="field-input mt-1.5"
                  id="model-category"
                  onChange={(event) => setModelCategory(event.target.value)}
                  value={selectedModelCategory}
                >
                  <option value="">Choose category</option>
                  {modelCategories.map((category) => (
                    <option key={category.toLocaleUpperCase('en-US')} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <label className="field-label" htmlFor="registered-models">
                  Registered models
                </label>
                <select
                  className="field-input mt-1.5"
                  disabled={!modelCategory}
                  id="registered-models"
                  value=""
                  onChange={() => undefined}
                >
                  <option value="">
                    {!modelCategory
                      ? 'Choose category first'
                      : `${registeredModels.length} models in this category`}
                  </option>
                  {registeredModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <TextField
                  autoComplete="off"
                  label="New model name"
                  maxLength={120}
                  onChange={(event) => setModelName(event.target.value)}
                  placeholder="Enter official model name"
                  value={modelName}
                />
              </div>
              <Button
                className="lg:justify-self-end"
                disabled={!modelCategory || modelName.trim().length < 2}
                loading={modelMutation.isPending}
                onClick={() => modelMutation.mutate()}
                type="button"
              >
                Add model
              </Button>
            </div>
          ) : (
            <div className="mt-4 rounded-[10px] border border-[var(--color-border)] p-4">
              <p className="font-bold text-[var(--color-text-strong)]">
                Upload multiple {modelTrackingMode === 'SERIALIZED' ? 'IT Asset' : 'IT Consumable'}{' '}
                models
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Required columns: Category and Model Name. Categories must already exist in the
                Categories & reference data section. CSV/XLSX, maximum 1,000 rows and 5 MB.
              </p>
              <label className="mt-4 block cursor-pointer rounded-[12px] border-2 border-dashed border-[var(--color-primary-border)] bg-[var(--color-surface-tint)] px-5 py-7 text-center transition hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]">
                <Upload
                  aria-hidden="true"
                  className="mx-auto text-[var(--color-primary)]"
                  size={24}
                />
                <span className="mt-2 block font-bold text-[var(--color-text-strong)]">
                  {modelFile ? modelFile.name : 'Choose a model sheet'}
                </span>
                <span className="mt-1 block text-xs font-semibold text-[var(--color-text-muted)]">
                  CSV or XLSX · maximum 5 MB
                </span>
                <input
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  onChange={chooseModelFile}
                  ref={modelFileInput}
                  type="file"
                />
              </label>
              <div className="mt-4 flex justify-end">
                <Button
                  disabled={!modelFile}
                  loading={modelImportMutation.isPending}
                  onClick={() => modelImportMutation.mutate()}
                  type="button"
                >
                  <Upload aria-hidden="true" size={18} />
                  Upload models
                </Button>
              </div>
              {modelImportResult?.failed.length ? (
                <div className="mt-4 max-h-56 overflow-auto rounded-[8px] border border-[var(--color-border)]">
                  {modelImportResult.failed.map((row) => (
                    <p
                      className="border-b border-[var(--color-border)] p-3 text-sm text-[var(--color-danger)]"
                      key={`${row.rowNumber}-${row.category}-${row.name}`}
                    >
                      Row {row.rowNumber}: {row.category || 'Missing category'} /{' '}
                      {row.name || 'Missing model'} — {row.reason}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          )}
          {modelMode === 'individual' && modelCategory ? (
            <p className="mt-3 text-xs font-semibold text-[var(--color-text-muted)]">
              {registeredModels.length} registered models in {modelCategory}. Duplicate names are
              blocked automatically.
            </p>
          ) : null}
        </AppCard>
      ) : null}

      {viewOnly && !query.isPending && !query.isError ? (
        <section
          aria-label="Asset detail summary"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
        >
          {[
            ['Total records', directoryOverview.total],
            ['IT asset types', directoryOverview.assets],
            ['IT consumables', directoryOverview.consumables],
            ['Reference values', directoryOverview.references],
            ['Registered models', directoryOverview.models],
          ].map(([label, count]) => (
            <AppCard className="p-4" key={label}>
              <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                {label}
              </p>
              <p className="mt-1 text-2xl font-extrabold text-[var(--color-primary-strong)]">
                {Number(count).toLocaleString('en-IN')}
              </p>
            </AppCard>
          ))}
        </section>
      ) : null}

      <div className={viewOnly ? 'block' : 'mx-auto max-w-5xl'}>
        {!viewOnly && addWorkspace === 'REFERENCE' ? (
          <AppCard>
            <div className="mb-5 flex items-start gap-3 border-b border-[var(--color-border)] pb-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                <Layers3 aria-hidden="true" size={20} />
              </span>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--color-primary)]">
                  Reference data
                </p>
                <h2 className="mt-1 text-xl font-extrabold text-[var(--color-primary-strong)]">
                  Add categories and locations
                </h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  These values become controlled dropdown options throughout inventory.
                </p>
              </div>
            </div>
            <div className="mb-5 inline-flex rounded-[10px] bg-[var(--color-surface-tint)] p-1">
              {canAddAssetTypes ? (
                <button
                  className={`flex min-h-10 items-center gap-2 rounded-[8px] px-4 text-sm font-bold transition ${mode === 'individual' ? 'bg-white text-[var(--color-primary-strong)] shadow-sm' : 'text-[var(--color-text-muted)] hover:text-[var(--color-primary)]'}`}
                  onClick={() => {
                    setMode('individual');
                    setMessage(null);
                    setResult(null);
                  }}
                  type="button"
                >
                  <PackagePlus aria-hidden="true" size={18} />
                  Individual
                </button>
              ) : null}
              {canAddAssetTypes ? (
                <button
                  className={`flex min-h-10 items-center gap-2 rounded-[8px] px-4 text-sm font-bold transition ${mode === 'bulk' ? 'bg-white text-[var(--color-primary-strong)] shadow-sm' : 'text-[var(--color-text-muted)] hover:text-[var(--color-primary)]'}`}
                  onClick={() => {
                    setMode('bulk');
                    setMessage(null);
                    setResult(null);
                  }}
                  type="button"
                >
                  <FileSpreadsheet aria-hidden="true" size={18} />
                  Bulk upload
                </button>
              ) : null}
            </div>

            {!canAddAssetTypes ? (
              <p className="mt-3 rounded-[10px] bg-[var(--color-surface-tint)] p-3 text-sm font-semibold text-[var(--color-text-muted)]">
                You can view saved asset details. Add/upload access is not enabled for this account.
              </p>
            ) : mode === 'individual' ? (
              <form onSubmit={submitIndividual}>
                <div className="grid gap-5 md:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="field-label">What are you adding?</span>
                    <select
                      className="field-input"
                      onChange={(event) => {
                        setKind(event.target.value as AssetDetailKind);
                        setName('');
                        setStoreLocation('');
                        setStoreBlock('');
                      }}
                      value={kind}
                    >
                      <option value="ASSET_TYPE">IT Asset</option>
                      <option value="CONSUMABLE_TYPE">IT Consumable</option>
                      <option value="LOCATION">Location</option>
                      <option value="BLOCK">Block</option>
                      <option value="STORE">Store</option>
                      <option value="DEPARTMENT">Department</option>
                    </select>
                    <span className="block text-xs font-medium leading-5 text-[var(--color-text-muted)]">
                      {detailDescriptions[kind]}
                    </span>
                  </label>
                  {kind === 'STORE' ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block space-y-1.5">
                        <span className="field-label">Store location</span>
                        <select
                          className="field-input"
                          onChange={(event) => setStoreLocation(event.target.value)}
                          required
                          value={storeLocation}
                        >
                          <option value="">Choose location</option>
                          {savedLocations.map((location) => (
                            <option key={location.id} value={location.name}>
                              {location.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block space-y-1.5">
                        <span className="field-label">Store block</span>
                        <select
                          className="field-input"
                          onChange={(event) => setStoreBlock(event.target.value)}
                          required
                          value={storeBlock}
                        >
                          <option value="">Choose block</option>
                          {savedBlocks.map((block) => (
                            <option key={block.id} value={block.name}>
                              {block.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : (
                    <TextField
                      label="Name"
                      maxLength={120}
                      onChange={(event) => setName(event.target.value)}
                      placeholder={detailPlaceholders[kind]}
                      required
                      value={name}
                    />
                  )}
                </div>
                <div className="mt-6 flex items-center justify-between gap-4 border-t border-[var(--color-border)] pt-5">
                  <p className="hidden text-sm text-[var(--color-text-muted)] sm:block">
                    Duplicate values are blocked automatically.
                  </p>
                  <Button loading={createMutation.isPending} type="submit">
                    {createMutation.isPending ? 'Saving...' : 'Save detail'}
                  </Button>
                </div>
              </form>
            ) : (
              <form className="mt-5 space-y-5" onSubmit={submitBulk}>
                <label className="block max-w-xl space-y-1.5">
                  <span className="field-label">Bulk upload type</span>
                  <select
                    className="field-input"
                    onChange={(event) => {
                      setBulkKind(event.target.value as AssetDetailKind);
                      setFile(null);
                      setPreview(null);
                      setResult(null);
                      setMessage(null);
                      if (fileInput.current) fileInput.current.value = '';
                    }}
                    value={bulkKind}
                  >
                    <option value="ASSET_TYPE">IT Asset</option>
                    <option value="CONSUMABLE_TYPE">IT Consumable</option>
                    <option value="LOCATION">Location</option>
                    <option value="BLOCK">Block</option>
                    <option value="STORE">Store</option>
                    <option value="DEPARTMENT">Department</option>
                  </select>
                </label>
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                  <label className="block cursor-pointer rounded-[12px] border-2 border-dashed border-[var(--color-primary-border)] bg-[var(--color-surface-tint)] p-6 text-center transition hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]">
                    <Upload
                      aria-hidden="true"
                      className="mx-auto text-[var(--color-primary)]"
                      size={24}
                    />
                    <p className="font-bold text-[var(--color-text-strong)]">
                      {file ? file.name : `Choose ${detailLabels[bulkKind]} sheet`}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      CSV and XLSX, maximum 5 MB and 1,000 rows. Required column:{' '}
                      {detailLabels[bulkKind]}.
                    </p>
                    <input
                      accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="sr-only"
                      onChange={chooseFile}
                      ref={fileInput}
                      type="file"
                    />
                    {file ? (
                      <p className="mt-2 text-xs font-semibold text-[var(--color-text-muted)]">
                        Selected: {file.name} · {(file.size / 1024).toFixed(1)} KB
                      </p>
                    ) : null}
                  </label>
                  <Button onClick={downloadTemplate} type="button" variant="secondary">
                    <Download aria-hidden="true" size={18} />
                    Template
                  </Button>
                </div>
                <div className="flex justify-end">
                  <Button loading={previewMutation.isPending} type="submit">
                    <Upload aria-hidden="true" size={18} />
                    {previewMutation.isPending ? 'Validating...' : 'Validate and preview'}
                  </Button>
                </div>
              </form>
            )}

            {preview ? (
              <section className="mt-6 border-t border-[var(--color-border)] pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
                      Review asset detail data
                    </h2>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {preview.validRows} ready · {preview.invalidRows} invalid
                    </p>
                  </div>
                  <Button
                    disabled={preview.validRows === 0}
                    loading={commitMutation.isPending}
                    onClick={commitBulk}
                  >
                    Upload valid rows to server
                  </Button>
                </div>
                <div className="mt-4 max-h-[420px] overflow-auto rounded-[8px] border border-[var(--color-border)]">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-[var(--color-surface-tint)]">
                      <tr>
                        <th className="p-3">Row</th>
                        <th className="p-3">Detail type</th>
                        <th className="p-3">Name</th>
                        <th className="p-3">Validation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row) => (
                        <tr className="border-t border-[var(--color-border)]" key={row.rowNumber}>
                          <td className="p-3">{row.rowNumber}</td>
                          <td className="p-3">{detailLabel(row.kind)}</td>
                          <td className="p-3 font-semibold">{row.name || 'Missing'}</td>
                          <td
                            className={`p-3 font-bold ${
                              row.valid
                                ? 'text-[var(--color-success)]'
                                : 'text-[var(--color-danger)]'
                            }`}
                          >
                            {row.valid ? 'Ready' : row.errors.join(' ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {result ? (
              <section className="mt-6 border-t border-[var(--color-border)] pt-5">
                <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
                  Upload complete
                </h2>
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                  {result.created.length} saved. {result.skipped.length} skipped.{' '}
                  {result.failed.length} failed.
                </p>
                {result.skipped.length > 0 || result.failed.length > 0 ? (
                  <div className="mt-4 rounded-[8px] border border-[var(--color-border)]">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[var(--color-surface-tint)]">
                        <tr>
                          <th className="p-3">Row</th>
                          <th className="p-3">Asset type</th>
                          <th className="p-3">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ...result.skipped.map((row, index) => ({ ...row, rowNumber: index + 1 })),
                          ...result.failed,
                        ].map((row) => (
                          <tr
                            className="border-t border-[var(--color-border)]"
                            key={`${row.rowNumber}-${row.name}-${row.reason}`}
                          >
                            <td className="p-3">{row.rowNumber}</td>
                            <td className="p-3">{row.name || 'Missing'}</td>
                            <td className="p-3 font-bold text-[var(--color-danger)]">
                              {row.reason}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>
            ) : null}
          </AppCard>
        ) : null}

        {viewOnly ? (
          <AppCard className="max-w-none">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                <ListFilter aria-hidden="true" size={20} />
              </span>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--color-primary)]">
                  Directory
                </p>
                <h2 className="mt-1 text-xl font-extrabold text-[var(--color-primary-strong)]">
                  Master-data directory
                </h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Search controlled values and use the action menu to edit or delete a record.
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-tint)] p-3 sm:grid-cols-[minmax(0,1fr)_220px]">
              <label className="search-shell">
                <span className="sr-only">Search saved asset details</span>
                <Search aria-hidden="true" className="search-shell-icon" size={17} />
                <input
                  className="field-input field-input-search"
                  onChange={(event) => {
                    setSavedSearch(event.target.value);
                    setDirectoryPage(1);
                  }}
                  placeholder="Search details"
                  type="search"
                  value={savedSearch}
                />
              </label>
              <label>
                <span className="sr-only">Filter saved details by type</span>
                <select
                  className="field-input"
                  onChange={(event) => {
                    setSavedKind(event.target.value as AssetDetailKind | 'ALL');
                    setDirectoryPage(1);
                  }}
                  value={savedKind}
                >
                  <option value="ALL">All types</option>
                  <option value="ASSET_TYPE">IT Asset</option>
                  <option value="CONSUMABLE_TYPE">IT Consumable</option>
                  <option value="LOCATION">Location</option>
                  <option value="BLOCK">Block</option>
                  <option value="STORE">Store</option>
                  <option value="DEPARTMENT">Department</option>
                </select>
              </label>
            </div>
            {query.isPending ? (
              <LoadingPanel label="Loading asset details" />
            ) : query.isError ? (
              <ErrorState
                message="Asset details could not be loaded."
                onRetry={() => void query.refetch()}
              />
            ) : query.data.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                No asset details saved yet.
              </p>
            ) : filteredDetails.length === 0 ? (
              <p className="mt-4 rounded-[10px] bg-[var(--color-surface-tint)] p-4 text-sm font-semibold text-[var(--color-text-muted)]">
                No records match the selected type and search text.
              </p>
            ) : (
              <ul className="mt-4 rounded-[12px] border border-[var(--color-border)] bg-white">
                <li className="hidden grid-cols-[minmax(0,1fr)_180px_120px_48px] items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface-tint)] px-4 py-3 text-xs font-extrabold uppercase tracking-[0.06em] text-[var(--color-text-muted)] md:grid">
                  <span>Name</span>
                  <span>Data type</span>
                  <span>Models</span>
                  <span className="sr-only">Actions</span>
                </li>
                {visibleDetails.map((assetType) => (
                  <li
                    className="group grid grid-cols-[minmax(0,1fr)_44px] items-center gap-3 border-b border-[var(--color-border)] px-4 py-3.5 text-sm text-[var(--color-text-strong)] transition last:border-b-0 hover:bg-[var(--color-surface-tint)] md:grid-cols-[minmax(0,1fr)_180px_120px_48px] md:gap-4"
                    key={assetType.id}
                  >
                    <span className="min-w-0 break-words font-bold">{assetType.name}</span>
                    <span className="hidden md:block">
                      <span className="rounded-full bg-[var(--color-primary-soft)] px-2.5 py-1 text-xs font-bold text-[var(--color-primary)]">
                        {detailLabels[assetType.kind]}
                      </span>
                    </span>
                    <span className="hidden text-sm font-semibold text-[var(--color-text-muted)] md:block">
                      {(assetType.models?.length ?? 0).toLocaleString('en-IN')}
                    </span>
                    {canDeleteAssetTypes ? (
                      <details className="relative" data-action-menu>
                        <summary
                          aria-label={`Actions for ${assetType.name}`}
                          className="icon-button list-none marker:hidden"
                        >
                          <MoreVertical size={17} />
                        </summary>
                        <div className="absolute right-0 top-full z-50 mt-2 w-40 rounded-[10px] border border-[var(--color-border)] bg-white p-1.5 shadow-[var(--shadow-overlay)]">
                          {canAddAssetTypes ? (
                            <button
                              className="menu-item w-full"
                              onClick={() => {
                                setMessage(null);
                                setEditTarget(assetType);
                                setEditName(assetType.name);
                              }}
                              type="button"
                            >
                              <Pencil size={16} />
                              Edit
                            </button>
                          ) : null}
                          <button
                            className="menu-item w-full text-[var(--color-danger)]"
                            onClick={() => {
                              setMessage(null);
                              setDeleteTarget(assetType);
                            }}
                            type="button"
                          >
                            <Trash2 size={16} />
                            Delete
                          </button>
                        </div>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {!query.isPending && !query.isError && filteredDetails.length > 0 ? (
              <div className="mt-4 flex flex-col gap-3 border-t border-[var(--color-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-[var(--color-text-muted)]">
                  Showing {(effectiveDirectoryPage - 1) * directoryPageSize + 1}–
                  {Math.min(effectiveDirectoryPage * directoryPageSize, filteredDetails.length)} of{' '}
                  {filteredDetails.length.toLocaleString('en-IN')}
                </p>
                <div className="flex gap-2">
                  <Button
                    disabled={effectiveDirectoryPage <= 1}
                    onClick={() => setDirectoryPage((page) => Math.max(1, page - 1))}
                    type="button"
                    variant="secondary"
                  >
                    Previous
                  </Button>
                  <span className="grid min-w-20 place-items-center text-sm font-bold">
                    {effectiveDirectoryPage} / {directoryPages}
                  </span>
                  <Button
                    disabled={effectiveDirectoryPage >= directoryPages}
                    onClick={() => setDirectoryPage((page) => Math.min(directoryPages, page + 1))}
                    type="button"
                    variant="secondary"
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </AppCard>
        ) : null}
      </div>

      {editTarget ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/40 p-4"
          role="dialog"
        >
          <form
            className="w-[min(92vw,500px)] rounded-[14px] border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-overlay)]"
            onSubmit={(event) => {
              event.preventDefault();
              if (editName.trim().length > 0) editMutation.mutate();
            }}
          >
            <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--color-primary)]">
              {detailLabels[editTarget.kind]}
            </p>
            <h2 className="mt-1 text-xl font-extrabold text-[var(--color-primary-strong)]">
              Edit reference value
            </h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Rename this controlled dropdown value. Values already used by inventory are protected.
            </p>
            <div className="mt-5">
              <TextField
                autoFocus
                label="Name"
                maxLength={120}
                onChange={(event) => setEditName(event.target.value)}
                value={editName}
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                disabled={editMutation.isPending}
                onClick={() => setEditTarget(null)}
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                disabled={!editName.trim() || editName.trim() === editTarget.name}
                loading={editMutation.isPending}
                type="submit"
              >
                Save changes
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/40 p-4"
          role="dialog"
        >
          <div className="w-[min(92vw,460px)] rounded-[10px] border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-overlay)]">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-[8px] bg-[var(--color-danger-soft)] text-[var(--color-danger)]">
                <Trash2 aria-hidden="true" size={20} />
              </span>
              <div>
                <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
                  Delete asset detail?
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                  {deleteTarget.name} will be removed from the {detailLabels[deleteTarget.kind]}{' '}
                  dropdown. It cannot be deleted while inventory data is using it.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                disabled={deleteMutation.isPending}
                onClick={() => setDeleteTarget(null)}
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                loading={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteTarget)}
                type="button"
                variant="danger"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
