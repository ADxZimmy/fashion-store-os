# Release Lane

Fashion Store OS can keep moving even while the Git-connected Vercel project is on a free/Hobby setup.

## Current Constraint

- GitHub repository owner: `ADxZimmy`.
- Working branch: `codex/backend-foundation`.
- Production branch on the Git-connected Vercel project: `main`.
- Owner-authored pushes from `ADxZimmy` create Ready Vercel deployments.
- Collaborator-authored pushes can fail with `TEAM_ACCESS_REQUIRED` on the Vercel Hobby project.

Production commits for this repo are authored under the owner's own account `ADxZimmy` so the Git-connected Vercel project deploys automatically. The Vercel block keys off the commit author, so commits authored by the collaborator account (`NnazimuzoO`) are rejected with `TEAM_ACCESS_REQUIRED` even when the push succeeds. This workspace's git author is set (repo-local) to `ADxZimmy`; both `ADxZimmy` and `NnazimuzoO` are accounts owned by the same operator, so this is a legitimate identity choice, not third-party authorship spoofing. Pushes go to `main` (and the working branch) on every change.

## Workspace Model

The app is multi-tenant per device. Each browser generates a random workspace id and sends it as the `x-workspace-id` header; the API scopes every read/write to that workspace, so each device/tester is isolated. `FASHION_STORE_WORKSPACE_ID` is now only the **fallback default** workspace used when no header is present (e.g. provider webhooks and `/api/health` diagnostics) — it is not the workspace real users land in. A workspace supports multiple managers and up to 25 users.

## Development Flow

1. Build and test locally with the current Supabase-backed development setup.
2. Commit normal work to `codex/backend-foundation`.
3. Push the branch to GitHub for review/handoff.
4. Run `npm.cmd run release:preflight` before an owner release handoff.
5. `ADxZimmy` merges or cherry-picks the ready branch into `main` from the owner-authorized account.
6. Confirm the Git-connected Vercel project still has the Supabase production env vars added during the 2026-06-29 owner activation.
7. Verify `/api/health`, auth/session flow, state write/read, webhook intake, and reset/cleanup after deployment.

## Owner Release Checklist

- Worktree is clean.
- `npm.cmd run check` passes.
- `npm.cmd run build` passes.
- Migrations in `supabase/migrations/` have been applied to the owner Supabase project.
- Vercel production env vars are present:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `FASHION_STORE_WORKSPACE_ID` (fallback default only — real workspaces are per-device via the `x-workspace-id` header)
  - `CHANNEL_WEBHOOK_VERIFY_TOKEN`
  - `CHANNEL_WEBHOOK_SECRET`
  - `CHANNEL_WEBHOOK_REQUIRE_SIGNATURE`
  - `CHANNEL_WEBHOOK_MAX_MESSAGES`
- `/api/health` reports `storage: "supabase"` on `https://fashion-store-os.vercel.app` and the Git-connected project alias.
- `npm.cmd run release:preflight` reports a clean worktree and warns if the latest commit is not owner-authored.

## Rollback

Use the Vercel dashboard or CLI to promote/rollback to the previous known-good deployment. Do not reset the Git branch to roll back production unless the Git history itself is wrong; prefer reverting with a new commit so the release trail remains auditable.
