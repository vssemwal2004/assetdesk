import { connectDatabase, disconnectDatabase } from '../db/mongoose.js';
import { AssetDetailModel } from '../modules/inventory/asset-detail.model.js';
import { IssueModel } from '../modules/issues/issue.model.js';
await connectDatabase();
console.log('LOCATIONS', await AssetDetailModel.find({ kind: 'LOCATION' }).select({ name: 1 }).lean());
console.log('MARKETING', await IssueModel.find({ destinationLocation: /marketing/i }).select({ issueId: 1, destinationLocation: 1, receiver: 1 }).lean());
await disconnectDatabase();
