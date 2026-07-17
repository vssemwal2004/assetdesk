# 04 — UX flows and mobile wireframes

## UX principles

- One obvious primary action per screen.
- Literal labels: `Issue material`, `Return material`, and `Send reminder`.
- Preserve entered values after validation and temporary network errors.
- Use defaults and search suggestions to reduce typing.
- Never rely on colour alone for status or error meaning.
- Never show fake metrics, percentages, charts, or unsupported trends.
- Separate an email failure from a successful Issue or Return result.
- Use full pages for complex mobile records and forms.

## Login and initial password flow

```text
Sign in
  → validate Worker ID/email and password
  → temporary credential?
      Yes → restricted session → Create new password → Dashboard
      No  → normal session → Dashboard
```

Login fields:

- Worker ID or Admin email
- Password
- Show/hide password control
- Sign in button
- Forgot password link

The form supports paste, browser autofill, and password managers.

Initial password screen:

- heading: `Create a new password`;
- short explanation that the temporary password can no longer be used afterward;
- new password and confirm password;
- visible requirements before entry;
- show/hide controls; and
- `Save new password` primary action.

No application navigation is displayed until the password is changed.

## Create one Worker

```text
Workers
  → Add Worker
  → enter name, email, optional contact/department
  → Review
  → Create Worker
  → show Worker ID and email state
```

Success actions:

- View Worker
- Create another
- Regenerate and resend credentials, only after an explicit confirmation

## Bulk Worker import

```text
Download template
  → Upload XLSX/CSV
  → Parse and validate
  → Preview valid, duplicate, and invalid rows
  → Correct file or exclude invalid rows
  → Confirm import
  → Show created/failed counts and downloadable result
```

The preview must not create accounts. Import submission is idempotent.

## Issue material flow

Use three guided steps and display `Step 1 of 3` as text.

### Step 1 — Receiver

- Search by university ID, name, email, or contact.
- Select an existing Receiver.
- If permitted and not found, add a Receiver in the same step.
- Display selected Receiver as a persistent summary card.

### Step 2 — Materials

- Search by material, asset tag, serial number, or category.
- Only available choices can be selected.
- Display available quantity and tracking type.
- Allow one or multiple materials.
- Keep selected lines visible with quantity and Remove action.

### Step 3 — Return and review

- Issue date/time defaults to now.
- Reusable material shows return presets and Custom.
- Consumable material states `No return expected`.
- Selecting a preset immediately shows the exact date.
- Purpose/notes are optional unless university policy changes.
- Review shows Receiver, items, quantities, condition, dates, and issuing user.
- Final action: `Confirm material issue`.

The frontend prevents double press and the API also requires an idempotency key.

### Issue success states

Normal:

```text
Material issued successfully
Issue ID: GEU-ISS-2026-000123
Notification: Queued

[View issue] [Issue another]
```

Email failure:

```text
Material issued successfully
Issue ID: GEU-ISS-2026-000123
Notification email could not be sent.

[Retry email] [View issue]
```

The second state must never imply that the material issue failed.

## Return flow

```text
Find Issue Record
  → select outstanding lines and quantities
  → enter condition and notes
  → review full or partial return
  → confirm return
  → show Return result and email state
```

Search supports Issue ID, Receiver, asset tag, serial number, and material.

The review clearly states either:

- `This completes the Issue Record`, or
- `2 of 5 items will remain outstanding`.

## Overdue flow

```text
Overdue list
  → open Issue Record
  → Send reminder / Extend date / Return / Mark lost
  → confirm action
  → append timeline and audit event
```

Overdue cards display:

- overdue duration;
- Receiver;
- material summary;
- original expected-return date;
- last reminder date; and
- reminder count.

## Dashboard mobile wireframe

```text
┌──────────────────────────────────┐
│ Dashboard                  [AV]  │
├──────────────────────────────────┤
│ [        Issue material        ] │
│                                  │
│ ┌────────────┐  ┌────────────┐   │
│ │  24        │  │  5         │   │
│ │ Issued     │  │ Due today  │   │
│ └────────────┘  └────────────┘   │
│ ┌────────────┐  ┌────────────┐   │
│ │  3         │  │  7         │   │
│ │ Overdue    │  │ Returned   │   │
│ └────────────┘  └────────────┘   │
│                                  │
│ Needs attention                  │
│ ┌──────────────────────────────┐ │
│ │ GEU-ISS-...  Overdue         │ │
│ │ Receiver · Material · 3 days │ │
│ └──────────────────────────────┘ │
│                                  │
│ Recent issues                    │
│ ┌──────────────────────────────┐ │
│ │ GEU-ISS-...  Issued          │ │
│ │ Receiver · Expected 18 Jul   │ │
│ └──────────────────────────────┘ │
├──────────────────────────────────┤
│ Home Issues  (+)  Overdue More  │
└──────────────────────────────────┘
```

## Issue list mobile wireframe

```text
┌──────────────────────────────────┐
│ ← Issues                    [AV] │
├──────────────────────────────────┤
│ [ Search Issue ID or receiver  ] │
│ [Filters 2]       24 results     │
│                                  │
│ ┌──────────────────────────────┐ │
│ │ GEU-ISS-2026-000123 [Issued] │ │
│ │ Dell laptop + 1 item         │ │
│ │ Receiver: A. Sharma          │ │
│ │ Expected: 18 Jul 2026, IST   │ │
│ │ Issued by: GEU-WRK-A7K4  [⋮]│ │
│ └──────────────────────────────┘ │
│                                  │
│ ┌──────────────────────────────┐ │
│ │ GEU-ISS-2026-000118 [Overdue]│ │
│ │ Network switch               │ │
│ │ Receiver: R. Mehta           │ │
│ │ Due: 12 Jul 2026, IST        │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

## Issue form mobile wireframe

```text
┌──────────────────────────────────┐
│ ← Issue material                │
│ Step 2 of 3 · Materials         │
├──────────────────────────────────┤
│ Receiver                        │
│ ┌──────────────────────────────┐ │
│ │ A. Sharma · GEU-EMP-1024     │ │
│ └──────────────────────────────┘ │
│                                  │
│ [ Search material or asset tag ]│
│                                  │
│ Selected materials               │
│ ┌──────────────────────────────┐ │
│ │ Dell Latitude · Available 3  │ │
│ │ Quantity [-] 1 [+]  [Remove]│ │
│ └──────────────────────────────┘ │
│                                  │
│                                  │
├──────────────────────────────────┤
│ [Back]                 [Continue]│
└──────────────────────────────────┘
```

## Loading states

- Render the app shell immediately.
- Use skeletons matching final card/table dimensions.
- Keep existing data visible during a background refresh.
- Use exact button labels: `Issuing…`, `Returning…`, and `Sending…`.
- Remote selects show `Loading materials…` inside the menu.
- Announce result counts and completion through an accessible status region.

## Empty states

| Context            | Message                          | Action                |
| ------------------ | -------------------------------- | --------------------- |
| First Issue Record | `No issues yet`                  | `Issue material`      |
| Filtered list      | `No records match these filters` | `Clear filters`       |
| Empty inventory    | `No material added`              | Admin: `Add material` |
| No overdue         | `No overdue material`            | None                  |

## Error states

- Field errors stay next to their controls and an error summary is shown.
- Permission error: `You do not have access to this page.`
- Missing record: `This Issue Record was not found.`
- Network error preserves form data and offers Retry.
- Unexpected error displays a supportable request/reference ID.
- Offline state prevents Issue/Return confirmation but preserves the draft in
  memory for the current session.
