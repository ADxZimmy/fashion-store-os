# Fashion Store OS Handover

Last updated: 2026-06-25
Current repo: `C:\Users\PC\Documents\Nitech\Personal\Fashion Store OS`

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
https://fashion-store-os-navy.vercel.app
```

Deployment target:

```text
nnazimuzoos-projects/fashion-store-os
```

Check the current Vercel deployment ID:

```powershell
vercel inspect https://fashion-store-os-navy.vercel.app
```

Supabase production project:

```text
Fashion Store OS
Project ref: duimatbeahwfeghcviju
URL: https://duimatbeahwfeghcviju.supabase.co
Region: us-east-1
```

Important: current production deploys are still triggered from the local repo with the Vercel CLI, while GitHub is kept updated from branch `codex/backend-foundation`. The earlier Vercel Git-author block was worked around by committing as a Vercel team member (`nnazimuzoo@nitechsoftware.com.ng`), but GitHub-triggered production deployments have not been re-verified as the primary deployment path.

The Vercel deployment publishes the static frontend from `dist/` and serverless API routes from `api/`. Live production persistence is backed by Supabase through Vercel env vars. See `docs/production-persistence.md`.

## Current Git State

Current branch: `codex/backend-foundation`

Recent commits:

```text
f7413d0 Add production persistence deployment
93e407d Add backend persistence foundation
f3e27d1 Add project handover
1ad4d92 Replace native dialogs with app modals
6c6a1aa Initial Fashion Store OS snapshot
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
npm.cmd run build
node scripts/check.js
vercel deploy --yes --logs
vercel deploy <temp-staging-path> --prod --yes --no-wait --project fashion-store-os --scope nnazimuzoos-projects
vercel inspect https://fashion-store-os-navy.vercel.app
rg -n "window\.prompt|window\.confirm|alert\(|confirm\(|prompt\(" src\app.js src\styles.css index.html
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
- Vercel production deployment confirmed:
  - URL: `https://fashion-store-os-navy.vercel.app`
  - Status: Ready
  - HTML `/`, JS `/src/app.js`, and CSS `/src/styles.css` return 200.
  - Serverless functions present: `api/auth`, `api/bootstrap`, `api/data`, `api/health`, and `api/state`.
- Production persistence code checks confirmed:
  - `npm.cmd run check` validates 11 JavaScript files.
  - `npm.cmd run build` generates the static deployment bundle.
  - Handler smoke test without Supabase env returns clear unconfigured storage responses.
- Supabase production persistence confirmed:
  - Dedicated project `duimatbeahwfeghcviju` created and healthy.
  - Migrations recorded: `create_fashion_store_os_documents`, `allow_default_workspace_document_api_access`.
  - RLS enabled and policy scoped to `workspace_id = 'default'` and `document_key in ('state', 'auth')`.
  - Local store smoke test passed against Supabase: empty, save, read, clear.
  - Live `/api/health` returns `{ ok: true, storage: "supabase", workspace: "default" }`.
  - Live API write/read/delete test passed through `https://fashion-store-os-navy.vercel.app`.
  - Runtime error scan found no production error/fatal logs in the last hour.
- Production bootstrap recovery checks confirmed:
  - `nslookup duimatbeahwfeghcviju.supabase.co 8.8.8.8` now resolves after restore.
  - REST read probe to `public.fashion_store_os_documents` returns 200 and an empty document list after cleanup.
  - Supabase security and performance advisors reported no lints.
  - Handler smoke tests confirmed unconfigured storage returns 503, unreachable Supabase returns 502, and `/api/health` returns HTTP 200 with `ok: false` diagnostics.
  - `npm.cmd run check` and `npm.cmd run build` passed after the recovery edits.

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

1. CRM channel intake
   - Add a backend endpoint for inbound WhatsApp/Instagram-style messages.
   - Map source, sender, handle/phone, message, desired garment, deadline, and follow-up status into CRM Inbox inquiries.
   - Add UI for reviewing and converting inbound channel messages.

2. GitHub-triggered Vercel deployments
   - GitHub is being kept updated from `codex/backend-foundation`.
   - Verify whether the Vercel Git integration should promote this branch or `main` to production.
   - Decide whether `main` should deploy to production and feature branches should create preview deployments.
   - Decide whether `main` should deploy to production and feature branches should create preview deployments.

3. Production auth decision
   - Choose the production backend/database stack.
   - Replace plaintext prototype passwords.
   - Define user/session model and staff permissions server-side.

4. Responsive QA pass
   - Check mobile, tablet, laptop, and desktop widths.
   - Verify sidebar hover/collapse behavior at each width.
   - Confirm no text overlap or broken cards.

5. Auth and role hardening
   - Decide whether this remains local-only or moves to a backend.
   - Replace plaintext localStorage passwords before any real use.
   - Add stronger role names and permissions if more staff levels are needed.

6. Data workflows
   - Add import/export for studio data.
   - Add backup/restore flow.
   - Add richer order history and activity timeline.

7. Form validation and empty states
   - Tighten validation for orders, measurements, inventory, and staff creation.
   - Add helpful empty states for a fresh workspace with no seed data.

8. Accessibility and keyboard pass
   - Verify keyboard navigation.
   - Verify modal focus flow.
   - Check labels, contrast, focus states, and Escape behavior.

9. Test strategy
   - Add lightweight automated checks if the project remains static.
   - At minimum, keep using `node --check src\app.js` and native-dialog scans after JS changes.

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

- Should the app eventually use a backend or remain local-first?
- Should staff access be limited to 2 permanently, or is that only for the current prototype?
- Should Mo'ora Afrika branding assets be replaced with final production files later?
- Should the onboarding flow include workspace setup before the dashboard opens?
- Should Vercel deployments be driven by GitHub integration rather than local CLI deploys?

## Known Risks

- Prototype authentication is not secure for production.
- JSON-file persistence is local-only; Vercel production uses Supabase document persistence.
- localStorage can be cleared by the browser or overwritten by reset.
- There is no migration system for future localStorage schema changes.
- No automated browser regression suite exists yet.
- Static HTML/CSS/JS is simple and fast, but larger features may need modularization.
- GitHub-triggered production deployments are not yet the verified deployment path; current production deploys are made from the local repo through Vercel CLI.
- Supabase projects can become inactive; `/api/health` now detects upstream storage failure, but live persistence still depends on the project staying active.
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
