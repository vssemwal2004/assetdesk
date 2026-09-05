import { connectDatabase, disconnectDatabase } from '../db/mongoose.js';
import { CartridgeModel } from '../modules/cartridges/cartridge.model.js';
import { GatePassModel } from '../modules/cartridges/gate-pass.model.js';

await connectDatabase();

try {
  const [cartridges, gatePasses] = await Promise.all([
    CartridgeModel.updateMany(
      { status: 'QC_PENDING' },
      { $set: { status: 'FILLED_AVAILABLE' }, $unset: { currentHolderName: '', currentHolderId: '' } },
    ),
    GatePassModel.updateMany({ status: 'QC_PENDING' }, { $set: { status: 'CLOSED' } }),
  ]);
  console.log(
    JSON.stringify({
      cartridgesMadeFilledAvailable: cartridges.modifiedCount,
      gatePassesClosed: gatePasses.modifiedCount,
    }),
  );
} finally {
  await disconnectDatabase();
}
