# Admin operational dashboard

The Admin home page is an operational view backed by one secured endpoint:
`GET /api/v1/dashboard/admin`. Worker accounts cannot access university-wide counts. The response
is marked `no-store`, and the frontend refreshes only on navigation, focus/reconnect, or an explicit
Refresh action.

## Metric definitions

- **Issued today:** Issue Records whose `issuedAt` falls inside the current IST calendar day.
- **Total Issues:** all Issue Records, including completed history.
- **Pending Returns:** Issue Records in `ISSUED` or `PARTIALLY_RETURNED` state with an outstanding
  quantity greater than zero.
- **Overdue:** pending Returns whose expected Return time is earlier than the server time.
- **Due today:** pending Returns due within the current IST calendar day.
- **Returned today:** Return events recorded within the current IST calendar day.
- **Outstanding items:** the summed outstanding quantity across pending Issue Records.
- **Active workers:** active accounts with the Worker role.

The API also returns up to five attention records (overdue first, followed by due-today records) and
the five most recently created Issue Records.

## Click-through filters

Dashboard cards open exact filtered tables rather than approximate status views:

- `period=TODAY` for Issue or Return activity recorded today.
- `returnState=PENDING` for all pending Returns.
- `returnState=OVERDUE` for overdue Returns.
- `returnState=DUE_TODAY` for Returns due today.
- `returnState=NEEDS_ATTENTION` for overdue or due-today records.

All date boundaries are calculated by the server in `Asia/Kolkata` time using half-open ranges, so
midnight records cannot appear in two days.
