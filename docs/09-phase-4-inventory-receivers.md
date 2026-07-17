# 09 — Phase 4 inventory and Receiver management

## Delivered scope

Phase 4 provides the two master-data directories required before an Issue Record
can be created:

- material inventory with serialized and quantity-tracked modes;
- individual asset-unit registration and operational condition states;
- controlled quantity adjustments with a required reason;
- Receiver directory records for university people, departments and approved
  external recipients;
- searchable, filtered and paginated Admin and Worker views; and
- responsive mobile cards, desktop tables and role-aware detail screens.

An Issue Record, Return, due-date calculation, overdue reminder, dashboard count
or email notification is not simulated here. Those workflows remain in Phases 5
through 7. AssetDesk does not store price, payment, fine, billing or financial
transaction data.

## Inventory model

Every material receives a sequential public code in the form
`GEU-MAT-######` and uses one immutable tracking mode.

### Serialized material

Serialized material is always reusable. Each physical unit receives its own
`GEU-AST-######` asset tag and may have a globally unique serial number.
Supported unit states are:

```text
AVAILABLE
ISSUED
UNDER_REPAIR
DAMAGED
LOST
RETIRED
```

Admins can move an available unit to repair, damaged, lost or retired. Repair,
damaged and lost units can return to available or be retired. Retired is a
terminal state. `ISSUED` is deliberately excluded from manual requests; only the
Phase 5 Issue/Return workflow may enter or leave that state.

Material totals are updated in the same MongoDB transaction as unit creation or
availability-state changes. Non-available units remain part of the registered
total, so serialized `available + issued` can be lower than the total while units
are under repair, damaged, lost or retired.

### Quantity-tracked material

Quantity material stores a unit label, total quantity, available quantity and
issued quantity. It can be reusable or consumable. An Admin adjusts total and
available stock together using a positive or negative integer and a mandatory
reason. An adjustment cannot remove currently issued stock, produce a negative
available quantity or exceed the supported one-billion-unit limit.

Quantity changes run in a MongoDB transaction. A replica-set deployment such as
MongoDB Atlas is therefore required, matching the project runtime baseline.

## Inventory endpoints

```text
GET   /api/v1/inventory
POST  /api/v1/inventory
GET   /api/v1/inventory/:materialCode
PATCH /api/v1/inventory/:materialCode
PATCH /api/v1/inventory/:materialCode/status
POST  /api/v1/inventory/:materialCode/adjust-quantity

GET   /api/v1/inventory/:materialCode/units
POST  /api/v1/inventory/:materialCode/units
PATCH /api/v1/inventory/:materialCode/units/:assetTag
```

The material list supports `page`, `pageSize`, `search`, `status`,
`trackingMode`, `returnPolicy` and `category`. Unit lists support `page`,
`pageSize`, `search` and `status`. Search input is escaped before it is used in a
regular expression.

Admins can read and manage every record. Workers can read only active materials;
for serialized material, Workers see only available units. All writes require an
Admin role, trusted Origin and valid CSRF token. Archived material remains in the
Admin record but cannot be adjusted or have units changed. A material with
issued stock cannot be archived.

## Receiver model

A Receiver is an operational directory record, not a login account. Every
record receives a sequential `GEU-RCV-######` code and contains:

- full name;
- optional university ID;
- Receiver type: faculty, staff, student, department or authorized external;
- optional department;
- contact number;
- email; and
- active or inactive status.

Normalized email is unique. A supplied university ID is also unique. Search
covers Receiver code, name, university ID, contact and email, with additional
status, type and department filters.

## Receiver endpoints

```text
GET   /api/v1/receivers
POST  /api/v1/receivers
GET   /api/v1/receivers/:receiverCode
PATCH /api/v1/receivers/:receiverCode
PATCH /api/v1/receivers/:receiverCode/status
```

Workers can search and read active Receivers only. Admins can also view inactive
records and can create, edit, deactivate or reactivate them. All Receiver writes
use the same role, Origin and CSRF protections as Inventory writes.

## Web experience

The authenticated application shell now exposes Inventory and Receivers for
both roles, with management actions shown only to Admins. Routes are lazy-loaded
and API responses are parsed with the shared Zod schemas at runtime.

```text
/inventory
/inventory/new                 Admin only
/inventory/:materialCode

/receivers
/receivers/new                 Admin only
/receivers/:receiverCode
```

Lists use compact mobile cards below the desktop breakpoint and accessible
tables on wider screens. Filters live in the URL so reload and back navigation
preserve the current view. Loading, empty, error, retry, confirmation and mutation
states use real API data; no placeholder inventory totals or fake activity are
displayed.

## Audit behavior

Append-only audit events record material creation, edits, status changes,
quantity adjustments, asset-unit creation and edits, and Receiver creation,
edits and status changes. Authenticated attempts to use an Admin-only route also
record a denied audit event. Quantity reasons are retained as operational
evidence; the shared audit sanitizer continues to redact credential-like
metadata keys.

## Phase acceptance checks

```text
npm run build
npm run typecheck
npm run lint
npm run test
npm run format:check
npm audit --omit=dev
```

Runtime acceptance uses an isolated Atlas database to verify Admin mutations,
Worker read restrictions, quantity invariants, serialized state transitions,
archiving rules, Receiver visibility and audit creation. The temporary database
must be dropped and all local test processes stopped after verification.
