# Fashion Store OS Handover

Last updated: 2026-06-29
Current repo: `F:\Fashion Store OS`

## Project Summary

Fashion Store OS is a static front-end prototype for Mo'ora Afrika, a contemporary African fashion and tailoring studio. It is intended to be a studio control room for inquiries, clients, measurements, garment orders, style recipes, material reserve, production flow, brand settings, onboarding, and staff access.

This repo is the active workspace. `C:\Users\PC\Documents\Nitech\Personal\Pastry County Kitchen OS` was used only as a reference and should not be edited for this project.

## Stack

- Static HTML/CSS/JavaScript frontend.
- Dependency-free Node backend in `server.js`.
- Entry point: `index.html`.
- App logic: `src/app.js`.
- Styling: `src/styles.css`.
- Backend runtime data: ignored JSON files under `data/`.
- Reference assets and prompt files: `docs/`.
- Data persistence uses backend JSON files when served through `node server.js`, Supabase document storage on Vercel, and browser `localStorage` as fallback when no backend API is available.
- There is no production-grade auth yet; the current access system remains a prototype.

## How To Run

Recommended productized local run:

```powershell
npm.cmd start
```

Or:

```powershell
node server.js
```

Then open:

```text
http://localhost:4179
```

Fallback static mode: open `index.html` directly in a browser, or serve the folder with:

```powershell
python -m http.server 4179
```

Static mode keeps using browser storage because the backend API is unavailable.

## Live Deployment

Current Vercel production URL:

```text
https://fashion-store-os.vercel.app
```

Deployment target:

```text
sanuske2-2147s-projects/fashion-store-os
```

Check the current Vercel deployment ID:

```powershell
vercel inspect https://fashion-store-os.vercel.app
```

Supabase production project:

```text
fashion-store
Project ref: elkpberfbhwbrkawklnk
URL: https://elkpberfbhwbrkawklnk.supabase.co
Region: eu-west-3
```

Important: GitHub is now the intended deployment source. Branch `main` has been promoted from `codex/backend-foundation`, and the Vercel Git integration for `sanuske2-2147s-projects/fashion-store-os` fires production deployments when `main` is pushed. A GitHub-authored owner commit from `ADxZimmy` deployed successfully to production with Supabase persistence active on 2026-06-29. Collaborator-authored commits by `NnazimuzoO` / Vercel user `nnazimuzoo` still block before build with Vercel `TEAM_ACCESS_REQUIRED` because that user is not a member of the Vercel team/project. The team is on the Hobby plan, and `vercel teams invite nnazimuzoo@nitechsoftware.com.ng --scope sanuske2-2147s-projects` failed because Hobby teams do not permit team members. Resolve collaborator deploys by upgrading/enabling collaboration, moving the project under an account that can include the commit authors, or ensuring production pushes are authored by a Vercel owner/member with contributing access.

The Vercel deployment publishes the static frontend from `dist/` and serverless API routes from `api/`. Live production persistence is backed by Supabase through Vercel env vars. See `docs/production-persistence.md`.

Current Git-connected Vercel project accessible from this workspace:

```text
Project: sanuske2-2147s-projects/fashion-store-os
Project ID: prj_3oNJjdlNXi5yTKkqenDEzY2jVELi
Team ID: team_SumcS7BfGXgJWdQc7y2iAxSk
Production branch: main
Production alias: https://fashion-store-os-sanuske2-2147s-projects.vercel.app
Public alias: https://fashion-store-os.vercel.app
Latest Git-triggered deployment: inspect with `vercel inspect https://fashion-store-os.vercel.app` or `vercel ls fashion-store-os --scope sanuske2-2147s-projects`
```

The Git-connected project now has the required Vercel production env vars for Supabase persistence. `/api/health` returns `ok: true`, `storage: "supabase"`, `supabaseHost: "elkpberfbhwbrkawklnk.supabase.co"`, and `workspace: "default"` on the deployment URL, the project alias, and `https://fashion-store-os.vercel.app`.

## Cutover Status

Procedure: `docs/cutover.md`. Post-launch support: the Post-Launch Support section of `docs/operations-runbook.md`.

v1.0.0 released 2026-08-03:

```text
Cutover date: 2026-08-03
Deployed commit: 8b5943e (confirmed Ready in Vercel before tagging)
Release tag: v1.0.0 (annotated 7420d1c -> 8b5943e)
Public target: https://fashion-store-os.vercel.app
  No custom domain; no DNS change. The alias was already serving, so
  cutover Steps 3 and 5 were skipped and there is no DNS rollback lever.
  Rollback = promote the previous known-good Vercel deployment.
/api/health on final target: PASS (ok:true, storage:"supabase")
/api/readiness: PASS (6/6)
Write path: NOT VERIFIED - cutover Step 6 browser smoke outstanding
Watch window: 2026-08-03 to 2026-08-17
```

Availability note: the Supabase project paused after ~31 days idle and production returned `storage: "supabase-unreachable"` from roughly 2026-06-29 until it was restored on 2026-07-31. A daily Vercel Cron on `/api/keepalive` now issues a real query to prevent a repeat idle pause. `CRON_SECRET` is not yet set, and cron registration is unconfirmed — both are owner-side.

## Current Git State

Current branch: `main` — the repo's only branch, and the production branch for the Git-connected Vercel project.

On 2026-07-30 the repo was consolidated to a single branch. `master` (32 commits behind, unreferenced by any deploy config) and `codex/backend-foundation` (identical to `main` at `a911466`) were both deleted locally and on GitHub. Neither held commits that were not already in `main`. Commit directly to `main` and push; see `docs/release-lane.md`.

Recent shipped code commits:

```text
87b12d9 Install Supabase CLI for owner activation
e12f23b Fix launch gate spawn and draft cutover handoff
0c96d30 Update phase handoff state after push
bcb5f64 Implement store workflow and launch readiness phases
40d8e0e Implement production readiness phases 009-012
```

Deployment and persistence setup files added in this slice:

```text
.gitignore
.vercelignore
.env.example
package-lock.json
package.json
api/
docs/production-persistence.md
scripts/build.js
scripts/check.js
supabase/migrations/20260611160501_create_fashion_store_os_documents.sql
supabase/migrations/20260611163000_allow_default_workspace_document_api_access.sql
vercel.json
```

Before each new work slice, run:

```powershell
git status --short
```

Do not overwrite user changes. If there are uncommitted changes you did not make, inspect them and work with them.

## Completed Work

### Pre-Pilot MVP Hardening (2026-06-29)

- Clean-slate signup: `createSeedState()` in `src/app.js` now returns empty collections, so new workspaces start with no clients/orders/inventory/styles. The demo studio content was preserved as dev-only `createDemoState()` / `loadStudioDemo()` (exposed on `window` only on localhost/file), never shown to testers.
- Removed backend/storage wording from the UI. The status indicator now shows neutral "All changes saved" / "Saved on this device" / "Getting your workspace ready"; the line naming `node server.js` and other "backend/browser storage" copy were replaced with owner-facing language.
- Made sign-in server-authoritative: the client reads the bootstrap `authenticated` flag, clears any stale local session pointer when not authenticated, and `persistLocalAuth()` no longer stores the session at rest in server mode. A device without a valid HttpOnly session cookie always lands on the sign-in screen.
- Verified with `node --check`, full `launch:check`, and a live server smoke (empty fresh bootstrap; signup→authed bootstrap with cookie vs `authenticated:false` without; reset cleanup). Not verified headlessly: the fresh-signup empty-dashboard browser render — confirm via pilot UAT Scenario 1.

### Studio OS Foundation

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

### Visual Direction

- Adapted the darker premium Mo'ora Afrika visual language from the provided reference images.
- Kept the actual app layout functional instead of copying the reference table structure directly.
- Sidebar behavior was refined to be fixed, collapsed by default, and expandable on hover while the main page adjusts instead of being covered.
- Removed the lower sidebar account mini-box that was not requested.
- Added appearance controls for the logo view:
  - Square / 1:1
  - Circle
- Restored the logo handling so the brand mark remains part of the appearance system.

### Onboarding And Access Prototype

- Added onboarding flow for first-time use.
- Added sign-up and sign-in flows.
- Added local prototype manager account creation.
- Added sign-out flow.
- Added staff access management in Settings.
- Manager can create up to 2 staff accounts.
- Staff accounts can be assigned access to specific app sections.
- Staff navigation is filtered by assigned access.

Important limitation: this is prototype auth only. Passwords and staff records are stored in localStorage and are not production secure.

### Modal And Popup Cleanup

- Replaced native browser/Windows dialogs with in-app modals.
- Restock material now uses a styled app modal.
- Staff deletion now uses a styled app confirmation modal.
- Reset local data now uses a styled app confirmation modal.
- App modal includes dialog semantics, close action, Escape close handling, and focused input for restocking.
- Verified that no `window.prompt`, `window.confirm`, `alert`, `confirm`, or `prompt` calls remain in `index.html`, `src/app.js`, or `src/styles.css`.

### Backend Persistence Foundation

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

### Vercel Live Testing Deployment

- Added `scripts/build.js` to create a clean `dist/` deployment bundle.
- Added `vercel.json` with `node scripts/build.js` and `dist` as the output directory.
- Added `.vercelignore` so planning docs, handover docs, runtime data, and large source prompt/deck files are not published.
- Added `dist/` and `.vercel/` to `.gitignore`.
- Deployed the app to Vercel production.
- Verified the live HTML, JavaScript, and CSS assets return 200 responses.
- Verified Vercel reports the deployment as Ready.
- Earlier static-only deployment used browser storage fallback; current production deployment now includes serverless API functions.

### Production Persistence Layer

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

### Mobile Navigation Drawer

- Replaced the desktop-style mobile header/nav with a compact mobile appbar and off-canvas navigation drawer.
- Added hamburger open/close controls, backdrop close, Escape close, and drawer focus handling.
- Live-audited the production mobile viewport at `https://fashion-store-os-navy.vercel.app`; the mobile appbar/drawer assets were present and no horizontal overflow was detected.

### Production Bootstrap Recovery

- Diagnosed live `/api/bootstrap` returning HTTP 500 while `/api/health` incorrectly reported healthy storage.
- Confirmed the documented Supabase ref `duimatbeahwfeghcviju` existed but had become `INACTIVE`, causing DNS/upstream fetch failures.
- Restored the Supabase project, reapplied the committed document-table/RLS migrations, and verified REST reads return 200 with the current publishable key.
- Updated Vercel production env vars for `SUPABASE_URL`, `SUPABASE_REST_API_KEY`, and `FASHION_STORE_WORKSPACE_ID`.
- Updated API health to perform a real Supabase read probe and report `supabase-unreachable` when the upstream storage layer is down.
- Updated API error handling so bootstrap/state/auth return safe storage errors instead of a generic 500 for Supabase failures.
- Deployed the recovered production build from commit `bbb4581`.
- Verified live `/api/health`, `/api/bootstrap`, API write/read/reset, empty post-test Supabase table, and clean Vercel runtime logs.

### CRM Channel Intake

- Added `channelMessages` to the workspace state model.
- Added a CRM Inbox channel message intake form for WhatsApp, Instagram, Website, Referral, and Walk-in sources.
- Added a channel intake queue with source, sender/contact, message, desired garment, occasion, deadline, budget, routing status, and follow-up state.
- Added route-to-inquiry, archive, reopen, and follow-up update actions.
- Added `/api/inbound` for local and Vercel production so same-origin JSON posts can append inbound channel messages to persisted state.
- Updated the dashboard demand metric to count raw channel messages as new leads until they are routed.
- Deployed the CRM channel intake build from commit `80bb19a`.
- Verified local endpoint behavior, local mobile/desktop browser flow, live `/api/inbound`, live asset presence, Supabase cleanup, and Vercel runtime logs.

### Owner Activation / Git-Connected Supabase Persistence

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

## Current LocalStorage Keys

The app currently uses these browser storage keys:

```text
fashion-studio-os-state-v1
fashion-studio-os-view-v1
fashion-studio-os-auth-v1
```

Resetting local data clears app state, selected view, auth records, and staff accounts in the current browser.

Backend mode stores equivalent runtime records in:

```text
data/state.json
data/auth.json
```

Those files are intentionally ignored by git.

## Verification Already Run

Latest checks:

```powershell
npm.cmd run check
npm.cmd run launch:check
npx supabase --version
npx supabase projects list --output json
npx supabase link --project-ref elkpberfbhwbrkawklnk --yes
npx supabase db push
vercel env ls
git push origin HEAD:main
Invoke-RestMethod https://fashion-store-os.vercel.app/api/health
Invoke-RestMethod https://fashion-store-os-sanuske2-2147s-projects.vercel.app/api/health
git diff --check
```

Results:

- JavaScript parse check passed.
- `server.js` parse check passed.
- Native dialog scan returned no matches.
- Chrome manual check confirmed:
  - Clean first launch shows manager signup.
  - Manager signup leads to business setup.
  - Business setup opens the dashboard with Server Storage status.
  - Backend `/api/bootstrap` receives state/auth records.
  - Reset workspace data clears backend and browser records back to first launch.
- Earlier Vercel production deployment confirmed:
  - URL: `https://fashion-store-os-navy.vercel.app`
  - Status: Ready
  - HTML `/`, JS `/src/app.js`, and CSS `/src/styles.css` return 200.
  - Serverless functions present: `api/auth`, `api/bootstrap`, `api/data`, `api/health`, `api/inbound`, and `api/state`.
- Production persistence code checks confirmed:
  - `npm.cmd run check` validates 11 JavaScript files.
  - `npm.cmd run build` generates the static deployment bundle.
  - Handler smoke test without Supabase env returns clear unconfigured storage responses.
- Earlier Supabase production persistence confirmed for the older deployment lane:
  - Dedicated project `duimatbeahwfeghcviju` created and healthy.
  - Migrations recorded: `create_fashion_store_os_documents`, `allow_default_workspace_document_api_access`.
  - RLS enabled and policy scoped to `workspace_id = 'default'` and `document_key in ('state', 'auth')`.
  - Local store smoke test passed against Supabase: empty, save, read, clear.
  - Live `/api/health` returns `{ ok: true, storage: "supabase", supabaseHost: "duimatbeahwfeghcviju.supabase.co", workspace: "default" }`.
  - Live API write/read/delete test passed through `https://fashion-store-os-navy.vercel.app`.
  - Runtime error scan found no production error/fatal logs in the last hour.
- Production bootstrap recovery checks confirmed:
  - `nslookup duimatbeahwfeghcviju.supabase.co 8.8.8.8` now resolves after restore.
  - REST read probe to `public.fashion_store_os_documents` returns 200 and an empty document list after cleanup.
  - Supabase security and performance advisors reported no lints.
  - Handler smoke tests confirmed unconfigured storage returns 503, unreachable Supabase returns 502, and `/api/health` returns HTTP 200 with `ok: false` diagnostics.
  - `npm.cmd run check` and `npm.cmd run build` passed after the recovery edits.
  - Vercel production deployment is Ready and aliased to the live URL.
  - Live smoke test wrote probe state/auth records, read them through bootstrap, reset them, and confirmed the Supabase table returned to 0 documents.
- CRM channel intake checks confirmed:
  - `npm.cmd run check` validates 13 JavaScript files after adding `api/_inbound.js` and `api/inbound.js`.
  - `npm.cmd run build` passes.
  - Local `/api/inbound` POST normalizes lowercase channel/follow-up values, persists to bootstrap state, and cleans up.
  - Local browser smoke passed at 390px and 1280px: save channel message, update follow-up, route to inquiry, and no horizontal overflow.
  - Live `/api/inbound` POST appeared in `/api/inbound` and `/api/bootstrap`, then cleanup returned state/auth to absent.
  - Live `src/app.js` contains the channel intake queue and route action code.
  - Vercel runtime error/fatal logs were clean after live smoke testing.
- Git-connected owner activation checks confirmed:
  - `npm.cmd run check` passed after the 2026-06-29 fast-forward and Supabase CLI install.
  - `npm.cmd run launch:check` passed after the 2026-06-29 Supabase CLI install.
  - Supabase CLI `2.108.0` is installed locally and available through `npx supabase`.
  - Owner Supabase login can list project `fashion-store` (`elkpberfbhwbrkawklnk`) in `eu-west-3`.
  - Old target `duimatbeahwfeghcviju` returned a Supabase 403 for API-key/link attempts from this owner workspace.
  - `npx supabase db push` applied the pending migrations to `elkpberfbhwbrkawklnk`.
  - Git-connected Vercel production env vars are present; secret values are not stored in repo docs.
  - `origin/main` was fast-forwarded to `87b12d9`.
  - Vercel production deployment from the Git-connected project is Ready.
  - `/api/health` on the deployment URL, project alias, and `https://fashion-store-os.vercel.app` returns Supabase storage on `elkpberfbhwbrkawklnk.supabase.co`.
  - Live activation round-trip passed: temporary manager signup, state write/read, manager export, cleanup, and final empty bootstrap.
  - `git diff --check` passed with only expected CRLF normalization warnings.
  - `npm.cmd run launch:check` passed after the readiness message update and now points to pilot UAT/cutover instead of pending Supabase activation.

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

## Next Steps

Suggested next work slices:

1. Phase 017 production cutover — owner-side steps
   - Repo-side work is done: `docs/cutover.md` holds the ordered checklist and `docs/operations-runbook.md` holds the post-launch watch window and issue intake.
   - Remaining steps are owner-only: confirm the Ready deployment, push the annotated `v1.0.0` tag, add the domain in Vercel, pass the `/api/health` gate, then point DNS.
   - Also owner-side: set `CRON_SECRET` in Vercel, and confirm the `/api/keepalive` cron is registered under Settings → Cron Jobs.

2. Real-store pilot UAT — waived, not done
   - The owner elected on 2026-07-31 to skip pilot UAT and proceed to cutover.
   - `docs/pilot-uat.md` is unexecuted. Its scenarios are reused as the post-cutover smoke set in `docs/cutover.md` Step 6.
   - Consequence to carry: the production **write** path has not been validated by a real operator since the Supabase restore. Reads were verified on 2026-07-31; writes were not.

3. Vercel ownership decision
   - Owner-authored GitHub commits from `ADxZimmy` deploy successfully to production.
   - Collaborator-authored deploys still fail on the Hobby plan with `TEAM_ACCESS_REQUIRED`.
   - Decide whether to upgrade/move the Vercel project so collaborator-authored commits can deploy without owner intervention.

4. Real channel integrations
   - Wire WhatsApp Business API or Instagram Graph API into `/api/inbound`.
   - Add provider verify tokens and HMAC secrets in Vercel, not in the repo.

5. Responsive QA pass
   - Check mobile, tablet, laptop, and desktop widths.
   - Verify sidebar hover/collapse behavior at each width.
   - Confirm no text overlap or broken cards.

6. Form validation and empty states
   - Tighten validation for orders, measurements, inventory, and staff creation.
   - Add helpful empty states for a fresh workspace with no seed data.

7. Accessibility and keyboard pass
   - Verify keyboard navigation.
   - Verify modal focus flow.
   - Check labels, contrast, focus states, and Escape behavior.

8. Test strategy
   - Add lightweight automated checks if the project remains static.
   - At minimum, keep using `npm.cmd run launch:check` and live `/api/health` checks before releases.

## Handover Update Protocol

Every contributor should update this file after each meaningful slice, milestone, checkpoint, or handoff.

When updating, add or change these sections:

- `Last updated`
- `Completed Work`
- `Current Git State`
- `Verification Already Run`
- `Next Steps`
- `Open Questions`
- `Known Risks`

Use this checkpoint template:

```markdown
### YYYY-MM-DD - Short Milestone Name

Owner:
Files changed:
Summary:
Verification:
Known risks:
Next step:
Commit:
```

## Open Questions

- Should staff access be limited to 2 permanently, or is that only for the current prototype?
- Should Mo'ora Afrika branding assets be replaced with final production files later?
- Vercel deployments should be driven by GitHub integration; owner-authored pushes now work, while collaborator-authored pushes need a Vercel access/plan decision.
- What custom domain should be used for Phase 017 cutover, and who owns the DNS zone?
- Which real provider app should connect first: WhatsApp Business API, Instagram Graph API, or a simpler inbound webhook bridge?

## Known Risks

- Prototype authentication is not secure for production.
- JSON-file persistence is local-only; Vercel production uses Supabase document persistence.
- localStorage can be cleared by the browser or overwritten by reset.
- There is no migration system for future localStorage schema changes.
- No automated browser regression suite exists yet.
- Static HTML/CSS/JS is simple and fast, but larger features may need modularization.
- GitHub-triggered production deployments are wired and fire on `main`, but the current Git-connected project blocks collaborator-authored deploys with `TEAM_ACCESS_REQUIRED` on the Hobby plan.
- Supabase projects can become inactive; `/api/health` now detects upstream storage failure, but live persistence still depends on `elkpberfbhwbrkawklnk` staying active.
- Prototype auth is still not production-secure even after durable persistence; a real auth/session model is a separate hardening phase.

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
