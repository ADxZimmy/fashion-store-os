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

**Not applicable to the v1.0.0 release.** The public target is `https://fashion-store-os.vercel.app`, the Vercel alias that was already serving, so there is no domain to add and no DNS to change. Steps 3 and 5 are skipped; Step 4 still runs.

Consequence for rollback: there is no DNS lever. Because the launch target is the same alias that already serves production, rollback is **only** promoting the previous known-good deployment in Vercel. See Rollback below.

If a custom domain is added later, this step applies as written: Vercel → project → Settings → Domains → Add, which displays the DNS records the registrar needs. **Record the values, but do not change DNS yet.** Adding the domain in Vercel is reversible; repointing DNS at a broken target is what causes user-visible downtime.

## Step 4 — Health gate before DNS

This is the gate the whole phase is built around. Run both:

```powershell
Invoke-RestMethod https://fashion-store-os.vercel.app/api/health
Invoke-RestMethod https://fashion-store-os.vercel.app/api/readiness
```

Proceed only when `/api/health` returns `ok: true` and `storage: "supabase"`.

Read `/api/health` for this decision, not `/api/readiness`. Readiness reports configuration, not connectivity — it returned `ok: true` throughout the 2026-07-30 outage while the database was unreachable. If health is not green, stop and work the Incident Checklist in `docs/operations-runbook.md`.

## Step 5 — Point DNS [OWNER]

**Not applicable to the v1.0.0 release** — see Step 3.

If a custom domain is added later: at the registrar, add exactly the records Vercel specified in Step 3. Then wait for propagation and for Vercel to issue the TLS certificate; the domain shows as valid in the Vercel dashboard when this completes.

## Step 6 — Verify on the final domain

Replace `YOUR-DOMAIN` with the live domain:

```powershell
Invoke-RestMethod https://YOUR-DOMAIN/api/health
Invoke-RestMethod https://YOUR-DOMAIN/api/readiness
```

Expected: health `ok: true` with `storage: "supabase"`.

Do not curl `/api/keepalive` as a liveness check once `CRON_SECRET` is set — it returns `401` to any caller without the bearer token, including you. That is correct behavior, not an outage. Keepalive's 200/503 signal is observable only through **Vercel → Settings → Cron Jobs**, which is where a failed run appears.

Then run the browser smoke set. **Full procedure: `docs/production-smoke.md`** — self-contained, safe to hand to an operator or coworking agent, and it includes mandatory cleanup. In summary:

- Fresh incognito workspace loads to manager signup with no leftover data.
- Manager signup → business setup → refresh → the workspace persists.
- A second browser gets its own isolated workspace.
- Delete the test workspace data when done.

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
| Cutover date | 2026-08-03 |
| Deployed commit | `8b5943e` (confirmed Ready in Vercel before tagging) |
| Release tag | `v1.0.0` — annotated `7420d1c`, points at `8b5943e` |
| Public domain | `https://fashion-store-os.vercel.app` (existing Vercel alias; no custom domain, no DNS change) |
| Operator | `ADxZimmy` |
| `/api/health` on final domain | Passed 2026-08-03: `ok: true`, `storage: "supabase"` |
| `/api/readiness` | Passed 2026-08-03: all 6 checks green |
| Read path | Passed 2026-08-03: `/api/bootstrap` on an isolated workspace returned a clean empty state |
| Write path | **Not verified.** Requires the browser smoke set in Step 6 |
| Pilot UAT status | Waived 2026-07-31; post-cutover smoke only |
