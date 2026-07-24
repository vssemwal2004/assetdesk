import { z } from 'zod';

export const WorkerIdSchema = z.string().regex(/^GEU-WRK-[A-HJ-NP-Z2-9]{4}$/, 'Invalid Worker ID');

export const IssueIdSchema = z.string().regex(/^GEU-ISS-\d{4}-\d{6}$/, 'Invalid Issue ID');

export const MaterialCodeSchema = z
  .string()
  .regex(/^GEU-(?:MAT-\d{6}|\d{4}-\d{6})$/, 'Invalid material code');

export const AssetTagSchema = z.string().regex(/^GEU-AST-\d{6}$/, 'Invalid asset tag');

export const ReceiverCodeSchema = z.string().regex(/^GEU-RCV-\d{6}$/, 'Invalid Receiver code');

export type WorkerId = z.infer<typeof WorkerIdSchema>;
export type IssueId = z.infer<typeof IssueIdSchema>;
export type MaterialCode = z.infer<typeof MaterialCodeSchema>;
export type AssetTag = z.infer<typeof AssetTagSchema>;
export type ReceiverCode = z.infer<typeof ReceiverCodeSchema>;
