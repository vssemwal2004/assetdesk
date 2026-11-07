import type { AssetUnit, Material } from '@assetdesk/contracts';

import { getAssetUnits } from '../../lib/inventory-api';
import { firstMatch } from '../../lib/search-highlight';

export interface InventorySearchHit {
  material: Material;
  field: string;
  value: string | null;
  /** Units whose serial number or asset tag matched; empty for stock-level matches. */
  units: AssetUnit[];
  path: string[];
}

// Serial lookups run one request per stock record, so keep the batch bounded.
const MAX_SERIAL_LOOKUPS = 25;

export function materialFieldMatch(material: Material, search: string) {
  return firstMatch(
    [
      { label: 'Material code', value: material.materialCode },
      { label: 'Model', value: material.typeModelName },
      { label: 'Configuration', value: material.configuration },
      { label: 'Material', value: material.name },
      { label: 'Category', value: material.category },
      { label: 'Store', value: material.store },
      { label: 'Location', value: material.location },
      { label: 'Block', value: material.block },
      { label: 'Department', value: material.department },
      { label: 'Vendor', value: material.vendorName },
      { label: 'Description', value: material.description },
    ],
    search,
  );
}

export function inventoryPath(material: Material): string[] {
  return [
    material.trackingMode === 'QUANTITY' ? 'IT Consumable' : 'IT Asset',
    material.category,
    material.typeModelName?.trim() || material.name,
    ...(material.trackingMode === 'SERIALIZED' && material.configuration?.trim()
      ? [material.configuration.trim()]
      : []),
    material.store ?? material.locationBlock ?? material.location ?? 'Store not set',
  ];
}

/**
 * Explains each inventory search result. Stock records that only matched through a unit
 * (the backend also searches serial numbers) are resolved to the matching serials.
 */
export async function inventorySearchHits(
  materials: Material[],
  search: string,
  signal?: AbortSignal,
): Promise<InventorySearchHit[]> {
  if (!search.trim()) return [];
  const local = materials.map((material) => ({
    material,
    match: materialFieldMatch(material, search),
  }));
  const needUnits = local
    .filter((entry) => !entry.match && entry.material.trackingMode === 'SERIALIZED')
    .slice(0, MAX_SERIAL_LOOKUPS);
  const unitEntries = await Promise.all(
    needUnits.map(async ({ material }) => {
      try {
        const result = await getAssetUnits(
          material.materialCode,
          1,
          { pageSize: 5, search: search.trim() },
          signal,
        );
        return [material.materialCode, result.data] as const;
      } catch {
        return [material.materialCode, [] as AssetUnit[]] as const;
      }
    }),
  );
  const unitsByCode = new Map<string, AssetUnit[]>(unitEntries);
  return local.map(({ material, match }) => {
    const units = unitsByCode.get(material.materialCode) ?? [];
    const unit = units[0];
    if (match) {
      return {
        material,
        field: match.label,
        value: match.value,
        units: [],
        path: inventoryPath(material),
      };
    }
    const identifier = unit ? (unit.serialNumber ?? unit.assetTag) : null;
    return {
      material,
      field: unit?.serialNumber
        ? 'Serial number'
        : unit
          ? 'Asset tag'
          : 'Serial number / asset tag',
      value: identifier,
      units,
      path: [
        ...inventoryPath(material),
        ...(identifier
          ? [`Serial ${identifier}${units.length > 1 ? ` +${units.length - 1} more` : ''}`]
          : []),
      ],
    };
  });
}
