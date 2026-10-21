# Requirements

Last updated: 2026-10-21

Rewritten on 2026-10-20 for the local-first model that shipped in Phase 021 (Release A, `v2.0.0`, 2026-10-19). Business records live on the shop device; the server database (Neon Postgres) holds identity, one encrypted backup per store, and a short-lived inbox for provider messages. Requirements the pivot retired are listed under Retired By Phase 021 with what replaced them. Sources: `.planning/phases/021-local-first-pivot/` and `docs/production-persistence.md`.

## Functional

### Store Workflow

- Requirement: First-launch business setup.
  Acceptance: When the device holds no business profile, a manager sees setup for business identity, contact details, currency, measurement and fabric units, logo, and brand colors, and the profile is saved on the device. The same screen offers restore from backup for a new or replacement device. Staff on a device with no records get a "No records here" screen instead, never setup.
- Requirement: Brand-agnostic operating dashboard.
  Acceptance: The dashboard uses the saved business name and shows inquiries, active orders, due work, fittings, production workload, low stock, reserved materials, revenue, and production status. Fittings due and the production flow count active orders only, never completed or cancelled ones.
- Requirement: Client, inquiry, order, measurement, catalog, recipe, inventory, and production modules.
  Acceptance: Each module has usable records, creation flows, and fashion/tailoring terminology. Editing or deleting saved records is not built for most modules yet (Open Questions).
- Requirement: Inquiry conversion.
  Acceptance: An inquiry converts into at most one order. A converted inquiry keeps a link to its order and offers Garment Orders instead of a second conversion, even if its status is changed back.
- Requirement: Style recipe and material estimation.
  Acceptance: Garment recipes calculate practical estimated material needs from base fabric, fabric width, wastage, selected design modifiers, and a size allowance that reads client measurements in the store's measurement unit.
- Requirement: Inventory reservation and deduction workflow.
  Acceptance: Confirmed orders reserve estimated materials; cutting deducts the actual fabric and releases the unused reserve; closing an order through Handoff or Complete deducts the remaining reserved finishing items. Advancing production stops at Ready, so no order closes without that step. A learning record compares the estimate with actual usage only when cutting was recorded.
- Requirement: Appearance/branding settings.
  Acceptance: Users can update display name, logo, primary/accent/sidebar/success colors, background mode, and contact details. Theme presets change colors only, never the business identity.
- Requirement: CRM channel intake.
  Acceptance: WhatsApp/Instagram-style messages, typed in by hand or collected from the transit inbox, are kept on the device as channel records with source, sender/contact, message, desired garment, deadline, consent, routing status, and follow-up state, then routed into the CRM inquiry pipeline.
- Requirement: Intelligence and reporting.
  Acceptance: The app provides a Reports workspace with conversion, revenue, workload, stock-risk, reply-draft, quote-draft, and learning-insight outputs derived from the records on the device.
- Requirement: Daily store order workflow.
  Acceptance: Orders support payment records, balance tracking, fitting scheduling/completion, manager review request/approval/change states, handoff details, customer follow-up state, and activity history.
- Requirement: Money entry.
  Acceptance: Payment, budget, quote, deposit, base price, and cost fields accept any amount to the cent, and amounts show cents when they have them. A guard keeps every number field's minimum a whole multiple of its step, so the browser never rejects an ordinary value.
- Requirement: Audited inventory adjustments.
  Acceptance: Restocks and manual inventory adjustments update stock while recording item, quantity before/after, reason, note, actor, and timestamp; adjustments below reserved quantity are blocked.

### Device Records

- Requirement: Records stay on the device.
  Acceptance: Business records are saved only in the device's IndexedDB, and no request carries them to the server. What leaves the device is sign-in traffic, the encrypted backup, and inbox acknowledgements (message ids).
- Requirement: Lock without loss.
  Acceptance: Sign-out and session expiry lock the screen and never modify device records; signing back in shows the same records. A sign-out the server did not hear, for example while offline, is completed before any later "still signed in" answer is trusted.
- Requirement: Offline use.
  Acceptance: A service-worker app shell lets a previously signed-in device open, edit, and save with the server unreachable, for up to 30 days after it last confirmed its identity online, and go back online without a reload when the server returns. A device that has never signed in cannot unlock.
- Requirement: One store per device.
  Acceptance: Device records are tagged with their store. Signing in with another store's account on a device that holds records shows a choice, sign out and keep the records or erase them, and never a silent wipe. Erasing the device's records is a separate, confirmed action that leaves the account intact.
- Requirement: Device storage hardening.
  Acceptance: Persistent storage is requested on every start and its status shown. Every write is guarded, so a quota failure is reported rather than lost and the previous records survive; a last-known-good copy recovers a corrupted save. Logos are downscaled to at most 512 pixels and re-encoded as JPEG when the PNG would exceed 256 KB.

### Backup And Restore

- Requirement: Encrypted backup.
  Acceptance: Each store keeps one backup the server cannot read: AES-GCM with a key derived on the device from the manager's passphrase (PBKDF2, 210,000 iterations; passphrase at least 10 characters), bound to the store id. The passphrase is never stored; the derived key is cached on the device so automatic backups can run (accepted trade-off). Automatic backup runs about 3 minutes after changes while online and catches up after time offline. A backup over the 4 MiB ciphertext limit is refused before upload with a visible error.
- Requirement: Restore onto a new device.
  Acceptance: A manager signs in on a device with no records and restores from the setup screen. A wrong passphrase fails without changing anything. The restore warns that two devices working at once hold different records, since there is no sync.
- Requirement: Your own copy.
  Acceptance: Settings downloads the records as a file, stamped with the store id, and loads such a file back, with no server involved. Loading accepts only a copy made by Download a copy (older copies without a store id are compared by business name), refuses another store's copy, and changes nothing until the operator confirms in an app dialog that names what the file holds and what the device holds. Business setup offers it next to Restore from backup.

### Identity And Access

- Requirement: Global accounts.
  Acceptance: An email is unique across the system, and a person signs in from any device with email and password. An account belongs to stores through memberships, as manager or staff with allowed views. Identity responses never carry business data.
- Requirement: Production auth hardening.
  Acceptance: Passwords are stored as PBKDF2 hashes. Sessions are hashed tokens in the HttpOnly `fso_session` cookie (Secure in production) with a 7-day expiry. Team, backup, and store-deletion actions are manager-gated; each gate is tested without a session and with the wrong role, and the team and store-deletion gates also on an empty system.
- Requirement: Staff lifecycle management.
  Acceptance: Managers invite managers and staff, assign staff sections, suspend, reactivate, and remove staff, and issue recovery codes for colleagues. Invites expire after 3 days and can be accepted from any device. A store holds at most 25 members including open invites, with at most 10 open invites. Managers cannot be suspended or removed. Staff section access is enforced by the app's screens only (accepted trade-off). Lifecycle events appear in the identity audit, kept 90 days.
- Requirement: Account recovery.
  Acceptance: A one-time recovery code is shown once at manager signup and can be re-issued from Settings. Redeeming a code sets a new password, grants no session, and spends the code; codes do not expire. An owner last-resort procedure is documented in `docs/operations-runbook.md`.
- Requirement: Durable abuse controls.
  Acceptance: Database-backed rate limits hold across serverless instances on signup, sign-in, recovery redemption, invite acceptance, password changes, and store deletion. Sign-in is limited per email and client (10 attempts in 5 minutes), so an attacker cannot lock out the real owner. Every identity action validates its request shape, and request bodies are capped at 5 MB.
- Requirement: Store deletion.
  Acceptance: A manager deletes the store from Settings by entering their password again. One transaction removes the store, accounts that belong only to it, sessions, invites, the backup, inbox messages, and audit rows. Device records are untouched, and the panel offers a download first.

### Channel Intake

- Requirement: Real channel webhook adapters.
  Acceptance: `/api/channel-webhook` accepts direct and Meta-style payloads, answers the provider's verify-token handshake, verifies HMAC SHA-256 signatures, normalizes messages, and stores them in the transit inbox for the one store named by `FASHION_STORE_INBOX_STORE_ID`. Without that binding it refuses deliveries with 503 rather than guessing. No third-party token is committed.
- Requirement: Production channel rollout safeguards.
  Acceptance: Signature-required mode fails closed without a secret; a delivery's batch is capped (25 by default, at most 100); duplicates are refused at insert by provider message id or a content fingerprint; consent status is preserved; GET answers only the verification handshake and never exposes messages.
- Requirement: Transit inbox.
  Acceptance: A signed-in device pulls waiting messages, stores them, then acknowledges them, which deletes the server copy; anything that fails before the acknowledgement is pulled again and ignored as a duplicate. Uncollected messages expire after 14 days.

### Operations

- Requirement: Owner-safe GitHub/Vercel release lane.
  Acceptance: The repo documents the `ADxZimmy` owner-release path, provides a preflight command, and does not rely on spoofed commit authorship to bypass Vercel Hobby permissions.
- Requirement: Continuous checks.
  Acceptance: CI runs `npm run launch:check` on every push and pull request, without blocking the deploy. Guards check route parity between `api/` and `server.js`, at most 12 functions in `api/`, and that `vercel.json` carries the security headers value for value.
- Requirement: Production readiness diagnostics.
  Acceptance: `/api/readiness` returns safe configuration checks plus a real database round trip. Only the required checks (database configured, database reachable, owner release lane) decide `ok`; the channel checks (signatures required, inbox bound to a store) are reported as optional.
- Requirement: Daily maintenance.
  Acceptance: A Vercel cron calls `/api/maintenance` daily at 06:00 UTC, guarded by `CRON_SECRET` when it is set. It sweeps expired sessions and invites, rate-limit events older than a day, audit rows older than 90 days, and expired inbox messages, and fails loudly when the database is unreachable.
- Requirement: Schema migrations.
  Acceptance: Schema changes are new files in `db/migrations/`, applied in order by production builds, one transaction per file. A production build without `DATABASE_URL` fails so the previous deployment stays live; preview builds do not migrate.
- Requirement: Pilot launch readiness.
  Acceptance: `npm.cmd run launch:check` runs the syntax check, every test suite (the server ones on embedded Postgres), the UX and security audits, and the build before an owner-side release. The Phase 021 UAT and `docs/pilot-uat.md` define the owner-run acceptance.

## Non-Functional

- Requirement: Responsive, modern, calm operations UI.
  Acceptance: The app works on desktop and narrow screens without overlapping content.
- Requirement: Persistent device records (was: persistent workspace state).
  Acceptance: Refreshing or restarting the browser retains the profile, records, reservations, and theme settings from the device's IndexedDB; identity comes back from the server, or offline from the cached identity.
- Requirement: Clear async feedback.
  Acceptance: The app shows a loading state while it checks identity, an "Offline: working on this device" chip while the server is unreachable, whether device storage is persistent, and the last backup time with any changes still waiting for one.
- Requirement: Production storage observability.
  Acceptance: `/api/health` performs a real database round trip and reports `storage: "postgres"`, `"database-unreachable"`, or `"unconfigured"`; it names the database host but never its credentials.
- Requirement: Runtime log hygiene.
  Acceptance: Expected 4xx auth/client responses do not emit error stacks, while 5xx failures still log for diagnosis.
- Requirement: Security headers.
  Acceptance: Every response carries the standard security headers and a Content Security Policy that allows scripts only from the app's own origin and forbids framing; production adds HSTS.
- Requirement: Brand neutrality.
  Acceptance: No store's branding ships with the app: the favicon is a neutral icon, and the build publishes no reference images.
- Requirement: Repeatable mobile/accessibility acceptance.
  Acceptance: `npm.cmd run ux:audit` verifies the mobile drawer (backdrop, close control, Escape), the live feedback region, the skip link and focus target, visible focus, reduced motion, 44px touch targets, overscroll/no-overflow protections, and the absence of native dialogs.
- Requirement: Repeatable security hygiene check.
  Acceptance: `npm.cmd run ops:security` checks the body limit, webhook signature-required mode, manager-gated identity actions, durable identity rate limiting, retired endpoints answering 410, the absence of server-side business-state writes, database credentials coming from the environment, no Supabase client in runtime code, the Content Security Policy, the owner release lane, and committed secret-looking values or native dialogs.

## Retired By Phase 021

Kept as the record of the server-data model; none of these describes the app now.

- Requirement: Backend-backed persistence foundation (state and auth documents on the server, with browser storage as the fallback).
  Retired: replaced by Records stay on the device. `/api/state` answers 410 until Release B deletes it.
- Requirement: Workspace-aware production persistence (Supabase workspace, audit, and channel-delivery tables).
  Retired: replaced by global identity rows on Neon (`db/migrations/0001_identity.sql`). The legacy Supabase project is decommissioned in Release B.
- Requirement: Manager-gated data export (`GET /api/data`).
  Retired: replaced by Your own copy, a download on the device. `/api/data` answers 410 until Release B.

## Out Of Scope

- Item: Platform OAuth setup, paid WhatsApp Business onboarding, Graph API permission review, and outbound send APIs.
- Item: Advanced pattern-making mathematics.
- Item: Sync between devices, CRDTs, or concurrent editing: one shop device per store, by design. Restoring onto a second device that keeps working forks the records.
- Item: Server-enforced access control on business records. Staff section access is enforced by the app's screens only, an accepted trade-off of keeping records on the device.
- Item: Per-user encryption of device records, and billing.
- Item: Device-side provider polling, and routing provider messages to more than one store.
- Item: Email verification and MFA.
- Item: Alerting and paging, deferred to the roadmap's Later > Alerting.

## Open Questions

- Question: Should a later phase migrate this static MVP into the missing existing app framework if that source tree is provided?
  Status: Open.
- Question: Which production backend should replace the current JSON-file persistence layer?
  Status: Answered. Business records stay on the device (Phase 021), and the server database is Neon Postgres (2026-10-02), holding identity, backups, and the inbox.
- Question: A store allows 25 members including open invites; should limits vary by subscription tier?
  Status: Open.
- Question: Should a store ever work from more than one device at once?
  Status: Open. Today it cannot, by design: there is no sync.
- Question: Which real provider should connect first: WhatsApp Business API, Instagram Graph API, or a simpler webhook bridge?
  Status: Open.
- Question: Should Complete and Handoff stay available at every step? Today an order can skip reserving and cutting, so its fabric is never deducted from stock and it leaves no learning record.
  Status: Open; raised by the 2026-10-20 audit, to settle before the pilot.
- Question: Should a manager be removable? Today no manager can be suspended or removed except by deleting the store.
  Status: Open; raised by the 2026-10-20 audit, to settle before the pilot.
- Question: Should saved records be editable? Clients, inquiries, orders, style recipes, and inventory details have no edit or delete screens.
  Status: Open; raised by the 2026-10-20 audit, to settle before the pilot.

Operational questions (the Vercel plan for collaborator deploys, a custom domain) are tracked in `handover.md`.
