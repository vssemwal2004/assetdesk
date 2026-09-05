import { Types } from 'mongoose';
import type { CreateCartridgesRequest } from '@assetdesk/contracts';
import { AppError } from '../../middleware/error-handler.js';
import { UserModel } from '../users/user.model.js';
import { CartridgeModel, type CartridgeDocument } from './cartridge.model.js';
import { CartridgeMovementModel } from './cartridge-movement.model.js';
import { GatePassModel } from './gate-pass.model.js';
import { AssetDetailModel } from '../inventory/asset-detail.model.js';

export interface CartridgeActor {
  userId: string;
  workerId: string;
  dataScope: 'OWN' | 'ALL';
}
function normalize(value: string) {
  return value.trim().toUpperCase();
}
function normalizeDetail(value: string) {
  return value.trim().replace(/\s+/g, '').toLocaleUpperCase('en-US');
}
function mapCartridge(item: CartridgeDocument) {
  return {
    id: item._id.toString(),
    serialNumber: item.serialNumber,
    model: item.cartridgeModel,
    colour: item.colour,
    compatiblePrinter: item.compatiblePrinter ?? null,
    location: item.location,
    department: item.department,
    vendorName: item.vendorName ?? null,
    status: item.status,
    currentHolderName: item.currentHolderName ?? null,
    refillCount: item.refillCount,
    notes: item.notes ?? null,
    createdByWorkerId: item.createdByWorkerId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
async function actorName(actor: CartridgeActor) {
  return (await UserModel.findById(actor.userId).select('name').lean())?.name ?? actor.workerId;
}
async function movement(
  cartridge: CartridgeDocument,
  type: string,
  fromStatus: string | undefined,
  actor: CartridgeActor,
  extra: Record<string, unknown> = {},
) {
  await CartridgeMovementModel.create({
    cartridgeId: cartridge._id,
    serialNumber: cartridge.serialNumber,
    type,
    ...(fromStatus ? { fromStatus } : {}),
    toStatus: cartridge.status,
    actorUserId: new Types.ObjectId(actor.userId),
    actorWorkerId: actor.workerId,
    ...extra,
  });
}

async function movements(
  cartridges: CartridgeDocument[],
  type: string,
  fromStatuses: Map<string, string | undefined>,
  actor: CartridgeActor,
  extra: Record<string, unknown> = {},
) {
  if (cartridges.length === 0) return;
  await CartridgeMovementModel.insertMany(
    cartridges.map((cartridge) => ({
      cartridgeId: cartridge._id,
      serialNumber: cartridge.serialNumber,
      type,
      ...(fromStatuses.get(cartridge._id.toString())
        ? { fromStatus: fromStatuses.get(cartridge._id.toString()) }
        : {}),
      toStatus: cartridge.status,
      actorUserId: new Types.ObjectId(actor.userId),
      actorWorkerId: actor.workerId,
      ...extra,
    })),
  );
}
export async function createCartridges(input: CreateCartridgesRequest, actor: CartridgeActor) {
  const [savedLocation, savedDepartment] = await Promise.all([
    AssetDetailModel.findOne({
      kind: 'LOCATION',
      normalizedName: normalizeDetail(input.location),
    }).lean(),
    AssetDetailModel.findOne({
      kind: 'DEPARTMENT',
      normalizedName: normalizeDetail(input.department),
    }).lean(),
  ]);
  if (!savedLocation || !savedDepartment)
    throw new AppError(
      400,
      'CARTRIDGE_DETAIL_NOT_SAVED',
      'Choose a Location and Department saved by the Admin.',
    );
  const normalized = input.serialNumbers.map(normalize);
  const duplicates = await CartridgeModel.find({ serialNumberNormalized: { $in: normalized } })
    .select('serialNumber')
    .lean();
  if (duplicates.length)
    throw new AppError(
      409,
      'CARTRIDGE_SERIAL_EXISTS',
      `Already registered: ${duplicates.map((x) => x.serialNumber).join(', ')}`,
    );
  const docs = await CartridgeModel.insertMany(
    input.serialNumbers.map((serialNumber) => ({
      serialNumber: serialNumber.trim(),
      serialNumberNormalized: normalize(serialNumber),
      cartridgeModel: input.model,
      colour: input.colour,
      ...(input.compatiblePrinter ? { compatiblePrinter: input.compatiblePrinter } : {}),
      location: savedLocation.name,
      department: savedDepartment.name,
      ...(input.vendorName ? { vendorName: input.vendorName } : {}),
      status: input.status,
      ...(input.notes ? { notes: input.notes } : {}),
      createdBy: new Types.ObjectId(actor.userId),
      createdByWorkerId: actor.workerId,
    })),
  );
  await CartridgeMovementModel.insertMany(
    docs.map((doc) => ({
      cartridgeId: doc._id,
      serialNumber: doc.serialNumber,
      type: 'CREATED',
      toStatus: doc.status,
      actorUserId: new Types.ObjectId(actor.userId),
      actorWorkerId: actor.workerId,
    })),
  );
  return docs.map(mapCartridge);
}
export async function listCartridges(
  input: {
    page: number;
    pageSize: number;
    search?: string | undefined;
    status?: string | undefined;
  },
  actor: CartridgeActor,
) {
  const filter: Record<string, unknown> =
    actor.dataScope === 'OWN' ? { createdBy: new Types.ObjectId(actor.userId) } : {};
  if (input.status) filter.status = input.status;
  if (input.search) {
    const regex = new RegExp(input.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { serialNumber: regex },
      { cartridgeModel: regex },
      { currentHolderName: regex },
      { department: regex },
      { vendorName: regex },
    ];
  }
  const [docs, total] = await Promise.all([
    CartridgeModel.find(filter)
      .sort({ updatedAt: -1 })
      .skip((input.page - 1) * input.pageSize)
      .limit(input.pageSize),
    CartridgeModel.countDocuments(filter),
  ]);
  return {
    data: docs.map(mapCartridge),
    meta: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    },
  };
}
export async function listCartridgeActivity(
  input: {
    page: number;
    pageSize: number;
    search?: string | undefined;
    type?: string | undefined;
  },
  actor: CartridgeActor,
) {
  const filter: Record<string, unknown> = {};
  if (actor.dataScope === 'OWN') filter.actorUserId = new Types.ObjectId(actor.userId);
  if (input.type) filter.type = input.type;
  if (input.search) {
    const regex = new RegExp(input.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { serialNumber: regex },
      { type: regex },
      { fromStatus: regex },
      { toStatus: regex },
      { employeeName: regex },
      { employeeId: regex },
      { department: regex },
      { remarks: regex },
      { actorWorkerId: regex },
    ];
  }
  const [docs, total] = await Promise.all([
    CartridgeMovementModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((input.page - 1) * input.pageSize)
      .limit(input.pageSize)
      .lean(),
    CartridgeMovementModel.countDocuments(filter),
  ]);
  return {
    data: docs.map((item) => ({
      id: item._id.toString(),
      cartridgeId: item.cartridgeId.toString(),
      serialNumber: item.serialNumber,
      type: item.type,
      fromStatus: item.fromStatus ?? null,
      toStatus: item.toStatus,
      employeeName: item.employeeName ?? null,
      employeeId: item.employeeId ?? null,
      department: item.department ?? null,
      defectReason: item.defectReason ?? null,
      remarks: item.remarks ?? null,
      actorWorkerId: item.actorWorkerId,
      createdAt: item.createdAt.toISOString(),
    })),
    meta: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    },
  };
}
async function findCartridge(serialNumber: string) {
  const item = await CartridgeModel.findOne({ serialNumberNormalized: normalize(serialNumber) });
  if (!item) throw new AppError(404, 'CARTRIDGE_NOT_FOUND', 'Cartridge was not found.');
  return item;
}
export async function getCartridge(serial: string, actor: CartridgeActor) {
  const item = await findCartridge(serial);
  if (actor.dataScope === 'OWN' && item.createdBy.toString() !== actor.userId) {
    const involved = await CartridgeMovementModel.exists({
      cartridgeId: item._id,
      actorUserId: new Types.ObjectId(actor.userId),
    });
    if (!involved)
      throw new AppError(403, 'PERMISSION_DENIED', 'You do not have access to this cartridge.');
  }
  const history = await CartridgeMovementModel.find({ cartridgeId: item._id })
    .sort({ createdAt: -1 })
    .lean();
  return { cartridge: mapCartridge(item), history };
}
export async function issueCartridge(
  input: {
    serialNumber: string;
    employeeName: string;
    employeeId?: string | undefined;
    department?: string | undefined;
    printerLocation?: string | undefined;
    remarks?: string | undefined;
  },
  actor: CartridgeActor,
) {
  const item = await findCartridge(input.serialNumber);
  if (item.status !== 'FILLED_AVAILABLE')
    throw new AppError(
      409,
      'CARTRIDGE_NOT_AVAILABLE',
      'Only a filled available cartridge can be issued.',
    );
  const from = item.status;
  item.status = 'ISSUED';
  item.currentHolderName = input.employeeName;
  if (input.employeeId) item.currentHolderId = input.employeeId;
  else delete item.currentHolderId;
  await item.save();
  await movement(item, 'ISSUED', from, actor, input);
  return mapCartridge(item);
}
export async function returnCartridge(
  input: {
    serialNumber: string;
    returnedByName: string;
    condition: string;
    defectReason?: string | undefined;
    remarks?: string | undefined;
  },
  actor: CartridgeActor,
) {
  const item = await findCartridge(input.serialNumber);
  if (item.status !== 'ISSUED')
    throw new AppError(409, 'CARTRIDGE_NOT_ISSUED', 'Only an issued cartridge can be returned.');
  const from = item.status;
  item.status =
    input.condition === 'EMPTY'
      ? 'EMPTY'
      : input.condition === 'FILLED_UNUSED'
        ? 'FILLED_AVAILABLE'
        : input.condition === 'DAMAGED'
          ? 'DAMAGED'
          : 'DEFECTIVE';
  delete item.currentHolderName;
  delete item.currentHolderId;
  await item.save();
  await movement(item, 'RETURNED', from, actor, {
    employeeName: input.returnedByName,
    defectReason: input.defectReason,
    remarks: input.remarks,
  });
  return mapCartridge(item);
}
export async function createGatePass(
  input: {
    vendorName: string;
    personTakingMaterial: string;
    cartridgeSerialNumbers: string[];
    expectedReturnDate?: string | undefined;
    remarks?: string | undefined;
    submitForVerification: boolean;
  },
  actor: CartridgeActor,
) {
  const serials = [...new Set(input.cartridgeSerialNumbers.map(normalize))];
  if (serials.length !== input.cartridgeSerialNumbers.length)
    throw new AppError(400, 'DUPLICATE_CARTRIDGE', 'A cartridge can appear only once.');
  const cartridges = await CartridgeModel.find({ serialNumberNormalized: { $in: serials } });
  if (cartridges.length !== serials.length)
    throw new AppError(404, 'CARTRIDGE_NOT_FOUND', 'One or more cartridges were not found.');
  if (cartridges.some((item) => !['EMPTY', 'DEFECTIVE', 'REFILL_FAILED'].includes(item.status)))
    throw new AppError(
      409,
      'CARTRIDGE_NOT_GATE_PASS_ELIGIBLE',
      'Only empty, defective, or refill-failed cartridges can be added.',
    );
  const name = await actorName(actor);
  const gatePassNumber = `GP-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`;
  const gateOutAt = new Date();
  const pass = await GatePassModel.create({
    gatePassNumber,
    vendorName: input.vendorName,
    personTakingMaterial: input.personTakingMaterial,
    cartridgeIds: cartridges.map((x) => x._id),
    cartridgeSerialNumbers: cartridges.map((x) => x.serialNumber),
    quantity: cartridges.length,
    status: 'GATE_OUT',
    preparedByUserId: new Types.ObjectId(actor.userId),
    preparedByWorkerId: actor.workerId,
    preparedByName: name,
    verifiedByUserId: new Types.ObjectId(actor.userId),
    verifiedByWorkerId: actor.workerId,
    verifiedByName: name,
    verifiedAt: gateOutAt,
    gateOutAt,
    gateOutByName: name,
    ...(input.expectedReturnDate ? { expectedReturnDate: new Date(input.expectedReturnDate) } : {}),
    ...(input.remarks ? { remarks: input.remarks } : {}),
  });
  const fromStatuses = new Map(cartridges.map((item) => [item._id.toString(), item.status]));
  await CartridgeModel.updateMany(
    { _id: { $in: pass.cartridgeIds } },
    { $set: { status: 'WITH_VENDOR' } },
  );
  const updatedCartridges = await CartridgeModel.find({ _id: { $in: pass.cartridgeIds } });
  await movements(updatedCartridges, 'GATE_OUT', fromStatuses, actor, {
    remarks: `Gate Pass ${pass.gatePassNumber} created and sent out.`,
  });
  return pass;
}
export async function listGatePasses(actor: CartridgeActor) {
  const filter =
    actor.dataScope === 'OWN' ? { preparedByUserId: new Types.ObjectId(actor.userId) } : {};
  return GatePassModel.find(filter).sort({ createdAt: -1 }).lean();
}
export async function getGatePass(id: string, actor: CartridgeActor) {
  const pass = await GatePassModel.findById(id).lean();
  if (!pass) throw new AppError(404, 'GATE_PASS_NOT_FOUND', 'Gate Pass was not found.');
  if (
    actor.dataScope === 'OWN' &&
    pass.preparedByUserId.toString() !== actor.userId &&
    pass.verifiedByUserId?.toString() !== actor.userId
  )
    throw new AppError(403, 'PERMISSION_DENIED', 'You do not have access to this Gate Pass.');
  return pass;
}
export async function verifyGatePass(id: string, actor: CartridgeActor) {
  const pass = await GatePassModel.findById(id);
  if (!pass) throw new AppError(404, 'GATE_PASS_NOT_FOUND', 'Gate Pass was not found.');
  if (pass.status !== 'AWAITING_VERIFICATION' && pass.status !== 'DRAFT')
    throw new AppError(409, 'INVALID_GATE_PASS_STATE', 'This Gate Pass cannot be verified.');
  pass.status = 'VERIFIED';
  pass.verifiedByUserId = new Types.ObjectId(actor.userId);
  pass.verifiedByWorkerId = actor.workerId;
  pass.verifiedByName = await actorName(actor);
  pass.verifiedAt = new Date();
  await pass.save();
  const cartridges = await CartridgeModel.find({ _id: { $in: pass.cartridgeIds } });
  const fromStatuses = new Map(cartridges.map((item) => [item._id.toString(), item.status]));
  await movements(cartridges, 'GATE_PASS_VERIFIED', fromStatuses, actor, {
    remarks: `Gate Pass ${pass.gatePassNumber} verified.`,
  });
  return pass;
}
export async function gateOut(id: string, actor: CartridgeActor) {
  const pass = await GatePassModel.findById(id);
  if (!pass) throw new AppError(404, 'GATE_PASS_NOT_FOUND', 'Gate Pass was not found.');
  if (pass.status !== 'VERIFIED')
    throw new AppError(409, 'GATE_PASS_NOT_VERIFIED', 'Verify the Gate Pass before Gate Out.');
  const cartridges = await CartridgeModel.find({ _id: { $in: pass.cartridgeIds } });
  const fromStatuses = new Map(cartridges.map((item) => [item._id.toString(), item.status]));
  pass.status = 'GATE_OUT';
  pass.gateOutAt = new Date();
  pass.gateOutByName = await actorName(actor);
  await pass.save();
  await CartridgeModel.updateMany(
    { _id: { $in: pass.cartridgeIds } },
    { $set: { status: 'WITH_VENDOR' } },
  );
  const updatedCartridges = await CartridgeModel.find({ _id: { $in: pass.cartridgeIds } });
  await movements(updatedCartridges, 'GATE_OUT', fromStatuses, actor, {
    remarks: `Gate Out recorded on ${pass.gatePassNumber}.`,
  });
  return pass;
}
export async function cancelGatePass(id: string, actor: CartridgeActor) {
  const pass = await GatePassModel.findById(id);
  if (!pass) throw new AppError(404, 'GATE_PASS_NOT_FOUND', 'Gate Pass was not found.');
  if (!['DRAFT', 'AWAITING_VERIFICATION', 'VERIFIED'].includes(pass.status))
    throw new AppError(
      409,
      'INVALID_GATE_PASS_STATE',
      'Only a Gate Pass before Gate Out can be cancelled.',
    );
  const cartridges = await CartridgeModel.find({ _id: { $in: pass.cartridgeIds } });
  const fromStatuses = new Map(cartridges.map((item) => [item._id.toString(), item.status]));
  const setupMovements = await CartridgeMovementModel.find({
    cartridgeId: { $in: pass.cartridgeIds },
    type: 'GATE_PASS_CREATED',
    toStatus: 'READY_FOR_GATE_OUT',
    remarks: `Added to Gate Pass ${pass.gatePassNumber}.`,
  })
    .sort({ createdAt: -1 })
    .lean();
  const rollbackStatuses = new Map(
    setupMovements
      .filter((entry) => entry.fromStatus)
      .map((entry) => [entry.cartridgeId.toString(), entry.fromStatus as string]),
  );
  await Promise.all(
    cartridges.map(async (cartridge) => {
      cartridge.status =
        (rollbackStatuses.get(cartridge._id.toString()) as typeof cartridge.status | undefined) ??
        'EMPTY';
      await cartridge.save();
    }),
  );
  pass.status = 'CANCELLED';
  await pass.save();
  const updatedCartridges = await CartridgeModel.find({ _id: { $in: pass.cartridgeIds } });
  await movements(updatedCartridges, 'GATE_PASS_CANCELLED', fromStatuses, actor, {
    remarks: `Gate Pass ${pass.gatePassNumber} cancelled.`,
  });
  return pass;
}
export async function gateIn(
  id: string,
  serialNumbers: string[],
  remarks: string | undefined,
  actor: CartridgeActor,
  conditions: Array<{
    serialNumber: string;
    condition: 'EMPTY' | 'DEFECTIVE' | 'FILLED_UNUSED' | 'DAMAGED' | 'WRONG_MODEL';
  }>,
) {
  const pass = await GatePassModel.findById(id);
  if (!pass) throw new AppError(404, 'GATE_PASS_NOT_FOUND', 'Gate Pass was not found.');
  if (!['VERIFIED', 'GATE_OUT', 'PARTIALLY_RETURNED'].includes(pass.status))
    throw new AppError(
      409,
      'INVALID_GATE_PASS_STATE',
      'Gate In is not available for this Gate Pass.',
    );
  const normalized = serialNumbers.map(normalize);
  if (new Set(normalized).size !== normalized.length)
    throw new AppError(
      400,
      'DUPLICATE_CARTRIDGE',
      'A cartridge can appear only once in a Gate In entry.',
    );
  const allowed = new Set(pass.cartridgeSerialNumbers.map(normalize));
  if (normalized.some((x) => !allowed.has(x)))
    throw new AppError(
      400,
      'GATE_IN_SERIAL_MISMATCH',
      'A returned serial is not on this Gate Pass.',
    );
  const conditionsBySerial = new Map(
    conditions.map((item) => [normalize(item.serialNumber), item.condition]),
  );
  if (
    conditionsBySerial.size !== normalized.length ||
    normalized.some((serialNumber) => !conditionsBySerial.has(serialNumber))
  )
    throw new AppError(
      400,
      'GATE_IN_CONDITION_MISMATCH',
      'Choose one return condition for every cartridge being received.',
    );
  const already = new Set(pass.gateInEvents.flatMap((x) => x.serialNumbers.map(normalize)));
  if (normalized.some((x) => already.has(x)))
    throw new AppError(
      409,
      'CARTRIDGE_ALREADY_GATE_IN',
      'A cartridge was already recorded at Gate In.',
    );
  const name = await actorName(actor);
  const now = new Date();
  if (pass.status === 'VERIFIED') {
    pass.gateOutAt = now;
    pass.gateOutByName = name;
    const gateOutCartridges = await CartridgeModel.find({
      _id: { $in: pass.cartridgeIds },
      status: 'READY_FOR_GATE_OUT',
    });
    const gateOutFromStatuses = new Map(
      gateOutCartridges.map((item) => [item._id.toString(), item.status]),
    );
    await CartridgeModel.updateMany(
      { _id: { $in: pass.cartridgeIds }, status: 'READY_FOR_GATE_OUT' },
      { $set: { status: 'WITH_VENDOR' } },
    );
    const updatedGateOutCartridges = await CartridgeModel.find({
      _id: { $in: pass.cartridgeIds },
    });
    await movements(updatedGateOutCartridges, 'GATE_OUT', gateOutFromStatuses, actor, {
      remarks: `Gate Out recorded on ${pass.gatePassNumber}.`,
    });
  }
  const returned = already.size + normalized.length;
  const cartridges = await CartridgeModel.find({
    serialNumberNormalized: { $in: normalized },
    status: 'WITH_VENDOR',
  });
  if (cartridges.length !== normalized.length) {
    throw new AppError(
      409,
      'CARTRIDGE_NOT_WITH_VENDOR',
      'Only cartridges currently Gate Out with the vendor can be recorded at Gate In.',
    );
  }
  const fromStatuses = new Map(cartridges.map((item) => [item._id.toString(), item.status]));
  await Promise.all(
    cartridges.map(async (item) => {
      const condition = conditionsBySerial.get(normalize(item.serialNumber));
      item.status =
        condition === 'FILLED_UNUSED'
          ? 'FILLED_AVAILABLE'
          : condition === 'EMPTY'
            ? 'EMPTY'
            : condition === 'DAMAGED'
              ? 'DAMAGED'
              : 'DEFECTIVE';
      if (condition === 'FILLED_UNUSED') item.refillCount += 1;
      await item.save();
    }),
  );
  const updatedCartridges = await CartridgeModel.find({
    serialNumberNormalized: { $in: normalized },
  });
  await movements(updatedCartridges, 'GATE_IN', fromStatuses, actor, {
    remarks: `Gate In recorded with return condition on ${pass.gatePassNumber}.`,
  });
  const nextStatus: 'PARTIALLY_RETURNED' | 'CLOSED' =
    returned === pass.quantity ? 'CLOSED' : 'PARTIALLY_RETURNED';
  pass.gateInEvents.push({
    at: now,
    byName: name,
    serialNumbers,
    conditions,
    ...(remarks ? { remarks } : {}),
  });
  pass.status = nextStatus;
  await pass.save();
  return pass;
}
export async function cartridgeDashboard(actor: CartridgeActor) {
  const filter = actor.dataScope === 'OWN' ? { createdBy: new Types.ObjectId(actor.userId) } : {};
  const [rows, refilled] = await Promise.all([
    CartridgeModel.aggregate<{ _id: string; count: number }>([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    CartridgeModel.countDocuments({ ...filter, refillCount: { $gt: 0 } }),
  ]);
  const counts = Object.fromEntries(rows.map((x) => [x._id, x.count]));
  const openGatePasses = await GatePassModel.countDocuments(
    actor.dataScope === 'OWN'
      ? {
          preparedByUserId: new Types.ObjectId(actor.userId),
          status: { $nin: ['CLOSED', 'CANCELLED'] },
        }
      : { status: { $nin: ['CLOSED', 'CANCELLED'] } },
  );
  return { counts, openGatePasses, refilled };
}
export async function recordQc(
  input: {
    serialNumber: string;
    result:
      | 'PASS'
      | 'REFILL_FAILED'
      | 'DAMAGED'
      | 'EMPTY'
      | 'DEFECTIVE'
      | 'FILLED_UNUSED'
      | 'WRONG_MODEL';
    remarks?: string | undefined;
  },
  actor: CartridgeActor,
) {
  const item = await findCartridge(input.serialNumber);
  if (item.status !== 'QC_PENDING')
    throw new AppError(409, 'QC_NOT_PENDING', 'This cartridge is not awaiting QC.');
  const from = item.status;
  item.status = ['PASS', 'FILLED_UNUSED'].includes(input.result)
    ? 'FILLED_AVAILABLE'
    : input.result === 'EMPTY'
      ? 'EMPTY'
      : input.result === 'DAMAGED'
        ? 'DAMAGED'
        : input.result === 'DEFECTIVE' || input.result === 'WRONG_MODEL'
          ? 'DEFECTIVE'
          : 'REFILL_FAILED';
  if (['PASS', 'FILLED_UNUSED'].includes(input.result)) item.refillCount += 1;
  await item.save();
  await movement(item, 'QC', from, actor, { remarks: input.remarks, result: input.result });
  const pass = await GatePassModel.findOne({ cartridgeIds: item._id, status: 'QC_PENDING' });
  if (pass) {
    const pending = await CartridgeModel.countDocuments({
      _id: { $in: pass.cartridgeIds },
      status: 'QC_PENDING',
    });
    if (pending === 0) {
      pass.status = 'CLOSED';
      await pass.save();
    }
  }
  return mapCartridge(item);
}
