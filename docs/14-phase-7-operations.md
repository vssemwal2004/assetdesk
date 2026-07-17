# Phase 7 operational follow-up, audit, and reports

Phase 7 turns the Issue and Return data into an Admin operations workspace. It adds overdue
follow-up, safe Return reminders, searchable audit evidence, and a non-financial Issue Register.
All pages use the same responsive card-and-table pattern as the rest of AssetDesk.

## Access and routes

These operational views require an authenticated account with full access:

- `/overdue` is Admin-only and lists Issue Records needing Return follow-up.
- `/audit` is Admin-only and displays immutable audit evidence.
- `/reports` is Admin-only and previews or exports the Issue Register.
- An authorized Admin or Worker can read reminder history for an Issue Record they are permitted
  to view. Only an Admin can queue a new reminder.

Responses containing operational records use `Cache-Control: no-store`. State-changing requests
also require a trusted application origin and CSRF token.

## Overdue definition

Overdue is derived at read time; it is not stored as another Issue status. An Issue Record is
overdue only when all of these conditions are true:

- its status is `ISSUED` or `PARTIALLY_RETURNED`;
- at least one material quantity remains outstanding; and
- `expectedReturnAt` is earlier than the current server time.

The Admin page sorts the oldest due time first and supports Issue ID, Receiver, and material
search. Each result shows the due time, overdue duration, outstanding quantity, reminder count,
and most recent reminder time. Both catalog-backed and Direct Issue Records use the same rules.

API endpoints:

- `GET /api/v1/overdue?page=1&pageSize=20&search=...`
- `GET /api/v1/issues/:issueId/reminders`
- `POST /api/v1/issues/:issueId/reminders`

## Safe Return reminders

The reminder action requires explicit confirmation in the UI. The POST request also requires an
`Idempotency-Key`, so retrying the same request cannot create duplicate history or email jobs. A
new reminder for the same Issue Record is blocked for 24 hours.

Creating a reminder is one MongoDB transaction that:

1. atomically claims an overdue Issue Record and updates its reminder counters;
2. creates an immutable reminder-history record;
3. queues one `RETURN_REMINDER` email job for the Receiver; and
4. appends a `RETURN_REMINDER_SENT` audit event.

No email is sent inside the API request. The normal notification worker delivers the queued job
through Brevo and applies the existing retry policy. The reminder contains the Issue ID, expected
Return time, overdue duration, and only the material still outstanding. It contains no prices,
fines, payments, or other financial data.

## Audit evidence

The Audit page is read-only and Admin-only. Records are ordered newest first and can be filtered by
date, action, result, and actor role, or searched by request ID, Worker ID, target, and reason code.
The inclusive date range is limited to 366 days.

Each row exposes the event time, actor, action, target, result, request ID, reason code, and
privacy-safe metadata. Business history remains append-only; the interface has no edit or delete
operation. CSV Issue Register exports append `REPORT_ISSUE_REGISTER_EXPORTED` evidence containing
the selected range, non-sensitive filter summary, format, and row count.

API endpoints:

- `GET /api/v1/audit-events?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/v1/audit-events/:auditEventId`

## Non-financial Issue Register

The Reports page previews the Issue Register before download. Filters include issued date range,
Issue status, Return state, Receiver type, and search. Dates use the `Asia/Kolkata` calendar and the
inclusive range is limited to 366 days.

The report contains Issue ID, status, issued and expected Return times, Receiver name/type and
department, issuing Worker identity, material summaries, issued/outstanding quantities, and Return
event count. It deliberately excludes Receiver email, contact number, internal notes, credentials,
notification data, and every price, cost, fine, payment, or billing field.

CSV exports are limited to 5,000 rows. Cells are quoted safely, control characters are removed,
and spreadsheet-formula prefixes are neutralized. If a result is larger, the Admin must choose a
smaller range.

API endpoints:

- `GET /api/v1/reports/issue-register`
- `POST /api/v1/reports/issue-register/export` with `{ "format": "CSV", "filters": ... }`

## Verification

Run the normal quality gates first:

```text
npm run typecheck
npm run test
```

The Atlas verifier requires the ignored local `.env` and a MongoDB replica-set deployment:

```text
npm run verify:phase7:atlas --workspace @assetdesk/backend
```

It creates a uniquely named temporary database, verifies the existing transactional Issue/Return
flow plus overdue detection, one queued reminder, idempotent replay, the 24-hour cooldown, audit
lookup, dashboard counts, and privacy-safe report output, then drops that temporary database. It
does not call Brevo or print credentials.
