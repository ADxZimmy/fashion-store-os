# Verification

Status: Pending. Phase 017 is drafted; cutover not yet executed. Record results here as steps complete.

## Automated Checks

- Command: `npm run launch:check`
  Result: Pending re-run at cutover.
  Notes: Passed locally on 2026-06-29 after the `launch-readiness.js` shell-spawn fix; re-run immediately before owner handoff.
- Command: `npm run release:preflight`
  Result: Pending.
  Notes: Expects a clean worktree and warns on non-owner-authored latest commit.

## Manual Checks

- Check: `/api/health` on the Git-connected deployment reports `storage: "supabase"` (Phase 008 prerequisite).
  Result: Pending owner setup.
  Notes: Hard gate before any DNS change.
- Check: Annotated release tag points at the deployed commit.
  Result: Pending.
- Check: Live domain serves the app and pilot smoke scenarios pass.
  Result: Pending.

## Residual Risk

- Risk: Collaborator-authored emergency deploys remain blocked (`TEAM_ACCESS_REQUIRED`) until the Vercel plan/ownership decision is made.
  Owner: ADxZimmy.
- Risk: Live persistence depends on the Supabase project staying active.
  Owner: ADxZimmy; mitigated by `/api/health` upstream detection and the watch window.
