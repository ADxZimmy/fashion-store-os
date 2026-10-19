# Production Persistence

Last updated: 2026-10-19

Where Fashion Store OS keeps what, after the Phase 021 local-first pivot. Business records live on each device. The server holds identity, an encrypted backup it cannot read, and a short-lived inbox for provider messages, all in one Postgres database.

## Status

- The design below is **in production** since Release A, 2026-10-19 (`v2.0.0`, commit `584277b`).
- The server database is **Neon Postgres**, chosen on 2026-10-02 after Supabase paused the project a second time. It was connected to the Vercel project on 2026-10-19: Vercel resource `neon-champagne-river`, Neon project `steep-smoke-31370127`, Frankfurt (`aws-eu-central-1`), PostgreSQL 18.6, database `neondb`. It is still empty; the first Release A build creates the tables. Its variables use the standard names (`DATABASE_URL` and so on), are set for Production only, and are write-only secrets: deployments read them, while `vercel env pull` and `vercel env run` receive them empty. See `docs/owner-activation-runbook.md`.

## What Lives Where

### On the device

Business records: profile, clients, inquiries, measurements, orders, styles, inventory, channel messages, settings.

| Store | Contents |
|---|---|
| IndexedDB database `fashion-studio-os`, object store `records` | `state:current` (the records) and `state:last-known-good` (a recovery snapshot). Written by `src/storage.js`. |
| Persistent-storage permission | Requested on every start, so the browser stops treating the records as evictable cache. Settings shows whether it was granted. |
| localStorage, small keys only | The offline identity cache (30 days), the store tag, the cached backup key and its salt (never the passphrase), the last-backup time, a pending-backup marker, a pending-sign-out marker, and the current view. |

The pre-pivot localStorage blob (`fashion-studio-os-state-v1`) is migrated into IndexedDB on first open and removed only after the new copy verifies.

Nothing the app saves while working is sent to the server. The only things that leave the device are sign-in traffic, the encrypted backup, and inbox acknowledgements (a list of ids).

### On the server (Neon Postgres)

Schema: `db/migrations/0001_identity.sql`. Every table is reached only by the app's server code; Neon has no public data endpoint, so there is no row-level security or role-grant layer to get wrong.

| Table | Holds |
|---|---|
| `fashion_store_os_accounts` | One row per person, email unique across the system, PBKDF2 password hash, recovery code hash. |
| `fashion_store_os_stores` | One row per business. |
| `fashion_store_os_memberships` | Who belongs to which store, as manager or staff, with their allowed views. |
| `fashion_store_os_sessions` | Hashed session tokens, 7-day expiry. |
| `fashion_store_os_invites` | Pending invites, hashed tokens, 3-day expiry. |
| `fashion_store_os_rate_limit_events` | One row per sign-in, signup, recovery, invite, or password attempt, for durable throttling. |
| `fashion_store_os_identity_audit` | Per-store identity events, kept 90 days. |
| `fashion_store_os_backups` | One encrypted backup per store: AES-GCM ciphertext, salt, IV. The key is derived on the device from a passphrase that never leaves it. |
| `fashion_store_os_inbox_messages` | Provider messages waiting for a device to collect them. Deleted on acknowledgement; anything uncollected expires after 14 days. |
| `fashion_store_os_schema_migrations` | Which migration files have been applied. |

The session cookie is `fso_session`: HttpOnly, SameSite=Lax, Secure in production.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Real database round trip. Always HTTP 200; `ok: false` with `storage: "unconfigured"` or `"database-unreachable"` when it fails. |
| `GET /api/readiness` | Configuration plus a round trip. Required checks decide `ok`; channel checks are reported but optional. |
| `GET /api/maintenance` | Daily cron at 06:00 UTC. Sweeps expired sessions, invites, rate-limit rows, audit rows over 90 days, and expired inbox messages. Guarded by `CRON_SECRET` when set. |
| `GET /api/bootstrap`, `GET /api/auth` | The signed-in viewer's identity: account, store, membership, and role-scoped roster. Never business data. |
| `POST /api/session` | Every identity action: `signup`, `signin`, `signout`, `accept-invite`, `redeem-recovery-code`, `create-staff`, `create-staff-invite`, `cancel-staff-invite`, `update-staff-access`, `create-recovery-code`, `reset-user-password`, `change-password`, `suspend-staff`, `reactivate-staff`, `delete-staff`, `delete-store`. |
| `GET` / `PUT` / `DELETE /api/backup` | The store's encrypted backup. Manager only. |
| `GET` / `POST /api/inbox` | A signed-in device pulls waiting messages, stores them, then acknowledges them. Any member of the store. |
| `GET` / `POST /api/channel-webhook` | Provider verification handshake and signed message intake into the inbox. |
| `/api/state`, `/api/data`, `/api/inbound`, `/api/workspace-code` | Retired. Answer `410 Gone` so a browser still running the old build stops trying. Deleted in Release B. |

The local dev server (`npm run dev`, `server.js`) mirrors every route; a guard test fails if the two ever differ.

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Neon connection string. Set by the Vercel Neon integration; `POSTGRES_URL` is accepted as a fallback. The names must be unprefixed: a prefixed name such as `NEON_FASHION_STORE_DATABASE_URL` is never read. A production build without it fails on purpose, so the previous deployment stays live. |
| `CRON_SECRET` | Recommended | Bearer token Vercel Cron sends to `/api/maintenance`. |
| `FASHION_STORE_INBOX_STORE_ID` | For channel intake | The one store that provider messages belong to. Until it is set, webhook deliveries are refused with 503 rather than guessed at. |
| `CHANNEL_WEBHOOK_VERIFY_TOKEN` | For channel intake | Provider handshake token. |
| `CHANNEL_WEBHOOK_SECRET` | For channel intake | HMAC SHA-256 secret for `x-hub-signature-256` or `x-fashion-signature`. |
| `CHANNEL_WEBHOOK_REQUIRE_SIGNATURE` | Production: `1` | Makes a missing secret fail closed. |
| `CHANNEL_WEBHOOK_MAX_MESSAGES` | No | Batch cap per delivery, default 25, maximum 100. |
| `DB_MIGRATE_ON_PREVIEW` | No | Set to `1` only once Neon gives each preview deployment its own database branch. |

No secret belongs in the repo. The security audit flags anything that looks like a Neon connection string or password, including in comments.

## Schema Changes

`scripts/db-migrate.js` runs as part of every production build (`vercel.json` `buildCommand`). It applies each pending file in `db/migrations/` in its own transaction and records it in the ledger, so a file lands completely or not at all. Preview builds skip it, because without per-preview branches they share the production database. Run it by hand with `npm run db:migrate` when `DATABASE_URL` is set.

## Local Development

`npm run dev` starts `server.js` on PGlite, a real Postgres embedded in the process, persisted under `data/pglite/` (git-ignored). It runs the same SQL adapter as production, so behaviour seen locally is the behaviour Neon will show. The test suites use an in-memory PGlite per suite.

## Legacy Supabase Project

The pre-pivot database is Supabase project `elkpberfbhwbrkawklnk` (`fashion-store`, `eu-west-3`). The owner restored it from its 2026-10-02 pause by 2026-10-19 for Phase 021 UAT item 11, whose first confirmation passed that day: its documents table is empty, so it holds no business data and no accounts. While it is active, the pre-pivot production build serves from it again, until Release A replaces that build. If it pauses again, it stays restorable for 90 days from that pause. Its five applied migrations stay in `supabase/migrations/` as the record of that project. Release B decommissions it after UAT item 11's second confirmation. Nothing in the new build reads it.

## Vercel Project

- Git-connected project: `sanuske2-2147s-projects/fashion-store-os` (project ID `prj_3oNJjdlNXi5yTKkqenDEzY2jVELi`).
- Functions run in Frankfurt (`fra1`), pinned by `regions` in `vercel.json` so they sit next to the database; every request makes several database round trips. Vercel's default would be Washington, D.C. A guard test keeps the pin in place.
- The Neon organization behind the database is managed by Vercel. Open it from Vercel (Storage, `neon-champagne-river`, Open in Neon), not from a separate Neon login, which cannot see it.
- The integration also enabled Neon Auth: a `neon_auth` schema and `NEON_AUTH` variables. The app does not use it.
- Public alias: `https://fashion-store-os.vercel.app`.
- `main` is the production branch; every push to it deploys. Commits must be authored as `ADxZimmy` or the Hobby-plan deploy is refused; see `docs/release-lane.md`.
