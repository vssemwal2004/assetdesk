import { createHash } from 'node:crypto';

import mongoose, { Types, type ClientSession } from 'mongoose';

import { env } from '../config/env.js';
import { connectToDatabase } from '../db/mongoose.js';
import { appendAuditEvent } from '../modules/audit/audit.service.js';
import { AssetUnitModel } from '../modules/inventory/asset-unit.model.js';
import { MaterialModel, type MaterialDocument } from '../modules/inventory/material.model.js';
import { allocateIssueId } from '../modules/issues/issue-id.js';
import { IssueModel, type IssueLineRecord } from '../modules/issues/issue.model.js';
import { issueYearInIst } from '../modules/issues/issue-date.js';
import { allocateReceiverCode } from '../modules/receivers/receiver-code.js';
import { ReceiverModel, type ReceiverDocument } from '../modules/receivers/receiver.model.js';
import { UserModel, type UserDocument } from '../modules/users/user.model.js';

const MIGRATION_KEY = 'deployed-location-stock-2026-08-12';
const STORE_PATTERN = /param\s*(?:centre\s*store|computer\s*cent(?:re|er))/i;
const CONTACT_PLACEHOLDER = '0000000000';
const EMAIL_DOMAIN = 'assetdesk.local';

interface MaterialPlan {
  material: MaterialDocument;
  deployedQuantity: number;
}

interface LocationPlan {
  key: string;
  location: string;
  block?: string;
  locationBlock: string;
  materials: MaterialPlan[];
  totalQuantity: number;
  serializedQuantity: number;
  quantityTrackedQuantity: number;
}

interface Options {
  apply: boolean;
  limitLocations?: number;
}

function parseOptions(): Options {
  const args = new Set(process.argv.slice(2));
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit-locations='));
  const limitLocations = limitArg ? Number(limitArg.split('=')[1]) : undefined;
  if (
    limitLocations !== undefined &&
    (!Number.isSafeInteger(limitLocations) || limitLocations < 1)
  ) {
    throw new Error('--limit-locations must be a positive integer.');
  }
  return { apply: args.has('--apply'), limitLocations };
}

function normalizeSpace(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function isStoreMaterial(material: MaterialDocument): boolean {
  const joined = [material.location, material.block, material.locationBlock]
    .map(normalizeSpace)
    .filter(Boolean)
    .join(' / ');
  return STORE_PATTERN.test(joined);
}

function locationKey(material: MaterialDocument): string {
  const location = normalizeSpace(material.location) || 'Unknown Location';
  const block = normalizeSpace(material.block);
  return `${location.toUpperCase()}|${block.toUpperCase()}`;
}

function receiverIdentity(locationBlock: string): string {
  return `MIGRATION:${MIGRATION_KEY}:${locationBlock.toUpperCase()}`;
}

function receiverEmail(locationBlock: string): string {
  const slug = locationBlock
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  const hash = createHash('sha1').update(locationBlock).digest('hex').slice(0, 8);
  return `deployed-${slug || 'location'}-${hash}@${EMAIL_DOMAIN}`;
}

function requestHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function buildPlans(materials: MaterialDocument[]): LocationPlan[] {
  const plans = new Map<string, LocationPlan>();
  for (const material of materials) {
    if (isStoreMaterial(material)) continue;
    const deployedQuantity = material.availableQuantity;
    if (deployedQuantity <= 0) continue;

    const location = normalizeSpace(material.location) || 'Unknown Location';
    const block = normalizeSpace(material.block);
    const locationBlock = block ? `${location} / ${block}` : location;
    const key = locationKey(material);
    const plan =
      plans.get(key) ??
      ({
        key,
        location,
        ...(block ? { block } : {}),
        locationBlock,
        materials: [],
        totalQuantity: 0,
        serializedQuantity: 0,
        quantityTrackedQuantity: 0,
      } satisfies LocationPlan);

    plan.materials.push({ material, deployedQuantity });
    plan.totalQuantity += deployedQuantity;
    if (material.trackingMode === 'SERIALIZED') plan.serializedQuantity += deployedQuantity;
    else plan.quantityTrackedQuantity += deployedQuantity;
    plans.set(key, plan);
  }
  return [...plans.values()].sort((left, right) => right.totalQuantity - left.totalQuantity);
}

async function getAdminActor(): Promise<UserDocument> {
  const admin =
    (await UserModel.findOne({ workerId: process.env.ASSETDESK_ADMIN_ID, role: 'ADMIN' })) ??
    (await UserModel.findOne({ role: 'ADMIN', status: 'ACTIVE' }).sort({ createdAt: 1 }));
  if (!admin) throw new Error('No Admin user found for migration actor.');
  return admin;
}

async function getOrCreateLocationReceiver(
  plan: LocationPlan,
  admin: UserDocument,
  session: ClientSession,
): Promise<ReceiverDocument> {
  const universityId = receiverIdentity(plan.locationBlock);
  const existing = await ReceiverModel.findOne({ universityIdNormalized: universityId }).session(
    session,
  );
  if (existing) return existing;

  const receiverCode = await allocateReceiverCode(session);
  const receiver = new ReceiverModel({
    receiverCode,
    fullName: plan.locationBlock,
    fullNameNormalized: plan.locationBlock.toUpperCase(),
    universityId,
    universityIdNormalized: universityId,
    type: 'DEPARTMENT',
    ...(plan.block
      ? { department: plan.block, departmentNormalized: plan.block.toUpperCase() }
      : {}),
    contact: CONTACT_PLACEHOLDER,
    contactNormalized: CONTACT_PLACEHOLDER,
    email: receiverEmail(plan.locationBlock),
    emailNormalized: receiverEmail(plan.locationBlock),
    status: 'ACTIVE',
    operationalUseCount: 0,
    createdBy: admin._id,
    updatedBy: admin._id,
  });
  return receiver.save({ session });
}

async function buildIssueLine(
  materialPlan: MaterialPlan,
  session: ClientSession,
): Promise<IssueLineRecord> {
  const { material, deployedQuantity } = materialPlan;
  const lineId = new Types.ObjectId().toString();
  const materialSnapshot = {
    materialId: material._id,
    materialCode: material.materialCode,
    name: material.name,
    category: material.category,
    source: 'CATALOG' as const,
    trackingMode: material.trackingMode,
    returnPolicy: material.returnPolicy,
    ...(material.unitLabel ? { unitLabel: material.unitLabel } : {}),
  };

  if (material.trackingMode === 'SERIALIZED') {
    const units = await AssetUnitModel.find({
      materialId: material._id,
      status: 'AVAILABLE',
    })
      .limit(deployedQuantity)
      .session(session);
    if (units.length !== deployedQuantity) {
      throw new Error(
        `Material ${material.materialCode} expected ${deployedQuantity} available units, found ${units.length}.`,
      );
    }
    return {
      lineId,
      material: materialSnapshot,
      issuedQuantity: deployedQuantity,
      outstandingQuantity: deployedQuantity,
      assets: units.map((unit) => ({
        assetUnitId: unit._id,
        assetTag: unit.assetTag,
        ...(unit.serialNumber ? { serialNumber: unit.serialNumber } : {}),
        conditionAtIssue: unit.condition,
        outstanding: true,
      })),
    };
  }

  const outstandingQuantity = material.returnPolicy === 'REUSABLE' ? deployedQuantity : 0;
  return {
    lineId,
    material: materialSnapshot,
    issuedQuantity: deployedQuantity,
    outstandingQuantity,
    assets: [],
  };
}

async function migrateLocation(
  plan: LocationPlan,
  admin: UserDocument,
): Promise<{ issueId: string; lineCount: number; itemCount: number } | undefined> {
  const session = await mongoose.startSession();
  try {
    let result: { issueId: string; lineCount: number; itemCount: number } | undefined;
    await session.withTransaction(async () => {
      const idempotencyKeyHash = requestHash(`${MIGRATION_KEY}:${plan.key}`);
      const existing = await IssueModel.findOne({ idempotencyKeyHash })
        .select('issueId')
        .session(session);
      if (existing) {
        result = undefined;
        return;
      }

      const receiver = await getOrCreateLocationReceiver(plan, admin, session);
      const lines: IssueLineRecord[] = [];
      for (const materialPlan of plan.materials) {
        lines.push(await buildIssueLine(materialPlan, session));
      }

      const issuedAt = new Date();
      const issueId = await allocateIssueId(issueYearInIst(issuedAt), session);
      const totalIssuedQuantity = lines.reduce((sum, line) => sum + line.issuedQuantity, 0);
      const totalOutstandingQuantity = lines.reduce(
        (sum, line) => sum + line.outstandingQuantity,
        0,
      );
      const issue = new IssueModel({
        issueId,
        receiver: {
          receiverId: receiver._id,
          receiverCode: receiver.receiverCode,
          fullName: receiver.fullName,
          ...(receiver.universityId ? { universityId: receiver.universityId } : {}),
          type: receiver.type,
          ...(receiver.department ? { department: receiver.department } : {}),
          contact: receiver.contact,
          email: receiver.email,
        },
        issuedBy: {
          userId: admin._id,
          workerId: admin.workerId,
          name: admin.name,
          role: admin.role,
        },
        issuedAt,
        assignmentType: 'LONG_TERM',
        status: 'ISSUED',
        purpose: 'Migration: mark non-store location inventory as already deployed.',
        notes: `Created by ${MIGRATION_KEY}. Store stock remains Param Computer Centre only.`,
        lines,
        returnEvents: [],
        totalIssuedQuantity,
        totalOutstandingQuantity,
        hasDamagedOutcome: false,
        hasLostOutcome: false,
        idempotencyKeyHash,
        requestFingerprint: requestHash(JSON.stringify({ key: plan.key, totalIssuedQuantity })),
        createdByUserId: admin._id,
      });
      await issue.save({ session });

      for (const line of lines) {
        if (line.material.trackingMode === 'SERIALIZED') {
          const assetTags = line.assets.map((asset) => asset.assetTag);
          const unitUpdate = await AssetUnitModel.updateMany(
            {
              materialId: line.material.materialId,
              assetTag: { $in: assetTags },
              status: 'AVAILABLE',
            },
            { $set: { status: 'ISSUED' } },
            { session },
          );
          if (unitUpdate.modifiedCount !== assetTags.length) {
            throw new Error(
              `Material ${line.material.materialCode} unit update mismatch: ${unitUpdate.modifiedCount}/${assetTags.length}.`,
            );
          }
        }

        if (line.material.returnPolicy === 'CONSUMABLE') {
          await MaterialModel.updateOne(
            { _id: line.material.materialId, availableQuantity: { $gte: line.issuedQuantity } },
            {
              $inc: {
                availableQuantity: -line.issuedQuantity,
                totalQuantity: -line.issuedQuantity,
              },
            },
            { session },
          );
          continue;
        }

        await MaterialModel.updateOne(
          { _id: line.material.materialId, availableQuantity: { $gte: line.issuedQuantity } },
          {
            $inc: { availableQuantity: -line.issuedQuantity, issuedQuantity: line.issuedQuantity },
          },
          { session },
        );
      }

      await appendAuditEvent(
        {
          requestId: MIGRATION_KEY,
          actorUserId: admin._id.toString(),
          actorWorkerId: admin.workerId,
          actorRole: admin.role,
          action: 'MIGRATION_DEPLOYED_LOCATION_ISSUES_CREATED',
          targetType: 'ISSUE',
          targetId: issueId,
          result: 'SUCCESS',
          metadata: {
            migrationKey: MIGRATION_KEY,
            location: plan.location,
            block: plan.block ?? null,
            lineCount: lines.length,
            totalIssuedQuantity,
            totalOutstandingQuantity,
          },
        },
        { session },
      );

      result = { issueId, lineCount: lines.length, itemCount: totalIssuedQuantity };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function main() {
  const options = parseOptions();
  await connectToDatabase();

  const admin = await getAdminActor();
  const materials = await MaterialModel.find({
    status: { $in: ['ACTIVE', 'NOT_IN_USE'] },
    availableQuantity: { $gt: 0 },
  }).sort({ location: 1, block: 1, category: 1, name: 1 });
  const plans = buildPlans(materials);
  const selectedPlans = options.limitLocations ? plans.slice(0, options.limitLocations) : plans;
  const existingMigrationIssues = await IssueModel.countDocuments({
    purpose: 'Migration: mark non-store location inventory as already deployed.',
  });

  const summary = {
    mode: options.apply ? 'APPLY' : 'DRY_RUN',
    migrationKey: MIGRATION_KEY,
    storeRule: 'Only Param Computer Centre / Param Centre Store remains available store stock.',
    adminActor: { workerId: admin.workerId, name: admin.name },
    scannedMaterials: materials.length,
    affectedLocations: selectedPlans.length,
    affectedMaterials: selectedPlans.reduce((sum, plan) => sum + plan.materials.length, 0),
    totalToMoveFromAvailable: selectedPlans.reduce((sum, plan) => sum + plan.totalQuantity, 0),
    serializedToIssue: selectedPlans.reduce((sum, plan) => sum + plan.serializedQuantity, 0),
    quantityTrackedToIssue: selectedPlans.reduce(
      (sum, plan) => sum + plan.quantityTrackedQuantity,
      0,
    ),
    existingMigrationIssues,
    locations: selectedPlans.map((plan) => ({
      location: plan.location,
      block: plan.block ?? null,
      materials: plan.materials.length,
      totalQuantity: plan.totalQuantity,
      serializedQuantity: plan.serializedQuantity,
      quantityTrackedQuantity: plan.quantityTrackedQuantity,
      sampleMaterials: plan.materials.slice(0, 5).map(({ material, deployedQuantity }) => ({
        materialCode: material.materialCode,
        name: material.name,
        category: material.category,
        trackingMode: material.trackingMode,
        returnPolicy: material.returnPolicy,
        deployedQuantity,
      })),
    })),
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!options.apply) {
    console.log(
      '\nDry run only. Re-run with --apply to create migration Issue Records and update stock.',
    );
    await mongoose.disconnect();
    return;
  }

  const applied = [];
  for (const plan of selectedPlans) {
    const result = await migrateLocation(plan, admin);
    if (result) applied.push({ location: plan.locationBlock, ...result });
  }
  console.log(JSON.stringify({ appliedCount: applied.length, applied }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
