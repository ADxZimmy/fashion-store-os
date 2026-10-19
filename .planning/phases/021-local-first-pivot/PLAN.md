# Plan

## Outcome

A store's device owns its business data outright: the app reads and writes locally, keeps working offline once unlocked, backs itself up as an encrypted blob the server cannot read, and restores onto a new device after a global-account sign-in. Supabase holds identity (accounts, memberships, sessions, invites, recovery codes), a transit inbox for provider webhooks, opaque backups — and nothing else.

## Scope

Included:

- Global identity restructure (accounts/stores/memberships/sessions/invites/recovery codes as rows, not a per-workspace JSON blob), with durable rate limits, request-shape validation, per-store quotas, and retention sweeps on the identity endpoints.
- Local-primary business data: the device is the only plaintext holder; auth failures lock the UI without touching data; offline unlock including an offline-capable app shell.
- Device storage hardening (IndexedDB, persistent-storage permission, guarded writes, quota surfacing).
- Encrypted backup/restore and plain local export/import via WebCrypto and file download (no new dependencies).
- Transit inbox for provider webhooks, single bound store.
- Endpoint, schema, scripts, and docs cleanup; a CI gate on push; the anon-grant hotfix.

Excluded:

- Multi-device sync, CRDTs, or any concurrent-editing story; the model is single-writer by design.
- Device-side provider polling; more than one bound store for webhook routing.
- Per-user encryption of local data; billing; UI redesign beyond what the flows above require.
- Alerting/paging. Deliberately deferred, not re-homed: it stays tracked as the ROADMAP "Later > Alerting" item, and the daily maintenance cron (which fails loudly when the database is unreachable) plus the CI gate are the interim signals.

Server database: **Neon Postgres**, changed from Supabase on 2026-10-02 after Supabase paused the project a second time. See CONTEXT, "Provider change". The steps below keep their numbering; where they name Supabase objects, the Neon equivalent is the schema in `db/migrations/0001_identity.sql`.

## Steps

0. **Ship the standing security hotfix, independent of everything else.** Apply `supabase/migrations/20260818090000_revoke_default_workspace_document_api_access.sql`, which drops the `20260611163000` policy and revokes anon/authenticated DML on `fashion_store_os_documents`. Service-role paths keep their explicit grant. This closes a live capability today and does not wait for the pivot.

1. **Restructure identity into global tables.** New migration: `accounts` (globally unique email, PBKDF2 hash fields), `stores`, `memberships` (role, allowed views, status), `sessions`, `invites`, `recovery_codes`, and `rate_limits` — RLS enabled, anon/authenticated revoked, service-role only. Rewrite `api/_auth.js` and its endpoints against rows: sign-in works from any device by email+password; sessions bind to accounts, not (cookie, workspace-header) pairs; the empty-document null-user accommodation in `requireSession`/`requireManager` dies with the document model — handlers receive a real user or an error, never null-means-bootstrap. Add durable table-backed rate limiting on signup, sign-in, recovery redemption, and invite acceptance (which today redeems codes with no limiter at all), request-shape validation on every identity endpoint, and modest per-store quotas (members, open invites, recovery codes, backup size). Retention: expired sessions, spent/expired invites and recovery codes, and stale rate-limit rows are swept by the daily keepalive cron handler and opportunistically on access.
   **Identity cutover decision, recorded:** existing accounts are *not* migrated — the per-workspace auth documents hold test accounts only (the production write path never had a real operator), so everyone re-signs up on Release A and every pre-existing session is invalidated. The old auth documents are left untouched until Release B drops them. If UAT item 11 finds a real account, this decision is revisited before Release B, not after.
   Mirror everything in `server.js`.

2. **Flip the data plane to local-primary.** Bootstrap becomes an identity/session check that never touches business data; `sendSessionPayload` stops reading state; the client stops PUTting state (remove `saveBackendData` calls and the `src/app.js:160-162` re-upload) in the same release the endpoints are gated. Failed or absent sessions show a lock screen and never wipe local data; "server unreachable" (offline) is distinguished from "server said no" (locked), and a previously signed-in device opens offline with its last-known identity until explicit sign-out — which requires an **offline-capable app shell**: a hand-written service worker with a versioned precache and update-on-reconnect (this supersedes the reliance on `Cache-Control: no-store` for freshness; the SW's version check becomes the staleness control). The local dataset is tagged with its store id: sign-in by a member of that store unlocks it; sign-in by anyone else gets an explicit choice (leave locked, or erase and start fresh) — never a silent wipe. Reset splits into two confirmations: erase local business data (clears all local keys including `WORKSPACE_KEY`) and delete server account/store. Invite acceptance warns about local data exactly as the join path does; the abandonment modal's text tells the truth under the new model. The plaintext local-password fallback, the `storageMode` local-vs-server chip and settings copy, and the `backendReady` dual-path branches through signup/team flows are all removed — server-for-identity, local-for-data is the only mode. Mirror in `server.js`.

3. **Harden device storage.** Move business state from a single localStorage string to IndexedDB with `navigator.storage.persist()` requested; wrap every write with error handling that surfaces quota failures in the UI instead of losing them; cap profile logo size at upload; keep a last-known-good copy so a corrupt write cannot destroy the dataset.

4. **Encrypted backup and restore, plus plain local export.** WebCrypto only: PBKDF2-derived key from an owner passphrase, AES-GCM over the serialized state, `backups` table storing `store_id`, ciphertext, salt, IV, and timestamp. The derived key (never the passphrase) is cached locally so automatic backup can run without interaction — an accepted shared-device trade-off recorded in CONTEXT, consistent with the existing devtools trade-off. "Back up now" plus an automatic backup debounced a few minutes after the last state write when online. A client-side size check refuses uploads near the ~4.5MB serverless body ceiling with a visible error naming the cause (the ceiling is documented, not discovered). Restore on a fresh device: sign in, fetch blob, enter passphrase, decrypt, hydrate local store — with an explicit warning that restoring forks the data if another device is still active. A wrong passphrase fails cleanly without touching local data. Alongside it, a plain local export/import (file download and restore from file, no server involved) replaces the retired `GET /api/data` export — the frontend has never had one.

5. **Transit inbox.** New `inbox_messages` table bound to a store id; `channel-webhook` keeps its `hub.challenge` handshake and HMAC verification but writes rows to the inbox instead of a state document, deduping at insert by the fingerprint logic ported from `api/_channel_intake.js` (whose state-document remainder is deleted); an authenticated device pulls messages into local state and deletes them server-side, idempotent by message id on the client side. The frontend's duplicate copy of the channel-message normalizer becomes the single client-side implementation once `api/inbound.js` and `api/_inbound.js` are deleted (the endpoint has zero frontend callers today). Undelivered rows expire via the same keepalive-cron sweep as step 1. Mirror in `server.js`.

6. **Cleanup and re-homed hardening.** Remove `GET/PUT /api/state`; shrink `/api/data` to account/store deletion (no business export — that is now the local file download built in step 4); retire `/api/workspace-code` and `api/_workspace_codes.js`; rewrite health and keepalive to probe the identity tables (both currently probe the documents table via `probeStorage`); give readiness the real connectivity probe it lacks today (it is configuration-only); add CSP and standard security headers; add a CI workflow that runs `npm run check` and `npm run launch:check` on every push (the push-is-release lane finally gets a post-push gate); update `scripts/security-audit.js` assertions and `scripts/launch-readiness.js` messaging in the same commits as the code they assert on. The legacy schema (`fashion_store_os_documents` with every legacy password hash, `fashion_store_os_workspaces`, `fashion_store_os_workspace_codes`, and the dead audit and channel-delivery tables) lives only in the old Supabase project; none of it was ever created on Neon. Release B therefore decommissions that project, after UAT item 11 confirms it holds nothing real, instead of dropping tables. Mirror every route change in `server.js`.

   **Built 2026-10-19, with one deviation.** Store deletion is a `delete-store` action on `/api/session` rather than `DELETE /api/data`: every identity action already dispatches there, so it inherits the same gates, throttles, and test harness, and `/api/data` stays 410 until Release B deletes it. The action is manager-only, asks for the password again, and runs as one transaction (store, accounts that belong only to it, sessions, invites, backup, inbox, audit). Security headers live in `api/_security_headers.js`; `vercel.json` carries a copy that a test checks value for value. CI runs `npm run launch:check` on every push via `.github/workflows/ci.yml`; it does not block Vercel's deploy. Route parity between `api/` and `server.js` is checked by the guard suite.

7. **Rewrite the model docs and the smoke.** `docs/production-persistence.md` (retire or rewrite), `docs/production-smoke.md` (new smoke: local persistence, offline unlock, backup/restore round trip, recovery round trip, inbox pull), `docs/cutover.md`, `docs/operations-runbook.md` (keepalive rationale rewritten: the cron resets the idle-pause timer regardless of user traffic — the pivot's risk is someone deleting it as "obsolete", because a paused project now blocks the entire identity plane), `docs/release-lane.md`, `docs/channel-integrations.md`, `docs/pilot-uat.md` and `docs/owner-activation-runbook.md` (rewrite or retire with a superseded note — both exercise server-persistence flows), `handover.md`, plus ROADMAP/STATE. UAT per `UAT.md`.

## Release Sequencing

Additive first, destructive last. Per-endpoint disposition in Release A:

| Endpoint | Release A | Release B |
|---|---|---|
| `/api/bootstrap` | Rewritten: identity/session only | — |
| `/api/session` | Rewritten: row-based identity, no state bundling | — |
| `/api/auth` | Rewritten against rows | — |
| `GET/PUT /api/state` | `410 Gone` | Deleted |
| `GET/POST /api/inbound` | `410 Gone` | Deleted |
| `GET /api/data` | `410 Gone` (export is local now) | Deleted |
| `DELETE /api/data` | `410 Gone`; store deletion moved to the `delete-store` action on `/api/session` (see step 6) | Deleted |
| `/api/workspace-code` | `410 Gone` (global sign-in replaces it) | Deleted; table dropped |
| `/api/channel-webhook` | Rewritten: writes to inbox | — |
| `/api/health` | Rewritten: real database round trip | Unchanged |
| `/api/maintenance` (was `/api/keepalive`) | Daily cron: retention sweep only, since Neon needs nothing kept alive | Unchanged |
| `/api/readiness` | Rewritten: identity checks plus a real connectivity probe | — |

Identity cutover at Release A: all existing sessions invalidate and accounts are recreated, per step 1's recorded decision. Old deployed clients get `authenticated: false` from the new bootstrap; their old code path clears the local cache — acceptable only because no real operator data exists locally either, which UAT item 11 confirms *before* Release A goes out, not after.

Existing production business data: none expected (the write path never had a real operator). The owner confirms via a service-role query in the Supabase dashboard listing all `fashion_store_os_documents` rows and inspecting for non-seed content — not via the app (`GET /api/data` 500s on zero-user workspaces, and Release A's bootstrap no longer serves state). Default-workspace webhook rows are discarded: no real provider credentials were ever configured. If anything real turns up, it is exported via the same service-role query before Release B.

**Release B** ships only after every UAT scenario passes: deletes the 410'd endpoints and decommissions the legacy Supabase project (step 6). Nothing destructive touches Neon.

## Verification

- Check: A fresh device signs up a manager, works, refreshes — data persists locally and no request writes business data to the server (network log clean of state writes).
- Check: Session expiry or explicit sign-out locks the UI and does not modify local business data; sign-in unlocks the same data.
- Check: With the server unreachable, a previously signed-in device opens (service worker shell), edits, and persists; a never-signed-in device cannot unlock.
- Check: Staff sign-in on the shop device sees only allowed views; a non-member account signing in over existing local data gets the locked/erase choice, never a silent wipe.
- Check: Backup blob at rest contains no plaintext business fields; restore on a fresh profile round-trips the full dataset; wrong passphrase fails without side effects; an oversized dataset is refused client-side with a visible error.
- Check: Recovery round trip against the row-based identity plane: code issued at signup, redeemed without a session, grants only a password reset, single-use.
- Check: A signed webhook message lands in the inbox, a device pull imports and deletes it, a second pull returns empty, and a duplicate provider delivery is deduped at insert.
- Check: Repeated failed sign-ins throttle durably (across serverless instances, not per-instance memory); the retention sweep clears expired sessions/invites/codes/rate-limit rows on the next cron run.
- Check: `requireManager`-class gates verified across all four cases (no session on empty store, no session on populated store, manager, staff) — the 2026-08-03 lesson, applied to every new identity endpoint.
- Check: Route parity between `api/` and `server.js` (every add/change/delete landed in both), asserted by an updated check script rather than by inspection.
- Check: `npm run check`, `npm run launch:check`, and the updated security audit pass at every step; the CI workflow goes red on a deliberately broken push (verified once); Supabase lint/advisors clean after each migration.

## Rollback

Application: Vercel deployment promotion, as today. Schema: forward migrations only; Release A is additive so the old model keeps working under it; nothing destructive ships until Release B, and Release B happens only after the UAT sign-off. Do not reset Git; revert with new commits.
