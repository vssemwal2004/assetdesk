# 15 - Phase 8 security, accessibility, performance, and verification

Phase 8 makes AssetDesk ready for controlled university testing. It does not add
payment, billing, fine, or transaction behavior.

## Security checklist

- Helmet security headers are enabled and `X-Powered-By` is disabled.
- CORS allows only `APP_ORIGIN` and credentialed API requests.
- Auth, password change, Issue, Return, reminder, report export, and logout
  mutations require a trusted Origin and CSRF token.
- Cookies use `SameSite=Strict`; production cookies are `Secure`.
- Access tokens are short-lived, refresh sessions rotate, and disabled users are
  blocked on each authenticated request.
- Login attempts are rate limited and account-level failed sign-ins lock the
  user temporarily.
- Audit events record protected actions and permission denials without storing
  raw secrets.
- `.env` and `.env.example` stay ignored by Git; real Brevo and MongoDB secrets
  must never be committed or printed.

## Accessibility checklist

- Every screen has one visible page title and semantic navigation/main regions.
- Mobile and desktop navigation have accessible names.
- Search fields use visible spacing between the icon, text, and submit action.
- Forms keep visible labels or screen-reader labels, preserve typed values after
  errors, and expose validation messages with `aria-invalid` or alert regions.
- Loading states use status regions, and route-level lazy loading uses an
  accessible loading panel.
- Keyboard users can skip directly to the main content and see focus outlines.

## Performance checklist

- Frontend feature pages are lazy-loaded by route.
- React Query avoids needless refetch on window focus and gives short-lived
  cached reads for operational screens.
- API list views use server-side paging, filtering, and projection instead of
  downloading full collections.
- CSV export has a bounded date range and maximum row count.
- Email delivery uses an outbox worker so Issue and Return flows do not block on
  Brevo.

## Verification commands

Run these before campus pilot testing:

```text
npm run typecheck
npm run lint
npm run test
npm run build
npm audit --audit-level=high
```

For Atlas transaction verification:

```text
npm run verify:phase7:atlas --workspace @assetdesk/backend
```

This creates and drops only temporary verification data and does not call Brevo.

## Manual pilot checks

- Admin signs in with configured Admin ID or email.
- Admin creates one Worker; Worker signs in and must change the temporary
  password.
- Worker creates a direct Issue Record from a phone-sized viewport.
- Admin searches Issue Records, records a partial Return, then records the final
  Return.
- Admin opens Overdue, Audit logs, and Reports.
- Search bars at mobile width show the icon, input text, and submit action
  without overlap.
