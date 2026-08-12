import { z } from 'zod';

import { EmailJobStatusSchema } from './domain.js';

export const NotificationEventTypeSchema = z.enum([
  'WORKER_INVITATION',
  'MATERIAL_ISSUED',
  'MATERIAL_RETURNED',
  'RETURN_REMINDER',
  'PASSWORD_RESET_OTP',
  'PASSWORD_CHANGED',
]);
export type NotificationEventType = z.infer<typeof NotificationEventTypeSchema>;

export const NotificationRecipientRoleSchema = z.enum([
  'RECEIVER',
  'ACTOR',
  'MAIN_ADMIN',
  'ACCOUNT_OWNER',
]);
export type NotificationRecipientRole = z.infer<typeof NotificationRecipientRoleSchema>;

export const NotificationDeliverySchema = z.object({
  notificationId: z.string().min(1),
  eventType: NotificationEventTypeSchema,
  recipientRole: NotificationRecipientRoleSchema,
  status: EmailJobStatusSchema,
  attemptCount: z.number().int().nonnegative(),
  acceptedAt: z.string().datetime({ offset: true }).nullable(),
  deliveredAt: z.string().datetime({ offset: true }).nullable(),
  failedAt: z.string().datetime({ offset: true }).nullable(),
  lastErrorSummary: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
});
export type NotificationDelivery = z.infer<typeof NotificationDeliverySchema>;

export const IssueNotificationsResponseSchema = z.object({
  data: z.object({ notifications: z.array(NotificationDeliverySchema) }),
});
export type IssueNotificationsResponse = z.infer<typeof IssueNotificationsResponseSchema>;

export const RetryNotificationResponseSchema = z.object({
  data: z.object({ notification: NotificationDeliverySchema }),
});
export type RetryNotificationResponse = z.infer<typeof RetryNotificationResponseSchema>;
