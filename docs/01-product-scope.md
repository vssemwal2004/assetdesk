# 01 — Product scope and business rules

## Product objective

AssetDesk gives a university server-room team one reliable place to:

- maintain reusable devices and quantity-based materials;
- issue material to an authorized university receiver free of cost;
- record full and partial returns;
- find due and overdue Issue Records;
- notify receivers, workers, and administrators by email;
- see who performed each action and when; and
- work comfortably on a phone, tablet, or desktop.

The system is an operational tracking tool. It does not calculate money and it
does not contain a financial transaction, invoice, purchase, billing, payment,
fine, or price module.

## Actors and records

AssetDesk separates three concepts that must not be merged:

1. **System user** — an Admin or Worker who signs in and performs an action.
2. **Receiver** — a faculty member, staff member, student, department, or other
   authorized person who receives material. A Receiver does not need an account.
3. **Inventory** — serialized devices and quantity-tracked materials that can be
   issued or returned.

## Roles

### Admin

An Admin can create and disable Workers, import Workers, manage inventory,
manage Receivers, issue and return material, view all Issue Records, manage
overdue records, send reminders, view audit events, export reports, and manage
system settings.

### Worker

A Worker can search available inventory and Receivers, issue material, accept a
return, search an active Issue ID, see permitted operational history, send a
reminder when allowed, and manage their own password and profile.

Detailed authorization is defined in [03-permissions.md](03-permissions.md).

## Identifier formats

Identifiers shown to users are separate from MongoDB internal identifiers.

| Record           | Format                | Example               |
| ---------------- | --------------------- | --------------------- |
| Worker           | `GEU-WRK-XXXX`        | `GEU-WRK-A7K4`        |
| Issue Record     | `GEU-ISS-YYYY-NNNNNN` | `GEU-ISS-2026-000123` |
| Inventory item   | `GEU-MAT-NNNNNN`      | `GEU-MAT-000241`      |
| Serialized asset | `GEU-AST-NNNNNN`      | `GEU-AST-000982`      |

Worker suffixes use unambiguous uppercase characters and are collision-checked.
Sequential record numbers are allocated atomically. All public identifiers have
unique database indexes.

## Inventory types

### Serialized device

A serialized device is a unique physical unit such as a server, laptop, switch,
router, drive, or test device. Each unit has its own asset tag, optional serial
number, condition, and state. Its effective quantity is one.

States:

- Available
- Issued
- Under repair
- Damaged
- Lost
- Retired

### Quantity-tracked material

A quantity-tracked material is managed as a count, such as cables, adapters,
tools, or other stock. It has total and available quantities.

A material can be configured as:

- **Reusable** — return is expected.
- **Consumable** — no return is expected and an expected-return date is omitted.

## Issue Record lifecycle

```text
Issued
  ├── Due soon
  ├── Overdue
  ├── Partially returned
  ├── Returned
  ├── Damaged
  ├── Lost
  └── Cancelled by Admin
```

`Due soon` and `Overdue` may be derived states based on the expected-return date.
The persisted state must still contain enough information to reproduce what the
user saw at the time of an action.

## Issue rules

- The issue date and time default to the current server time.
- Dates are stored in UTC and displayed in `Asia/Kolkata` with `IST` visible in
  emails and detailed records.
- A reusable item requires an expected-return date.
- Return presets are 1 day, 1 week, 1 month, 6 months, 1 year, and Custom.
- A calendar month/year is used for month/year presets, not a fixed number of
  days. The calculated exact date is always shown before confirmation.
- One Issue Record may contain multiple materials.
- A serialized device cannot be active on two Issue Records at the same time.
- Quantity cannot be issued below zero availability.
- The server rechecks availability at confirmation time.
- A final Review step is required before issue confirmation.
- A double tap or retried mobile request must not create a duplicate Issue Record.
- Completed history cannot be silently edited; corrections create audit events.

## Return rules

- A return starts from an Issue ID, Receiver, asset tag, serial number, or device.
- Full and partial returns are supported.
- Returned quantity cannot exceed outstanding quantity.
- A serialized device cannot be returned twice.
- Return date and time default to the current server time.
- Condition on return is required for serialized devices.
- A damaged item goes to Damaged/Under repair instead of Available.
- A lost item never increases available stock.
- Successful return, stock movement, audit event, and email job are committed as
  one consistent database operation.

## Receiver rules

Receiver fields:

- full name;
- university ID when available;
- type: Faculty, Staff, Student, Department, or Authorized External;
- department;
- contact number;
- email; and
- active/inactive status.

Search checks normalized university ID, name, email, and contact number. Existing
Receiver data is selected and reused rather than entered again during one flow.

## Worker creation rules

Single and bulk creation use the same validation rules:

- name is required;
- valid unique email is required;
- department and contact number are optional initially;
- Worker ID is system-generated and not editable;
- the account starts in `INVITED` state;
- a one-time temporary password expires after 24 hours;
- first login can access only the mandatory password-change screen; and
- an Admin can regenerate credentials, which invalidates the previous temporary
  credential.

Bulk upload accepts `.xlsx` and `.csv`, with a maximum initial limit of 1,000 rows
and 5 MB. The flow is Upload, Preview, Correct, Confirm, and Result. Valid rows are
not discarded merely because another row is invalid.

## Dashboard metrics

Only values calculated from real stored data can be displayed:

- Currently issued
- Issued today
- Due today
- Overdue
- Returned today
- Available materials
- Damaged or lost
- Active Workers, Admin only

An Admin receives university-wide counts. A Worker receives counts within their
authorized scope. Every metric opens the matching filtered list.

## Audit requirements

At minimum, append an audit event for:

- login success, failure, throttling, and logout;
- first password creation, password change, and password reset;
- Worker creation, import, status change, and credential regeneration;
- inventory creation, edit, archive, and state change;
- Receiver creation and edit;
- issue, return, partial return, extension, cancellation, damage, and loss;
- reminder creation and resend;
- email acceptance, delivery, bounce, and permanent failure; and
- permission denial and protected export.

Passwords, temporary passwords, access tokens, refresh tokens, reset tokens,
cookie values, authorization headers, and Brevo credentials must never be logged.

## Non-functional requirements

- Mobile-first from 320 CSS pixels upward.
- WCAG 2.2 AA accessibility target.
- Keyboard, screen reader, touch, mouse, and 200% zoom support.
- No page-level horizontal scroll on supported mobile widths.
- Core Web Vitals targets: LCP at most 2.5 s, INP at most 200 ms, and CLS at most
  0.1 at the 75th percentile.
- Server-side authorization on every protected endpoint.
- HTTPS-only production traffic.
- Issue and Return remain successful when Brevo is temporarily unavailable; the
  email is queued and its failure is presented separately.
- Search, filter, sorting, pagination, and exports operate on the server for large
  collections.
- All user-facing dates display an explicit timezone.

## MVP scope

- Admin and Worker authentication
- Mandatory first-login password change
- Single and bulk Worker creation
- Inventory and serialized assets
- Receiver directory
- Multi-item material issue
- Full and partial return
- Due, overdue, extension, damage, and loss tracking
- Role-scoped dashboard
- Search, filters, pagination, and basic exports
- Brevo issue, return, reminder, and account emails
- Email delivery state and manual retry
- Append-only audit history
- Responsive phone, tablet, and desktop layouts

## Explicitly outside the MVP

- Payments, prices, fines, invoices, billing, or financial reports
- Purchase-order and procurement workflow
- Native Android or iOS application
- Offline Issue/Return submission
- QR or barcode scanning
- University SSO
- Recipient OTP or signed acknowledgment
- Maintenance work-order management
- Advanced analytics and decorative charts
