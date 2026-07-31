# Verification

Status: Repo-side complete on 2026-07-31 (plan steps 2-5). Owner-side cutover (steps 6-8) not yet executed. Record owner results here as steps complete.

## Automated Checks

- Command: `npm run launch:check`
  Result: Passed on 2026-07-31; syntax, UX audit (10 checks), security audit (5 checks), and production build all green.
  Notes: Re-run immediately before the owner cutover.
- Command: `npm run release:preflight`
  Result: Passed on 2026-07-31; clean worktree, expected repository, owner-authored latest commit.
  Notes: Every push to `main` is now a production release, so this runs before the push rather than at a handoff.

## Manual Checks

- Check: `/api/health` on the Git-connected deployment reports `storage: "supabase"` (Phase 008 prerequisite).
  Result: Passed on 2026-07-31 after the Supabase restore.
  Notes: Public alias and project alias both returned `ok: true`, `storage: "supabase"`, host `elkpberfbhwbrkawklnk.supabase.co`. Failed on 2026-07-30 with `supabase-unreachable` — see Residual Risk. Re-run immediately before any DNS change.
- Check: `/api/keepalive` returns 200 against live storage and 503 when unreachable.
  Result: Passed on 2026-07-31; observed 503 during the outage and 200 after the restore, with no code change between them.
- Check: `/api/bootstrap` read path on an isolated workspace.
  Result: Passed on 2026-07-31; returned a clean empty state with `authenticated: false`.
- Check: `docs/cutover.md` exists with an ordered, owner-gated checklist and the `/api/health` DNS gate.
  Result: Passed on 2026-07-31.
- Check: Production **write** path validated against live Supabase.
  Result: **Not verified.** Reads were confirmed on 2026-07-31; no write round-trip was run after the restore. Covered by `docs/cutover.md` Step 6 (post-cutover), not before it.
- Check: Annotated release tag points at the deployed commit.
  Result: Pending owner action.
- Check: Live domain serves the app and pilot smoke scenarios pass.
  Result: Pending owner action.
- Check: `/api/keepalive` cron registered in Vercel → Settings → Cron Jobs.
  Result: Pending owner confirmation; the CLI available in the working session authenticates as `nnazimuzoo`, which has no access to the `sanuske2-2147s-projects` scope.

## Residual Risk

- Risk: Live persistence depends on the Supabase project staying active.
  Status: **Materialized on 2026-07-30.** The free-tier project paused after ~31 days idle waiting on pilot UAT, DNS stopped resolving, and production served `storage: "supabase-unreachable"` while every env var was still correct.
  Why the prior mitigation failed: `/api/health` did detect it, but detection is not alerting — nobody was reading it, so the outage ran unnoticed until it was checked by hand.
  Mitigation now: a daily Vercel Cron on `/api/keepalive` issues a real query to prevent idle pause, and returns 503 so a failure appears as a failed cron invocation rather than a silent 200. Still not a pager — someone must read the Cron Jobs tab.
  Owner: ADxZimmy.
- Risk: Pilot UAT was waived, so the production write path and a full operating cycle have never been exercised by a real store operator.
  Mitigation: `docs/cutover.md` Step 6 reuses the pilot scenarios as a post-cutover smoke set. This detects rather than prevents, because it runs after the domain is live.
  Owner: ADxZimmy.
- Risk: Collaborator-authored emergency deploys remain blocked (`TEAM_ACCESS_REQUIRED`) until the Vercel plan/ownership decision is made.
  Owner: ADxZimmy.
- Risk: `/api/readiness` reports configuration, not connectivity, and returned `ok: true` throughout the outage.
  Mitigation: documented in `docs/operations-runbook.md` and `docs/cutover.md` Step 4 — read `/api/health` for liveness decisions.
