import { z } from 'zod';

export const UserRoleSchema = z.enum(['ADMIN', 'WORKER']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const AccountStatusSchema = z.enum(['INVITED', 'ACTIVE', 'DISABLED']);
export type AccountStatus = z.infer<typeof AccountStatusSchema>;

export const ReceiverTypeSchema = z.enum([
  'FACULTY',
  'STAFF',
  'STUDENT',
  'DEPARTMENT',
  'AUTHORIZED_EXTERNAL',
  'MANAGEMENT',
  'GEHU',
]);
export type ReceiverType = z.infer<typeof ReceiverTypeSchema>;

export const TrackingModeSchema = z.enum(['SERIALIZED', 'QUANTITY']);
export type TrackingMode = z.infer<typeof TrackingModeSchema>;

export const AssignmentTypeSchema = z.enum(['LONG_TERM', 'SHORT_TERM']);
export type AssignmentType = z.infer<typeof AssignmentTypeSchema>;

export const ReturnPolicySchema = z.enum(['REUSABLE', 'CONSUMABLE']);
export type ReturnPolicy = z.infer<typeof ReturnPolicySchema>;

export const AssetUnitStatusSchema = z.enum([
  'AVAILABLE',
  'ISSUED',
  'RETURNED',
  'UNDER_REPAIR',
  'DAMAGED',
  'LOST',
  'SCRAPPED',
]);
export type AssetUnitStatus = z.infer<typeof AssetUnitStatusSchema>;

export const IssueStatusSchema = z.enum([
  'ISSUED',
  'PARTIALLY_RETURNED',
  'RETURNED',
  'DAMAGED',
  'LOST',
  'CANCELLED',
]);
export type IssueStatus = z.infer<typeof IssueStatusSchema>;

export const EmailJobStatusSchema = z.enum([
  'QUEUED',
  'PROCESSING',
  'RETRY_WAIT',
  'ACCEPTED_BY_PROVIDER',
  'DELIVERED',
  'DEFERRED',
  'BOUNCED',
  'BLOCKED',
  'INVALID',
  'FAILED',
]);
export type EmailJobStatus = z.infer<typeof EmailJobStatusSchema>;
