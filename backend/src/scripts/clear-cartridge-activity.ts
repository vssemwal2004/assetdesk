import { connectDatabase, disconnectDatabase } from '../db/mongoose.js';
import { CartridgeMovementModel } from '../modules/cartridges/cartridge-movement.model.js';

const confirmation = '--confirm-clear-cartridge-activity';

if (!process.argv.includes(confirmation)) {
  throw new Error(`Refusing to clear cartridge activity without ${confirmation}.`);
}

await connectDatabase();

try {
  const result = await CartridgeMovementModel.deleteMany({});
  console.log(JSON.stringify({ cartridgeActivityRecordsDeleted: result.deletedCount }));
} finally {
  await disconnectDatabase();
}
