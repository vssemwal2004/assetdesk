import { connectDatabase, disconnectDatabase } from '../db/mongoose.js';
import { CartridgeModel } from '../modules/cartridges/cartridge.model.js';
import { CartridgeMovementModel } from '../modules/cartridges/cartridge-movement.model.js';
import { GatePassModel } from '../modules/cartridges/gate-pass.model.js';

const confirmation = '--confirm-reset-cartridges';

if (!process.argv.includes(confirmation)) {
  throw new Error(`Refusing to reset cartridge data without ${confirmation}.`);
}

await connectDatabase();

try {
  const [cartridgeCount, gatePassCount, gatePassMovementCount] = await Promise.all([
    CartridgeModel.countDocuments(),
    GatePassModel.countDocuments(),
    CartridgeMovementModel.countDocuments({
      type: {
        $in: [
          'GATE_PASS_CREATED',
          'GATE_PASS_VERIFIED',
          'GATE_PASS_CANCELLED',
          'GATE_OUT',
          'GATE_IN',
          'QC',
        ],
      },
    }),
  ]);

  const [cartridges, gatePasses, movements] = await Promise.all([
    CartridgeModel.updateMany(
      {},
      {
        $set: { status: 'FILLED_AVAILABLE' },
        $unset: { currentHolderName: '', currentHolderId: '', vendorName: '' },
      },
    ),
    GatePassModel.deleteMany({}),
    CartridgeMovementModel.deleteMany({
      type: {
        $in: [
          'GATE_PASS_CREATED',
          'GATE_PASS_VERIFIED',
          'GATE_PASS_CANCELLED',
          'GATE_OUT',
          'GATE_IN',
          'QC',
        ],
      },
    }),
  ]);

  console.log(
    JSON.stringify({
      cartridgesFound: cartridgeCount,
      cartridgesUpdated: cartridges.modifiedCount,
      gatePassesFound: gatePassCount,
      gatePassesDeleted: gatePasses.deletedCount,
      gatePassMovementsFound: gatePassMovementCount,
      gatePassMovementsDeleted: movements.deletedCount,
    }),
  );
} finally {
  await disconnectDatabase();
}
