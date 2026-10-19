# Fashion Store OS Operations Runbook

Last updated: 2026-10-19

How to run Fashion Store OS in production after the Phase 021 local-first pivot. Background on what lives where: `docs/production-persistence.md`.

## The One Thing To Understand

Business records live **on each device**, not on the server. The server (Neon Postgres) holds accounts, sessions, invites, an encrypted backup per store, and a short-lived message inbox. Two consequences shape everything below:

- **A server outage does not stop a shop working.** A device that was signed in keeps opening, saving, and working offline for up to 30 days. What an outage blocks is signing in on a new device, invites, password recovery, backups, and collecting channel messages.
- **Losing a device is the real data-loss risk.** The encrypted backup is the protection, and only the store's passphrase opens it. Nobody, including the owner, can recover a backup whose passphrase is lost.

## Release Lane

`main` is the production branch; every push deploys. Commits must be authored as `ADxZimmy`. Before pushing: `npm.cmd run launch:check` and `npm.cmd run release:preflight`. CI runs the same gates after the push but does not block the deploy. Full detail: `docs/release-lane.md`.

## Health And Readiness

| Route | What it tells you |
|---|---|
| `/api/health` | A real database round trip. Always HTTP 200; read the body. `storage: "postgres"` is healthy, `"database-unreachable"` means Neon did not answer, `"unconfigured"` means `DATABASE_URL` is missing. |
| `/api/readiness` | Configuration plus a round trip. `ok` reflects the required checks only (database configured, database reachable, owner lane); the channel checks are optional until a provider is connected. |
| `/api/maintenance` | The daily cron target. Returns 401 to anyone without the `CRON_SECRET` bearer token, so a manual request tells you nothing. Read its result in Vercel, Settings, Cron Jobs. |

Unlike the pre-pivot build, readiness no longer stays green through a database outage: it asks the database.

## Vercel Observability

After each release:

- Deployment status is **Ready**, and the build log shows a `db-migrate:` line (applied, or schema up to date).
- Runtime Logs show no 5xx after the smoke test.
- Function activity for `/api/bootstrap`, `/api/session`, `/api/auth`, `/api/backup`, `/api/inbox`, `/api/channel-webhook`, `/api/health`, `/api/readiness`, `/api/maintenance`. Calls to `/api/state`, `/api/data`, `/api/inbound`, or `/api/workspace-code` come from a browser still on the old build; they get 410 and should fade away.
- Cron Jobs: `/api/maintenance` succeeded.

## Neon Operations

The database is a Neon Postgres project connected through the Vercel integration, which supplies `DATABASE_URL` to every environment.

- **It does not pause the way Supabase did.** Neon scales idle compute to zero after 5 minutes and wakes it on the next query; the first request after a quiet spell is a little slower. Idle branches are archived and unarchived automatically on access. Nothing needs keeping alive.
- **Free plan limits** (as of 2026-10): 1 GB storage, 100 compute-hours a month, 5 GB transfer a month. These are usage caps, not inactivity rules. If compute runs out, the database is suspended until the next month, which looks like `database-unreachable`. One shop is far below this, because compute only accrues while requests are being served. Check usage in the Neon console when traffic grows.
- **Schema changes** are files in `db/migrations/`, applied automatically by production builds, one transaction per file. Never edit an applied file; add a new one. Preview builds do not migrate.
- **Direct access** for diagnosis: the Neon console SQL editor, as the project owner. Never paste customer data or credentials out of it into issues or this repo.

## Daily Maintenance

Vercel Cron calls `/api/maintenance` at 06:00 UTC. It sweeps expired sessions and invites, rate-limit events older than a day, audit rows older than 90 days, and inbox messages left uncollected for 14 days.

A failed run means either the sweep failed or the database is unreachable. Treat it as an incident until `/api/health` says otherwise. The cron is the only check that goes red without someone looking, and only in the Vercel dashboard: nothing pages anyone yet (alerting is a tracked roadmap item).

## Backups And Recovery

### What protects a shop's records

| Layer | Protects against | Who controls it |
|---|---|---|
| IndexedDB with persistent storage | Ordinary reloads, restarts, the browser clearing cache under storage pressure (when persistence is granted) | The device |
| Recovery snapshot (`state:last-known-good`) | A corrupted save | Automatic |
| Encrypted backup | Losing or wiping the device | The manager's passphrase |
| Downloaded copy (Settings, Your own copy) | Anything, if the file is kept somewhere safe | The manager |

Encrypted backups run automatically a few minutes after changes while online, and catch up after time offline. Settings, Backup, shows the last backup time and whether changes are waiting.

### What the owner can and cannot restore

- **Identity, backups, and the inbox:** Neon can restore the database to an earlier point within its history window by branching from a timestamp. Use this only for server-side damage (for example a bad migration).
- **A store's records:** only from that store's encrypted backup, with its passphrase, from inside the app. The server cannot read the backup. A lost passphrase means the backup is unopenable by anyone; the manager should set a new one (Settings, Backup, Change passphrase) from a device that still has the records, which replaces the backup.
- **A device's records with no backup:** gone if the device is lost or its site data is cleared. Tell managers to set up the backup on day one.

### Restore rehearsal

Rehearse after any change to backup code: sign up a throwaway store, add records, back up, then sign in from a fresh browser profile and restore. `docs/production-smoke.md` Steps 6 and 7 are exactly this.

## Devices And Staff

Records live on the device they were made on. A store normally works from one shop device, and manager and staff all sign in there; staff see only the sections a manager assigned them.

- **Staff invites** can be accepted from any device, since accepting creates the account, but staff work on the shop device. A staff account signed in on a device with no records gets a "No records here" screen with sign-out, never business setup, which would start a separate copy of the store.
- **A new or replacement device** starts empty by design. A manager signs in and chooses **Restore from backup** on the business-setup screen. If the old device is still in use, the two now hold different records: there is no syncing between devices.
- **A device holds one store's records.** Signing in on it with an account from a different store shows a choice screen: sign out and keep the records, or erase them and continue. Nothing is erased without that choice.

## Account Recovery

1. **Recovery code.** Shown once at manager signup (on the setup screen) and re-issuable from Settings, Account security. Redeemed from the sign-in screen with **Forgot password**. Single use, no expiry, and redeeming grants no session.
2. **Manager-issued code.** Any manager can issue a recovery code for a colleague from Settings, Team access. The colleague chooses their own password.

### Owner last resort

Only when an account has no usable password, no valid recovery code, and no manager who can issue one. It issues a fresh recovery code by writing its hash directly, then the user goes through the normal **Forgot password** flow. Verified against the real code path on 2026-10-19.

1. Confirm the person's identity and email **out of band**.
2. On a trusted machine, generate a code and its hash:
   ```bash
   node -e "const c=require('crypto');const code=c.randomBytes(24).toString('base64url');console.log('code: '+code);console.log('hash: '+c.createHash('sha256').update(code).digest('hex'))"
   ```
3. In the Neon console SQL editor:
   ```sql
   update fashion_store_os_accounts
   set recovery_code_hash = '<hash>', recovery_issued_at = now(), recovery_redeemed_at = null
   where lower(email) = lower('<email>');
   ```
   Exactly one row must be updated.
4. Give the **code** (not the hash) to the person through a channel only they control. They redeem it with **Forgot password**.
5. Record the date, operator, and reason outside this repo.

Never put codes, hashes, connection strings, or customer data in this repo or `.planning/`.

## Deleting A Store

A manager can delete their store from Settings, Account security, **Delete this store**, with their password. It removes the store, every account that belongs only to it, sessions, invites, the encrypted backup, and inbox messages, in one transaction. It does not touch device records, and afterwards nobody can sign in to open them, so the panel offers a download first.

## Channel Intake

Provider messages go to a transit inbox, not straight to a device. `FASHION_STORE_INBOX_STORE_ID` names the one store they belong to; until it is set, the webhook refuses deliveries with 503 rather than guessing. Devices collect messages on start and with **Check for messages**, store them, then acknowledge, which deletes them server-side. Setup and testing: `docs/channel-integrations.md`.

## Secret Rotation

When a maintainer leaves, a secret may have leaked, or a provider credential changes:

1. **Database:** reset the database role's password in the Neon console, then make sure `DATABASE_URL` in Vercel carries the new connection string before redeploying. **Webhooks:** replace `CHANNEL_WEBHOOK_SECRET` and the verify token with the provider. **Cron:** replace `CRON_SECRET`.
2. Redeploy from the Vercel dashboard.
3. Check `/api/health`, `/api/readiness`, a sign-in, and (for webhook changes) a signed test delivery.
4. Revoke the old value only after the new deployment passes.

Rotating the database password does not sign anyone out; sessions live in the database, not in the connection.

## API Abuse Controls

- Request body limit (`api/_response.js`).
- Durable, database-backed rate limits on signup, sign-in, recovery redemption, invite acceptance, password changes, and store deletion. Sign-in throttles each email per client so an attacker cannot lock out the real owner.
- Manager gates on team management, backups, and store deletion. Each is tested against a missing session and the wrong role; the team-management and store-deletion gates are also tested on an empty system, where the 2026-08-03 bug lived.
- Webhook signature-required mode, batch cap, and deduplication at insert.
- Security headers on every response, including a Content Security Policy that only allows scripts from this site (`api/_security_headers.js`).

Before real provider traffic: set `CHANNEL_WEBHOOK_REQUIRE_SIGNATURE=1`, configure the provider secrets and `FASHION_STORE_INBOX_STORE_ID`, send a signed test event, and confirm an unsigned one is refused.

## Post-Launch Support

Release procedure: `docs/cutover.md`. This section covers the period after it.

### Watch window

Run for **14 days** after Release A.

| When | Check |
| --- | --- |
| Day 0, first 2 hours | `/api/health` and `/api/readiness` every 30 minutes; Runtime Logs for 5xx. |
| Days 0 to 2, daily | Cron Jobs: `/api/maintenance` succeeded. Runtime Logs for 5xx. Neon console: usage well under the limits. |
| Days 3 to 14, every other day | The same, plus `docs/production-smoke.md` Steps 2 to 5 from a fresh profile. |
| Exit | No unresolved sev-1 or sev-2 issues, and 7 consecutive successful maintenance runs. |

### Issue intake

Record: date, reporter, device and browser, whether the device was online, the screen, expected versus actual, and steps to reproduce. Do not paste customer records, passwords, codes, or connection strings. If a store must be identified, use its business name as the reporter gives it.

### Triage

| Severity | Meaning | Response |
| --- | --- | --- |
| Sev-1 | Business data leaving the device; records lost; a sign-out that does not stick; an auth bypass; the database unreachable (sign-in down everywhere) | Work the Incident Checklist now. |
| Sev-2 | A core workflow blocked with no workaround, including backup, restore, or recovery failing | Fix on `main` within the watch window. |
| Sev-3 | Degraded or confusing behaviour with a workaround | Next release. |
| Sev-4 | Cosmetic or enhancement | Backlog. |

## Incident Checklist

1. Capture the deployment URL, commit, time, and failing screen or route.
2. Check `/api/health` and `/api/readiness`.
3. Read Vercel Runtime Logs for 5xx, and the latest Cron Jobs result.
4. If the database is the problem: check the Neon console for the project's status and compute usage, and that `DATABASE_URL` is still set in Vercel.
5. Remember that signed-in devices keep working offline. Tell shops not to sign out or clear site data until sign-in works again.
6. If a release caused it, promote the previous known-good deployment in Vercel. For the first Release A deploy there is none; fix forward (see `docs/cutover.md`, Rollback).
7. Record the incident below.

## Incident Log

| Date found | What happened | Resolution |
| --- | --- | --- |
| 2026-07-30 | Supabase free project paused after about a month idle; `/api/health` reported `supabase-unreachable`; readiness stayed green. | Restored 2026-07-31. Daily keepalive cron added. |
| 2026-10-02 | Supabase paused again despite the keepalive cron; the project hostname stopped resolving. | Server database moved to Neon (Phase 021). The legacy project is decommissioned in Release B. |
