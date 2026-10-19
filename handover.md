# Fashion Store OS Handover

Last updated: 2026-10-19
Current repo: `F:\Fashion Store OS`

## Project Summary

Fashion Store OS is a brand-agnostic operations app for fashion studios: a control room for inquiries, clients, measurements, garment orders, style recipes, material reserve, production flow, reports, brand settings, onboarding, and staff access. No real store has used it yet.

Since Phase 021 (Release A, `v2.0.0`, live since 2026-10-19) it is **local-first**. Each store's business records live on its shop device. The server holds only identity, one encrypted backup per store that it cannot read, and a short-lived inbox for provider messages.

This repo is the active workspace. `C:\Users\PC\Documents\Nitech\Personal\Pastry County Kitchen OS` was used only as a reference and should not be edited for this project.

## Read First

| Question | Document |
| --- | --- |
| What lives where, endpoints, configuration | `docs/production-persistence.md` |
| Running it in production | `docs/operations-runbook.md` |
| How a change reaches production | `docs/release-lane.md` |
| Releasing Phase 021 (Release A, then B) | `docs/cutover.md` |
| Connecting the Neon database | `docs/owner-activation-runbook.md` |
| Testing a deployment | `docs/production-smoke.md` |
| Provider messages | `docs/channel-integrations.md` |
| A real-store pilot | `docs/pilot-uat.md` |
| Phase 021 plan, evidence, and UAT | `.planning/phases/021-local-first-pivot/` |
| Current status | `.planning/STATE.md`, `.planning/ROADMAP.md` |

## Stack

- Static HTML, CSS, and JavaScript, no framework and no bundler: `index.html`, `src/app.js` (the app), `src/storage.js` (IndexedDB device storage), `src/backup.js` (WebCrypto backup), `src/sw.js` (offline app shell), `src/styles.css`.
- Serverless API on Vercel under `api/`: identity (`_identity.js` core, `_identity_pg.js` SQL adapter, `_identity_http.js` action dispatch), encrypted backups (`_backup.js`), the transit inbox (`_inbox.js`, `_channel_webhook.js`), health, readiness, and the daily maintenance cron.
- Database: Neon Postgres over its HTTP driver, `@neondatabase/serverless`, the only runtime dependency. The schema is `db/migrations/`, applied by `scripts/db-migrate.js` during production builds.
- Local development: `server.js` mirrors every API route and runs the same SQL adapter on PGlite, an embedded Postgres stored under `data/pglite/` (git-ignored). The test suites run on PGlite too.
- Security: PBKDF2 password hashes, hashed session tokens in HttpOnly cookies, one-time recovery codes, durable rate limits, manager gates on team, backup, and store-deletion actions, and a strict Content Security Policy (`api/_security_headers.js`).
- Not built: email verification, MFA, sync between devices, alerting.

## How To Run

```powershell
npm.cmd run dev
```

Then open `http://localhost:4179`. The first start creates the embedded database and applies the schema; no account and no `DATABASE_URL` are needed. Opening `index.html` directly no longer works, because signing in needs the API.

Before committing:

```powershell
npm.cmd run launch:check
```

It runs the syntax check, every test suite, the UX and security audits, and the build. For anything a browser can show, also check it in a browser against the dev server: the first browser session found ten defects the suites had passed.

## Development Rules

- Every API route change lands in both `api/` and `server.js`. A guard checks the two match.
- `api/` holds at most 12 functions (files not starting with `_`): the Vercel Hobby plan refuses a deployment with more. A guard enforces it. Release A has 10; the four retired endpoints share `api/retired.js` through `vercel.json` rewrites.
- A schema change is a new file in `db/migrations/`. Never edit an applied one.
- Bump `SHELL_VERSION` in `src/sw.js` in the same commit as any change to a file it precaches.
- Security-audit assertions change in the same commit as the code they assert on.
- Working-tree files use CRLF line endings (Git normalizes them on commit). Any script that edits files must handle CRLF and report each replacement it makes: a CRLF-blind script once reported success while silently skipping its multi-line edits.
- The owner's writing rule: no em-dashes anywhere, including UI copy, code comments, docs, and commit messages. Write ranges with "to". A guard enforces it for `src/app.js`.

## Live Deployment

| Thing | Value |
| --- | --- |
| Public URL | `https://fashion-store-os.vercel.app` |
| Vercel project | `sanuske2-2147s-projects/fashion-store-os` |
| Project ID | `prj_3oNJjdlNXi5yTKkqenDEzY2jVELi` |
| Team ID | `team_SumcS7BfGXgJWdQc7y2iAxSk` |
| Production branch | `main`; every push deploys |
| Release owner | `ADxZimmy`. On the Hobby plan, deploys of collaborator-authored commits (`NnazimuzoO`) fail with `TEAM_ACCESS_REQUIRED`. |

**Status on 2026-10-19: Release A is live.** Production runs the local-first build, `v2.0.0` (commit `584277b`), on Neon: `/api/health` reports `storage: "postgres"`, and the retired endpoints answer 410. Smoke Steps 1 and 2 passed; Steps 3 to 10 (operator mode) are pending. The 14-day watch window runs from 2026-10-19. Record: `docs/cutover.md`, Release A Record.

The legacy Supabase project `fashion-store` (`elkpberfbhwbrkawklnk`) is no longer read by production. It was restored for UAT item 11 (first confirmation passed: no business data, no accounts) and will pause again after about a week idle; Release B decommissions it after the second confirmation.

Database: Neon project `steep-smoke-31370127` (Vercel resource `neon-champagne-river`), Frankfurt, PostgreSQL 18.6, connected 2026-10-19 and still empty. `DATABASE_URL` is set for Production only, as a write-only secret. Functions are pinned to Frankfurt (`fra1`) in `vercel.json` to sit next to it. The Neon organization is managed by Vercel: open it from Vercel's Storage tab.

## Release Status

| Release | State |
| --- | --- |
| v1.0.0, 2026-08-03 | Released on the Vercel alias. Down from the 2026-10-02 Supabase pause until the owner restored the project (by 2026-10-19). Record: `docs/cutover.md`, History. |
| Release A (Phase 021), `v2.0.0` | Released 2026-10-19 from `584277b`. Smoke Steps 3 to 10 pending (operator). Record: `docs/cutover.md`. |
| Release B | After the Phase 021 UAT: deletes the retired endpoints and decommissions the legacy Supabase project. |

## Current Git State

- `main` is production. Release A is `584277b`, tagged `v2.0.0` and pushed on 2026-10-19; later commits on `main` are documentation of the release.
- `phase-021-release-a` was fast-forwarded into `main` for Release A and is fully merged. It exists only locally and can be deleted.
- Local-only leftovers `master`, `codex/backend-foundation`, and `backup/main-before-backend-promotion` still exist in this checkout. GitHub has only `main`.
- Commits must be authored as `ADxZimmy`. This checkout's repo-local identity has been set to that since 2026-10-19; a fresh clone needs the command in `docs/release-lane.md`.

Phase 021 commits in Release A:

```text
584277b Serve the retired endpoints from one function
0177f90 Record UAT item 11's first confirmation
b1078ac Record the repo-local commit identity
6c3d87c Record the corrected Neon connection
4b22179 Pin functions to Frankfurt and record the Neon connection
a6685e3 Phase 021 step 7: rewrite the model docs and the smoke
2ebdb0c Phase 021 step 6: store deletion, security headers, CI, route parity
6be1a05 Record the first browser session
873c44d Fix the defects the first browser session found
cfa8a16 Record the second Supabase pause and the move to Neon
45ea77c Move the server database from Supabase to Neon
77e7f1d Phase 021 step 5: transit inbox for provider webhooks
d5782bc Phase 021 step 4: encrypted backup, restore, and local export
93013a9 Phase 021 step 3: harden device storage
356d40c Phase 021 step 2: flip the data plane to local-primary
9d7d91b Record step 1 evidence and the untested-adapter risk
bc72529 Fix the defects the step 1 review confirmed
128ae7d Phase 021 step 1: restructure identity into global rows
```

Before each work slice, run `git status --short`. Do not overwrite changes you did not make; inspect them and work with them.

## Readiness Assessment (2026-10-19)

Built, verified locally, and released (Release A, 2026-10-19):

- Global identity on rows, with durable rate limits, request validation, per-store quotas, and retention sweeps.
- Local-first records: sign-out and session expiry lock the screen without touching data; a signed-in device opens offline for up to 30 days; a device holding another store's records asks before doing anything with them.
- Encrypted backup and restore onto a new device, plus a plain file download and load.
- The transit inbox, including signed delivery, deduplication, and acknowledgement.
- Store deletion, security headers, a CI workflow, and a route parity guard.
- Browser checks on 2026-10-19 of the client flows above, after which eleven defects were fixed and pinned by guards.

Not yet verified:

- In production: a write (smoke Steps 3 to 10, operator mode), rate limits across serverless instances, and a scheduled maintenance run. Verified at release: the build-time migration, live database round trips from the functions, the retired endpoints, the security headers, and CI.
- CI going red on a deliberately broken push.
- In a browser: the oversized-backup refusal, logo downscaling, the file download, and persistent storage being granted.
- The Phase 021 UAT (owner-run, after Release A) and a real-store pilot.

Accepted trade-offs (Phase 021 CONTEXT):

- Staff section access is enforced by the app's screens only. Anyone with the shop device's browser can read its records.
- No sync: one shop device per store. Restoring onto a second device that keeps working forks the records.
- The derived backup key is cached on the device so automatic backups can run. The passphrase is never stored.
- A database outage blocks sign-in on new devices, invites, recovery, backups, and the inbox. Signed-in devices keep working offline.

## Device Storage

IndexedDB database `fashion-studio-os`, object store `records`:

- `state:current`: the store's records.
- `state:last-known-good`: the recovery snapshot, used if the current copy cannot be read.

localStorage:

| Key | Holds |
| --- | --- |
| `fashion-studio-os-store-v1` | Which store this device's records belong to |
| `fashion-studio-os-identity-v1` | Last known identity, for opening offline. No secrets: the session stays in the HttpOnly cookie. |
| `fashion-studio-os-auth-v1` | Team roster cache for rendering, stored without a session pointer |
| `fashion-studio-os-backupkey-v1` | The derived backup key, never the passphrase |
| `fashion-studio-os-backupmeta-v1` | Last backup details |
| `fashion-studio-os-backuppending-v1` | When the latest change not yet in a backup was made |
| `fashion-studio-os-signout-pending-v1` | A sign-out the server has not heard yet |
| `fashion-studio-os-view-v1` | The last open view |
| `fashion-studio-os-state-v1`, `fashion-studio-os-workspace-v1` | Pre-pivot keys. Old records are migrated into IndexedDB on first open and the old key removed once the copy verifies. |

Signing out never touches records. Settings, This device's records, **Erase this device's records** clears them, with confirmation. Server tables are listed in `docs/production-persistence.md`.

## Verification

Latest, 2026-10-19:

- `npm.cmd run launch:check` green: identity 136, local-first 90, storage 36, backup 45, inbox 35, and Neon 55 assertions, plus the UX and security audits and the build.
- The production Neon database answered a read-only check through the app's own database code (`docs/owner-activation-runbook.md`, Status).
- Browser sessions in the in-app browser against the dev server: the client flows of steps 2 to 6 and the staff-device fix.
- HTTP runs against the dev server: the channel inbox local smoke (10 of 10) and signed delivery (11 of 11).

Full record: `.planning/phases/021-local-first-pivot/VERIFICATION.md`. Earlier results: `.planning/STATE.md`, Verification Snapshot.

## Next Steps

1. Owner: the production smoke, `docs/production-smoke.md` Steps 3 to 10, in operator mode.
2. The 14-day watch window from 2026-10-19 (`docs/operations-runbook.md`, Post-Launch Support).
3. The Phase 021 UAT, then Release B.
4. A pilot with a real store (`docs/pilot-uat.md`).
5. Later: alerting, a custom domain if wanted, a Vercel plan decision for collaborator deploys, and connecting a real provider.

Done on 2026-10-19: Neon connected to the Vercel project (`docs/owner-activation-runbook.md`), this checkout's repo-local commit identity set to `ADxZimmy`, Phase 021 UAT item 11's first confirmation passed, and Release A shipped as `v2.0.0`.

## UI/UX Expectations

Use the local UI/UX Pro Max skill for UI passes:

```text
C:\Users\PC\.codex\skills\ui-ux-pro-max\SKILL.md
```

The preferred direction is polished, premium, restrained, and operational. Avoid patchwork changes. Sidebar and layout interactions should feel fluid and natural.

Key design constraints from the owner:

- Do not turn the app into a landing page.
- Keep the working interface as the first screen after sign-in.
- The sidebar should not cover active content.
- The page should adjust when the sidebar expands.
- Scrollbars should not be visually noisy.
- Keep the original logo direction and make the display shape configurable.
- Use app-native UI for popups, not browser-native dialogs.

## Handover Update Protocol

Every contributor should update this file after each meaningful slice, milestone, checkpoint, or handoff.

When updating, add or change these sections:

- `Last updated`
- `Current Git State`
- `Readiness Assessment`
- `Verification`
- `Next Steps`
- `Open Questions`
- `Known Risks`
- `History`

Use this checkpoint template:

```markdown
### YYYY-MM-DD: Short Milestone Name

Owner:
Files changed:
Summary:
Verification:
Known risks:
Next step:
Commit:
```

## Open Questions

- A store allows 25 members including open invites; confirm the commercial plan and whether limits should vary by subscription tier.
- Should Mo'ora Afrika branding assets be replaced with final production files later?
- Should a store ever work from more than one device at once? Today it cannot, by design: there is no sync.
- Collaborator-authored commits cannot deploy on the Vercel Hobby plan; upgrade, move the project, or keep owner-authored releases?
- If a custom domain is wanted, which one, and who owns the DNS zone?
- Which real provider should connect first: WhatsApp Business API, Instagram Graph API, or a simpler webhook bridge?

## Known Risks

- Losing or wiping the shop device loses every change since the last backup, and a lost backup passphrase makes the backup unopenable by anyone. Managers must set up the backup on day one; downloaded copies are a second line.
- Without persistent storage, the browser may evict records under storage pressure. The app warns when persistence was not granted.
- Staff section access is UI-only.
- Two devices working on one store diverge, with no merge.
- Release A's only rollback target is the pre-pivot build, which runs the old model and works only while the legacy Supabase project is active, so fix forward by preference.
- CI runs after a push but does not block the deploy; every push to `main` is a release.
- Nothing pages anyone during an outage. A failed maintenance cron shows only in the Vercel dashboard.
- Neon's Free plan suspends the database for the rest of the month if its compute allowance runs out.
- Channel intake serves one store per deployment (`FASHION_STORE_INBOX_STORE_ID`).
- Accepted from the legacy plane, and throttled: an unverified signup can claim a global email, and the "accept your invite first" sign-in hint reveals that an address has a pending invite.
- No email verification or MFA.
- The legacy Supabase project stays restorable for 90 days from its next pause; Release B's second UAT item 11 confirmation needs it before then.

## History

### 2026-10-19: Phase 021 Local-First Pivot, Steps 1 to 7

Owner: `ADxZimmy`, decision of 2026-08-18. Plan, evidence, and UAT: `.planning/phases/021-local-first-pivot/`.

- Step 0 (2026-08-18, in production): revoked the anon-key grant on the legacy documents table.
- Step 1: identity restructured into global rows (accounts, stores, memberships, sessions, invites, recovery codes), with durable rate limits, request validation, per-store quotas, and retention sweeps. Existing accounts are not migrated: everyone signs up again at Release A.
- Step 2: records became local-primary. Failed sessions lock the screen without touching data; offline unlock from a cached identity; a service-worker app shell; each device tagged with its store, with an explicit choice on mismatch. Workspace codes, the plaintext local-password fallback, and the dual storage paths were removed.
- Step 3: records moved from localStorage to IndexedDB, with persistent storage requested, guarded writes that surface quota failures, logo downscaling, and a last-known-good snapshot.
- Step 4: encrypted backup (a PBKDF2-derived AES-GCM key, the store id bound into the ciphertext) that runs automatically a few minutes after changes, restore onto a new device, and a plain file download and load.
- Step 5: the transit inbox. Provider webhooks land in a server-side inbox for one bound store; devices pull, store, then acknowledge, which deletes the server copy.
- 2026-10-02: Supabase paused production a second time, and the server database moved to Neon. One SQL adapter runs on Neon in production and on PGlite locally and in tests.
- 2026-10-19, browser session: ten defects the suites had passed, among them a security hole where an offline sign-out left the session valid. All fixed and guarded.
- Step 6: store deletion (the `delete-store` action), security headers with a strict CSP, a CI workflow, and a route parity guard.
- Step 7: the model docs and smoke rewritten. Checking the docs against the code found staff on an empty device being offered business setup; fixed.

The pivot resolves the 2026-07-31 readiness assessment's blockers by design: tenancy (global accounts), data integrity (one writer per store), authorization (the server holds no business data), abuse controls (durable rate limits), and channel binding (one bound store).

### 2026-08-03: v1.0.0

Released on the existing `https://fashion-store-os.vercel.app` alias from `8b5943e`, tag `v1.0.0`. The write path was never verified by a real operator, and the real-store pilot was waived on 2026-07-31. The Supabase project behind it paused for inactivity on 2026-07-30 (restored 2026-07-31) and again on 2026-10-02. Full record: `docs/cutover.md`, History.

### Earlier Work, Pre-Pivot (2026-06 To 2026-08)

These sections describe the pre-pivot model, in which business data lived on the server. They are kept as the record; none of them describes how the app works now.

#### Pre-Pilot MVP Hardening (2026-06-29)

- Clean-slate signup: `createSeedState()` in `src/app.js` now returns empty collections, so new workspaces start with no clients/orders/inventory/styles. The demo studio content was preserved as dev-only `createDemoState()` / `loadStudioDemo()` (exposed on `window` only on localhost/file), never shown to testers.
- Removed backend/storage wording from the UI. The status indicator now shows neutral "All changes saved" / "Saved on this device" / "Getting your workspace ready"; the line naming `node server.js` and other "backend/browser storage" copy were replaced with owner-facing language.
- Made sign-in server-authoritative: the client reads the bootstrap `authenticated` flag, clears any stale local session pointer when not authenticated, and `persistLocalAuth()` no longer stores the session at rest in server mode. A device without a valid HttpOnly session cookie always lands on the sign-in screen.
- Verified with `node --check`, full `launch:check`, and a live server smoke (empty fresh bootstrap; signup→authed bootstrap with cookie vs `authenticated:false` without; reset cleanup). Not verified headlessly: the fresh-signup empty-dashboard browser render, left to pilot UAT Scenario 1.

#### Studio OS Foundation

- Created a Mo'ora Afrika Fashion House / Studio OS prototype.
- Added core sections:
  - Dashboard
  - CRM Inbox
  - Clients
  - Measurements
  - Garment Orders
  - Style Recipes
  - Material Reserve
  - Production Flow
  - Settings
- Seeded local demo data for clients, inquiries, styles, inventory, orders, and usage records.
- Added localStorage persistence for studio data.

#### Visual Direction

- Adapted the darker premium Mo'ora Afrika visual language from the provided reference images.
- Kept the actual app layout functional instead of copying the reference table structure directly.
- Sidebar behavior was refined to be fixed, collapsed by default, and expandable on hover while the main page adjusts instead of being covered.
- Removed the lower sidebar account mini-box that was not requested.
- Added appearance controls for the logo view:
  - Square / 1:1
  - Circle
- Restored the logo handling so the brand mark remains part of the appearance system.

#### Onboarding And Access Prototype

- Added onboarding flow for first-time use.
- Added sign-up and sign-in flows.
- Added local prototype manager account creation.
- Added sign-out flow.
- Added staff access management in Settings.
- Manager can create up to 2 staff accounts.
- Staff accounts can be assigned access to specific app sections.
- Staff navigation is filtered by assigned access.

Important limitation at the time: this was prototype auth only. Passwords and staff records were stored in localStorage and were not production secure. Phase 021 deleted this path.

#### Modal And Popup Cleanup

- Replaced native browser/Windows dialogs with in-app modals.
- Restock material now uses a styled app modal.
- Staff deletion now uses a styled app confirmation modal.
- Reset local data now uses a styled app confirmation modal.
- App modal includes dialog semantics, close action, Escape close handling, and focused input for restocking.
- Verified that no `window.prompt`, `window.confirm`, `alert`, `confirm`, or `prompt` calls remain in `index.html`, `src/app.js`, or `src/styles.css`.

#### Backend Persistence Foundation

- Added `server.js` as the first backend layer.
- Added `package.json` with `start`, `dev`, and `check` scripts.
- Added API endpoints:
  - `GET /api/health`
  - `GET /api/bootstrap`
  - `GET /api/state`
  - `PUT /api/state`
  - `GET /api/auth`
  - `PUT /api/auth`
  - `DELETE /api/data`
  - `GET /api/inbound`
  - `POST /api/inbound`
- Runtime state/auth JSON files are stored under `data/` and ignored by git.
- Frontend now checks backend storage on boot.
- Frontend saves state/auth to backend when available and to localStorage as fallback.
- Reset workspace data clears backend records when available and browser records locally.
- First launch is now truly brand-agnostic: if no profile exists, manager signup leads into business setup before the dashboard opens.
- Added loading and storage-status UI using the UI/UX Pro Max guidance.

#### Vercel Live Testing Deployment

- Added `scripts/build.js` to create a clean `dist/` deployment bundle.
- Added `vercel.json` with `node scripts/build.js` and `dist` as the output directory.
- Added `.vercelignore` so planning docs, handover docs, runtime data, and large source prompt/deck files are not published.
- Added `dist/` and `.vercel/` to `.gitignore`.
- Deployed the app to Vercel production.
- Verified the live HTML, JavaScript, and CSS assets return 200 responses.
- Verified Vercel reports the deployment as Ready.
- Earlier static-only deployment used browser storage fallback; the later production deployment included serverless API functions.

#### Production Persistence Layer

- Added Vercel serverless API routes under `api/`.
- Added Supabase-backed state/auth document persistence helper.
- Added `/api/health`, `/api/bootstrap`, `/api/state`, `/api/auth`, and `/api/data` production route equivalents.
- Created dedicated Supabase project `Fashion Store OS` (`duimatbeahwfeghcviju`) in `us-east-1`.
- Added Supabase migrations for `public.fashion_store_os_documents` and default-workspace API access.
- Added `.env.example` and `docs/production-persistence.md`.
- Updated `npm.cmd run check` to validate every JavaScript file, including API routes.
- Set Vercel production env vars: `SUPABASE_URL`, `SUPABASE_REST_API_KEY`, and `FASHION_STORE_WORKSPACE_ID`.
- Deployed production serverless functions from a clean non-Git staging copy made from the local Git commit to avoid Vercel's unverified Git-author block.
- Verified live Supabase health, bootstrap, write, read, reset, and clean table state.

#### Mobile Navigation Drawer

- Replaced the desktop-style mobile header/nav with a compact mobile appbar and off-canvas navigation drawer.
- Added hamburger open/close controls, backdrop close, Escape close, and drawer focus handling.
- Live-audited the production mobile viewport at `https://fashion-store-os-navy.vercel.app`; the mobile appbar/drawer assets were present and no horizontal overflow was detected.

#### Production Bootstrap Recovery

- Diagnosed live `/api/bootstrap` returning HTTP 500 while `/api/health` incorrectly reported healthy storage.
- Confirmed the documented Supabase ref `duimatbeahwfeghcviju` existed but had become `INACTIVE`, causing DNS/upstream fetch failures.
- Restored the Supabase project, reapplied the committed document-table/RLS migrations, and verified REST reads return 200 with the current publishable key.
- Updated Vercel production env vars for `SUPABASE_URL`, `SUPABASE_REST_API_KEY`, and `FASHION_STORE_WORKSPACE_ID`.
- Updated API health to perform a real Supabase read probe and report `supabase-unreachable` when the upstream storage layer is down.
- Updated API error handling so bootstrap/state/auth return safe storage errors instead of a generic 500 for Supabase failures.
- Deployed the recovered production build from commit `bbb4581`.
- Verified live `/api/health`, `/api/bootstrap`, API write/read/reset, empty post-test Supabase table, and clean Vercel runtime logs.

#### CRM Channel Intake

- Added `channelMessages` to the workspace state model.
- Added a CRM Inbox channel message intake form for WhatsApp, Instagram, Website, Referral, and Walk-in sources.
- Added a channel intake queue with source, sender/contact, message, desired garment, occasion, deadline, budget, routing status, and follow-up state.
- Added route-to-inquiry, archive, reopen, and follow-up update actions.
- Added `/api/inbound` for local and Vercel production so same-origin JSON posts can append inbound channel messages to persisted state.
- Updated the dashboard demand metric to count raw channel messages as new leads until they are routed.
- Deployed the CRM channel intake build from commit `80bb19a`.
- Verified local endpoint behavior, local mobile/desktop browser flow, live `/api/inbound`, live asset presence, Supabase cleanup, and Vercel runtime logs.

#### Owner Activation / Git-Connected Supabase Persistence

- Installed Supabase CLI `2.108.0` as a local dev dependency and verified `npm.cmd run check` plus `npm.cmd run launch:check`.
- Completed owner Vercel login and Supabase login on 2026-06-29.
- Confirmed the old runbook target `duimatbeahwfeghcviju` returned a Supabase 403 for this owner account, so it should be treated as historical context for the older deployment lane.
- Activated the accessible owner Supabase project `fashion-store` (`elkpberfbhwbrkawklnk`, `eu-west-3`) for the Git-connected Vercel production lane.
- Linked the local Supabase CLI to `elkpberfbhwbrkawklnk` and applied all pending migrations, including document storage and the workspace/audit/channel-delivery hardening migration.
- Set the Git-connected Vercel production env vars for Supabase persistence and webhook safety without storing secret values in the repo.
- Promoted `codex/backend-foundation` to `main` at commit `87b12d9`.
- Verified the Ready production deployment through the Git-connected Vercel project and stable aliases.
- Verified `/api/health` is green on the deployment URL, `https://fashion-store-os-sanuske2-2147s-projects.vercel.app`, and `https://fashion-store-os.vercel.app`.
- Ran a live activation smoke: temporary manager signup, state write/read, manager export, cleanup, and final empty bootstrap all passed.
- Updated `scripts/launch-readiness.js` so the launch gate now says Supabase activation is complete and the remaining gate is live health plus pilot UAT before public cutover.

## GSD Hybrid Skill Transfer

The GSD Hybrid skill is already installed on this machine at:

```text
C:\Users\PC\.codex\skills\gsd-hybrid
```

It is not only one `SKILL.md` file. The folder includes:

```text
SKILL.md
scripts\
references\
agents\
```

To give it to another person, copy the whole folder, not only `SKILL.md`.

### Install On Another Windows Workspace

On the other person's machine:

1. Close Codex.
2. Create the skills folder if it does not exist:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex\skills"
```

3. Copy the full `gsd-hybrid` folder into:

```text
C:\Users\<TheirUserName>\.codex\skills\gsd-hybrid
```

4. Confirm this file exists:

```text
C:\Users\<TheirUserName>\.codex\skills\gsd-hybrid\SKILL.md
```

5. Restart Codex so it can pick up the new skill.

### Zip Transfer Option

From this machine, create a zip of the skill folder:

```powershell
Compress-Archive -Path "C:\Users\PC\.codex\skills\gsd-hybrid" -DestinationPath "C:\Users\PC\Downloads\gsd-hybrid-skill.zip" -Force
```

A transferable zip has been created at:

```text
C:\Users\PC\Downloads\gsd-hybrid-skill.zip
```

Send `gsd-hybrid-skill.zip` to the other person. They should extract it so the final folder path is:

```text
C:\Users\<TheirUserName>\.codex\skills\gsd-hybrid\SKILL.md
```

Avoid extracting it as:

```text
C:\Users\<TheirUserName>\.codex\skills\gsd-hybrid\gsd-hybrid\SKILL.md
```

That nested path will not be picked up correctly.

### Optional GSD Setup For This Repo

If the next contributor wants to use the GSD Hybrid planning artifacts inside this project, run this from the project root after the skill is installed:

```powershell
python C:\Users\<TheirUserName>\.codex\skills\gsd-hybrid\scripts\init_gsd_hybrid.py --project-root .
```

That creates a `.planning/` folder for durable phase plans, requirements, roadmap, state, and verification notes.

Do not install shell hooks, global CLIs, or copied package scripts just to use this skill.
