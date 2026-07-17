# 08 — Phase 3 authentication and Worker management

## Delivered scope

Phase 3 provides the first secure, usable application slice:

- Admin and Worker sign-in;
- short-lived JWT access sessions with rotating refresh credentials;
- mandatory password replacement for newly created Workers;
- self-service password change and logout;
- Admin-only Worker list, search, filters, creation, editing and status control;
- one-time credential regeneration;
- CSV/XLSX Worker import with preview and explicit commit; and
- a responsive cream-and-purple application shell for mobile, tablet and desktop.

Material inventory, Issue Records, Returns, dashboard counts and notification
delivery are intentionally not fabricated in this phase. They are added by the
later implementation phases.

## Authentication endpoints

```text
POST /api/v1/auth/login
POST /api/v1/auth/refresh
GET  /api/v1/auth/me
POST /api/v1/auth/change-initial-password
POST /api/v1/auth/change-password
POST /api/v1/auth/logout
```

Access and refresh credentials are stored in `HttpOnly`, `SameSite=Strict`
cookies. The React application never stores them in browser storage. Unsafe
requests also require a session-bound CSRF value and an allowed Origin.

An access token lasts ten minutes by default. Refresh credentials rotate on use.
Admin sessions use a shorter idle limit than Worker sessions, while both have an
absolute expiry. Account disabling, password replacement and credential
regeneration revoke existing sessions.

## First Worker login

1. An Admin creates a Worker individually or through an import.
2. AssetDesk generates a `GEU-WRK-XXXX` ID and a 20-character temporary password.
3. Only the Argon2id hash is persisted.
4. The one-time plaintext credential appears only in the create, import-commit or
   regenerate response.
5. The Worker signs in and receives a restricted password-change session.
6. Every application API except profile verification, initial password change and
   logout remains blocked.
7. After a policy-compliant password is created, all old sessions are revoked and
   a normal session is issued.

Temporary credentials expire after 24 hours by default. An Admin can regenerate
them, which immediately invalidates the previous credential and active sessions.

## Worker management endpoints

```text
GET   /api/v1/workers
POST  /api/v1/workers
GET   /api/v1/workers/:workerId
PATCH /api/v1/workers/:workerId
PATCH /api/v1/workers/:workerId/status
POST  /api/v1/workers/:workerId/regenerate-credentials

POST  /api/v1/worker-imports/preview
POST  /api/v1/worker-imports/:importId/commit
```

Every endpoint requires a signed-in Admin whose initial-password restriction has
been cleared. State changes additionally require Origin and CSRF validation.
Management responses use `Cache-Control: no-store` because they can contain
personal or one-time credential data.

The list supports `page`, `pageSize`, `search` and `status`. Search covers Worker
ID, name, email, contact and department. Regex input is escaped on the server.

Disabling a Worker immediately revokes their sessions. Reactivating a Worker who
has not replaced the temporary password returns them to `INVITED`; it does not
incorrectly bypass the required password change.

## Bulk import

Accepted formats are UTF-8 CSV and XLSX. Required columns are `Name` and `Email`;
`Contact` and `Department` are optional. Common header variants such as
`Worker Name`, `Email ID`, `Phone Number` and `Dept` are recognized.

Limits:

- one file;
- 5 MB maximum;
- 1,000 non-empty Worker rows; and
- no duplicate email inside the file or existing user directory.

Preview stores a short-lived validated snapshot and returns row-level errors.
Commit operates only on that snapshot. A compare-and-set state transition allows
only one request to claim a preview, preventing duplicate creation after a double
tap or mobile retry. Valid rows can succeed while invalid/conflicting rows are
reported separately.

## Initial Admin bootstrap

The first Admin is created deliberately; no default account or hard-coded
password exists. Supply these process environment variables through a secure
local/hosting secret mechanism:

```text
ASSETDESK_ADMIN_ID
ASSETDESK_ADMIN_NAME
ASSETDESK_ADMIN_EMAIL
ASSETDESK_ADMIN_PASSWORD
ASSETDESK_ADMIN_CONTACT       optional
ASSETDESK_ADMIN_DEPARTMENT    optional
```

Then run:

```text
npm run admin:bootstrap --workspace @assetdesk/backend
```

The command is idempotent for the same Admin and refuses to replace another
existing Admin. The password must satisfy the same server policy as normal
password changes. Clear temporary shell environment values after the command.

## Notification status in this phase

Worker creation currently records invitation status as `PENDING` and reports
`PENDING_EMAIL_CONFIGURATION`. This is deliberate: the configured Brevo value is
an SMTP credential, while the planned reliable notification worker needs sender
identity configuration and the chosen Brevo transport. Phase 6 adds queued email
delivery without coupling account/material writes to provider availability.

## Security and audit behavior

- Argon2id password hashing with the OWASP minimum memory profile;
- minimum 15-character permanent passwords;
- generic invalid-credential errors and progressive temporary login locking;
- strict JWT algorithm, issuer, audience, type and claim validation;
- hashed rotating refresh credentials and replay handling;
- server-side role and first-password gates;
- password/token/cookie redaction from structured logs;
- append-only audit events for login, logout, password and Worker actions; and
- no password hash or reusable plaintext credential in normal Worker responses.

## Phase acceptance checks

```text
npm run build
npm run typecheck
npm run lint
npm run test
npm run format:check
npm audit --omit=dev
```

Runtime acceptance additionally verifies database readiness, Admin sign-in,
Worker creation, restricted first login, password replacement, Worker list
access, session revocation and import preview/commit against an isolated test
database.
