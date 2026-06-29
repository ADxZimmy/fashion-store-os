# Fashion Store OS Pilot UAT

Last updated: 2026-06-29

## Pilot Goal

Validate that a real fashion store can use Fashion Store OS for one full operating cycle before public launch.

## Workspace Model

Fashion Store OS is multi-tenant per device. Each browser/device generates its own isolated workspace (an `x-workspace-id` it keeps in local storage), so multiple testers can run the app at the same time without sharing or colliding. **One browser = one studio.** A workspace can have multiple managers and up to 25 users. Clearing browser storage (or a fresh incognito window) starts a new empty workspace — the old data stays in the cloud but becomes unreachable from that browser — so testers should not clear site data mid-pilot.

## Pilot Roles

- Manager: owns setup, team access, manager review, reports, export, and launch sign-off. A workspace can have more than one manager.
- Staff: handles CRM intake, measurements, orders, fittings, production updates, and inventory changes.
- Owner release operator: `ADxZimmy` handles the Git-connected Vercel release and production env vars.

## Entry Criteria

- `npm.cmd run launch:check` passes locally.
- Owner-side Supabase env vars are set on the Git-connected Vercel project.
- `/api/health` reports healthy production storage.
- `/api/readiness` reports production prerequisites, or any failed check is explicitly accepted for the pilot.
- A rollback path is available from Vercel deployment history.

## Scenario 1: Workspace Setup

Steps:

1. Open the app as a new workspace.
2. Create manager access.
3. Enter business name, contact details, units, logo, and brand colors.
4. Refresh and confirm the workspace persists.

Pass:

- Dashboard opens with the saved business identity.
- The save indicator shows "All changes saved" (no backend/storage wording).
- This device's workspace is independent of any other tester's device.
- No hardcoded old brand appears in runtime UI.

## Scenario 2: CRM Intake To Inquiry

Steps:

1. Add a WhatsApp or Instagram-style channel message.
2. Route it into the inquiry pipeline.
3. Update follow-up status.
4. Convert the inquiry into an order draft.

Pass:

- Message is preserved in CRM Inbox.
- Inquiry includes source, contact, style, deadline, budget, notes, and consent context.
- Converted order appears in Garment Orders.

## Scenario 3: Quote, Payment, Fitting, Review, Handoff

Steps:

1. Create or open an order draft.
2. Record deposit/payment.
3. Confirm and reserve materials.
4. Start cutting and enter actual fabric used.
5. Schedule a fitting.
6. Complete the fitting.
7. Request manager review.
8. Approve review or request changes.
9. Record final payment if needed.
10. Complete handoff.

Pass:

- Balance updates after each payment.
- Reserved stock decreases available stock.
- Cutting deducts actual fabric and releases unused reserve.
- Fitting/review/follow-up status is visible on the order.
- Handoff closes the order and records a learning entry.

## Scenario 4: Inventory Adjustment

Steps:

1. Restock a material.
2. Adjust a material down for correction or damage.
3. Try to adjust below reserved quantity.

Pass:

- Restock and adjustment appear in inventory history.
- Available stock updates correctly.
- Invalid adjustment below reserved quantity is blocked.

## Scenario 5: Reports And Staff Access

Steps:

1. Review Reports after creating CRM and order activity.
2. In Team access, add a user — try both a Staff role (limited access) and a Manager role (full access).
3. Sign in as the staff user and confirm limited navigation; sign in as the second manager and confirm full access.
4. Suspend/reactivate the staff user as a manager.

Pass:

- Reports show current conversion, revenue, stock, production, and learning signals.
- Staff sees only assigned sections; a second manager has full access.
- Suspended staff cannot continue access.
- Adding multiple users/managers is allowed up to the 25-user workspace limit.

## Scenario 6: Recovery And Export

Steps:

1. Run `/api/health` and `/api/readiness`.
2. Export data as manager through the server API.
3. Review the operations runbook restore path.
4. Confirm Vercel logs are clean after smoke tests.

Pass:

- Health/readiness responses are safe and useful.
- Export is manager-gated and sanitized.
- Restore process is understood before public launch.

## Issue Triage

- P0: Data loss, broken auth, public secret exposure, or production app unavailable.
- P1: Core store workflow blocked.
- P2: Mobile/a11y issue that slows staff but has a workaround.
- P3: Copy, polish, or reporting nuance.

Launch rule:

- No open P0 or P1.
- P2 items must have an owner and date.
- Public launch waits for owner production persistence and one clean pilot cycle.
