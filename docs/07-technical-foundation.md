# 07 — Technical foundation

## Workspace

AssetDesk uses npm workspaces and strict TypeScript.

```text
frontend       React, Vite, Tailwind, TanStack Query
backend        Express API, MongoDB, and background worker
packages/contracts
               Shared Zod contracts and TypeScript types
```

The application remains a modular monolith. The frontend, API, and background
worker are independently runnable processes but share one repository and contract
set. The worker is built from `backend/src/worker.ts` so all server-side code is
available after `cd backend`.

## Runtime versions

- Node engine range: 22.12 through 26.x
- Production target: Node 24 LTS
- React 19.2
- Vite 8.1
- Tailwind CSS 4
- Express 5
- Mongoose 9
- Zod 4

Exact resolved dependency versions are recorded in `package-lock.json`.

## Environment handling

The API and worker load the root `.env` and validate required values before
starting. Invalid configuration fails startup without printing secret values.

Required now:

- `MONGODB_URI`
- `APP_ORIGIN`
- `PORT`

`MONGODB_DB_NAME` is optional and defaults to `assetdesk`, preventing a URI
without a path from writing to MongoDB's generic fallback database.

Required when email sending is implemented:

- `BREVO_API_KEY` for the planned REST API integration
- `BREVO_SENDER_EMAIL`
- `BREVO_SENDER_NAME`

`BREVO_SMTP_KEY` is retained separately and must not be passed as an API key.

## API foundation

The Express application currently provides:

- request IDs;
- Helmet security headers;
- a strict CORS origin;
- credential-aware CORS;
- a 256 KB JSON-body limit;
- disabled Express fingerprint header;
- centralized RFC-style problem responses;
- Zod-aware validation errors;
- Pino structured logs with secret redaction;
- graceful shutdown; and
- MongoDB connection lifecycle management.

Endpoints:

```text
GET /api/v1/health/live
GET /api/v1/health/ready
```

Liveness shows that the Node process can answer requests. Readiness separately
shows whether MongoDB is connected, allowing a deployment platform to stop
routing traffic to a degraded instance.

## Shared contracts

The first shared schemas cover:

- Admin and Worker roles;
- account states;
- Receiver types;
- inventory tracking and return policies;
- asset states;
- Issue states;
- email job states;
- public Worker, Issue, Material, and Asset identifier formats;
- health responses;
- API problem responses; and
- pagination metadata.

Frontend responses are parsed at runtime instead of being trusted only because a
TypeScript type exists.

## Web foundation

The React application includes:

- Vite and Tailwind CSS 4;
- shared cream/purple design tokens;
- TanStack Query defaults;
- React Router;
- typed and runtime-validated health API access;
- loading, success, error, and retry states;
- reduced-motion behavior; and
- a responsive 320 px minimum layout.

The root route now resolves through authenticated routing. Phase 3 provides the
sign-in, mandatory first-password, profile, dashboard shell and Worker
management screens.

## Verification baseline

The foundation is accepted only when all of these pass:

```text
npm run build
npm run typecheck
npm run lint
npm run test
npm run format:check
```

Runtime readiness must additionally show both:

```text
API live: ok
MongoDB readiness: up
```
