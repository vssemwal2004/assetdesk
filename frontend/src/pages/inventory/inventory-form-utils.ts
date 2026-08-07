import type {
  AssetDetail,
  InventoryModel,
  Material,
  TrackingMode,
} from '@assetdesk/contracts';

function normalizedCatalogValue(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleUpperCase('en-US');
}

function uniqueCatalogValues(values: string[]): string[] {
  const unique = new Map<string, string>();
  for (const value of values) {
    const displayValue = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!displayValue) continue;
    const key = normalizedCatalogValue(displayValue);
    if (!unique.has(key)) unique.set(key, displayValue);
  }
  return [...unique.values()].sort((left, right) => left.localeCompare(right));
}

export function inventoryCategoryOptions(
  details: AssetDetail[],
  models: InventoryModel[],
  trackingMode: TrackingMode,
  selectedValue = '',
): string[] {
  const detailKind = trackingMode === 'SERIALIZED' ? 'ASSET_TYPE' : 'CONSUMABLE_TYPE';
  return uniqueCatalogValues([
    ...details.filter((detail) => detail.kind === detailKind).map((detail) => detail.name),
    ...models.filter((model) => model.trackingMode === trackingMode).map((model) => model.category),
    selectedValue,
  ]);
}

export function inventoryModelOptions(
  models: InventoryModel[],
  cachedNames: string[],
  selectedValue = '',
): string[] {
  return uniqueCatalogValues([
    ...models.map((model) => model.name),
    ...cachedNames,
    selectedValue,
  ]);
}

export function resolveCatalogOption(value: string, options: string[]): string {
  const key = normalizedCatalogValue(value);
  return options.find((option) => normalizedCatalogValue(option) === key) ?? value;
}

export function materialRequestName(category: string, modelName: string): string {
  const normalizedCategory = category.trim().replace(/\s+/g, ' ');
  const normalizedModel = modelName.trim().replace(/\s+/g, ' ');
  const combined = normalizedModel
    .toLocaleLowerCase('en-US')
    .startsWith(normalizedCategory.toLocaleLowerCase('en-US'))
    ? normalizedModel
    : `${normalizedCategory} ${normalizedModel}`;

  // The server derives the persisted display name from category + model, but the
  // request contract still caps this compatibility field at 120 characters.
  return combined.length <= 120 ? combined : normalizedModel.slice(0, 120);
}

export type QuantityAdjustmentDirection = 'INCREASE' | 'DECREASE';

export function signedQuantityDelta(
  direction: QuantityAdjustmentDirection,
  rawAmount: string,
): number {
  const amount = Number(rawAmount);
  return direction === 'DECREASE' ? -amount : amount;
}

export function quantityAdjustmentMaximum(
  material: Pick<Material, 'availableQuantity' | 'totalQuantity'>,
  direction: QuantityAdjustmentDirection,
): number {
  return direction === 'DECREASE'
    ? material.availableQuantity
    : 1_000_000_000 - material.totalQuantity;
}

export function materialGroupKey(category: string, trackingMode: TrackingMode): string {
  return `${normalizedCatalogValue(category)}|${trackingMode}`;
}
