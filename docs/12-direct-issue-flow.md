# 12 — Direct Issue workflow simplification

## Current product decision

AssetDesk no longer requires an Admin to create an inventory/material catalog
before an Issue Record can be made. A server-room user can immediately enter:

- Receiver name;
- email and contact number;
- optional university ID and department;
- person type;
- one or more material/device names;
- quantity and an optional identifying description;
- expected Return preset or custom date;
- optional purpose and notes.

The Issue date uses the current server time. All direct items are returnable and
their outstanding quantity is tracked on the immutable Issue Record.

## Receiver handling

The Issue screen does not require Receiver-directory setup. AssetDesk reuses an
existing Receiver by normalized email or creates the Receiver automatically in
the same MongoDB transaction as the Issue. The entered contact information
becomes the current Receiver snapshot and is used for notification delivery.

## Material handling

Direct material is stored only as an Issue snapshot with an internal
`DIRECT-XXXXXXXX` reference. It does not create a Material catalog record, does
not require an available-stock balance, and does not appear as a prerequisite in
the interface. A direct Return reduces only the Issue's outstanding balance.

Earlier catalog-backed Issue Records remain readable and returnable. Their
existing inventory effects are preserved for backward compatibility, but the
catalog creation screen and navigation are no longer part of the active flow.

## Reliability

Direct Issue creation still retains:

- Admin/Worker authorization;
- server-generated Issue IDs;
- idempotent mobile-safe submission;
- transactional Receiver, Issue, audit, and email-job persistence;
- partial and complete Returns;
- receiver/operator notification emails; and
- full Issue and Return history.
