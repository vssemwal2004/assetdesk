# 06 — Email and notification specification

## Email architecture

Brevo is asynchronous. The user-facing API stores an email job with the Issue or
Return operation. A separate worker sends it after the database operation is
complete.

```text
Issue/Return saved
  → email job Queued
  → worker claims job
  → Brevo accepts message
  → Brevo webhook reports delivery result
  → AssetDesk timeline is updated
```

Brevo unavailability must not roll back a valid Issue or Return.

## Recipient rules

| Event                     |      Receiver |     Acting Worker |      Acting Admin |                              Main Admin |
| ------------------------- | ------------: | ----------------: | ----------------: | --------------------------------------: |
| Worker invitation         |            No |   New Worker only |                No |                                      No |
| Worker issues material    |           Yes |               Yes |                No |                                     Yes |
| Admin issues material     |           Yes |                No |               Yes | Only if different and policy enables it |
| Worker records return     |           Yes |               Yes |                No |                                     Yes |
| Admin records return      |           Yes |                No |               Yes | Only if different and policy enables it |
| Due/overdue reminder      |           Yes | Configurable copy | Configurable copy |                       Configurable copy |
| Expected-return extension |           Yes |          If actor |          If actor |               When action was by Worker |
| Password changed          | Account owner |                No |                No |                                      No |
| Permanent email failure   |            No |                No |    Relevant Admin |                              Main Admin |

Addresses are normalized and deduplicated. Each recipient receives a separate
email job so delivery status and privacy are independent; do not depend on CC for
delivery tracking.

## Required templates

### Worker invitation

Parameters:

- Worker name
- Worker ID
- temporary password
- credential expiry
- AssetDesk login URL
- support contact

The email states that the password is temporary, must be changed at first login,
and will never be requested by an administrator.

### Material issued — Receiver

- Receiver name
- Issue ID
- material names and quantities
- asset tags/serials when appropriate
- condition at issue
- issue date/time in IST
- exact expected-return date/time in IST or `No return expected`
- issuing user
- return/help contact

### Material issued — Operator/Admin

Contains the same operational record plus Receiver contact details allowed by
policy and the `View Issue Record` application link.

### Material returned — Receiver

- Issue ID
- returned lines and quantities
- remaining outstanding items
- return date/time in IST
- return condition
- user who recorded the return

### Material returned — Operator/Admin

Contains the Return summary and direct Issue Record link.

### Reminder

- Issue ID
- outstanding materials
- original expected-return date
- overdue duration when applicable
- server-room return instructions
- support contact

### Expected-return extension

- Issue ID
- old expected-return date
- new expected-return date
- user who approved the extension

### Password changed

- user name/ID
- change time in IST
- security contact if the user did not perform the change

## Template rules

- Use a verified university sender domain.
- Provide HTML and plain-text versions.
- Escape all values received from users.
- Notes are rendered as text, never raw HTML.
- Include no price, payment, fine, invoice, or billing language.
- Use short literal subject lines containing the Issue ID where applicable.
- Do not attach a generated PDF in the MVP.
- Do not expose other recipients' email addresses.

## Email job states

```text
QUEUED
  → PROCESSING
  → ACCEPTED_BY_PROVIDER
  → DELIVERED

QUEUED / PROCESSING
  → RETRY_WAIT
  → PROCESSING

ACCEPTED_BY_PROVIDER
  → DEFERRED / BOUNCED / BLOCKED / INVALID / FAILED
```

Brevo acceptance is not delivery. A `Delivered` webhook means the receiving mail
system accepted the message; it does not prove that the person read the email or
received the physical material.

Authoritative operational evidence is the immutable Issue/Return event, actor,
server timestamp, inventory movement, Receiver details, and notification history.

## Email job fields

```text
eventKey                 unique
issueId
returnEventId            optional
eventType
recipientRole
recipientEmailNormalized
templateKey
templateVersion
templateParams
status
attemptCount
nextAttemptAt
leaseUntil
providerMessageId
idempotencyKey
lastErrorCode
lastErrorSummary
acceptedAt
deliveredAt
failedAt
createdAt
updatedAt
```

Example unique event keys:

```text
issue:<issueId>:issued:<recipientRole>:<recipientId>
return:<issueId>:<returnEventId>:<recipientRole>:<recipientId>
reminder:<issueId>:<rule>:<yyyy-mm-dd>:<recipientId>
```

## Retry behavior

Retry connection failures, timeouts, HTTP 429, and recoverable provider errors.
Initial application schedule:

```text
1 minute → 5 minutes → 15 minutes → 30 minutes → 2 hours
```

Permanent authentication/configuration failures alert an Admin. Hard bounce,
invalid, or blocked addresses are not automatically retried. Manual resend creates
a new auditable job after the address or configuration is corrected.

Issue and Return success screens display notification status separately:

- Queued
- Delivered
- Failed — Retry available

## Brevo webhook

Endpoint:

```text
POST /api/v1/webhooks/brevo/email
```

Controls:

- HTTPS only;
- Brevo-configured bearer/custom secret header;
- optional Brevo IP allowlist as an additional control;
- strict payload schema and size limit;
- rate limiting;
- idempotent event fingerprint; and
- quick `204` response after safe persistence.

Track:

- sent/request;
- delivered;
- deferred;
- soft bounce;
- hard bounce;
- blocked;
- invalid;
- spam; and
- error.

Opened/clicked events are not operational proof and are not required in the MVP.
