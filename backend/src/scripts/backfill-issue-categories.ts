import { connectDatabase, disconnectDatabase } from '../db/mongoose.js';
import { MaterialModel } from '../modules/inventory/material.model.js';
import { IssueModel } from '../modules/issues/issue.model.js';

async function main(): Promise<void> {
  await connectDatabase();
  const issues = await IssueModel.find({
    $or: [
      { 'lines.material.category': { $exists: false } },
      { 'lines.material.category': null },
      { 'lines.material.category': '' },
    ],
  })
    .select(
      '_id issueId lines.material.materialId lines.material.materialCode lines.material.category',
    )
    .lean();

  const materials = await MaterialModel.find({}).select('_id materialCode category').lean();
  const byId = new Map(materials.map((material) => [material._id.toString(), material.category]));
  const byCode = new Map(materials.map((material) => [material.materialCode, material.category]));
  let updatedLines = 0;
  const unmatched: Array<{ issueId: string; materialCode: string }> = [];

  for (const issue of issues) {
    for (let index = 0; index < issue.lines.length; index += 1) {
      const line = issue.lines[index];
      if (!line || line.material.category?.trim()) continue;
      const category =
        byId.get(line.material.materialId?.toString() ?? '') ??
        byCode.get(line.material.materialCode);
      if (!category) {
        unmatched.push({ issueId: issue.issueId, materialCode: line.material.materialCode });
        continue;
      }
      await IssueModel.collection.updateOne(
        { _id: issue._id },
        { $set: { [`lines.${index}.material.category`]: category } },
      );
      updatedLines += 1;
    }
  }

  console.log(
    JSON.stringify(
      { scannedIssues: issues.length, updatedLines, unmatchedCount: unmatched.length, unmatched },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => disconnectDatabase());
