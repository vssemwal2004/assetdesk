# 03 — Roles and permission matrix

## Authorization model

Permissions are enforced by Express middleware and resource-level service rules.
React route guards improve the interface but are not a security boundary.

Middleware order:

```text
authenticate
→ verify active user and session
→ enforce initial-password gate
→ authorize permission
→ authorize resource scope
→ validate request
→ execute service
→ append audit event
```

Authorization is deny-by-default.

## Permission keys

```text
dashboard.read
workers.read
workers.create
workers.import
workers.update
workers.disable
workers.regenerate_credentials
inventory.read
inventory.manage
receivers.search
receivers.manage
issues.create
issues.read.all
issues.read.own
issues.read.active_for_return
issues.return
issues.extend
issues.cancel
issues.mark_damaged
issues.mark_lost
reminders.send
audit.read
reports.export
settings.manage
profile.manage_self
```

## Role matrix

| Capability                                 | Admin |                      Worker |
| ------------------------------------------ | ----: | --------------------------: |
| Sign in after initial password change      |   Yes |                         Yes |
| Read role-scoped dashboard                 |   Yes |                         Yes |
| Create a Worker                            |   Yes |                          No |
| Import Workers                             |   Yes |                          No |
| Edit/disable/reactivate a Worker           |   Yes |                          No |
| Regenerate temporary Worker credentials    |   Yes |                          No |
| Read available inventory                   |   Yes |                         Yes |
| Create/edit/archive inventory              |   Yes |                          No |
| Search Receivers for an operational flow   |   Yes |                         Yes |
| Manage the Receiver directory              |   Yes |    Configurable create-only |
| Create an Issue Record                     |   Yes |                         Yes |
| Browse all Issue Records                   |   Yes |                          No |
| Read own operational activity              |   Yes |                         Yes |
| Search an active Issue ID to accept return |   Yes |                         Yes |
| Accept full or partial return              |   Yes |                         Yes |
| Extend expected-return date                |   Yes |                Configurable |
| Cancel an Issue Record                     |   Yes |                          No |
| Mark damaged or lost                       |   Yes | Configurable request/action |
| Send a reminder                            |   Yes |                Configurable |
| Read audit events                          |   Yes |                          No |
| Export reports                             |   Yes |                          No |
| Manage system settings                     |   Yes |                          No |
| Change own password/profile                |   Yes |                         Yes |

## Resource rules

- A Worker does not receive an unrestricted list of university-wide personal
  history.
- A Worker can search an active Issue ID or asset to accept a return during
  another shift.
- A Worker sees only the Receiver fields necessary for issue and return work.
- An Admin can see all operational history but cannot edit an audit event.
- Neither role can edit a completed return in place. A correction is a new event.
- A disabled user loses API access immediately, even if an access JWT has not yet
  reached its expiry.
- Role/status/password changes revoke existing refresh sessions.
- Export, bulk reminder, loss, cancellation, and settings actions receive explicit
  server-side permission checks and audit entries.

## Initial password restriction

A restricted first-login session can call only:

```text
GET  /api/v1/auth/me
POST /api/v1/auth/change-initial-password
POST /api/v1/auth/logout
```

Every other protected endpoint returns `403 PASSWORD_CHANGE_REQUIRED`.
