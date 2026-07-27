import { useQuery } from '@tanstack/react-query';

import type { AssetDetailKind, TrackingMode } from '@assetdesk/contracts';

import { getAssetDetails } from '../../lib/inventory-api';

function categoryKind(trackingMode: TrackingMode): AssetDetailKind {
  return trackingMode === 'SERIALIZED' ? 'ASSET_TYPE' : 'CONSUMABLE_TYPE';
}

export function MaterialCategoryField({
  id,
  value,
  trackingMode,
  onChange,
}: {
  id: string;
  value: string;
  trackingMode: TrackingMode;
  onChange: (value: string) => void;
}) {
  const query = useQuery({
    queryKey: ['asset-details'],
    queryFn: ({ signal }) => getAssetDetails(undefined, signal),
  });
  const kind = categoryKind(trackingMode);
  const categories = (query.data ?? [])
    .filter((detail) => detail.kind === kind)
    .map((detail) => detail.name)
    .sort((left, right) => left.localeCompare(right));
  const selectValue = value && categories.includes(value) ? value : '';
  const hintId = `${id}-hint`;
  const label = trackingMode === 'SERIALIZED' ? 'IT Asset type' : 'IT Consumable type';

  return (
    <div className="space-y-1.5">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <select
        aria-describedby={hintId}
        className="field-input"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        required
        value={selectValue}
      >
        <option value="">Choose {label.toLowerCase()}</option>
        {categories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
      <p className="text-xs leading-5 text-[var(--color-text-muted)]" id={hintId}>
        Add values from Inventory, Add asset details.
      </p>
    </div>
  );
}
