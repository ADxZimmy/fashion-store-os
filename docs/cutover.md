# Production Cutover

Last updated: 2026-07-31

Ordered checklist for moving Fashion Store OS from the Vercel alias to a stable public domain, and for standing up the post-launch watch window.

## How To Read This

- Steps marked **[OWNER]** require the `ADxZimmy` account (Vercel dashboard, registrar DNS, tag push). They cannot be done from a collaborator session — collaborator-authored deploys still fail with `TEAM_ACCESS_REQUIRED` on the Hobby plan.
- Unmarked steps are repo-side and can be run by any maintainer.
- Step 4 is a hard gate. Do not point DNS until it passes.

## Prerequisite Status

| Prerequisite | State |
| --- | --- |
| Phase 008 Supabase activation | Complete (2026-06-29) |
| Production `/api/health` | Green (re-verified 2026-07-31 after the Supabase restore) |
| Daily keepalive cron | Deployed; confirm it is registered under Vercel → Settings → Cron Jobs |
| `CRON_SECRET` set in Vercel | Pending owner action |
| Real-store pilot UAT | **Waived by owner decision on 2026-07-31.** `docs/pilot-uat.md` was not executed against production |

The pilot waiver is recorded, not resolved. The scenarios in `docs/pilot-uat.md` are still the best-defined smoke set for this app, so Step 6 reuses them as a post-cutover check. Note what that trades away: they run *after* the domain is live rather than gating it, and they exercise a manager signup and write path that has never been validated by a real operator.

## Step 0 — Preflight

```powershell
npm.cmd run launch:check
npm.cmd run release:preflight
```

Both must pass. `release:preflight` fails on a dirty worktree and warns when the latest commit is not owner-authored — an unowned commit will not auto-deploy.

Confirm production is currently healthy:

```powershell
Invoke-RestMethod https://fashion-store-os.vercel.app/api/health
```

Expected: `ok: true`, `storage: "supabase"`.

## Step 1 — Confirm the deployment is Ready [OWNER]

Vercel → project → Deployments. The latest production deployment must be **Ready** and built from the exact commit you intend to tag. Note its commit SHA; every later step refers to it.

## Step 2 — Tag the release [OWNER]

Tag the commit that is actually deployed — never a newer commit that has not been through a production build.

```bash
git tag -a v1.0.0 -m "Fashion Store OS v1.0.0"
git push origin v1.0.0
```

The tag is the rollback anchor: it maps one Git commit to one known-good Vercel deployment.

## Step 3 — Add the custom domain [OWNER]

Vercel → project → Settings → Domains → Add. Vercel will display the DNS records the registrar needs.

**Record the values, but do not change DNS yet.** Adding the domain in Vercel is reversible; repointing DNS at a broken target is what causes user-visible downtime.

## Step 4 — Health gate before DNS

This is the gate the whole phase is built around. Run both:

```powershell
Invoke-RestMethod https://fashion-store-os.vercel.app/api/health
Invoke-RestMethod https://fashion-store-os.vercel.app/api/readiness
```

Proceed only when `/api/health` returns `ok: true` and `storage: "supabase"`.

Read `/api/health` for this decision, not `/api/readiness`. Readiness reports configuration, not connectivity — it returned `ok: true` throughout the 2026-07-30 outage while the database was unreachable. If health is not green, stop and work the Incident Checklist in `docs/operations-runbook.md`.

## Step 5 — Point DNS [OWNER]

At the registrar, add exactly the records Vercel specified in Step 3. Then wait for propagation and for Vercel to issue the TLS certificate; the domain shows as valid in the Vercel dashboard when this completes.

## Step 6 — Verify on the final domain

Replace `YOUR-DOMAIN` with the live domain:

```powershell
Invoke-RestMethod https://YOUR-DOMAIN/api/health
Invoke-RestMethod https://YOUR-DOMAIN/api/readiness
Invoke-RestMethod https://YOUR-DOMAIN/api/keepalive
```

Expected: health `ok: true` with `storage: "supabase"`; keepalive HTTP 200. A keepalive `503` means production storage is unreachable — treat it as a failed cutover and roll back.

Then run the browser smoke set from `docs/pilot-uat.md` against the live domain, at minimum:

- Scenario 1 (workspace setup): manager signup → business setup → refresh → workspace persists.
- Confirm a second browser gets its own isolated workspace.
- Confirm no old brand name appears anywhere in runtime UI.

This is the first real exercise of the production **write** path since the Supabase restore. Reads were verified on 2026-07-31; writes were not.

## Step 7 — Start the watch window

Follow **Post-Launch Support** in `docs/operations-runbook.md` for cadence, log scan, and issue intake.

## Rollback

- **Before DNS:** nothing user-visible has changed. Remove the domain in Vercel if needed.
- **After DNS:** promote the previous known-good deployment in Vercel (do **not** force-reset Git). If the domain itself is the problem, repoint DNS to the prior target or the `fashion-store-os.vercel.app` alias.
- Record the rollback in the incident log section of `docs/operations-runbook.md`.

## Cutover Record

Fill this in at cutover and keep it in the repo:

| Field | Value |
| --- | --- |
| Cutover date | _pending_ |
| Deployed commit | _pending_ |
| Release tag | _pending_ |
| Public domain | _pending_ |
| Operator | `ADxZimmy` |
| `/api/health` on final domain | _pending_ |
| Pilot UAT status | Waived 2026-07-31; post-cutover smoke only |
