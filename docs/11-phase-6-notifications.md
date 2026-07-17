# 11 — Phase 6 Brevo notifications

## Delivered scope

Phase 6 adds durable, asynchronous email notifications for:

- Worker invitations and regenerated credentials;
- Material Issue Records;
- Material Returns; and
- password changes.

Email delivery is never treated as the authoritative material record. A valid
Issue or Return remains successful if Brevo is unavailable after commit.

## Transactional outbox

Issue, Return, account, and invitation jobs are created in the same MongoDB
transaction as the business change. Each normalized recipient receives an
independent job with a unique event key. This prevents partial business records,
duplicate messages during API retries, and disclosure through `CC`.

Recipient policy:

| Action                      | Recipients                          |
| --------------------------- | ----------------------------------- |
| Worker creates Issue/Return | Receiver, acting Worker, main Admin |
| Admin creates Issue/Return  | Receiver, acting Admin              |
| Worker invitation           | New Worker                          |
| Password changed            | Account owner                       |

Until an explicit ownership flag is introduced, the oldest active Admin is the
deterministic main Admin. Recipients with the same normalized email address are
deduplicated.

## Worker and retry behavior

The API process only queues jobs. Run the independent worker with:

```text
npm run worker:dev
```

Production uses:

```text
npm run worker:start
```

The repeatable Atlas verification command creates an isolated temporary
database, validates Issue/Return transactions and their expected outbox jobs,
then drops the database:

```text
npm run verify:phase6:atlas --workspace @assetdesk/backend
```

The worker atomically leases one eligible job, renders HTML and plain-text
content, and calls Brevo's transactional email REST API. Recoverable network,
timeout, HTTP 429, and provider 5xx failures use this schedule:

```text
1 minute → 5 minutes → 15 minutes → 30 minutes → 2 hours
```

After those retry slots, or on a permanent provider error, the job becomes
`FAILED`. An Admin may create a new, auditable resend job. Expired worker leases
are reclaimable after 60 seconds.

## Brevo configuration

Required by the notification worker:

```text
BREVO_API_KEY=xkeysib-...
BREVO_SENDER_EMAIL=no-reply@verified-university-domain.edu
BREVO_SENDER_NAME=AssetDesk
```

`BREVO_API_KEY` is a REST API key. A credential beginning with `xsmtpsib-` is an
SMTP key and is intentionally rejected for this integration. Configure a
verified sender/domain in Brevo before enabling the worker.

Webhook configuration:

```text
BREVO_WEBHOOK_SECRET=<at-least-32-random-characters>
```

Configure Brevo to send transactional events to:

```text
POST /api/v1/webhooks/brevo/email
X-Brevo-Webhook-Secret: <configured secret>
```

The endpoint also accepts the same value as a Bearer token. It validates a
strict operational core, limits requests, fingerprints events for idempotency,
and stores the event and delivery-state update transactionally. Delivery,
deferred, bounce, blocked, invalid, spam, and error states are tracked. Open and
click events are ignored because they are not operational proof.

## Application API and UI

Authenticated users with access to an Issue may read privacy-safe status data:

```text
GET /api/v1/issues/:issueId/notifications
```

Admins may resend a permanently failed notification:

```text
POST /api/v1/notifications/:notificationId/retry
```

The Issue detail screen shows queued, sending, accepted, delivered, deferred,
and failure states. It polls only while delivery is active and clearly separates
email status from the saved Issue/Return evidence. Recipient addresses are not
returned by this status API.

## Security and content controls

- User-controlled content is escaped before HTML rendering.
- Notes are never interpreted as HTML.
- Each email has an equivalent plain-text body.
- API keys, SMTP keys, webhook secrets, and credential hashes are not logged.
- Templates contain no price, payment, fine, invoice, or billing language.
- Invitation credentials are stored only in the durable invitation job and are
  protected by the same database access controls as user credentials.
- Brevo provider acceptance is distinct from recipient mail-server delivery.

## Phase boundary

Phase 6 does not implement due/overdue reminder scheduling, dashboards, audit-log
screens, or reports. Those remain Phase 7. The outbox, template, worker, and
delivery-state architecture are ready for Phase 7 reminder jobs.
