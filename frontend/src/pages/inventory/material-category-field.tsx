import { useQuery } from '@tanstack/react-query';
import { getAssetTypes } from '../../lib/inventory-api';

const DEFAULT_ASSET_TYPES = ['Computer', 'Printer', 'Network Device', 'Consumable'] as const;

export function MaterialCategoryField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const query = useQuery({
    queryKey: ['asset-types'],
    queryFn: ({ signal }) => getAssetTypes(signal),
  });
  const assetTypes = [
    ...new Set([...DEFAULT_ASSET_TYPES, ...(query.data?.map((assetType) => assetType.name) ?? [])]),
  ];
  const selectValue = value && assetTypes.includes(value) ? value : '';
  const hintId = `${id}-hint`;

  return (
    <div className="space-y-1.5">
      <label className="field-label" htmlFor={id}>
        Asset type
      </label>
      <select
        aria-describedby={hintId}
        className="field-input"
        id={id}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next);
        }}
        required
        value={selectValue}
      >
        <option value="">Choose asset type</option>
        {assetTypes.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
      <p className="text-xs leading-5 text-[var(--color-text-muted)]" id={hintId}>
        Add new asset types from Inventory, Add asset type.
      </p>
    </div>
  );
}
