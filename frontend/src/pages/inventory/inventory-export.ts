import type { AssetUnit, Material } from '@assetdesk/contracts';

import { humanizeCatalogValue } from '../../lib/catalog-format';
import { saveWorkbook, type SheetValue } from '../../lib/excel-export';
import { getAssetUnits, getInventory, type InventoryFilters } from '../../lib/inventory-api';
import { inventoryStatusLabel } from '../../lib/inventory-status';

export type InventoryExportColumnKey =
  | 'code'
  | 'category'
  | 'model'
  | 'configuration'
  | 'name'
  | 'tracking'
  | 'returnPolicy'
  | 'status'
  | 'store'
  | 'location'
  | 'block'
  | 'department'
  | 'vendor'
  | 'total'
  | 'available'
  | 'issued'
  | 'unitLabel'
  | 'description'
  | 'createdAt'
  | 'updatedAt'
  | 'serialNumber'
  | 'assetTag'
  | 'unitStatus'
  | 'unitCondition'
  | 'unitVendor';

export const inventoryExportColumns: Array<{
  key: InventoryExportColumnKey;
  label: string;
  group: string;
  width: number;
}> = [
  { key: 'code', label: 'Material code', group: 'Stock record', width: 20 },
  { key: 'category', label: 'Category', group: 'Stock record', width: 20 },
  { key: 'model', label: 'Model', group: 'Stock record', width: 28 },
  { key: 'configuration', label: 'Configuration', group: 'Stock record', width: 36 },
  { key: 'name', label: 'Material name', group: 'Stock record', width: 32 },
  { key: 'tracking', label: 'Inventory type', group: 'Stock record', width: 16 },
  { key: 'returnPolicy', label: 'Return policy', group: 'Stock record', width: 16 },
  { key: 'status', label: 'Status', group: 'Stock record', width: 20 },
  { key: 'description', label: 'Description', group: 'Stock record', width: 36 },
  { key: 'store', label: 'Store', group: 'Place & source', width: 28 },
  { key: 'location', label: 'Location', group: 'Place & source', width: 24 },
  { key: 'block', label: 'Block', group: 'Place & source', width: 18 },
  { key: 'department', label: 'Department', group: 'Place & source', width: 22 },
  { key: 'vendor', label: 'Vendor', group: 'Place & source', width: 22 },
  { key: 'createdAt', label: 'Added on', group: 'Place & source', width: 20 },
  { key: 'updatedAt', label: 'Updated on', group: 'Place & source', width: 20 },
  { key: 'total', label: 'Total quantity', group: 'Quantities', width: 14 },
  { key: 'available', label: 'Available', group: 'Quantities', width: 12 },
  { key: 'issued', label: 'Issued', group: 'Quantities', width: 12 },
  { key: 'unitLabel', label: 'Unit', group: 'Quantities', width: 10 },
  {
    key: 'serialNumber',
    label: 'Serial number',
    group: 'Serial details (per-serial layout)',
    width: 24,
  },
  { key: 'assetTag', label: 'Asset tag', group: 'Serial details (per-serial layout)', width: 20 },
  {
    key: 'unitStatus',
    label: 'Serial status',
    group: 'Serial details (per-serial layout)',
    width: 16,
  },
  {
    key: 'unitCondition',
    label: 'Condition',
    group: 'Serial details (per-serial layout)',
    width: 16,
  },
  {
    key: 'unitVendor',
    label: 'Serial vendor',
    group: 'Serial details (per-serial layout)',
    width: 20,
  },
];

export const defaultInventoryExportColumns: InventoryExportColumnKey[] = [
  'code',
  'category',
  'model',
  'configuration',
  'store',
  'tracking',
  'total',
  'available',
  'issued',
  'status',
];

export type InventoryExportLayout = 'STOCK' | 'SERIAL';

const MAX_SERIAL_STOCK_RECORDS = 400;
const UNIT_REQUEST_CONCURRENCY = 4;

function value(
  material: Material,
  unit: AssetUnit | null,
  column: InventoryExportColumnKey,
): SheetValue {
  switch (column) {
    case 'code':
      return material.materialCode;
    case 'category':
      return material.category;
    case 'model':
      return material.typeModelName ?? '';
    case 'configuration':
      return material.configuration ?? '';
    case 'name':
      return material.name;
    case 'tracking':
      return material.trackingMode === 'SERIALIZED' ? 'IT Asset' : 'IT Consumable';
    case 'returnPolicy':
      return humanizeCatalogValue(material.returnPolicy);
    case 'status':
      return inventoryStatusLabel(material.status);
    case 'store':
      return material.store ?? material.locationBlock ?? '';
    case 'location':
      return material.location ?? '';
    case 'block':
      return material.block ?? '';
    case 'department':
      return material.department ?? '';
    case 'vendor':
      return material.vendorName ?? '';
    case 'total':
      return unit ? 1 : material.totalQuantity;
    case 'available':
      return unit ? Number(unit.status === 'AVAILABLE') : material.availableQuantity;
    case 'issued':
      return unit ? Number(unit.status === 'ISSUED') : material.issuedQuantity;
    case 'unitLabel':
      return material.unitLabel ?? (material.trackingMode === 'SERIALIZED' ? 'unit' : '');
    case 'description':
      return material.description ?? '';
    case 'createdAt':
      return new Date(material.createdAt);
    case 'updatedAt':
      return new Date(material.updatedAt);
    case 'serialNumber':
      return unit?.serialNumber ?? '';
    case 'assetTag':
      return unit?.assetTag ?? '';
    case 'unitStatus':
      return unit ? humanizeCatalogValue(unit.status) : '';
    case 'unitCondition':
      return unit?.condition ?? '';
    case 'unitVendor':
      return unit?.vendorName ?? '';
  }
}

async function allMaterials(filters: Omit<InventoryFilters, 'page' | 'pageSize'>) {
  const first = await getInventory({ page: 1, pageSize: 100, ...filters });
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, first.meta.totalPages - 1) }, (_, index) =>
      getInventory({ page: index + 2, pageSize: 100, ...filters }),
    ),
  );
  return [first, ...rest].flatMap((page) => page.data);
}

async function allUnits(materialCode: string): Promise<AssetUnit[]> {
  const first = await getAssetUnits(materialCode, 1, { pageSize: 100 });
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, first.meta.totalPages - 1) }, (_, index) =>
      getAssetUnits(materialCode, index + 2, { pageSize: 100 }),
    ),
  );
  return [first, ...rest].flatMap((page) => page.data);
}

async function unitsByMaterial(materials: Material[]): Promise<Map<string, AssetUnit[]>> {
  const serialized = materials.filter((material) => material.trackingMode === 'SERIALIZED');
  if (serialized.length > MAX_SERIAL_STOCK_RECORDS) {
    throw new Error(
      `A per-serial sheet supports up to ${MAX_SERIAL_STOCK_RECORDS} IT asset stock records (${serialized.length} selected). Add filters such as category or store and try again.`,
    );
  }
  const result = new Map<string, AssetUnit[]>();
  for (let index = 0; index < serialized.length; index += UNIT_REQUEST_CONCURRENCY) {
    const batch = serialized.slice(index, index + UNIT_REQUEST_CONCURRENCY);
    const loaded = await Promise.all(batch.map((material) => allUnits(material.materialCode)));
    batch.forEach((material, position) =>
      result.set(material.materialCode, loaded[position] ?? []),
    );
  }
  return result;
}

export async function downloadInventorySheet(input: {
  filters: Omit<InventoryFilters, 'page' | 'pageSize'>;
  columns: InventoryExportColumnKey[];
  layout: InventoryExportLayout;
  fileName: string;
  filterSummary: Array<{ label: string; value: string }>;
}): Promise<void> {
  const materials = await allMaterials(input.filters);
  if (!materials.length) throw new Error('No inventory records match these filters.');
  const units = input.layout === 'SERIAL' ? await unitsByMaterial(materials) : new Map();
  const rows = materials.flatMap((material) => {
    const materialUnits: AssetUnit[] = units.get(material.materialCode) ?? [];
    const entries: Array<AssetUnit | null> = materialUnits.length ? materialUnits : [null];
    return entries.map((unit) => input.columns.map((column) => value(material, unit, column)));
  });
  const definitions = new Map(inventoryExportColumns.map((column) => [column.key, column]));
  await saveWorkbook({
    fileName: input.fileName,
    sheetName: input.layout === 'SERIAL' ? 'Inventory serials' : 'Inventory',
    columns: input.columns.map((key) => ({
      label: definitions.get(key)?.label ?? key,
      width: definitions.get(key)?.width ?? 20,
    })),
    rows,
    filterSummary: input.filterSummary,
  });
}
