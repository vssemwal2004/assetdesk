# AssetDesk

AssetDesk is a mobile-first university material issue and return tracking system.
It replaces handwritten server-room records with searchable Issue Records,
direct material records, return history, overdue follow-up, email notifications, and
an immutable audit trail.

AssetDesk has no payment, price, billing, fine, or financial transaction feature.
Product copy must use **Issue Record**, **Return**, **Receiver**, and **Material**.

## Current project status

- Phase 1: product and design foundation — complete
- Phase 2: TypeScript workspace and runtime foundation — complete
- Phase 3: authentication and Worker management — complete
- Phase 4: inventory and Receiver management — complete
- Phase 5: Material Issue and Return workflows — complete
- Phase 6: Brevo notification outbox and delivery tracking — complete
- Phase 7: dashboards, overdue tracking, reminders, audit logs, and reports — complete
- Phase 8: security, accessibility, performance, and end-to-end verification — in progress

## Foundation documents

1. [Product scope and business rules](docs/01-product-scope.md)
2. [Information architecture and routes](docs/02-information-architecture.md)
3. [Roles and permission matrix](docs/03-permissions.md)
4. [UX flows and mobile wireframes](docs/04-ux-flows.md)
5. [Design system specification](docs/05-design-system.md)
6. [Email and notification specification](docs/06-email-specification.md)
7. [Technical foundation](docs/07-technical-foundation.md)
8. [Phase 3 authentication and Worker management](docs/08-phase-3-auth-workers.md)
9. [Phase 4 inventory and Receiver management](docs/09-phase-4-inventory-receivers.md)
10. [Phase 5 Issue Records and Returns](docs/10-phase-5-issue-return.md)
11. [Phase 6 Brevo notifications](docs/11-phase-6-notifications.md)
12. [Direct Issue workflow simplification](docs/12-direct-issue-flow.md)
13. [Admin operational dashboard](docs/13-admin-dashboard.md)
14. [Phase 7 operational follow-up, audit, and reports](docs/14-phase-7-operations.md)
15. [Phase 8 verification checklist](docs/15-phase-8-verification.md)

## Planned delivery order

1. Product and design foundation
2. TypeScript monorepo and shared contracts
3. Authentication and worker management
4. Inventory and receiver management
5. Material issue and Return workflows
6. Brevo notification outbox and delivery tracking
7. Dashboards, overdue tracking, audit logs, reminders, and reports
8. Security, accessibility, performance, and end-to-end verification

## Local development

Requirements:

- Node.js 22.12 or newer; Node.js 24 LTS is the production target
- npm 10 or newer
- MongoDB Atlas or another replica-set deployment

Setup:

```text
npm install
npm run dev
```

The root command starts both applications. They can also be started separately:

```text
cd frontend
npm run dev

cd backend
npm run dev
```

Local services:

- Web: `http://localhost:5173`
- API liveness: `http://127.0.0.1:4000/api/v1/health/live`
- API readiness: `http://127.0.0.1:4000/api/v1/health/ready`

In development, the API can start even when MongoDB Atlas blocks the current
machine. `/health/live` will stay available and `/health/ready` will report the
database as down. To make development startup fail immediately when MongoDB is
unavailable, set `DATABASE_REQUIRED_ON_START=true` in `.env`. Production always
requires MongoDB at startup.

If Atlas returns an IP whitelist error, open MongoDB Atlas, go to Network Access,
and add the current machine IP address. Then restart the backend.

Useful commands:

```text
npm run build
npm run typecheck
npm run lint
npm run test
npm run format:check
```

Production build installs must include optional native packages. Vite,
Tailwind, Rolldown, and Lightning CSS load platform-specific packages on Linux,
so do a clean install on the server instead of copying `node_modules` from
another machine:

```text
rm -rf node_modules frontend/node_modules backend/node_modules packages/*/node_modules
npm ci --include=optional
npm run build
```

If production fails with `Cannot find module '../lightningcss.linux-x64-gnu.node'`,
the Linux optional package was pruned or never installed. Run the clean install
commands above from the repository root, then restart the service.

## Database backups

Run `npm run backup` to create a compressed MongoDB backup in the ignored
`backups/` directory. Successful runs automatically delete backup archives older
than 2 days. Run `npm run backup:install` once on Windows to install the daily
2:00 AM Scheduled Task; when the user is not logged on at that time, it runs as
soon as possible after the next logon.

Before the first sign-in, configure `ASSETDESK_ADMIN_ID`,
`ASSETDESK_ADMIN_NAME`, `ASSETDESK_ADMIN_EMAIL`, and
`ASSETDESK_ADMIN_PASSWORD` in the ignored root `.env`, then run:

```text
npm run admin:bootstrap --workspace @assetdesk/backend
```

The command is idempotent for the same Admin ID and email. The password is
Argon2id-hashed before database storage; normal sign-in accepts the configured
Admin ID or email and never compares requests directly against `.env`.

New Workers are created from the Admin-only `/workers` interface individually
or by CSV/XLSX import. AssetDesk queues the invitation and displays the generated
credential once as an operational fallback. The Worker must replace it at first
sign-in.

Admins and Workers can create multi-item Issue Records directly from
`/issues/new` by entering the person's contact details and material/device
description. No material catalog setup is required. They can search permitted
Issue history at `/issues` and record full or partial Returns from `/returns`.
Issue history, Receiver snapshots, Return events, audit evidence, and
notification jobs are updated transactionally. The separate
notification worker sends through Brevo, tracks provider/webhook delivery, and
shows privacy-safe delivery status on the Issue detail screen. See the
[Phase 6 notification guide](docs/11-phase-6-notifications.md).

Admins can open `/overdue` to follow up on late Returns and queue a Receiver reminder, `/audit` to
review immutable evidence, and `/reports` to preview or download the non-financial Issue Register.
Reminder creation is idempotent, uses a 24-hour per-Issue cooldown, and writes its history, email
outbox job, and audit evidence transactionally. See the
[Phase 7 operations guide](docs/14-phase-7-operations.md).

Phase 8 verification covers security headers, CSRF/origin protection,
accessible search controls, lazy-loaded routes, bounded reports, and the manual
pilot checklist. See the [Phase 8 verification guide](docs/15-phase-8-verification.md).

The real `.env` and `.env.example` are ignored by Git. Never commit credentials
or print them in logs. A Brevo SMTP key begins with `xsmtpsib-`; the notification
worker requires a separate Brevo REST API key beginning with `xkeysib-`.
