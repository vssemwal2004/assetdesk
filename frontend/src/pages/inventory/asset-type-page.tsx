import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  PackagePlus,
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
  importInventoryModels,
  previewAssetTypeImport,
  syncInventoryModels,
  updateAssetDetail,
  type AssetTypeImportPreviewResponse,
  type AssetTypeImportResponse,
} from '../../lib/inventory-api';
import { isApiError } from '../../lib/api-client';

type Mode = 'individual' | 'bulk';

const detailLabels: Record<AssetDetailKind, string> = {
  ASSET_TYPE: 'IT Asset',
  CONSUMABLE_TYPE: 'IT Consumable',
  LOCATION: 'Location',
  BLOCK: 'Block',
  DEPARTMENT: 'Department',
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
  DEPARTMENT: {
    fileName: 'assetdesk-departments-template.csv',
    csv: 'Department\r\nComputer Centre\r\nIT Department\r\nElectrical Department\r\n',
  },
};

function detailLabel(value: string | undefined): string {
  return value === 'LOCATION' ||
    value === 'BLOCK' ||
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
  const [kind, setKind] = useState<AssetDetailKind>('ASSET_TYPE');
  const [bulkKind, setBulkKind] = useState<AssetDetailKind>('ASSET_TYPE');
  const [name, setName] = useState('');
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
  const filteredDetails = useMemo(
    () =>
      (query.data ?? [])
        .filter((detail) => savedKind === 'ALL' || detail.kind === savedKind)
        .filter((detail) =>
          detail.name.toLocaleLowerCase().includes(savedSearch.trim().toLocaleLowerCase()),
        ),
    [query.data, savedKind, savedSearch],
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
        ['LOCATION', 'BLOCK', 'DEPARTMENT'].includes(detail.kind),
      ).length,
      models: details.reduce((count, detail) => count + (detail.models?.length ?? 0), 0),
    };
  }, [query.data]);
  const categoryKind = modelTrackingMode === 'SERIALIZED' ? 'ASSET_TYPE' : 'CONSUMABLE_TYPE';
  const registeredModels =
    query.data?.find(
      (detail) =>
        detail.kind === categoryKind &&
        detail.name.toLocaleUpperCase('en-US') === modelCategory.toLocaleUpperCase('en-US'),
    )?.models ?? [];
  const modelMutation = useMutation({
    mutationFn: () =>
      createInventoryModel({
        category: modelCategory,
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
    const trimmed = name.trim();
    if (trimmed.length < 1) return setMessage('Enter a name.');
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
          <Link className="button-quiet" to="/inventory">
            <ArrowLeft aria-hidden="true" size={18} />
            Back to Inventory
          </Link>
        }
        description={
          viewOnly
            ? 'Search, filter, edit, and delete controlled inventory values.'
            : 'Add categories, models, locations, blocks, and departments.'
        }
        title={viewOnly ? 'View asset types' : 'Add asset types'}
      />

      {canAddModels && !viewOnly ? (
        <AppCard>
          <div className="mb-4">
            <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--color-primary)]">
              Model master
            </p>
            <h2 className="mt-1 text-xl font-extrabold text-[var(--color-primary-strong)]">
              Add registered model
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Choose a category first, then save the official model name. Materials and bulk uploads
              can only use registered models.
            </p>
            {user?.role === 'ADMIN' ? (
              <Button
                className="mt-3"
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
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Button
              onClick={() => {
                setModelMode('individual');
                setModelImportResult(null);
                setMessage(null);
              }}
              type="button"
              variant={modelMode === 'individual' ? 'primary' : 'secondary'}
            >
              <PackagePlus aria-hidden="true" size={18} />
              Individual
            </Button>
            <Button
              onClick={() => {
                setModelMode('bulk');
                setMessage(null);
              }}
              type="button"
              variant={modelMode === 'bulk' ? 'primary' : 'secondary'}
            >
              <FileSpreadsheet aria-hidden="true" size={18} />
              Bulk upload
            </Button>
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
                  value={modelCategory}
                >
                  <option value="">Choose category</option>
                  {(query.data ?? [])
                    .filter(
                      (detail) =>
                        detail.kind ===
                        (modelTrackingMode === 'SERIALIZED' ? 'ASSET_TYPE' : 'CONSUMABLE_TYPE'),
                    )
                    .map((detail) => (
                      <option key={detail.id} value={detail.name}>
                        {detail.name}
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
                Required columns: Category and Model Name. Categories must already exist below in
                Asset Details. CSV/XLSX, maximum 1,000 rows and 5 MB.
              </p>
              <input
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="field-input mt-3"
                onChange={chooseModelFile}
                ref={modelFileInput}
                type="file"
              />
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

      <div
        className={viewOnly ? 'block' : 'grid items-start gap-5 xl:grid-cols-[380px_minmax(0,1fr)]'}
      >
        {!viewOnly ? (
          <AppCard className="xl:order-2">
            <div className="mb-5">
              <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--color-primary)]">
                Reference data
              </p>
              <h2 className="mt-1 text-xl font-extrabold text-[var(--color-primary-strong)]">
                Add categories and locations
              </h2>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Maintain only the reusable dropdown values required across inventory.
              </p>
            </div>
            <div className="mb-5 grid grid-cols-2 gap-2">
              {canAddAssetTypes ? (
                <Button
                  onClick={() => {
                    setMode('individual');
                    setMessage(null);
                    setResult(null);
                  }}
                  type="button"
                  variant={mode === 'individual' ? 'primary' : 'secondary'}
                >
                  <PackagePlus aria-hidden="true" size={18} />
                  Individual
                </Button>
              ) : null}
              {canAddAssetTypes ? (
                <Button
                  onClick={() => {
                    setMode('bulk');
                    setMessage(null);
                    setResult(null);
                  }}
                  type="button"
                  variant={mode === 'bulk' ? 'primary' : 'secondary'}
                >
                  <FileSpreadsheet aria-hidden="true" size={18} />
                  Bulk upload
                </Button>
              ) : null}
            </div>

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
                <ErrorSummary
                  message={message}
                  title={mode === 'individual' ? 'Asset detail' : 'Upload'}
                />
              )
            ) : null}

            {!canAddAssetTypes ? (
              <p className="mt-3 rounded-[10px] bg-[var(--color-surface-tint)] p-3 text-sm font-semibold text-[var(--color-text-muted)]">
                You can view saved asset details. Add/upload access is not enabled for this account.
              </p>
            ) : mode === 'individual' ? (
              <form className="mt-5 space-y-5" onSubmit={submitIndividual}>
                <label className="block space-y-1.5">
                  <span className="field-label">Detail type</span>
                  <select
                    className="field-input"
                    onChange={(event) => setKind(event.target.value as AssetDetailKind)}
                    value={kind}
                  >
                    <option value="ASSET_TYPE">IT Asset</option>
                    <option value="CONSUMABLE_TYPE">IT Consumable</option>
                    <option value="LOCATION">Location</option>
                    <option value="BLOCK">Block</option>
                    <option value="DEPARTMENT">Department</option>
                  </select>
                </label>
                <TextField
                  label="Name"
                  maxLength={120}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Desktop, Cable, Computer Centre, A Block, IT Department"
                  required
                  value={name}
                />
                <div className="flex justify-end">
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
                    <option value="DEPARTMENT">Department</option>
                  </select>
                </label>
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="rounded-[8px] border border-[var(--color-border)] p-5">
                    <p className="font-bold text-[var(--color-text-strong)]">
                      Upload {detailLabels[bulkKind]} list
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      CSV and XLSX, maximum 5 MB and 1,000 rows. Required column:{' '}
                      {detailLabels[bulkKind]}.
                    </p>
                    <input
                      accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="field-input mt-4"
                      onChange={chooseFile}
                      ref={fileInput}
                      type="file"
                    />
                    {file ? (
                      <p className="mt-2 text-xs font-semibold text-[var(--color-text-muted)]">
                        Selected: {file.name} · {(file.size / 1024).toFixed(1)} KB
                      </p>
                    ) : null}
                  </div>
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

        <AppCard className={viewOnly ? 'max-w-none' : 'xl:sticky xl:top-5 xl:order-1'}>
          <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--color-primary)]">
            Directory
          </p>
          <h2 className="mt-1 text-xl font-extrabold text-[var(--color-primary-strong)]">
            Master-data directory
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Select a data type, then manage every saved value from its action menu.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px] lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_160px]">
            <label className="relative block">
              <span className="sr-only">Search saved asset details</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
                size={17}
              />
              <input
                className="field-input pl-10"
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
            <ul
              className={
                viewOnly
                  ? 'mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3'
                  : 'mt-4 max-h-[620px] space-y-1.5 overflow-auto pr-1'
              }
            >
              {visibleDetails.map((assetType) => (
                <li
                  className="group flex items-center justify-between gap-3 rounded-[8px] border border-transparent bg-[var(--color-surface-tint)] px-3 py-2.5 text-[14px] font-bold text-[var(--color-text-strong)] transition hover:border-[var(--color-primary-border)] hover:bg-white"
                  key={assetType.id}
                >
                  <span className="min-w-0 break-words">
                    <span className="mr-2 rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-xs text-[var(--color-primary)]">
                      {detailLabels[assetType.kind]}
                    </span>
                    {assetType.name}
                  </span>
                  {canDeleteAssetTypes ? (
                    <details className="relative">
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
