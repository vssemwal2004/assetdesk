import type { AssetUnit, Material } from '@assetdesk/contracts';

import type { AssetUnitDocument } from './asset-unit.model.js';
import type { MaterialDocument } from './material.model.js';

export function toMaterial(material: MaterialDocument): Material {
  return {
    id: material._id.toString(),
    materialCode: material.materialCode,
    name: material.name,
    category: material.category,
    typeModelName: material.typeModelName ?? null,
    location: material.location ?? null,
    block: material.block ?? null,
    department: material.department ?? null,
    vendorName: material.vendorName ?? null,
    locationBlock:
      material.locationBlock ?? ([material.location, material.block].filter(Boolean).join(' / ') || null),
    description: material.description ?? null,
    trackingMode: material.trackingMode,
    returnPolicy: material.returnPolicy,
    status: material.status,
    totalQuantity: material.totalQuantity,
    availableQuantity: material.availableQuantity,
    issuedQuantity: material.issuedQuantity,
    unitLabel: material.unitLabel ?? null,
    assignmentTypes: material.assignmentTypes?.length
      ? material.assignmentTypes
      : ['LONG_TERM', 'SHORT_TERM'],
    createdAt: material.createdAt.toISOString(),
    updatedAt: material.updatedAt.toISOString(),
  };
}

export function toAssetUnit(unit: AssetUnitDocument): AssetUnit {
  return {
    id: unit._id.toString(),
    assetTag: unit.assetTag,
    materialCode: unit.materialCode,
    serialNumber: unit.serialNumber ?? null,
    condition: unit.condition,
    status: unit.status,
    createdAt: unit.createdAt.toISOString(),
    updatedAt: unit.updatedAt.toISOString(),
  };
}
