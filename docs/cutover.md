# Production Cutover

Last updated: 2026-10-19

Ordered checklist for releasing Phase 021 (the local-first pivot) to production as **Release A**, then **Release B** after UAT. The v1.0.0 cutover record from 2026-08-03 is kept at the end as history.

## How To Read This

- Steps marked **[OWNER]** need the `ADxZimmy` account (Vercel dashboard, Neon, tag push). Collaborator-authored deploys fail with `TEAM_ACCESS_REQUIRED` on the Vercel Hobby plan.
- Unmarked steps can be run by any maintainer.
- Step 4 is a hard gate.

## What Release A Changes For Users

- **Business records move onto the device.** A browser that already has records in localStorage from the old build has them migrated into IndexedDB on its first open of the new build; the old copy is removed only after the new one verifies.
- **Every account starts fresh.** The new build keeps accounts in Neon, not in the paused Supabase project, and does not migrate the old ones. This is deliberate and safe only because no real operator ever used the old write path; Prerequisite 3 confirms that before release.
- **A tab still running the old build** gets `410 Gone` from the retired endpoints, keeps its changes in the browser, and picks up the new build on reload.

## Prerequisites

| # | Prerequisite | How to confirm |
|---|---|---|
| 1 | Neon added to the Vercel project **[OWNER]** | `vercel env ls` shows `DATABASE_URL`, unprefixed, for Production only. **Met on 2026-10-19** (`docs/owner-activation-runbook.md`). |
| 2 | `CRON_SECRET` set in Vercel | Settings, Environment Variables. Set since 2026-08-02; still present on 2026-10-19. |
| 3 | Legacy Supabase holds nothing real **[OWNER]** | Phase 021 UAT item 11. **Met on 2026-10-19:** the restored project's documents table is empty (Phase 021 VERIFICATION). Step 0 re-runs the count just before the push. |
| 4 | Branch reviewed | `phase-021-release-a` merged into `main` locally and `npm.cmd run launch:check` green on the result. |

Prerequisite 3 gates the identity cutover. If it finds a real account or real records, stop: the release needs a migration plan first.

## Step 0: Preflight

```powershell
npm.cmd run launch:check
npm.cmd run release:preflight
```

Both must pass. `release:preflight` fails on a dirty worktree and warns when the latest commit is not owner-authored, which would not deploy.

Then re-check the legacy project, because the pre-pivot build keeps serving from it until this release replaces that build. With the Supabase CLI logged in:

```powershell
npx supabase db query --linked "select count(*) from public.fashion_store_os_documents"
```

**Pass:** `0`. Anything else means someone used the old build since the UAT item 11 check: stop and inspect those rows before releasing.

## Step 1: Push and watch the build [OWNER]

Push `main`. In Vercel, Deployments, open the new production build and read its log.

**Pass:** the log contains `db-migrate: applied 0001_identity` (first deploy) or `db-migrate: schema up to date` (later deploys), and the deployment is **Ready**.

If the build fails with `DATABASE_URL is not set`, Prerequisite 1 is incomplete. The failed build never goes live, so nothing user-visible changed; fix the integration and redeploy.

The CI workflow (`.github/workflows/ci.yml`) runs the same gates on the push. It does not block the deploy; a red CI run on `main` means a release to roll back or fix.

## Step 2: Tag the release [OWNER]

Tag the commit that is actually deployed, never a newer one.

```bash
git tag -a v2.0.0 -m "Fashion Store OS v2.0.0: local-first (Phase 021 Release A)"
git push origin v2.0.0
```

## Step 3: Custom domain

Not applicable. The public target remains `https://fashion-store-os.vercel.app`. If a domain is added later: Vercel, Settings, Domains, Add; record the DNS values, and do not change DNS until Step 4 passes on the alias.

## Step 4: Health gate

```powershell
Invoke-RestMethod https://fashion-store-os.vercel.app/api/health
Invoke-RestMethod https://fashion-store-os.vercel.app/api/readiness
Invoke-WebRequest https://fashion-store-os.vercel.app/api/state -SkipHttpErrorCheck | Select-Object StatusCode
```

**Proceed only when** health returns `ok: true` and `storage: "postgres"`, readiness returns `ok: true`, and `/api/state` returns `410`. Readiness now performs a real database round trip, so unlike the v1.0.0 cutover it no longer stays green through a database outage.

## Step 5: Smoke test

Run `docs/production-smoke.md` in full, including its mandatory cleanup. It is self-contained and safe to hand to an operator or an agent.

## Step 6: Watch window

Follow **Post-Launch Support** in `docs/operations-runbook.md`.

## Rollback

- **First Release A deploy:** prefer fixing forward on `main`. The previous production build is the pre-pivot one, and it works only while the legacy Supabase project is active (restored for UAT item 11 on 2026-10-19; a free project pauses again after about a week idle). Promoting it does bring a working site back, but on the old server-data model: records made under the new build stay in each browser's IndexedDB, which the old build cannot read, and reappear when the new build returns. With no real users yet, use the promotion only to get a working site back quickly while the fix is made.
- **Later deploys:** promote the previous known-good deployment in Vercel. Do not reset Git.
- **Schema:** forward-only. Never edit an applied file in `db/migrations/`; add a new one. Neon can restore the database to an earlier point within its history window by branching from a timestamp; the other projects on this Neon account show a 6-hour window, so confirm the new project's setting once it exists. This covers identity, backups, and the inbox, never device records.
- Record any rollback in the incident log of `docs/operations-runbook.md`.

## Release B

Only after every Phase 021 UAT scenario passes:

1. Delete the retired endpoints (`api/state.js`, `api/data.js`, `api/inbound.js`, `api/workspace-code.js`, `api/_gone.js`) and their dev-server routes.
2. Decommission the legacy Supabase project, after UAT item 11's second confirmation. Remove the `SUPABASE_*` and `FASHION_STORE_WORKSPACE_ID` variables from Vercel and the `supabase` devDependency.
3. Re-run Steps 0 to 5.

Nothing in Release B touches Neon.

## Release A Record

Fill this in at release and keep it in the repo:

| Field | Value |
| --- | --- |
| Release date | |
| Deployed commit | |
| Release tag | |
| Neon project | `steep-smoke-31370127` (Vercel resource `neon-champagne-river`), Frankfurt `aws-eu-central-1`, PostgreSQL 18.6; functions in `fra1` |
| Build log migration line | |
| `/api/health` | |
| `/api/readiness` | |
| `/api/state` returns 410 | |
| Smoke test (`docs/production-smoke.md`) | |
| Legacy Supabase check (UAT item 11) | Passed 2026-10-19: 0 documents, 2 test workspace rows. Recheck at Step 0: |
| Operator | |

## History: v1.0.0 Cutover (2026-08-03)

| Field | Value |
| --- | --- |
| Cutover date | 2026-08-03 |
| Deployed commit | `8b5943e` (confirmed Ready in Vercel before tagging) |
| Release tag | `v1.0.0`, annotated `7420d1c`, points at `8b5943e` |
| Public domain | `https://fashion-store-os.vercel.app` (existing alias; no custom domain, no DNS change) |
| Operator | `ADxZimmy` |
| `/api/health` | Passed 2026-08-03: `ok: true`, `storage: "supabase"` |
| `/api/readiness` | Passed 2026-08-03: all 6 checks green |
| Write path | Never verified; superseded by Phase 021, which removed it |
| Pilot UAT | Waived 2026-07-31 |

The Supabase project behind v1.0.0 paused for inactivity twice: found on 2026-07-30 and again on 2026-10-02. The second time is why Phase 021 moved the server database to Neon.
