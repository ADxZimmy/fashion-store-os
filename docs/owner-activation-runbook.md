# Owner Activation Runbook

Last updated: 2026-10-19

Audience: `ADxZimmy`, the owner of the Vercel project. Goal: connect a Neon Postgres database to the Git-connected Vercel project, so the first Phase 021 production build can apply the schema and `/api/health` reports `storage: "postgres"`. This is Prerequisite 1 of `docs/cutover.md`.

Time: about 10 minutes. Do it from the owner account: the Vercel project belongs to it, and on the Hobby plan deploys of collaborator-authored commits are refused with `TEAM_ACCESS_REQUIRED`.

Status as of 2026-10-19: **not done.** No Neon database is connected yet, and production still runs the pre-pivot build on the paused Supabase project.

## Targets

| Thing | Value |
| --- | --- |
| Git-connected Vercel project | `sanuske2-2147s-projects/fashion-store-os` |
| Vercel project ID | `prj_3oNJjdlNXi5yTKkqenDEzY2jVELi` |
| Production branch | `main` |
| Public URL | `https://fashion-store-os.vercel.app` |
| Neon database | Created in Step 2. Record its project name, id, and region in the Release A record in `docs/cutover.md`. |

## What Happens Where

Connecting Neon only stores configuration. Nothing changes for users until the Phase 021 build is pushed to `main`: that build runs `scripts/db-migrate.js`, which creates the tables from `db/migrations/` before the deployment goes live. The pre-pivot build currently in production never reads `DATABASE_URL`, so adding it is safe at any time.

## Step 1: Check the function region

Vercel, project, Settings, Functions: note the **Function Region**. Every API request makes several database round trips, so the database belongs in the same region as the functions; the distance between them costs more than the distance to the user.

If the shop is far from that region (for example in West Africa, with functions on Vercel's US East default), consider moving both to Europe, for example Vercel `fra1` with Neon's Frankfurt region. Decide before Step 2: a Neon database cannot move region later without a migration.

## Step 2: Create the database from Vercel

1. Vercel, project, **Storage**, create a database and choose **Neon** (listed with the marketplace database providers). Accept Neon's terms as the owner.
2. Plan: **Free**. Region: the one matching Step 1.
3. Connect it to this project for the **Production** environment. Development is not needed: local development runs on an embedded database. Leave **Preview** unconnected (see Preview deployments below).
4. If the dialog offers an environment variable prefix, leave it **empty**. The app reads `DATABASE_URL`, falling back to `POSTGRES_URL`; a prefixed name such as `STORAGE_DATABASE_URL` is never read, and the production build would fail.

## Step 3: Confirm the configuration

Vercel, project, Settings, Environment Variables, Production:

- `DATABASE_URL` is present (the integration may add several related variables too; they are harmless).
- `CRON_SECRET` is still present (set since 2026-08-02). The daily `/api/maintenance` cron needs it.

Never copy the connection string into the repo, an issue, or `.planning/`.

## Step 4: Note the database's settings

From Vercel, Storage, open the database in the Neon console:

- Note the project name, id, and region for the Release A record.
- Note how far back the database can be restored (Neon's history retention or restore window setting). It bounds a restore by branching from a timestamp (`docs/operations-runbook.md`, Backups And Recovery).

## Step 5: Release

Continue with `docs/cutover.md`. On the first Phase 021 production build, the build log shows:

```text
db-migrate: production database at <host>
db-migrate: applied 0001_identity (<n> statements)
db-migrate: applied 1 of 1 migrations.
```

Later builds show `db-migrate: schema up to date`. Then `/api/health` returns `ok: true` and `storage: "postgres"`, which closes the last unverified piece of the move to Neon: the production driver against a live database.

## Troubleshooting

| Symptom | Meaning | Fix |
| --- | --- | --- |
| Build fails with `db-migrate: DATABASE_URL is not set` | Neon is not connected to Production, or the variables were given a prefix. | Recheck Steps 2 and 3, then redeploy. A failed build never goes live, so users saw nothing. |
| Build fails with `db-migrate: failed.` | The database refused or did not answer. | Check the database's status in the Neon console; reconnect the integration if the credentials changed. |
| `/api/health` says `unconfigured` after a good build | `DATABASE_URL` was removed or renamed since that build. | Restore it and redeploy. |
| `/api/health` says `database-unreachable` | Neon is down, or the Free plan's monthly compute ran out. | Neon console: project status and usage. Signed-in devices keep working offline meanwhile. |

## Preview Deployments

Preview builds skip migrations unless `DB_MIGRATE_ON_PREVIEW=1`. A preview connected to the production database would run unreviewed code against real accounts, so leave Preview unconnected: previews then report `storage: "unconfigured"` and cannot sign in, which is fine for checking layout. If working previews are wanted later, enable Neon's per-preview database branches for Preview and set `DB_MIGRATE_ON_PREVIEW=1` for the Preview environment only. Never point Preview at the production database.

## History

This runbook previously activated Supabase for Phase 008. On 2026-06-29 the owner connected the Supabase project `fashion-store` (`elkpberfbhwbrkawklnk`, eu-west-3) to this Vercel project, and `/api/health` reported `storage: "supabase"`. That project paused for inactivity on 2026-07-30 and again on 2026-10-02; the second pause is why Phase 021 moved the server database to Neon. The legacy project is decommissioned in Release B, after Phase 021 UAT item 11. Details: `docs/production-persistence.md`.
