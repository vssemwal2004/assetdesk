import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { AppError } from '../../middleware/error-handler.js';
import type { MaterialDocument } from '../inventory/material.model.js';
import type { IssueAssetRecord, IssueDocument, IssueLineRecord } from '../issues/issue.model.js';
import {
  applyMaterialReturn,
  applyQuantityMaterialReturn,
  assertIssueOutstandingInvariant,
  assertLineKind,
  assertQuantityWithinOutstanding,
  findOutstandingIssueAsset,
} from './return.service.js';

function expectProblem(run: () => unknown, code: string): void {
  try {
    run();
    throw new Error(`Expected ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
  }
}

function asset(assetTag: string, outstanding: boolean): IssueAssetRecord {
  return {
    assetUnitId: new Types.ObjectId(),
    assetTag,
    conditionAtIssue: 'Good',
    outstanding,
  };
}

function line(
  trackingMode: 'QUANTITY' | 'SERIALIZED',
  returnPolicy: 'REUSABLE' | 'CONSUMABLE',
  outstandingQuantity: number,
  assets: IssueAssetRecord[] = [],
): IssueLineRecord {
  return {
    lineId: '3516ac36-3f1c-4c22-8fc3-6707ab8a7a37',
    material: {
      materialId: new Types.ObjectId(),
      materialCode: 'GEU-MAT-000001',
      name: 'Network Switch',
      category: 'Networking',
      trackingMode,
      returnPolicy,
      ...(trackingMode === 'QUANTITY' ? { unitLabel: 'piece' } : {}),
    },
    issuedQuantity: Math.max(1, outstandingQuantity),
    outstandingQuantity,
    assets,
  };
}

describe('Return line ownership and outstanding validation', () => {
  it('rejects a request kind that does not match the Issue snapshot', () => {
    expectProblem(
      () => assertLineKind(line('SERIALIZED', 'REUSABLE', 1), 'QUANTITY'),
      'RETURN_LINE_KIND_MISMATCH',
    );
  });

  it('accepts return-by-date consumable material while outstanding remains', () => {
    expect(() => assertLineKind(line('QUANTITY', 'CONSUMABLE', 3), 'QUANTITY')).not.toThrow();
  });

  it('rejects material lines with no outstanding return balance', () => {
    expectProblem(
      () => assertLineKind(line('QUANTITY', 'CONSUMABLE', 0), 'QUANTITY'),
      'RETURN_LINE_NOT_OUTSTANDING',
    );
  });

  it('rejects over-return instead of clamping the requested quantity', () => {
    expectProblem(
      () => assertQuantityWithinOutstanding({ outstandingQuantity: 2 }, 3),
      'RETURN_QUANTITY_EXCEEDS_OUTSTANDING',
    );
  });

  it('rejects a mismatched asset and a previously processed asset', () => {
    const issuedLine = line('SERIALIZED', 'REUSABLE', 1, [
      asset('GEU-AST-000001', true),
      asset('GEU-AST-000002', false),
    ]);
    expectProblem(
      () => findOutstandingIssueAsset(issuedLine, 'GEU-AST-000003'),
      'RETURN_ASSET_NOT_ON_LINE',
    );
    expectProblem(
      () => findOutstandingIssueAsset(issuedLine, 'GEU-AST-000002'),
      'RETURN_ASSET_ALREADY_PROCESSED',
    );
  });
});

describe('Return inventory and Issue invariants', () => {
  it('moves quantity from issued to available without changing total', () => {
    const material = {
      totalQuantity: 10,
      availableQuantity: 4,
      issuedQuantity: 6,
    } as MaterialDocument;

    applyMaterialReturn(material, 3, 3);

    expect(material).toMatchObject({
      totalQuantity: 10,
      availableQuantity: 7,
      issuedQuantity: 3,
    });
  });

  it('keeps quantity stock balanced when returned stock is not available', () => {
    const material = {
      totalQuantity: 10,
      availableQuantity: 4,
      issuedQuantity: 6,
    } as MaterialDocument;

    applyQuantityMaterialReturn(material, 3, false);

    expect(material).toMatchObject({
      totalQuantity: 7,
      availableQuantity: 4,
      issuedQuantity: 3,
    });
    expect(material.availableQuantity + material.issuedQuantity).toBe(material.totalQuantity);
  });

  it('removes damaged serialized stock from issued without making it available', () => {
    const material = {
      totalQuantity: 5,
      availableQuantity: 2,
      issuedQuantity: 2,
    } as MaterialDocument;

    applyMaterialReturn(material, 1, 0);

    expect(material.availableQuantity).toBe(2);
    expect(material.issuedQuantity).toBe(1);
  });

  it('rejects inventory underflow and inconsistent serialized outstanding counts', () => {
    expectProblem(
      () =>
        applyMaterialReturn(
          {
            totalQuantity: 1,
            availableQuantity: 0,
            issuedQuantity: 0,
          } as MaterialDocument,
          1,
          1,
        ),
      'RETURN_INVENTORY_STATE_CONFLICT',
    );

    const serializedLine = line('SERIALIZED', 'REUSABLE', 2, [asset('GEU-AST-000001', true)]);
    expectProblem(
      () =>
        assertIssueOutstandingInvariant({
          lines: [serializedLine],
          totalOutstandingQuantity: 2,
        } as IssueDocument),
      'ISSUE_ASSET_STATE_CONFLICT',
    );
  });
});
