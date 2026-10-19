# Release Lane

Last updated: 2026-10-19

How a change gets from this repo to production.

## Constraints

- GitHub repository owner: `ADxZimmy`.
- One branch, `main`: the working branch, the GitHub default, and the production branch of the Git-connected Vercel project. **Every push to `main` is a production release.**
- The Vercel project is on the Hobby plan, which deploys only commits authored by the project owner. Commits authored by the collaborator account (`NnazimuzoO`) are refused with `TEAM_ACCESS_REQUIRED` even when the push succeeds. Both accounts belong to the same operator, so authoring as `ADxZimmy` is an identity choice, not spoofing a third party.
- The Hobby plan also refuses a deployment with more than **12 functions**. With no framework, every file in `api/` not starting with `_` is one function. A guard in `scripts/test-local-first.js` fails at 13; that is why the four retired endpoints share `api/retired.js` through `vercel.json` rewrites.
- Functions run in one region, Frankfurt (`fra1`), next to the database (`vercel.json`).

### Commit author

Commits in this repo must be authored as `ADxZimmy`. The main checkout (`F:\Fashion Store OS`) has had this as its repo-local identity since 2026-10-19, so a plain `git commit` there is owner-authored. A fresh clone or another machine starts with the global identity, whose deploys would be refused, so set it once there:

```bash
git config --local user.name ADxZimmy && git config --local user.email 84815694+ADxZimmy@users.noreply.github.com
```

`npm.cmd run release:preflight` warns when the latest commit is not owner-authored.

## What A Release Ships

Since Phase 021, business records live on each device and the server database is Neon Postgres, holding identity, encrypted backups, and the message inbox. A release is static files plus serverless functions. Its build also applies any new schema file in `db/migrations/` to Neon before the deployment goes live, so code never runs ahead of the schema it needs. Background: `docs/production-persistence.md`.

## Development Flow

1. Work locally: `npm.cmd run dev` starts the app on an embedded Postgres under `data/pglite/`, running the same SQL as production. No Neon account or `DATABASE_URL` is needed.
2. Run `npm.cmd run launch:check`. It covers syntax, every test suite (the server ones on embedded Postgres), the UX and security audits, and the build.
3. For changes a browser can show, check them in a browser against `npm.cmd run dev`. The suites cannot see everything: the first browser session found ten defects they had passed.
4. Commit to `main` as `ADxZimmy`.
5. Run `npm.cmd run release:preflight` **before** pushing. The push is the release.
6. Push. Vercel builds and promotes to production; CI (`.github/workflows/ci.yml`) runs the launch gates on the same commit. CI does not block the deploy, so a red run on `main` means a release to fix or roll back.
7. After the deploy: `/api/health` and `/api/readiness`, then `docs/production-smoke.md` for changes touching sign-in, storage, backup, or the inbox.

For work not ready to deploy, use a short-lived branch (as `phase-021-release-a` is for Phase 021) and fast-forward it into `main` when it passes. `main` is the trunk; do not keep long-running branches.

## Owner Release Checklist

- Worktree clean; `npm.cmd run launch:check` and `npm.cmd run release:preflight` pass.
- Vercel production environment variables present (values never in the repo):
  - `DATABASE_URL`, set by the Neon integration: unprefixed, Production only
  - `CRON_SECRET`
  - For channel intake: `FASHION_STORE_INBOX_STORE_ID`, `CHANNEL_WEBHOOK_VERIFY_TOKEN`, `CHANNEL_WEBHOOK_SECRET`, `CHANNEL_WEBHOOK_REQUIRE_SIGNATURE=1`, optionally `CHANNEL_WEBHOOK_MAX_MESSAGES`
- The build log shows a `db-migrate:` line, and the deployment is Ready.
- `/api/health` on `https://fashion-store-os.vercel.app` reports `ok: true` and `storage: "postgres"`.

The `SUPABASE_*` and `FASHION_STORE_WORKSPACE_ID` variables are unused since Phase 021 and are removed in Release B, when the legacy Supabase project is decommissioned.

## Rollback

Promote the previous known-good deployment in Vercel. Do not reset the Git branch; revert with a new commit so the release trail stays auditable. Schema changes are forward-only: add a new migration rather than editing an applied one.

One exception: the first Phase 021 deployment's predecessor is the pre-pivot build, which works only while the legacy Supabase project is active and runs the old model. For that release, prefer fixing forward. See `docs/cutover.md`, Rollback.
