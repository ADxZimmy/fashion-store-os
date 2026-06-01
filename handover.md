# Fashion Store OS Handover

Last updated: 2026-06-01
Current repo: `F:\Fashion Store OS`

## Project Summary

Fashion Store OS is a static-first front-end prototype for fashion and tailoring studios. It is intended to be a studio control room for inquiries, clients, measurements, garment orders, style recipes, material reserve, production flow, brand settings, onboarding, and staff access.

This repo is the active workspace. `C:\Users\PC\Documents\Nitech\Personal\Pastry County Kitchen OS` was used only as a reference and should not be edited for this project.

## Stack

- Static HTML/CSS/JavaScript frontend.
- Dependency-free Node backend in `server.js`.
- Entry point: `index.html`.
- App logic: `src/app.js`.
- Styling: `src/styles.css`.
- Backend runtime data: ignored JSON files under `data/`.
- Reference assets and prompt files: `docs/`.
- Data persistence uses backend JSON files when served through `node server.js`; browser `localStorage` remains the fallback.
- Vercel deploy path uses `npm run build` to publish only public static assets from `dist/`.
- There is no production database or cloud auth yet.

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

## Vercel Deployment

Repo-side Vercel setup is complete:

```powershell
npm.cmd run build
vercel deploy --prod
```

Important current status:

- `vercel.json` builds the app into `dist/`.
- `dist/` contains only `index.html`, `src/`, and required JPG assets.
- Handover files, planning files, prompt/PPTX docs, backend source, and runtime data are not copied into `dist/`.
- The deployed app will use browser storage fallback until a durable cloud database/auth layer replaces JSON-file persistence.
- Live Vercel deployment is blocked on this machine because Vercel CLI is not authenticated and no `VERCEL_TOKEN` is present.

Recommended production branch for Vercel Git integration: `main`.

## Current Git State

Current branch: `main`

Recent commits:

```text
93e407d Add backend persistence foundation
f3e27d1 Add project handover
1ad4d92 Replace native dialogs with app modals
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

### Vercel Static Deployment Setup

- Confirmed collaborator's latest pushed work is on `origin/main` and `origin/codex/backend-foundation` at `93e407d`.
- Switched local work to `main`.
- Added `scripts/build-static.js`.
- Added `npm run build` to create a Vercel-safe `dist/` folder.
- Added `vercel.json` with `npm run build` and `dist` output.
- Added `dist/` and `.vercel/` to `.gitignore`.
- Added hash-based section links such as `/#orders`.
- Kept the app as a single-page operational workspace instead of splitting modules into separate HTML pages.
- Attempted production deploy through Vercel CLI and connector.
- Vercel deploy is currently blocked by missing local Vercel credentials.

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
rg -n "window\.prompt|window\.confirm|alert\(|confirm\(|prompt\(" src\app.js src\styles.css index.html
```

Results:

- JavaScript parse check passed.
- `server.js` parse check passed.
- Native dialog scan returned no matches.
- Static Vercel build passed and wrote `dist/`.
- Static dist privacy check passed:
  - `dist/handover.md` absent.
  - `dist/.planning` absent.
  - `dist/server.js` absent.
  - prompt/PPTX docs absent.
- Local static server check passed at `http://localhost:4181/#orders`; manager signup and business setup completed from `dist/`, then opened the Garment Orders view with the `#orders` URL and no browser console errors.
- `vercel deploy --yes --prod` was attempted but blocked because the CLI is not authenticated.
- Chrome manual check confirmed:
  - Clean first launch shows manager signup.
  - Manager signup leads to business setup.
  - Business setup opens the dashboard with Server Storage status.
  - Backend `/api/bootstrap` receives state/auth records.
  - Reset workspace data clears backend and browser records back to first launch.

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

1. Complete Vercel production deployment
   - Authenticate the desired Vercel account/team with `vercel login`, or provide a Vercel token.
   - Run `vercel deploy --prod` from `F:\Fashion Store OS`.
   - Inspect the live URL and record it in this handover.
   - If using Vercel Git integration, set the production branch to `main`.

2. Production database and auth decision
   - Choose the production backend/database stack before treating cloud storage as shared/durable.
   - Replace JSON-file persistence and plaintext prototype passwords.
   - Define user/session model and staff permissions server-side.

3. CRM channel intake
   - Add a backend endpoint for inbound WhatsApp/Instagram-style messages.
   - Map source, sender, handle/phone, message, desired garment, deadline, and follow-up status into CRM Inbox inquiries.
   - Add UI for reviewing and converting inbound channel messages.

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
- Which Vercel account/team should own the production deployment?
- Should the hosted prototype remain browser-storage-only until a durable database is added, or should the next slice prioritize cloud persistence immediately?

## Known Risks

- Prototype authentication is not secure for production.
- JSON-file persistence is a backend foundation only, not the final multi-user production database.
- Vercel static deployment uses browser storage fallback, not shared server storage.
- Live Vercel deployment cannot be completed from this machine until Vercel credentials are available.
- localStorage can be cleared by the browser or overwritten by reset.
- There is no migration system for future localStorage schema changes.
- No automated browser regression suite exists yet.
- Static HTML/CSS/JS is simple and fast, but larger features may need modularization.

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
