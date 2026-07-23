import type { EmailJobStatus } from '@assetdesk/contracts';

const brevoEventStatus: Record<string, EmailJobStatus | undefined> = {
  sent: 'ACCEPTED_BY_PROVIDER',
  delivered: 'DELIVERED',
  'soft bounce': 'DEFERRED',
  soft_bounce: 'DEFERRED',
  hard_bounce: 'BOUNCED',
  blocked: 'BLOCKED',
  invalid: 'INVALID',
  spam: 'BLOCKED',
  error: 'FAILED',
};

export function webhookStatusForEvent(event: string): EmailJobStatus | undefined {
  return brevoEventStatus[event.trim().toLowerCase()];
}
