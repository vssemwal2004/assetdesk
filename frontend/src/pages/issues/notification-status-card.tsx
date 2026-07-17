import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, CheckCircle2, Clock3, MailWarning, RotateCcw } from 'lucide-react';

import type { EmailJobStatus, NotificationDelivery } from '@assetdesk/contracts';

import { useAuth } from '../../auth/auth-context';
import { AppCard, Button } from '../../components/ui';
import { formatIstDateTime } from '../../lib/date-time';
import { getIssueNotifications, retryNotification } from '../../lib/issues-api';

const FAILURE_STATES = new Set<EmailJobStatus>(['FAILED', 'BOUNCED', 'BLOCKED', 'INVALID']);
const ACTIVE_STATES = new Set<EmailJobStatus>([
  'QUEUED',
  'PROCESSING',
  'RETRY_WAIT',
  'ACCEPTED_BY_PROVIDER',
  'DEFERRED',
]);

function statusLabel(status: EmailJobStatus): string {
  const labels: Record<EmailJobStatus, string> = {
    QUEUED: 'Queued',
    PROCESSING: 'Sending',
    RETRY_WAIT: 'Retry scheduled',
    ACCEPTED_BY_PROVIDER: 'Accepted by Brevo',
    DELIVERED: 'Delivered',
    DEFERRED: 'Deferred by mail server',
    BOUNCED: 'Bounced',
    BLOCKED: 'Blocked',
    INVALID: 'Invalid address',
    FAILED: 'Failed',
  };
  return labels[status];
}

function recipientLabel(notification: NotificationDelivery): string {
  const labels = {
    RECEIVER: 'Receiver',
    ACTOR: 'Issuing/Return user',
    MAIN_ADMIN: 'Main Admin',
    ACCOUNT_OWNER: 'Account owner',
  };
  return labels[notification.recipientRole];
}

export function NotificationStatusCard({ issueId }: { issueId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['issue-notifications', issueId],
    queryFn: ({ signal }) => getIssueNotifications(issueId, signal),
    refetchInterval: (state) =>
      state.state.data?.data.notifications.some((item) => ACTIVE_STATES.has(item.status))
        ? 15_000
        : false,
  });
  const retry = useMutation({
    mutationFn: retryNotification,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['issue-notifications', issueId] });
    },
  });

  return (
    <AppCard>
      <div className="flex items-center gap-2 text-[var(--color-primary)]">
        <BellRing aria-hidden="true" size={20} />
        <h2 className="font-extrabold text-[var(--color-primary-strong)]">Email notifications</h2>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
        Delivery is tracked separately from the Issue Record. Email status does not change the saved
        material transaction.
      </p>
      {query.isPending ? (
        <p className="mt-4 text-sm text-[var(--color-text-muted)]">Loading delivery status…</p>
      ) : query.isError ? (
        <button className="button-quiet mt-4" onClick={() => void query.refetch()} type="button">
          Retry status check
        </button>
      ) : query.data.data.notifications.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--color-text-muted)]">
          No notifications are recorded.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {query.data.data.notifications.map((notification) => {
            const failed = FAILURE_STATES.has(notification.status);
            const delivered = notification.status === 'DELIVERED';
            const Icon = delivered ? CheckCircle2 : failed ? MailWarning : Clock3;
            return (
              <li
                className="rounded-[12px] border border-[var(--color-border)] p-3"
                key={notification.notificationId}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-2">
                    <Icon
                      aria-hidden="true"
                      className={
                        delivered
                          ? 'text-[var(--color-success)]'
                          : failed
                            ? 'text-[var(--color-danger)]'
                            : 'text-[var(--color-primary)]'
                      }
                      size={18}
                    />
                    <div>
                      <p className="text-sm font-bold text-[var(--color-text-strong)]">
                        {recipientLabel(notification)}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                        {statusLabel(notification.status)} · {notification.attemptCount}{' '}
                        {notification.attemptCount === 1 ? 'attempt' : 'attempts'}
                      </p>
                      {notification.deliveredAt ? (
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                          Delivered {formatIstDateTime(notification.deliveredAt)}
                        </p>
                      ) : null}
                      {notification.lastErrorSummary ? (
                        <p className="mt-1 text-xs text-[var(--color-danger)]">
                          {notification.lastErrorSummary}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {failed && user?.role === 'ADMIN' ? (
                    <Button
                      disabled={retry.isPending}
                      onClick={() => retry.mutate(notification.notificationId)}
                      variant="secondary"
                    >
                      <RotateCcw aria-hidden="true" size={16} />
                      Resend
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AppCard>
  );
}
