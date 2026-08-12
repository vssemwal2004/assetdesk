import { connectDatabase, disconnectDatabase } from '../db/mongoose.js';
import { AssetDetailModel } from '../modules/inventory/asset-detail.model.js';
import { MaterialModel } from '../modules/inventory/material.model.js';
import { normalizeLookupValue } from '../modules/inventory/inventory.service.js';
import { UserModel } from '../modules/users/user.model.js';

const CURRENT_STORE_PATTERN =
  /^(param\s*centre\s*store|param\s*center\s*store|aryabhatt\s*store|aryabhat\s*store|arayabhatt\s*store)$/i;

const TARGET_STORES = [
  { location: 'Param Centre Store', block: 'Param Computer Centre' },
  { location: 'Aryabhatt Store', block: 'Aryabhatt Centre' },
] as const;

async function main(): Promise<void> {
  await connectDatabase();
  const admin = await UserModel.findOne({ role: 'ADMIN' }).sort({ createdAt: 1, _id: 1 });
  if (!admin) throw new Error('No admin user found to own seeded store details.');

  await AssetDetailModel.deleteMany({ kind: 'STORE' });
  for (const store of TARGET_STORES) {
    await MaterialModel.updateMany(
      { location: exactStorePattern(store.location) },
      {
        $set: {
          location: store.location,
          block: store.block,
          locationBlock: `${store.location} / ${store.block}`,
        },
      },
    );
  }
  const stores = TARGET_STORES.map((store) => `${store.location} / ${store.block}`);

  const report: Array<{ store: string; action: 'created' }> = [];
  for (const store of stores) {
    const normalizedName = normalizeLookupValue(store);
    await AssetDetailModel.create({
      kind: 'STORE',
      name: store,
      normalizedName,
      createdBy: admin._id,
    });
    report.push({ store, action: 'created' });
  }

  console.table(report);
}

function exactStorePattern(location: string): RegExp {
  return new RegExp(
    `^${location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*')}$`,
    'i',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
