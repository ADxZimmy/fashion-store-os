# Verification

Status: Planned on 2026-08-18. Step 0 executed the same day. Steps 1 to 7 built by 2026-10-19 on `phase-021-release-a`, not pushed; nothing after step 0 has run in production. This file records evidence as steps land; the checks below mirror PLAN.md and must each carry a dated result before the phase closes.

## Checks To Run

- Step 0 hotfix applied: `supabase migration list --linked` shows `20260818090000` in both ledgers, and an anon-key request against `fashion_store_os_documents` is refused.
  Result: **Partially passed on 2026-08-18.** Migration applied via `npx supabase db push`; `supabase migration list --linked` shows all five versions matching in both ledgers. Production `/api/health` (200, `storage: "supabase"`) and `/api/readiness` (200) confirmed green after the revoke, so the service-role path is unaffected. The anon-key refusal probe is **outstanding** — it needs the anon key, which is owner-side (Supabase dashboard); the grant removal is in the applied migration, but per this project's rule the refusal is verified by probe, not inferred from the SQL.
- Identity restructure: sign-in from a second browser with no prior localStorage succeeds; all four manager-gate cases return 401/401/2xx/403 on every new identity endpoint; concurrent identity operations from two sessions do not lose writes.
  Result: **Passed locally on 2026-08-18, production verification outstanding.** Built on branch `phase-021-release-a` (`128ae7d`, remediated by `bc72529`). 115 assertions in `scripts/test-identity.js` run the real core against a file-backed adapter, including all four gate cases for every manager-gated action. An adversarial review confirmed 20 defects in the first cut; all material ones are fixed and regression-tested. Two are recorded as accepted: unverified signup can permanently squat a global email, and the "accept your invite first" sign-in hint reveals that an address has a pending invite — both inherited from the legacy plane, both throttled.
  Superseded on 2026-10-02 by the move to Neon (CONTEXT, "Provider change"). The untested Supabase adapter was deleted. Its replacement, `api/_identity_pg.js`, is the code the suites run: 116 identity, 45 backup, and 35 inbox assertions against PGlite (real Postgres), plus a 22-step HTTP round trip through the dev server (signup, cookie session, identity-only bootstrap, backup round trip, inbox drain, maintenance, readiness, the four 410s, sign-out). The schema is `db/migrations/0001_identity.sql`, applied automatically by production builds.
  Still not evidenced: Neon's HTTP driver against a live Neon database. Needs the owner to add Neon to the Vercel project; the first production build then migrates, and a live sign-up round trip closes it.
  Partly evidenced on 2026-10-19, after the owner connected Neon (project `steep-smoke-31370127`, Frankfurt, PostgreSQL 18.6). From a local machine, with the production variables injected in memory by `vercel env run`, the app's own `api/_db.js` ran `db.probe` (the `/api/health` query) and a `driver.transaction` (the mechanism migrations use) against the live database, read-only; the role may create tables in `public`, and the database held no app tables yet. Still outstanding: the same from Vercel's functions, the build-time migration, and a write.
- Local-primary flip: no code path PUTs business state to the server (grep plus network-log evidence); bootstrap response carries no state; session responses carry no state.
- Trust direction: expired session → lock screen, local dataset byte-identical before and after; a non-member sign-in over existing local data gets the locked/erase choice, never a silent wipe.
  Result: **Passed in a real browser on 2026-10-19** (dev server on embedded Postgres). Sign-out locked the UI, cleared the offline identity cache, and left the records in IndexedDB; signing back in showed the same records. Signing up a second account on the same device raised the mismatch screen with nothing changed; erasing from it cleared both IndexedDB records and re-tagged the device. Saving a profile and a client sent no request to the server: the only API calls were identity checks, the signup, and one inbox pull.
- Offline shell: with the server unreachable, a previously signed-in device opens via the service worker and works; a never-signed-in device cannot unlock.
  Result: **Passed in a real browser on 2026-10-19** after one fix. The worker had never registered locally: the build serves it at /sw.js but the dev server only at /src/sw.js, so it 404'd. With that fixed, the worker activated, precached all seven shell assets, and with the server stopped the app opened from cache, unlocked from the cached identity, showed the offline chip, and saved a new client to IndexedDB. A session that opened offline went back online by itself about a minute after the server returned, without a reload (reconnect check added in this session; before it, offline mode lasted until a reload).
- Storage hardening: quota exhaustion surfaces an error in the UI and the previous dataset survives; persistent storage requested.
- Backup/restore: round trip on a fresh profile; blob opacity; wrong-passphrase failure is side-effect free; an oversized dataset is refused client-side before upload with a visible error.
  Result: **Passed in a real browser on 2026-10-19** after fixes, except the oversized case (not exercised). Setting a passphrase backed up immediately; the server blob held no plaintext business field and the passphrase was stored nowhere, only the derived key. A wrong passphrase failed with the generic message and left the local dataset byte-identical. Restoring onto an emptied device brought the profile and clients back. Defects found and fixed: restore was unreachable on a new device (setup screen only, no restore option); offline edits never reached the backup; an erase within three minutes of an edit would have let the queued backup overwrite the store's good backup with an empty one. Each fix was re-run in the browser and is pinned by a static guard.
- Recovery: full round trip on the row-based plane — issue at signup, redeem without a session, single-use, grants only a password reset.
- Transit inbox: signed delivery → pull → server deletion → duplicate provider delivery deduped at insert; unsigned delivery refused when signature mode is on; retention sweep removes expired inbox rows and expired sessions/invites/codes/rate-limit rows on the next cron run.
  Result: **Passed locally over HTTP on 2026-10-19, production verification outstanding (UAT item 8).** Against the dev server: a signed delivery was accepted (201) with either signature header; unsigned, wrongly signed, and altered-after-signing deliveries were refused (401); required mode with no secret failed closed (503); with no bound store every delivery was refused (503); a repeat delivery came back 202 with one duplicate; the device pulled each message once, acknowledged it, and the next pull was empty. The retention sweep is covered by the suites and was not re-run here.
- Rate limits: durable across instances (verified against deployed serverless, not local memory).
- Route parity: every endpoint add/change/delete landed in both `api/` and `server.js`, asserted by an updated check script.
  Result: **Passed on 2026-10-19.** The guard suite derives the endpoint list from `api/` and checks it against the routes in `server.js` in both directions (13 endpoints). Mutation-tested: removing the `/api/backup` route from `server.js` fails it.
- Suites: `npm run check`, `npm run launch:check` green at every landed step; security-audit assertions updated in the same commits that change the asserted files; the CI workflow observed red on a deliberately broken push once.
  Result: **Partially passed.** `launch:check` green at steps 6 and 7 on 2026-10-19 (at step 7: identity 136, local-first 90, storage 36, backup 45, inbox 35, Neon 54, plus the UX and security audits and the build). The CI workflow has never run, because the branch has not been pushed; the deliberately broken push is outstanding.

## Notes

The 2026-08-03 lesson stands: a check that passes only against the case the bug does not touch is worse than no check. Every gate here must be exercised against the empty/bootstrap case explicitly, and production behaviour is verified by probe, not inferred from local tests.

## Browser session, 2026-10-19

First run of the client flows from steps 2 to 5 in a real browser (the dev server on embedded Postgres, driven through the in-app browser). Ten defects found, all fixed, each re-run in the browser and pinned by a guard in scripts/test-local-first.js:

1. A dead "Have a workspace code" button and its copy survived step 2: that step's first edit script did not handle CRLF line endings and silently missed its multi-line replacements while reporting success.
2. The service worker 404'd on the dev server (served at /src/sw.js, registered at /sw.js), so offline could only ever have been seen in production.
3. The signup recovery code rendered only in Settings, but signup lands on setup: a manager who reloaded first lost it (pre-existing since Phase 018, made worse by the pivot). Now shown on setup and on the mismatch screen.
4. The locked sign-in screen said "No account exists yet" on every device, false once accounts became global.
5. Restore onto a new device was unreachable: a device with no profile shows only setup, and restore lived in Settings.
6. The setup screen had no sign-out, so a wrong sign-in on a fresh device could only be escaped by inventing a business profile.
7. Offline edits were never backed up, because automatic backup only followed an online edit, and an offline session never noticed the server returning.
8. An erase within three minutes of an edit would have let the queued backup upload the emptied device over the store's good backup.
9. **Security:** sign-out while offline only locked the device. The HttpOnly session cookie stayed valid, so the next online start unlocked the device as whoever signed out; a dropped network during an online sign-out left the UI unlocked. A sign-out the server never heard about is now recorded and completed before any later "still signed in" answer is trusted.
10. Stale and non-compliant copy: the erase dialog still said there was no server copy to restore from, the storage panel promised backups "coming next", the mismatch screen named stores by internal id, and several strings used em-dashes.

Not exercised: the oversized-backup refusal, logo downscaling (needs a file upload), the plain file export (a download), persistent storage being granted (this browser declined, and the "Evictable" warning showed as designed), and the transit inbox beyond an empty pull.

## UAT item 11, first confirmation, 2026-10-19

**Passed.** The owner restored the legacy Supabase project `fashion-store` (`elkpberfbhwbrkawklnk`), which then reported `ACTIVE_HEALTHY`. It was queried read-only through `supabase db query --linked` (the Management API), as `postgres`: that role owns the tables and bypasses row-level security, and RLS is not forced on any of them, so the counts are complete.

- `fashion_store_os_documents`: **0 rows**, so no `state` documents (no business data) and no `auth` documents (no accounts).
- `fashion_store_os_workspaces`: 2 rows, both test registrations from 2026-06-29, neither with documents: `default` ("Default workspace") and `ws-test-1782732395-aaa`.
- Audit events, channel delivery events, workspace codes, Supabase Auth users, and storage objects: 0 each.
- Table statistics read zero everywhere, even for the 2 workspace rows, so the pause and restore reset them; they are not evidence either way.
- The orphaned test workspace recorded on 2026-08-03 (STATE, Verification Snapshot) is gone too. Nothing in this repo records what removed it; the outcome is the same.

Caveat: while the project is active, the pre-pivot production build serves from it again, so new rows could appear until Release A replaces that build. `docs/cutover.md` Step 0 re-runs the count just before the push. The second confirmation, before Release B, still applies.

## Step 6, 2026-10-19

Built and committed as `2ebdb0c`. Evidence:

- **Store deletion** (`delete-store` on `/api/session`; see the PLAN deviation note). 136 identity assertions, including all four gate cases (no session on an empty system, no session on a populated one, manager, staff), the cascade checked row by row in SQL, an account that also belongs to another store surviving, the other store untouched, and the email reusable afterwards. In the browser: a wrong password was refused; the right one signed the device out, ended the server session, kept the records on the device, and dropped the cached backup key; the deleted account's sign-in then returned 401.
- **Security headers.** `api/_security_headers.js` is the source; `server.js` sends it on every response and the guard suite checks `vercel.json`'s copy value for value. In the browser the headers were present and the policy raised no violation across sign-in, setup, dashboard, clients, CRM inbox, orders, production, reports, and settings; fonts loaded, inline style attributes applied, and backup, restore, WebCrypto, and IndexedDB all worked under it.
- **CI.** `.github/workflows/ci.yml` runs `npm ci` and `npm run launch:check` on every push and pull request. Not yet observed running (see Suites above).
- **Route parity.** See the check above.

## Step 7, 2026-10-19

The model docs were rewritten for local-first and Neon: `docs/production-persistence.md`, `docs/production-smoke.md`, `docs/cutover.md`, `docs/operations-runbook.md`, `docs/release-lane.md`, `docs/channel-integrations.md`, `docs/pilot-uat.md`, `docs/owner-activation-runbook.md` (now the Neon activation runbook), and `handover.md`, plus ROADMAP and STATE. UAT items 3, 4, 7, 9, and 10 were updated: item 4 inspects the backup in the Neon console, and item 10 states the real throttle.

Where a doc makes a checkable claim, it was checked against the running code rather than the source:

- `docs/channel-integrations.md`, Local Smoke, run as written over HTTP: 10 of 10. The signed-delivery claims: 11 of 11 (see Transit inbox above), and `/api/readiness` lists both channel checks as optional.
- The owner last-resort recovery in `docs/operations-runbook.md` (writing a code's hash directly in SQL) was run against the real identity core: the code redeemed once and was refused the second time.

One defect found by checking the docs against the code, fixed the same day:

11. A staff account signed in on a device with no records was shown the manager's business setup form. Filling it in would have started a second, separate copy of the store on that device, which no manager would ever see, and given staff a manager-only screen. Staff now get a "No records here" screen pointing them to the shop device, with sign-out. Pinned by a guard, which fails when the fix is reverted. In the browser, on fresh origins: staff accepting an invite on an empty device got the new screen; its sign-out ended the server session; a manager on an empty device still got setup with restore; and staff signed in on the set-up shop device saw only their two assigned views. Deleting the throwaway store afterwards removed both accounts (staff sign-in 401).

Also corrected: the operations runbook said staff accept invites "from their own device", which reads as staff working there; `SHELL_VERSION` was bumped to `fso-shell-v4`, since three earlier commits changed precached files without bumping it against the worker's own rule (no effect yet: no build with the worker has shipped); the two single-card screens (store mismatch, no records here) now center their card instead of leaving half the page empty; and `.gitignore` now refuses `.env` files except the example, because `vercel env pull` writes the Neon connection string to `.env.local` and the secret scan only reads source file extensions (pinned by a guard).
