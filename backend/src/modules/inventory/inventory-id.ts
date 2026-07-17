import { AppError } from '../../middleware/error-handler.js';
import { InventoryCounterModel } from './inventory-counter.model.js';

const MAX_PUBLIC_SEQUENCE = 999_999;

type InventoryIdentifierKind = 'MATERIAL' | 'ASSET';

function formatInventoryIdentifier(kind: InventoryIdentifierKind, sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > MAX_PUBLIC_SEQUENCE) {
    throw new AppError(
      503,
      'INVENTORY_IDENTIFIER_EXHAUSTED',
      'No more inventory identifiers are currently available.',
    );
  }
  const prefix = kind === 'MATERIAL' ? 'GEU-MAT' : 'GEU-AST';
  return `${prefix}-${String(sequence).padStart(6, '0')}`;
}

export function formatMaterialCode(sequence: number): string {
  return formatInventoryIdentifier('MATERIAL', sequence);
}

export function formatAssetTag(sequence: number): string {
  return formatInventoryIdentifier('ASSET', sequence);
}

async function allocateSequence(kind: InventoryIdentifierKind): Promise<number> {
  const counter = await InventoryCounterModel.findOneAndUpdate(
    { _id: kind },
    { $inc: { sequence: 1 } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  if (!counter) {
    throw new AppError(
      503,
      'INVENTORY_IDENTIFIER_UNAVAILABLE',
      'An inventory identifier could not be allocated. Try again.',
    );
  }
  return counter.sequence;
}

export async function allocateMaterialCode(): Promise<string> {
  return formatMaterialCode(await allocateSequence('MATERIAL'));
}

export async function allocateAssetTag(): Promise<string> {
  return formatAssetTag(await allocateSequence('ASSET'));
}
