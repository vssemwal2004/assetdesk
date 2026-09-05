import { Types, type ClientSession } from 'mongoose';

import type {
  InventoryQuantityEntry,
  InventoryQuantityEntryAction,
  TrackingMode,
} from '@assetdesk/contracts';

import {
  InventoryQuantityEntryModel,
  type InventoryQuantityEntryRecord,
} from './inventory-quantity-entry.model.js';

export interface RecordInventoryQuantityEntryInput {
  materialId: string;
  materialCode: string;
  trackingMode: TrackingMode;
  action: InventoryQuantityEntryAction;
  quantityDelta: number;
  previousTotalQuantity: number;
  totalQuantity: number;
  entryDate?: string;
  vendorName?: string | null;
  reason?: string | null;
  actorUserId?: string;
  actorWorkerId?: string;
  actorRole?: 'ADMIN' | 'WORKER';
}

export interface ListInventoryQuantityEntriesInput {
  materialCode: string;
  page: number;
  pageSize: number;
  from?: Date;
  to?: Date;
  vendorName?: string;
  action?: InventoryQuantityEntryAction;
}

function entryDate(value?: string): Date {
  if (!value) return new Date();
  return new Date(`${value}T00:00:00.000+05:30`);
}

function toEntry(record: InventoryQuantityEntryRecord): InventoryQuantityEntry {
  return {
    id: record._id.toString(),
    materialCode: record.materialCode as InventoryQuantityEntry['materialCode'],
    trackingMode: record.trackingMode,
    action: record.action,
    quantityDelta: record.quantityDelta,
    previousTotalQuantity: record.previousTotalQuantity,
    totalQuantity: record.totalQuantity,
    entryDate: record.entryDate.toISOString(),
    vendorName: record.vendorName ?? null,
    reason: record.reason ?? null,
    actorWorkerId: record.actorWorkerId ?? null,
    actorRole: record.actorRole ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function recordInventoryQuantityEntry(
  input: RecordInventoryQuantityEntryInput,
  session?: ClientSession,
): Promise<void> {
  await InventoryQuantityEntryModel.create(
    [
      {
        materialId: new Types.ObjectId(input.materialId),
        materialCode: input.materialCode,
        trackingMode: input.trackingMode,
        action: input.action,
        quantityDelta: input.quantityDelta,
        previousTotalQuantity: input.previousTotalQuantity,
        totalQuantity: input.totalQuantity,
        entryDate: entryDate(input.entryDate),
        ...(input.vendorName?.trim() ? { vendorName: input.vendorName.trim() } : {}),
        ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
        ...(input.actorUserId ? { actorUserId: new Types.ObjectId(input.actorUserId) } : {}),
        ...(input.actorWorkerId ? { actorWorkerId: input.actorWorkerId } : {}),
        ...(input.actorRole ? { actorRole: input.actorRole } : {}),
      },
    ],
    session ? { session } : undefined,
  );
}

export async function listInventoryQuantityEntries(
  input: ListInventoryQuantityEntriesInput,
): Promise<{
  entries: InventoryQuantityEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  const filter: Record<string, unknown> = { materialCode: input.materialCode };
  if (input.from || input.to) {
    filter.entryDate = {
      ...(input.from ? { $gte: input.from } : {}),
      ...(input.to ? { $lt: input.to } : {}),
    };
  }
  if (input.vendorName)
    filter.vendorName = new RegExp(input.vendorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (input.action) filter.action = input.action;

  const skip = (input.page - 1) * input.pageSize;
  const [records, total] = await Promise.all([
    InventoryQuantityEntryModel.find(filter)
      .sort({ entryDate: -1, _id: -1 })
      .skip(skip)
      .limit(input.pageSize),
    InventoryQuantityEntryModel.countDocuments(filter),
  ]);
  return {
    entries: records.map(toEntry),
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
}
