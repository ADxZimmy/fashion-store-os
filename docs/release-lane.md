# Release Lane

Fashion Store OS can keep moving even while the Git-connected Vercel project is on a free/Hobby setup.

## Current Constraint

- GitHub repository owner: `ADxZimmy`.
- Working branch: `codex/backend-foundation`.
- Production branch on the Git-connected Vercel project: `main`.
- Owner-authored pushes from `ADxZimmy` create Ready Vercel deployments.
- Collaborator-authored pushes can fail with `TEAM_ACCESS_REQUIRED` on the Vercel Hobby project.

Do not spoof `ADxZimmy` as a commit author. Vercel may use the authenticated GitHub actor/pusher, not only the commit author metadata, and fake authorship makes the release trail worse.

## Development Flow

1. Build and test locally with the current Supabase-backed development setup.
2. Commit normal work to `codex/backend-foundation`.
3. Push the branch to GitHub for review/handoff.
4. Run `npm.cmd run release:preflight` before an owner release handoff.
5. `ADxZimmy` merges or cherry-picks the ready branch into `main` from the owner-authorized account.
6. `ADxZimmy` adds Supabase production env vars to the Git-connected Vercel project before relying on that deployment.
7. Verify `/api/health`, auth/session flow, state write/read, webhook intake, and reset/cleanup after deployment.

## Owner Release Checklist

- Worktree is clean.
- `npm.cmd run check` passes.
- `npm.cmd run build` passes.
- Migrations in `supabase/migrations/` have been applied to the owner Supabase project.
- Vercel production env vars are present:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `FASHION_STORE_WORKSPACE_ID`
  - `CHANNEL_WEBHOOK_VERIFY_TOKEN`
  - `CHANNEL_WEBHOOK_SECRET`
  - `CHANNEL_WEBHOOK_REQUIRE_SIGNATURE`
  - `CHANNEL_WEBHOOK_MAX_MESSAGES`
- `npm.cmd run release:preflight` reports a clean worktree and warns if the latest commit is not owner-authored.

## Rollback

Use the Vercel dashboard or CLI to promote/rollback to the previous known-good deployment. Do not reset the Git branch to roll back production unless the Git history itself is wrong; prefer reverting with a new commit so the release trail remains auditable.
