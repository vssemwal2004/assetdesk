import { useQuery } from '@tanstack/react-query';

import type { AssetDetailKind, TrackingMode } from '@assetdesk/contracts';

import { getAssetDetails, getInventoryModels } from '../../lib/inventory-api';
import { inventoryCategoryOptions, resolveCatalogOption } from './inventory-form-utils';

function categoryKind(trackingMode: TrackingMode): AssetDetailKind {
  return trackingMode === 'SERIALIZED' ? 'ASSET_TYPE' : 'CONSUMABLE_TYPE';
}

export function MaterialCategoryField({
  id,
  value,
  trackingMode,
  onChange,
  disabled = false,
}: {
  id: string;
  value: string;
  trackingMode: TrackingMode;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const query = useQuery({
    queryKey: ['asset-details'],
    queryFn: ({ signal }) => getAssetDetails(undefined, signal),
  });
  const modelsQuery = useQuery({
    queryKey: ['inventory-models', 'all-categories', trackingMode],
    queryFn: ({ signal }) => getInventoryModels(undefined, trackingMode, signal),
  });
  const kind = categoryKind(trackingMode);
  const categories = inventoryCategoryOptions(
    query.data ?? [],
    modelsQuery.data ?? [],
    trackingMode,
    value,
  );
  const selectValue = resolveCatalogOption(value, categories);
  const hintId = `${id}-hint`;
  const label = trackingMode === 'SERIALIZED' ? 'IT Asset type' : 'IT Consumable type';
  const loading = query.isPending && modelsQuery.isPending && categories.length === 0;
  const loadFailed = query.isError && modelsQuery.isError;

  return (
    <div className="space-y-1.5">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <select
        aria-describedby={hintId}
        className="field-input"
        disabled={disabled || loading}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        required
        value={selectValue}
      >
        <option value="">
          {loading ? `Loading ${label.toLowerCase()}s…` : `Choose ${label.toLowerCase()}`}
        </option>
        {categories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
      <p className="text-xs leading-5 text-[var(--color-text-muted)]" id={hintId}>
        {loadFailed
          ? 'Categories could not be loaded. Try refreshing the page.'
          : modelsQuery.isError
            ? 'Showing categories from Add asset details; Model Master could not be refreshed.'
            : query.isError
              ? 'Showing categories discovered from Model Master.'
              : `Loaded from Add asset details and ${kind === 'ASSET_TYPE' ? 'IT Asset' : 'IT Consumable'} Model Master.`}
      </p>
    </div>
  );
}
