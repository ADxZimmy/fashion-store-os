# Context

## Decision

Owner decision, 2026-08-18: invert the storage model. Each device stores its own business data; Supabase stores user details only. This supersedes the Phase 020 premise — account-bound *server-owned* tenancy, conflict-safe *server* writes, and server-enforced RBAC on business data all hardened exactly the server data plane this pivot removes.

Settled the same day, with the owner choosing all three:

- Sharing model: **data belongs to the device.** Manager and staff sign in on the store's device and work on that device's records, with role-gated UI. A new device starts empty by design.
- Webhooks: **transit inbox.** The server keeps only undelivered inbound provider messages; a signed-in device pulls them into local data and they are deleted server-side.
- Durability: **encrypted backup blob.** The device encrypts its data with a key that never leaves it and stores an opaque blob in Supabase for restore onto a new device.

## Entailments

Consequences the three choices force, verified against the code on 2026-08-18:

- **Global accounts are not optional.** Today every account, session, invite, and recovery code lives inside a per-workspace `auth` document addressed only by a device-generated workspace id held in localStorage (`api/_store.js:35-64`, `WORKSPACE_KEY` at `src/app.js:4`). There is no email-to-workspace index anywhere, so losing the device loses the *pointer to the identity* as well as the data — and the chosen restore story (sign in from a fresh device, pull the backup) is impossible without device-independent sign-in. Identity must restructure into global tables: accounts with globally unique emails, stores, memberships, sessions, invites, recovery codes.
- **Offline unlock is required.** `render()` gates every view on `currentUser()` (`src/app.js:1017`) and sessions validate only server-side, so today a Supabase pause locks a store out of data sitting on its own device. Local-first without an offline unlock path would make availability *worse* than the current model.
- **Phase 019 workspace codes retire.** Join codes exist to move a device-bound identity address between devices. Under global accounts, signing in on the second device replaces the join flow, and the combined invite string (`workspaceCode.inviteToken`, `api/_auth.js:606-618`) collapses back to a plain invite token.

## Hazards The Impact Map Found

Each of these is assigned to a PLAN step; none is optional.

- The trust direction is backwards for local-first: bootstrap **replaces local state with a seed and deletes the local cache** whenever the server reports unauthenticated or stateLocked (`src/app.js:146-156`). Under local-first that destroys the only copy on routine session expiry. Sign-out does the same via `clearState`.
- The deployed client **re-uploads business data** whenever the server lacks it (`src/app.js:160-162`), and every `saveState()` PUTs the whole blob. Client call sites and server endpoints must change in the same release or the pivot boundary silently leaks.
- `persistLocalState` is an **unguarded `localStorage.setItem`** (`src/app.js:5470-5472`); profile logos are base64 data URLs inside the same blob; and the server's 5MB body limit, which today indirectly bounds state size, disappears with the server. Quota exhaustion would silently lose writes.
- **Sign-in, signup, recovery, and invite acceptance have no rate limiting at all** (`api/session.js`); the only limiter in the codebase is in-memory, per-instance, and scoped to the `/api/workspace-code` redeem action — the accept-invite path redeems invite codes with no limiter. Under the pivot these endpoints are the entire remaining server attack surface.
- Migration `20260611163000` granted anon/authenticated DML on the documents table and was **never revoked** — the `20260626191000` hardening covered other tables. The anon key can read, write, or plant the default workspace's state and auth documents; the auth document carries password hashes whenever accounts exist there (default was last observed empty on 2026-08-03, so this is a standing capability rather than a confirmed current exposure). Hotfix migration written in this phase: `supabase/migrations/20260818090000_revoke_default_workspace_document_api_access.sql`.
- `GET /api/data` **500s on a zero-user workspace** (`user.id` dereference on `requireManager`'s null user, `api/data.js:30`) and DELETE proceeds unauthenticated there — the same `requireManager` null-user class as the 2026-08-03 join-code bug. Do not trust `requireManager` alone; check the returned user.
- **Invite acceptance wipes local data with no warning**: the confirm-join guard protects only the join-code path (`src/app.js:3425-3429`); `acceptInvite` calls `adoptWorkspace` directly (`src/app.js:3380-3382`). And the existing abandonment modal promises "anything in the current one stays stored" (`src/app.js:1570`) — false under local-first.
- `confirmResetLocalData` clears `STORAGE_KEY`, `VIEW_KEY`, and `AUTH_KEY` but **never `WORKSPACE_KEY`** (`src/app.js:4645-4647`).
- `scripts/security-audit.js` **hard-asserts on file contents** — line 26 on `api/channel-webhook.js`, line 27 on `api/data.js` containing `requireManager` — so endpoint removals must update the audit in the same commit or `launch:check` fails.
- The auth document is a whole-document read-modify-write with **last-write-wins**; concurrent identity operations from two devices can silently lose writes. Global account rows fix this for identity; it stays unfixed for business data by design (single-writer device).
- `server.js` mirrors all eleven routes; **every change lands twice** or local dev diverges.
- `/api/inbound` has **zero frontend callers** — the UI's manual intake is already fully client-side (`src/app.js:3829-3856`) with its own normalizer copy. The endpoint and `api/_inbound.js` are deletions plus a dedupe, not a migration.
- Housekeeping that never existed: expired/redeemed workspace-code rows have no sweep (moot once the table retires), and two schema-only tables (`fashion_store_os_audit_events`, `fashion_store_os_channel_delivery_events`) have zero code references. The same defect class threatens the pivot's own new tables — sessions, invites, recovery codes, rate-limit counters, inbox rows all accumulate — so PLAN step 1/5 give every transient table a sweep from day one.
- The keepalive/health probe queries the documents table specifically (`api/_store.js:107-113`); when the schema restructures, the probe target must move with it or the cron probes a vestigial table.

## What Survives Of Phase 020

Re-homed:

- Step 4's abuse controls → PLAN step 1, in full: durable rate limits, request-shape validation, per-store quotas, and retention rules — the identity plane is now the whole attack surface.
- Step 6's anon-grant removal → PLAN step 0 (hotfix, written); CSP/security headers → PLAN step 6.
- Step 7's CI gates → PLAN step 6 (a workflow running the check suites on every push — the push-is-release lane's missing post-push gate).

Deferred, not re-homed: step 8's **alerting**, which stays tracked as the ROADMAP "Later > Alerting" item. Production went a month unprobed before the 2026-07-30 pause was noticed — the argument for alerting is unchanged by the pivot. Note the keepalive nuance precisely: the daily cron resets the idle-pause timer regardless of user traffic, so sparser identity-only traffic does not itself raise pause risk — the risk is someone deleting the cron as "obsolete", after which a pause blocks every sign-in, invite, and recovery while local work continues.

Dropped by design: conflict-safe server writes, server-enforced RBAC on business data, server-owned workspace membership.

## Accepted Trade-Offs

Stated plainly rather than discovered later:

- **RBAC on business data becomes advisory.** `allowedViews` gates the UI only; anyone with device access can read or edit the entire local dataset via devtools. Accepted for a trusted shop device. Per-user local encryption is the only stronger mechanism and is out of scope.
- **Multi-device concurrent editing is impossible by design** — that is how the Phase 020 conflict problem is resolved, not deferred. The backup blob is a restore mechanism, not a sync mechanism; restoring onto a second active device forks the data, and the UI must say so at restore time.
- **A red database means sign-in, invites, recovery, backups, and the inbox are down** while local work continues after offline unlock. Health severity semantics change accordingly. On Neon an idle database wakes by itself; the failure modes left are a real outage and the free plan's monthly compute cap (see Provider change).
- **The backup key is cached on the device.** Automatic backup cannot run without key material, so the PBKDF2-derived AES key (never the passphrase) persists locally. Someone with device access can therefore trigger backups or read the key — consistent with the devtools trade-off above, and the passphrase itself stays unrecoverable from the device.
- **The local plaintext-password auth fallback is deleted, not kept.** It predates server auth, stores plaintext passwords in localStorage (`src/app.js:277`), and would otherwise become load-bearing under "everything local". Offline access is the explicit unlock design in PLAN step 2, not the prototype path.

## Provider change, 2026-10-02

**What happened.** On 2026-10-02 production `/api/health` reported `supabase-unreachable`, and the project hostname returned NXDOMAIN on public resolvers: Supabase had paused the Free project for inactivity a second time (the first was 2026-07-30), despite the daily keepalive cron. Either the cron never fired (a successful run was never observed) or one query a day did not count as "sufficient user database activity". Supabase restores a paused Free project for 90 days from the pause date; healthy on 2026-08-18 and needing about 7 idle days to pause, the window closes no earlier than about 2026-11-23.

**Why it could not stay.** After the pivot the server side is everything a new device needs: sign-in, invites, recovery, encrypted backups, and the inbox. A pause that only a human can undo is an outage of all of it.

**Decision (owner, 2026-10-02).** Move the server database to **Neon Postgres**, provisioned through the Vercel integration, using Neon's official driver (`@neondatabase/serverless`). Neon's free plan scales idle compute to zero and wakes it on the next query, and archives idle branches but unarchives them automatically on access, so an idle week costs a slower first request rather than an outage. Considered and rejected: Turso (its free plan archives databases after 10 idle days and needs a manual unarchive, the same failure), and Supabase Pro (never pauses and needs no code change, but $25 a month, and the owner asked to move).

**What it cost.** No data migration: the identity, backup, and inbox tables had never been applied to Supabase. The step 1 adapter boundary meant the core (`api/_identity.js`, `_backup.js`, `_inbox.js`) did not change at all.

**What changed in the design.**

- One SQL adapter, `api/_identity_pg.js`, replaces both the Supabase adapter and the file-backed fake. Production runs it over Neon's HTTP driver (`api/_db.js`); tests and the local dev server run it over PGlite, a real Postgres embedded in-process (`db/pglite.js`). The step 1 risk "the Supabase adapter has zero test coverage" is closed for the SQL itself; what remains untested is Neon's driver against a live database.
- The schema lives in `db/migrations/0001_identity.sql` and is applied by `scripts/db-migrate.js` during production builds (skipped on preview builds unless `DB_MIGRATE_ON_PREVIEW=1`), atomically per file. Row-level security and Supabase role grants were dropped: Neon exposes no public data endpoint, so the exposure class the step 0 hotfix closed cannot recur.
- `/api/keepalive` became `/api/maintenance`. Nothing needs keeping alive; the daily cron runs the retention sweep and fails loudly when the database is unreachable.
- `/api/health` probes the database; `/api/readiness` gains a real round trip and separates required checks from optional channel checks.
- The legacy Supabase modules (`_store`, `_auth`, `_workspace_codes`, `_rate_limit`) were deleted, with the never-applied Supabase versions of the phase migrations.
- The security audit now recognises Neon connection strings and passwords, and scans comments: it previously stripped everything after `//`, which would have hidden the credential half of any `postgresql://` URL.

**New limits to watch.** Neon Free: 1 GB storage, 100 compute-hours a month, 5 GB transfer a month. These are usage caps, not inactivity rules; exhausting compute suspends the database until the next month. One shop is far from them because compute only accrues while serving requests.

**Legacy Supabase project.** Restore it once before the window closes to run UAT item 11 (confirm the old documents hold nothing real), then decommission it. Its five applied migrations stay in `supabase/migrations/` as the record of that project until then.
