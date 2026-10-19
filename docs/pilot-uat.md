# Fashion Store OS Pilot UAT

Last updated: 2026-10-19

## Pilot Goal

Validate that a real fashion store can run one full operating cycle on Fashion Store OS before it is offered more widely. This pilot tests the business workflows. The technical acceptance of the release (sign-in, offline use, backup, restore, the inbox) is the Phase 021 UAT in `.planning/phases/021-local-first-pivot/UAT.md`, which comes first.

## How The App Holds Data

Since Phase 021 (Release A):

- **Records live on the shop's device**, in the browser that recorded them, not on a server. Choose one device and one browser as the shop device for the whole pilot. Manager and staff all sign in there.
- **Accounts live on the server**, so anyone can sign in from any device, but a device without the store's records has nothing to work on. Staff signed in elsewhere see a "No records here" screen.
- **The encrypted backup protects against losing the device.** The manager sets a backup passphrase on day one and keeps it somewhere safe. Nobody can open the backup without it, including the app's operators.
- **Clearing site data or using a private window on the shop device erases its records.** Testers must not do either during the pilot.

## Pilot Roles

- Manager: setup, team access, the backup passphrase, manager review, reports, and sign-off. A store can have more than one manager.
- Staff: CRM intake, measurements, orders, fittings, production updates, and inventory changes, on the shop device.
- Owner release operator: `ADxZimmy`, for releases and production configuration.

## Entry Criteria

- Release A is deployed and `docs/production-smoke.md` passed on it.
- The Phase 021 UAT passed.
- `/api/health` reports `ok: true` and `storage: "postgres"`; `/api/readiness` reports `ok: true`.
- For provider messages in Scenario 2: channel intake is configured (`docs/channel-integrations.md`). Without it, enter messages by hand.

## Scenario 1: Shop Device Setup

Steps:

1. On the shop device, create the manager account.
2. Save the recovery code shown on the setup screen somewhere safe. It is shown once.
3. Enter the business name, contact details, units, logo, and brand colours, then open the dashboard.
4. Refresh and confirm everything persists.
5. Settings, Backup: **Back up now**, set a passphrase, and confirm a last backup time appears.
6. Settings, This device's records: note whether the status says Protected or Evictable.

Pass:

- The dashboard opens with the saved business identity, and no old brand appears anywhere.
- The backup shows a last backup time and **Automatic: Up to date**.
- If storage is Evictable, the manager understands the backup is what protects the records.

## Scenario 2: CRM Intake To Inquiry

Steps:

1. Add a WhatsApp or Instagram style message in CRM Inbox, by hand or, if a provider is connected, by sending a real message and using **Check for messages**.
2. Route it into the inquiry pipeline.
3. Update the follow-up status.
4. Convert the inquiry into an order draft.

Pass:

- The message is preserved in CRM Inbox, once, even after checking for messages again.
- The inquiry carries source, contact, style, deadline, budget, notes, and consent.
- The converted order appears in Garment Orders.

## Scenario 3: Quote, Payment, Fitting, Review, Handoff

Steps:

1. Create or open an order draft.
2. Record a deposit.
3. Confirm the order and reserve materials.
4. Start cutting and enter the actual fabric used.
5. Schedule a fitting, then complete it.
6. Request manager review; approve it or request changes.
7. Record the final payment if needed.
8. Complete the handoff.

Pass:

- The balance updates after each payment.
- Reserved stock reduces available stock; cutting deducts the actual fabric and releases the unused reserve.
- Fitting, review, and follow-up status are visible on the order.
- Handoff closes the order and records a learning entry.

## Scenario 4: Inventory Adjustment

Steps:

1. Restock a material.
2. Adjust a material down for a correction or damage.
3. Try to adjust below the reserved quantity.

Pass:

- The restock and the adjustment appear in inventory history, and available stock is correct.
- The adjustment below the reserved quantity is blocked.

## Scenario 5: Reports And Staff Access

Steps:

1. Review Reports after the activity above.
2. In Settings, Team access, invite a staff member with some sections and a second manager.
3. Each accepts their invite on the shop device: sign out, then **Accept invite** on the sign-in screen.
4. Sign in as each in turn on the shop device.
5. As a manager, suspend the staff member, try to sign in as them, then reactivate them.
6. Optionally, sign in as the staff member on a different device.

Pass:

- Reports show current conversion, revenue, stock, production, and learning signals.
- Staff see only their assigned sections; the second manager has full access.
- A suspended staff member cannot sign in; after reactivation they can.
- On a different device, the staff member sees "No records here", never the business setup form.
- The team understands that section access is enforced by the app's screens, not by the device: anyone with access to the shop device's browser could read its records.

## Scenario 6: Backup, Restore, And Your Own Copy

Steps:

1. Settings, Backup: confirm the last backup is recent. Automatic backups run a few minutes after changes while online.
2. Settings, Your own copy: **Download a copy** and keep the file somewhere safe.
3. Restore rehearsal on a second device or browser profile: sign in as the manager, choose **Restore from backup** on the setup screen, and enter the passphrase. Then try a wrong passphrase once.
4. Afterwards, erase the rehearsal device (Settings, This device's records, **Erase this device's records**) so the shop device stays the only working copy.

Pass:

- The restored records match the shop device.
- The wrong passphrase is refused and nothing changes.
- The manager knows a lost passphrase means a lost backup, and that two devices working at once hold two different sets of records: there is no syncing.

## Scenario 7: An Offline Day

Steps:

1. On the signed-in shop device, turn off Wi-Fi and mobile data.
2. Keep working: add a client and record a payment.
3. Close the app and open it again while still offline.
4. Reconnect.

Pass:

- The app opens offline with everything available and shows "Offline: working on this device".
- The offline changes are still there after reopening.
- Within a few minutes of reconnecting, the offline label clears and Settings, Backup shows a backup time later than the offline changes.

## Issue Triage

Use the severity scale in `docs/operations-runbook.md`, Post-Launch Support. In short:

- Sev-1: records lost, data leaving the device, a sign-out that does not stick, or sign-in down everywhere.
- Sev-2: a core workflow blocked with no workaround, including backup, restore, or recovery.
- Sev-3: degraded or confusing, with a workaround.
- Sev-4: cosmetic or enhancement.

Never paste customer records, passwords, recovery codes, or passphrases into an issue.

Pilot exit:

- No open Sev-1 or Sev-2.
- Every Sev-3 has an owner and a date.
- Wider rollout waits for one clean operating cycle.

## History

The 2026-06-29 version of this document described the pre-pivot model, in which each browser kept a server-side workspace. That pilot was waived on 2026-07-31 (`docs/cutover.md`, v1.0.0 history). Phase 021 replaced the model before any real store used it.
