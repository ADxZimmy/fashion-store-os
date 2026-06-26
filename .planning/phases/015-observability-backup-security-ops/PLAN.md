# Plan

## Outcome

The project has a production-readiness endpoint, structured operational notes, a security audit command, and backup/restore runbook guidance for the Git-connected owner deployment.

## Scope

Included:

- `/api/readiness` for safe deployment readiness diagnostics.
- Local server readiness parity.
- Security audit script.
- Operations runbook covering Vercel monitoring, Supabase backups, restore rehearsal, secret rotation, and abuse controls.

Excluded:

- Paid Vercel/Supabase plan changes.
- Creating owner-side production env vars.

## Steps

1. Add readiness API route and local route.
2. Add dependency-free security audit.
3. Document observability, backup, restore, secret rotation, and incident response.
4. Verify with local checks.

## Verification

- Check: `npm.cmd run ops:security`
  Expected: Passes without secrets or native dialogs.
- Check: Readiness route source check.
  Expected: Route exists and returns safe status fields only.

## Rollback

Remove `api/readiness.js`, the local server route, security audit script, and operations runbook.
