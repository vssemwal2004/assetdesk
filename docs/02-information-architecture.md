# 02 — Information architecture and routes

## Navigation principles

- Navigation is role-based. An inaccessible destination is not rendered.
- Mobile keeps five consistent bottom destinations.
- Desktop groups destinations into a persistent sidebar.
- Search, sort, page, and filters are reflected in the URL so refresh and Back
  preserve the user's context.
- A complete record uses a full page on mobile. Dialogs are limited to short
  confirmations; bottom sheets are limited to filters and short action menus.

## Public and authentication routes

| Route                      | Screen                      | Access                         |
| -------------------------- | --------------------------- | ------------------------------ |
| `/login`                   | Sign in                     | Signed out                     |
| `/change-initial-password` | Mandatory password creation | Restricted first-login session |
| `/forgot-password`         | Request reset               | Signed out                     |
| `/reset-password`          | Set reset password          | Valid reset token              |
| `/access-denied`           | Permission explanation      | Any authenticated user         |

An authenticated user with `mustChangePassword=true` is redirected to
`/change-initial-password` by both frontend routing and backend authorization.

## Application routes

| Route                      | Screen                 |       Admin |                        Worker |
| -------------------------- | ---------------------- | ----------: | ----------------------------: |
| `/dashboard`               | Role-scoped dashboard  |         Yes |                           Yes |
| `/issues`                  | Issue Record list      | All records |               Permitted scope |
| `/issues/new`              | Guided material issue  |         Yes |                           Yes |
| `/issues/:issueId`         | Full Issue Record      |         Yes |                 Resource rule |
| `/issues/:issueId/return`  | Full/partial return    |         Yes |                           Yes |
| `/issues/:issueId/extend`  | Extend expected return |         Yes |                  Configurable |
| `/overdue`                 | Overdue list           |         Yes |               Permitted scope |
| `/returns`                 | Return activity        |         Yes |               Permitted scope |
| `/inventory`               | Inventory list         |         Yes |        Read-only availability |
| `/inventory/new`           | Add material           |         Yes |                            No |
| `/inventory/:itemId`       | Inventory detail       |         Yes |              Read-only subset |
| `/receivers`               | Receiver directory     |         Yes |                   Search/read |
| `/receivers/:receiverId`   | Receiver detail        |         Yes | Restricted operational subset |
| `/workers`                 | Worker management      |         Yes |                            No |
| `/workers/new`             | Create Worker          |         Yes |                            No |
| `/workers/import`          | Bulk import            |         Yes |                            No |
| `/workers/:workerId`       | Worker detail          |         Yes |                            No |
| `/audit`                   | Audit event list       |         Yes |                            No |
| `/reports`                 | Reports and export     |         Yes |                            No |
| `/settings`                | System settings        |         Yes |                            No |
| `/profile`                 | Own profile            |         Yes |                           Yes |
| `/profile/change-password` | Own password change    |         Yes |                           Yes |

## Mobile app shell

### Top bar

- Root screen: menu icon, short title, profile avatar.
- Child screen: back button, short title, optional overflow action.
- Height: 56 px plus safe-area inset.
- The bar is sticky without covering focused content.

### Bottom navigation

1. Home
2. Issues
3. Issue New
4. Overdue
5. More

`Issue New` is visually emphasized but remains a normal labelled navigation
control. `More` opens a role-appropriate destination sheet.

Admin More destinations:

- Return material
- Inventory
- Workers
- Receivers
- Activity logs
- Reports
- Settings

Worker More destinations:

- Return material
- Inventory availability
- Receiver search
- My activity
- Profile

## Tablet and desktop app shell

| Width        | Navigation                    | Content behavior                 |
| ------------ | ----------------------------- | -------------------------------- |
| `<600px`     | Bottom navigation             | One column, 16 px gutter         |
| `600–839px`  | 72 px navigation rail         | One or two columns, 24 px gutter |
| `840–1199px` | 80/248 px collapsible sidebar | Table and optional detail sheet  |
| `>=1200px`   | 248 px persistent sidebar     | 12-column grid, max 1440 px      |

Desktop sidebar groups:

```text
Overview
  Dashboard

Material
  Issue New
  Return
  All Issues
  Overdue

Management
  Inventory
  Workers        Admin only
  Receivers

Administration  Admin only
  Activity Logs
  Reports
  Settings
```

## Dashboard information order

### Mobile

1. Page title and profile
2. Primary `Issue material` action
3. Two-column metric grid
4. Needs attention
5. Recent Issue Records
6. Bottom navigation

### Desktop

1. Page title and quick actions
2. Metric grid
3. Recent Issue Records, approximately 7 columns
4. Needs attention, approximately 5 columns

## List behavior

Below 840 px, Issue Records render as cards containing:

- Issue ID and status;
- primary material and extra-item count;
- Receiver;
- expected-return date;
- issuing user; and
- a separate overflow action.

At 840 px and above, use a semantic table with:

- selection;
- Issue ID;
- Receiver;
- material/count;
- issuing user;
- issue date;
- expected return;
- status; and
- actions.

Desktop row selection opens a 480 px quick-detail sheet. `Open full record` uses
the canonical detail route. Mobile always uses the full route.

## Issue detail information order

1. Issue ID, status, and permitted actions
2. Receiver information
3. Issued materials and outstanding quantities
4. Issue and expected-return dates
5. Notes/purpose
6. Email delivery summary
7. Activity timeline

The timeline is a semantic vertical history, not a decorative graph.
