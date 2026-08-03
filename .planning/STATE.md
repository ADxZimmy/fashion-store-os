# State

Last updated: 2026-08-03

## Current Focus

Phase 017 cutover executed on 2026-08-03. `v1.0.0` is tagged (annotated `7420d1c` → commit `8b5943e`, the commit confirmed Ready in Vercel), the `/api/health` gate passed, and the public target is the existing `https://fashion-store-os.vercel.app` alias. No custom domain was registered and no DNS was changed, so Steps 3 and 5 of `docs/cutover.md` were not applicable — the alias was already serving, meaning there was no cutover moment and no DNS rollback lever. Rollback is Vercel deployment promotion only.

The 14-day watch window is open. The remaining unverified item is the production write path: reads and both health endpoints pass, but no manager signup has been completed against live Supabase since the restore. `docs/cutover.md` Step 6 browser smoke covers it and is owner-side.

Real-store pilot UAT was waived by owner decision on 2026-07-31 rather than executed. Its scenarios are reused as the post-cutover smoke set. The production write path is therefore unvalidated by a real operator.

The repo is single-branch: `main` is the working, default, and production branch. Every push to `main` is a production release.

## Completed

- Initialized planning artifacts.
- Read Prompt 1 and extracted the deck direction.
- Confirmed referenced docs/assets are in `docs/`.
- Added static app shell in `index.html`.
- Added responsive theme and UI styling in `src/styles.css`.
- Added persistent local app logic, data models, onboarding, settings, and workflows in `src/app.js`.
- Verified onboarding, dashboard, order cutting/completion, inventory deduction, reserve release, learning records, and mobile layout.
- Accepted the GitHub collaborator invitation and connected the repo to `ADxZimmy/fashion-store-os`.
- Added project handover documentation.
- Replaced native browser dialogs with app-native modals.
- Persisted UI/UX Pro Max design-system guidance under `design-system/fashion-store-os/`.
- Added dependency-free Node backend serving static files and JSON persistence APIs.
- Wired frontend bootstrap/save/reset flows to backend storage with localStorage fallback.
- Restored true brand-agnostic first launch by requiring business setup when no profile exists.
- Added visible loading and storage-status UI.
- Added a Vercel static deployment config with `vercel.json`, `.vercelignore`, and `scripts/build.js`.
- Created and linked the Vercel project `nnazimuzoos-projects/fashion-store-os`.
- Deployed the current local working tree to Vercel production at `https://fashion-store-os-navy.vercel.app`.
- Added Vercel serverless API routes for production persistence.
- Added a Supabase document-table migration for persisted `state` and `auth` records.
- Added production persistence setup docs and env example.
- Replaced the narrow JS check command with `scripts/check.js` to validate all JavaScript files.
- Created dedicated Supabase project `Fashion Store OS` (`duimatbeahwfeghcviju`) in `us-east-1`.
- Applied Supabase migrations for document persistence and default-workspace API access.
- Set Vercel production env vars for Supabase persistence.
- Deployed production build with serverless API functions from the local Git commit.
- Verified live Supabase-backed API persistence at `https://fashion-store-os-navy.vercel.app`.
- Shipped and live-audited the mobile navigation drawer at `https://fashion-store-os-navy.vercel.app`.
- Amended the deployment commit author to a Vercel team member and pushed `codex/backend-foundation` to GitHub.
- Restored Supabase project `duimatbeahwfeghcviju` from `INACTIVE`, reapplied migrations, updated Vercel env vars, and deployed production bootstrap diagnostics.
- Verified live production `/api/health`, `/api/bootstrap`, API write/read/reset, empty post-test Supabase table, and clean Vercel runtime logs after the recovery deployment.
- Added CRM channel intake with `channelMessages`, a CRM Inbox intake queue, route/archive/follow-up controls, and local/Vercel `/api/inbound` routes.
- Verified live `/api/inbound` post/read/bootstrap/cleanup, deployed CRM intake assets, empty post-test Supabase table, and clean Vercel runtime logs.
- Added production auth hardening with server-owned password hashes, HttpOnly session cookies, sanitized auth bootstrap, read-only `/api/auth`, and manager-gated staff session actions.
- Added Reports with conversion, revenue, production pressure, stock risk, reply drafts, quote drafts, stock alerts, production load, and usage-learning insights.
- Added `/api/channel-webhook` for direct and Meta-style webhook payloads with optional verify-token and HMAC signature checks.
- Verified the next three phases locally with API smoke tests, Playwright mobile/desktop checks, `npm.cmd run check`, and `npm.cmd run build`.
- Committed and pushed `e8cb943` to `origin/codex/backend-foundation`.
- Deployed a Ready production build, aliased to `https://fashion-store-os-navy.vercel.app`.
- Verified live `/api/health`, session signup/state lock/webhook/reset flow, clean post-test bootstrap, live Reports browser smoke, and clean Vercel error logs.
- Promoted `codex/backend-foundation` to `main` for GitHub-triggered Vercel production deployments.
- Confirmed owner-authored GitHub pushes from `ADxZimmy` create Ready production deployments on the Git-connected Vercel project `sanuske2-2147s-projects/fashion-store-os`.
- Confirmed collaborator-authored GitHub pushes from `NnazimuzoO` still block with `TEAM_ACCESS_REQUIRED` because Vercel Hobby does not allow adding that user as a team member.
- Confirmed the pre-activation Git-connected deployment served the frontend but reported `storage: "unconfigured"` until owner env vars were set.
- Checked GitHub before publishing the next planning update; `origin/codex/backend-foundation` was ahead of local by documentation/deployment commits, so local was fast-forwarded before editing.
- Added the full GSD production-readiness phase sequence through Phase 017 in `.planning/ROADMAP.md`.
- Implemented Phase 009 release lane with `docs/release-lane.md`, `scripts/release-preflight.js`, and `npm.cmd run release:preflight`.
- Implemented Phase 010 data hardening with workspace/audit/channel delivery Supabase migration, workspace id validation, service-role key preference, and manager-gated sanitized `GET /api/data` export.
- Implemented Phase 011 account lifecycle/RBAC hardening with staff invite acceptance, password change, staff suspend/reactivate, session cleanup, audit events, and Settings/onboarding controls.
- Implemented Phase 012 production channel rollout safeguards with signature-required mode, batch limits, webhook dedupe, delivery events, consent/provider metadata, and non-leaking webhook GET behavior.
- Updated production persistence, channel integration, env, roadmap, requirements, and phase artifacts for Phases 009-012.
- Implemented Phase 013 store workflow completion with payment records, balance tracking, fitting scheduling/completion, manager review, handoff, customer follow-up, order activity, and inventory adjustment history.
- Implemented Phase 014 mobile/accessibility UX acceptance with toast live-region hardening, touch target/reduced-motion/overscroll CSS fixes, and `npm.cmd run ux:audit`.
- Implemented Phase 015 observability/backup/security operations with `/api/readiness`, local readiness parity, `docs/operations-runbook.md`, and `npm.cmd run ops:security`.
- Implemented Phase 016 pilot UAT and launch readiness with `docs/pilot-uat.md` and `npm.cmd run launch:check`.
- Fixed `scripts/launch-readiness.js` to spawn `npm.cmd` with `shell: true` on Windows so `npm run launch:check` passes from any shell (was failing `spawnSync EINVAL` outside PowerShell).
- Drafted Phase 017 cutover artifacts (CONTEXT/PLAN/VERIFICATION/UAT) gating the DNS switch on a green `/api/health`.
- Authored `docs/owner-activation-runbook.md`, an exact owner runbook to activate Git-connected Supabase persistence (Phase 008).
- Fast-forwarded local `codex/backend-foundation` to `origin/codex/backend-foundation` at `e12f23b` after scanning GitHub on 2026-06-29.
- Installed Supabase CLI `2.108.0` as a local dev dependency so owner activation can use `npx supabase`.
- Verified `npm.cmd run check` and `npm.cmd run launch:check` still pass after the fast-forward and CLI install.
- Completed owner-side Supabase and Vercel CLI authentication on 2026-06-29.
- Confirmed the old Supabase target `duimatbeahwfeghcviju` is not accessible from the owner account in this workspace; Supabase returned a 403 privilege error for API keys/link attempts.
- Activated the owner-accessible Supabase project `fashion-store` (`elkpberfbhwbrkawklnk`, `eu-west-3`) for the Git-connected production lane.
- Linked the local Supabase CLI to `elkpberfbhwbrkawklnk` and applied all pending migrations: document storage, default-workspace API access, and workspace/audit/channel-delivery hardening.
- Set the Git-connected Vercel production env vars for Supabase persistence and webhook safety on `sanuske2-2147s-projects/fashion-store-os` without recording secret values in the repo.
- Promoted `codex/backend-foundation` to `main` at `87b12d9`, producing a Ready Git-connected Vercel production deployment.
- Verified `/api/health` returns `ok: true`, `storage: "supabase"`, `supabaseHost: "elkpberfbhwbrkawklnk.supabase.co"`, and `workspace: "default"` on the deployment URL, project alias, and `fashion-store-os.vercel.app`.
- Ran a live activation round-trip smoke: temporary manager signup, state write/read, manager export, cleanup, and final empty bootstrap all passed.
- Updated `scripts/launch-readiness.js` so `npm.cmd run launch:check` now reports that Supabase activation is complete and the remaining gate is live health plus pilot UAT before public cutover.
- Pre-pilot MVP hardening in `src/app.js`: new workspaces start as a true clean slate (empty `createSeedState()`; demo content preserved as dev-only `createDemoState()`/`loadStudioDemo()`), removed backend/storage wording from the UI in favor of neutral "All changes saved"/"Saved on this device", and made the client trust the server `authenticated` flag (clears stale local session pointer; `persistLocalAuth` no longer stores the session at rest) so a device without a valid session cookie always lands on sign-in.
- Verified the hardening: `node --check`, full `launch:check` (syntax/UX/security/build), and a live server smoke (fresh bootstrap returns empty state; signup→authed bootstrap with cookie vs `authenticated:false` without cookie; reset cleanup).
- Pivoted to multi-tenant per-device workspaces (same secure Supabase stack): the browser generates a random workspace id (`x-workspace-id` header), `api/_store.js` resolves it per request via `storeForRequest(request)`, and all handlers (bootstrap/session/state/auth/data/inbound/channel-webhook) are scoped to it. Each device/tester now gets an isolated workspace instead of one shared `default` tenant. Validated via unit test of `resolveWorkspaceId` and confirmed the documents table has no workspace_id CHECK constraint (service-role key writes arbitrary ids).
- Lifted the single-manager + 2-staff caps: a workspace now allows multiple managers and up to `USER_LIMIT` (25) users. Managers can create/invite additional manager- or staff-role accounts (role selector added to the Team access panel); invited managers can accept invites. Suspend/remove stays scoped to staff for safety (remove a manager by resetting the workspace).
- Consolidated the repo to a single branch on 2026-07-30: deleted `master` (32 commits behind, unreferenced by any deploy config) and `codex/backend-foundation` (identical to `main`). `main` is now the working, default, and production branch, and `docs/release-lane.md` moves `release:preflight` to run before the push because every push is now a release.
- Added `/api/keepalive` and a daily Vercel Cron (`0 6 * * *`) after the Supabase project paused from ~31 days idle and production returned `storage: "supabase-unreachable"`. The route runs a real Supabase query to reset the pause timer and returns 503 (not 200 like `/api/health`) when the probe fails, so an outage surfaces as a failed cron invocation. Gated by `CRON_SECRET` when set.
- Phase 017 repo-side: authored `docs/cutover.md` (ordered preflight → tag → domain → health gate → DNS → verify → watch checklist with owner-only steps marked) and added Post-Launch Support to `docs/operations-runbook.md` (14-day watch window, issue intake fields, sev-1..4 triage). Recorded the readiness blind spot — `/api/readiness` reports configuration, not connectivity, and stayed green through the outage.

## In Progress

- Item: Phase 017 post-launch watch window (14 days from 2026-08-03), per the Post-Launch Support section of `docs/operations-runbook.md`.
- Item: Production write-path verification via the `docs/cutover.md` Step 6 browser smoke set (manager signup → business setup → refresh → persistence; second browser for workspace isolation). Owner-side. The first attempt on 2026-08-03 was blocked by the account lockout below and has not been completed.
- Item: Phase 018 production verification — the recovery round trip is now Step 6 of `docs/production-smoke.md` and runs with the write-path smoke. The owner last-resort procedure is documented but not rehearsed.
- Item: Apply the Phase 019 migration to production. `npx supabase db push` creates `fashion_store_os_workspace_codes`. Owner action. Until then the invite path degrades to a same-device invite and `/api/workspace-code` returns a storage error, so the fix is inert in production.

## Known Defects

- ~~Staff invites cannot be accepted from the invitee's own device.~~ **Fixed in Phase 019 on 2026-08-03**, pending the production migration. Invites now carry a workspace code, and acceptance resolves the issuing workspace instead of the invitee's own. The failure was confirmed on the pre-change build before the fix landed.
- ~~A workspace is reachable only from the browser that created it.~~ **Fixed in Phase 019 on 2026-08-03**, pending the production migration. A manager issues a 30-minute single-use workspace code from Settings and redeems it on the other device.

Historical detail retained below.

- Staff invites cannot be accepted from the invitee's own device. `acceptStaffInvite` resolves the workspace from the `x-workspace-id` header and then looks for the invited user inside it, so a staff member opening the app on their own browser lands in a fresh empty workspace where the invite does not exist and gets "Invite details do not match." An invite is only redeemable on the browser that created it, which defeats its purpose. Same root cause affects Phase 018 manager-issued recovery codes, which are also handed to another person. Fix planned in Phase 019.
- A workspace is reachable only from the browser that created it. Found on 2026-08-03 when an operator changed machines; the only workaround was reading `fashion-studio-os-workspace-v1` from `localStorage` on the first machine and pasting it into the second. Planned in Phase 019.

## Blocked

- Collaborator-authored Vercel production deploys are blocked with `TEAM_ACCESS_REQUIRED` because commit author `NnazimuzoO` / Vercel user `nnazimuzoo` does not have contributing access to `sanuske2-2147s-projects/fashion-store-os`. The attempted invite to `nnazimuzoo@nitechsoftware.com.ng` failed because Vercel Hobby teams do not permit team members.
- `/api/keepalive` cron registration in Vercel → Settings → Cron Jobs is still unconfirmed from this session; the available CLI authenticates as `nnazimuzoo`, which has no access to the `sanuske2-2147s-projects` scope. `CRON_SECRET` enforcement was confirmed live on 2026-08-02 (401 without a bearer token), but a successful scheduled firing has not been observed.

## Waived

- Real-store pilot UAT was waived by owner decision on 2026-07-31 rather than executed. `docs/pilot-uat.md` scenarios are reused as the post-cutover smoke set in `docs/cutover.md` Step 6. Consequence: the production write path has not been validated by a real operator since the Supabase restore — reads were verified on 2026-07-31, writes were not.

## Next Action

Owner (`ADxZimmy`): run the `docs/cutover.md` Step 6 browser smoke against `https://fashion-store-os.vercel.app` — manager signup, business setup, refresh for persistence, and a second browser for workspace isolation. This is the first exercise of the production write path since the Supabase restore. Then confirm the `/api/keepalive` cron shows a successful run under Vercel → Settings → Cron Jobs, and work the watch-window cadence for 14 days.

## Verification Snapshot

- Command/check: `node --check src\\app.js`
  Result: Passed.
- Command/check: Headless Chrome onboarding and order workflow via local static server.
  Result: Passed; no browser runtime errors.
- Command/check: 390px mobile-width layout probe.
  Result: Passed; document scroll width matched viewport width.
- Command/check: `node --check src\\app.js`
  Result: Passed after backend wiring edits.
- Command/check: `node --check server.js`
  Result: Passed after backend wiring edits.
- Command/check: `npm.cmd run check`
  Result: Passed.
- Command/check: `GET /api/health`
  Result: Passed; returned `{ ok: true, storage: "json-file" }`.
- Command/check: Chrome first-run smoke test at `http://localhost:4179`
  Result: Passed; manager signup opened setup, setup opened dashboard with Server Storage, backend state/auth files were written, and UI reset returned the app to first launch.
- Command/check: Native dialog scan
  Result: Passed; no `prompt`, `confirm`, or `alert` calls in runtime app files.
- Command/check: Runtime hardcoded brand scan
  Result: Passed; no Mo'ora/Pastry hardcoding in runtime app files.
- Command/check: `npm.cmd run check`
  Result: Passed after Vercel build script was added.
- Command/check: `npm.cmd run build`
  Result: Passed; generated 6 public files in `dist/`.
- Command/check: `vercel deploy --yes --logs`
  Result: Passed; deployed production target `dpl_H2EEfbKVqesoef2iRaKKLMgTWnd6`.
- Command/check: `vercel inspect https://fashion-store-os-navy.vercel.app`
  Result: Passed; deployment status was Ready.
- Command/check: Live HTTP probes
  Result: Passed for `/`, `/src/app.js`, and `/src/styles.css`; `/api/bootstrap` returned 404 as expected for the current static Vercel deployment.
- Command/check: `npm.cmd run check`
  Result: Passed after production API routes were added; 11 JavaScript files checked.
- Command/check: Production API unconfigured smoke test
  Result: Passed; in an intentionally env-less handler test, `/api/health` reported storage unconfigured and `/api/bootstrap` returned a clear 503.
- Command/check: Supabase project creation
  Result: Passed; `Fashion Store OS` project `duimatbeahwfeghcviju` is active and healthy in `us-east-1`.
- Command/check: Supabase migrations
  Result: Passed; migrations `create_fashion_store_os_documents` and `allow_default_workspace_document_api_access` are recorded.
- Command/check: Supabase local store smoke test
  Result: Passed; state/auth documents could be saved, read, and cleared through the REST helper.
- Command/check: Vercel clean staging production deploy
  Result: Passed; deployment is Ready and aliased to `https://fashion-store-os-navy.vercel.app`.
- Command/check: Live production API persistence
  Result: Passed; `/api/health` reports Supabase, `/api/bootstrap` works, and live API write/read/delete completed successfully.
- Command/check: Vercel runtime error scan
  Result: Passed; no production error/fatal logs found for the last hour.
- Command/check: Live mobile navigation audit
  Result: Passed on 2026-06-25; production assets include mobile appbar/off-canvas drawer code, no horizontal overflow was detected, and the drawer opened with full navigation links.
- Command/check: Live `/api/bootstrap` recovery probe
  Result: Failed on 2026-06-25; production returned HTTP 500.
- Command/check: Supabase DNS probe
  Result: Failed on 2026-06-25; `duimatbeahwfeghcviju.supabase.co` returned NXDOMAIN via `nslookup`.
- Command/check: Supabase MCP probe
  Result: Failed on 2026-06-25; SQL and API-log calls for project `duimatbeahwfeghcviju` timed out.
- Command/check: Supabase project restore
  Result: Passed on 2026-06-25; project `duimatbeahwfeghcviju` is `ACTIVE_HEALTHY`.
- Command/check: Supabase migration reapply and advisors
  Result: Passed on 2026-06-25; document table/RLS/policy were recreated and security/performance advisors returned no lints.
- Command/check: Supabase REST read probe
  Result: Passed on 2026-06-25; REST read to `fashion_store_os_documents` returned HTTP 200 with an empty list.
- Command/check: API handler probes
  Result: Passed on 2026-06-25; unconfigured storage returns 503, unreachable storage returns 502, and health reports `ok: false` with safe diagnostics.
- Command/check: `npm.cmd run check`
  Result: Passed on 2026-06-25; 11 JavaScript files checked.
- Command/check: `npm.cmd run build`
  Result: Passed on 2026-06-25; 6 public files built into `dist/`.
- Command/check: Vercel production deploy
  Result: Passed on 2026-06-25; production deployment is Ready and aliased to `https://fashion-store-os-navy.vercel.app`.
- Command/check: Live production API persistence
  Result: Passed on 2026-06-25; `/api/health` returned `ok: true`, `/api/bootstrap` worked, live API write/read/reset succeeded, and Supabase document count returned to 0 after cleanup.
- Command/check: Vercel runtime error scan
  Result: Passed on 2026-06-25; no production error/fatal serverless logs found after smoke testing.
- Command/check: `npm.cmd run check`
  Result: Passed on 2026-06-25 after CRM channel intake; 13 JavaScript files checked.
- Command/check: `npm.cmd run build`
  Result: Passed on 2026-06-25 after CRM channel intake; 6 public files built into `dist/`.
- Command/check: Local `/api/inbound` smoke
  Result: Passed on 2026-06-25; POST normalized lowercase source/status values, appeared in bootstrap state, and cleanup removed test data.
- Command/check: Local browser CRM smoke
  Result: Passed on 2026-06-25 at 390px and 1280px; channel message save, follow-up update, route-to-inquiry, and no-horizontal-overflow checks passed.
- Command/check: Vercel production deploy
  Result: Passed on 2026-06-25; production deployment is Ready and aliased to `https://fashion-store-os-navy.vercel.app`.
- Command/check: Live `/api/inbound` smoke
  Result: Passed on 2026-06-25; live POST appeared in `/api/inbound` and `/api/bootstrap`, then `/api/data` cleanup returned state/auth to absent.
- Command/check: Live asset check
  Result: Passed on 2026-06-25; production `src/app.js` contains channel intake, route action, and intake queue code.
- Command/check: Vercel runtime error scan
  Result: Passed on 2026-06-25; no production error/fatal serverless logs found for the CRM intake deployment after smoke testing.
- Command/check: `npm.cmd run check`
  Result: Passed on 2026-06-25 after phases 005-007; 17 JavaScript files checked.
- Command/check: `npm.cmd run build`
  Result: Passed on 2026-06-25 after phases 005-007; 6 public files built into `dist/`.
- Command/check: Local API auth/webhook smoke
  Result: Passed on 2026-06-25; signup created hashed auth storage, unauthenticated bootstrap locked state, staff limited access persisted, and direct/Meta webhook payloads normalized.
- Command/check: Local Playwright Reports smoke
  Result: Passed on 2026-06-25 at 390px and 1280px; Reports rendered, drawer closed after mobile navigation, no horizontal overflow, and browser console had 0 errors.
- Command/check: Vercel production deploy
  Result: Passed on 2026-06-25; production deployment is Ready and aliased to `https://fashion-store-os-navy.vercel.app`.
- Command/check: Live production auth/webhook/reset smoke
  Result: Passed on 2026-06-25; live session signup, protected state write, unauthenticated bootstrap lock, channel webhook append, authenticated bootstrap read, and cleanup all succeeded.
- Command/check: Live production Reports smoke
  Result: Passed on 2026-06-25; live browser reached Reports, rendered learning insights, and had no desktop horizontal overflow.
- Command/check: Vercel runtime error scan
  Result: Passed on 2026-06-25; `vercel logs --since 15m --level error` returned no logs after live smoke testing.
- Command/check: GitHub owner-authored push to `main`
  Result: Passed on 2026-06-26; Vercel created Ready production deployment `dpl_GKDe4822iJSPiRTHJWzYgzV79mRH`.
- Command/check: Live Git-connected `/`
  Result: Passed on 2026-06-26; `https://fashion-store-gnm1h1k6x-sanuske2-2147s-projects.vercel.app` returned HTTP 200.
- Command/check: Live Git-connected `/api/health`
  Result: Failed persistence readiness on 2026-06-26 before activation; returned `ok: false`, `storage: "unconfigured"`. Supabase env vars were added and verified on 2026-06-29.
- Command/check: Supabase docs/changelog review
  Result: Passed on 2026-06-26; confirmed explicit grants are required for new tables in the newer Supabase Data API model, so Phase 010 migration includes explicit grants and RLS.
- Command/check: `npm.cmd run check`
  Result: Passed on 2026-06-26 after Phases 009-012; 19 JavaScript files checked.
- Command/check: `npm.cmd run build`
  Result: Passed on 2026-06-26 after Phases 009-012; 6 public files built into `dist/`.
- Command/check: Local Phase 009-012 API smoke
  Result: Passed on 2026-06-26; manager signup, staff invite/accept/change-password/suspend/reactivate, suspended-staff 401, signed webhook accept, duplicate retry, non-leaking webhook GET, consent persistence, delivery events, and sanitized manager export all passed.
- Command/check: `npm.cmd run release:preflight`
  Result: Expected fail before commit on 2026-06-26 because the worktree was dirty; repository check passed and owner-author warning displayed.
- Command/check: Browser UI smoke
  Result: Skipped on 2026-06-26; `npx playwright` hung and Chrome/Edge were not discoverable on PATH.
- Command/check: `npm.cmd run check`
  Result: Passed on 2026-06-26 after Phases 013-016; 23 JavaScript files checked.
- Command/check: `npm.cmd run ux:audit`
  Result: Passed on 2026-06-26; mobile drawer, live region, focus, reduced motion, touch target, no-overflow, Escape, and native-dialog gates passed.
- Command/check: `npm.cmd run ops:security`
  Result: Passed on 2026-06-26; API body limit, webhook signature mode, manager-gated export, owner lane, secret-looking values, and native-dialog checks passed.
- Command/check: `npm.cmd run launch:check`
  Result: Passed on 2026-06-26; syntax, UX audit, security audit, and production build all passed locally.
- Command/check: Local `/api/health` and `/api/readiness` smoke
  Result: Passed on 2026-06-26; local backend returned `storage: "json-file"` and readiness `mode: "local"`.
- Command/check: `node scripts/launch-readiness.js` (umbrella `npm run launch:check`)
  Result: Passed on 2026-06-29 from Bash after the `shell: true` fix; previously failed `spawnSync npm.cmd EINVAL` outside PowerShell. Syntax, UX, security, and build gates all green.
- Command/check: `npx supabase --version`
  Result: Passed on 2026-06-29; local CLI reports `2.108.0`.
- Command/check: `npx supabase projects list --output json`
  Result: Passed on 2026-06-29 after owner login; active owner project is `fashion-store` (`elkpberfbhwbrkawklnk`) in `eu-west-3`.
- Command/check: old Supabase target access (`duimatbeahwfeghcviju`)
  Result: Failed as expected on 2026-06-29; Supabase returned 403, so the Git-connected lane now uses the accessible owner project `elkpberfbhwbrkawklnk`.
- Command/check: `npx supabase link --project-ref elkpberfbhwbrkawklnk --yes`
  Result: Passed on 2026-06-29.
- Command/check: `npx supabase db push`
  Result: Passed on 2026-06-29; applied the document, default-workspace API, and workspace/audit/channel-delivery migrations.
- Command/check: Vercel production env vars
  Result: Passed on 2026-06-29; required Supabase/workspace/webhook-safety variables are present on `sanuske2-2147s-projects/fashion-store-os` without repo-stored secret values.
- Command/check: GitHub push to `main`
  Result: Passed on 2026-06-29; `origin/main` fast-forwarded to `87b12d9`.
- Command/check: Git-connected Vercel production deployment
  Result: Passed on 2026-06-29; the Git-triggered production deployment reached Ready and the stable aliases were healthy.
- Command/check: Git-connected `/api/health`
  Result: Passed on 2026-06-29; deployment URL, project alias, and `https://fashion-store-os.vercel.app` all returned Supabase storage on `elkpberfbhwbrkawklnk.supabase.co`.
- Command/check: Live activation round-trip smoke
  Result: Passed on 2026-06-29; temporary manager signup, state write/read, manager export, cleanup, and final empty bootstrap all succeeded.
- Command/check: `npm.cmd run launch:check`
  Result: Passed on 2026-06-29 after Supabase CLI install; syntax, UX, security, and build gates all green.
- Command/check: `npm.cmd run check`
  Result: Passed on 2026-06-29 after activation docs and launch-readiness message updates; 23 JavaScript files checked.
- Command/check: `git diff --check`
  Result: Passed on 2026-06-29; no whitespace errors, only expected CRLF normalization warnings.
- Command/check: `npm.cmd run launch:check`
  Result: Passed on 2026-06-29 after updating the readiness message; final note now says production Supabase activation is complete and to re-check live health plus pilot UAT before public cutover.
- Command/check: Pre-pilot MVP hardening verification (`node --check src\\app.js`, `npm run launch:check`, local server smoke).
  Result: Passed on 2026-06-29; syntax/UX/security/build green, fresh bootstrap returned empty state, signup issued a session and authed bootstrap returned `authenticated:true`, cookieless bootstrap returned `authenticated:false`, and reset cleanup returned the workspace to empty.
  Note: A fresh-signup empty-dashboard browser render was not verified headlessly; confirm via pilot UAT Scenario 1 on the live URL.
- Command/check: Live `/api/health` on the Git-connected deployment
  Result: Failed on 2026-07-30; returned `ok: false`, `storage: "supabase-unreachable"`. `elkpberfbhwbrkawklnk.supabase.co` did not resolve against a public DNS resolver — the free-tier Supabase project had paused after ~31 days idle. Vercel env vars were unchanged and correct throughout.
- Command/check: `/api/keepalive` failure path on the deployed route
  Result: Passed on 2026-07-30; returned HTTP 503 with `supabase-unreachable` while the database was down, confirming a dead database surfaces as a failed cron invocation instead of `/api/health`'s silent 200.
- Command/check: `/api/keepalive` handler auth matrix (mocked req/res)
  Result: Passed on 2026-07-30; open with no `CRON_SECRET`, 401 on missing/wrong/wrong-length bearer with no `timingSafeEqual` crash, proceeds on correct bearer, 405 on POST.
- Command/check: Live `/api/health`, `/api/readiness`, `/api/keepalive`, `/api/bootstrap` after Supabase restore
  Result: Passed on 2026-07-31; DNS resolved again, health `ok: true` with `storage: "supabase"` on both aliases, readiness all 6 checks green, keepalive HTTP 200, and bootstrap on an isolated workspace returned a clean empty state. The successful `SELECT` confirms the schema survived — this was a pause/restore, not a delete/recreate, so no migration re-run was needed.
  Note: Read path only. The production write path was not exercised after the restore; `docs/cutover.md` Step 6 covers it post-cutover.
- Command/check: Phase 018 recovery implementation
  Result: Passed on 2026-08-03. 37 unit assertions over `api/_auth.js` plus an HTTP round trip through the local server: signup issues a code, only the hash reaches disk, the hash survives a subsequent auth write, redeem sets no `Set-Cookie` and returns `authenticated: false`/`passwordReset: true`, the old password stops working, the code is single-use, a code backdated 400 days still redeems, and unknown-email and wrong-code both return 401 `Recovery details do not match.`
  Note: The `normalizeAuthDocument` field-list trap existed in two places, not one — `normalizeAuth` in `src/app.js:266` rebuilds users from its own explicit list and dropped the recovery metadata until it was added there too.
- Command/check: `npm.cmd run launch:check` and `npm.cmd run release:preflight` for Phase 017 repo-side
  Result: Passed on 2026-07-31; syntax/UX/security/build green, clean worktree, owner-authored latest commit.
- Command/check: `CRON_SECRET` enforcement on the deployed `/api/keepalive`
  Result: Passed on 2026-08-02; returned 401 with no auth header and 401 with a wrong bearer, where it had returned 200 before. Confirms the secret is both set and picked up by a redeploy, since Vercel env changes do not apply to existing deployments. `/api/health` stayed public and green.
- Command/check: Phase 017 cutover Step 0 gates
  Result: Passed on 2026-08-03; `launch:check` (syntax/UX/security/build) and `release:preflight` (clean worktree, expected repo, owner-authored) all green.
- Command/check: Annotated release tag
  Result: Passed on 2026-08-03; `v1.0.0` (`7420d1c`) points at `8b5943e`, tagger `ADxZimmy`, pushed to GitHub. The owner confirmed the Vercel Ready deployment was built from `8b5943e` before tagging.
- Command/check: Phase 017 cutover Step 4 health gate on `https://fashion-store-os.vercel.app`
  Result: Passed on 2026-08-03; `/api/health` returned `ok: true`, `storage: "supabase"`, and `/api/readiness` returned all 6 checks green.
- Command/check: Phase 017 cutover Step 6 API verification
  Result: Passed on 2026-08-03; `/api/bootstrap` on an isolated workspace returned a clean empty state with `authenticated: false`. `/api/keepalive` returned 401 without a bearer token, which is correct with `CRON_SECRET` set and is not a storage signal.
  Note: Write path not covered. The Step 6 browser smoke (manager signup through persistence) is owner-side and outstanding.
- Command/check: Phase 017 cutover Step 6 browser smoke, first attempt
  Result: Blocked on 2026-08-03. Signup returned "Manager access already exists" because the operator's browser was bound via `localStorage` (`fashion-studio-os-workspace-v1`) to a workspace that already had a manager, and the credentials were unknown. Confirmed not a tenancy defect: `/api/bootstrap` with no `x-workspace-id` header showed the `default` workspace empty (`authExists: false`, 0 users), and `src/app.js:170` correctly generates and persists a per-device id.
  Finding: the workspace was unrecoverable. `sanitizeAuth` blanks `name`/`email` for unauthenticated callers (`api/_auth.js:98-104`, correct — it prevents user enumeration), and no password reset flow exists anywhere in the codebase. A forgotten manager password therefore destroys access to a workspace permanently. Raised as Phase 018.
  Workaround: cleared the browser's workspace and app keys to start a fresh workspace. This orphans the old workspace's Supabase rows with no UI path to reach or delete them; acceptable here because it held only test data.
