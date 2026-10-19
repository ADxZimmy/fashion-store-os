# Owner Activation Runbook

Last updated: 2026-10-19

Audience: `ADxZimmy`, the owner of the Vercel project. Goal: connect a Neon Postgres database to the Git-connected Vercel project, so the first Phase 021 production build can apply the schema and `/api/health` reports `storage: "postgres"`. This is Prerequisite 1 of `docs/cutover.md`.

Time: about 10 minutes. Do it from the owner account: the Vercel project belongs to it, and on the Hobby plan deploys of collaborator-authored commits are refused with `TEAM_ACCESS_REQUIRED`.

Status as of 2026-10-19: **done.** The database exists and answers: the app's own database code ran against it read-only, and its role may create tables. After one redo (the first connection had a variable prefix and included Preview), `vercel env ls` lists `DATABASE_URL` and the other standard names for Production only, and their values are write-only secrets: `vercel env run` receives them empty. Production still runs the pre-pivot build on the paused Supabase project until Release A.

## Targets

| Thing | Value |
| --- | --- |
| Git-connected Vercel project | `sanuske2-2147s-projects/fashion-store-os` |
| Vercel project ID | `prj_3oNJjdlNXi5yTKkqenDEzY2jVELi` |
| Production branch | `main` |
| Public URL | `https://fashion-store-os.vercel.app` |
| Vercel storage resource | `neon-champagne-river` |
| Neon project | `steep-smoke-31370127`, in a Neon organization managed by Vercel. Open it from Vercel; a separate Neon login cannot see it. |
| Region | Frankfurt, `aws-eu-central-1`. Functions are pinned to `fra1` to match (Step 1). |
| Database | `neondb` on PostgreSQL 18.6 |

## What Happens Where

Connecting Neon only stores configuration. Nothing changes for users until the Phase 021 build is pushed to `main`: that build runs `scripts/db-migrate.js`, which creates the tables from `db/migrations/` before the deployment goes live. The pre-pivot build currently in production never reads `DATABASE_URL`, so adding it is safe at any time.

## Step 1: Choose the region (done)

Every API request makes several database round trips, so the functions belong in the same region as the database; the distance between them costs more than the distance to the user.

The database is in Frankfurt, which suits a shop in West Africa better than Vercel's US East default. `vercel.json` pins the functions to Frankfurt (`fra1`) to match, overriding the dashboard's Function Region setting, and a guard test keeps the pin in place. A Neon database cannot move region without a migration, so if the functions ever move, the database has to move with them.

## Step 2: Create the database from Vercel

1. Vercel, project, **Storage**, create a database and choose **Neon** (listed with the marketplace database providers). Accept Neon's terms as the owner.
2. Plan: **Free**. Region: the one matching Step 1.
3. Connect it to this project for the **Production** environment. Development is not needed: local development runs on an embedded database. Leave **Preview** unconnected (see Preview deployments below).
4. If the dialog offers an environment variable prefix, make sure it is **empty**. The app reads `DATABASE_URL`, falling back to `POSTGRES_URL`; a prefixed name is never read, and the production build would fail. The first connection, on 2026-10-19, came out as `NEON_FASHION_STORE_DATABASE_URL` and so on.

## Fixing The Connection

Needed if the variables ever come out prefixed or reach Preview, as the first connection did on 2026-10-19.

1. Vercel, project, **Storage**, `neon-champagne-river`. Remove **this project's connection** only. Do **not** delete the database itself, which is a separate action.
2. Connect the project again: **Production** only, the **Custom Prefix** field **empty**. Marking the variables **Sensitive** in the advanced options is recommended; the current connection's values are write-only, which is what that option gives.
3. Check the result with `vercel env ls`: `DATABASE_URL` is listed for Production only, and no prefixed names remain. If any survive the disconnect, delete them under Settings, Environment Variables.

The database is untouched by this. Neon Auth, which the integration enabled on the database, stays as it is; the app does not use it.

Because the variables are secrets, `vercel env pull` and `vercel env run` receive them empty: only deployments can read them. To query the database by hand, use the Neon console (Step 4).

## Step 3: Confirm the configuration

Vercel, project, Settings, Environment Variables:

- `DATABASE_URL` is present for Production, unprefixed, and not for Preview (the integration adds several related variables too; they are harmless).
- `CRON_SECRET` is still present (set since 2026-08-02). The daily `/api/maintenance` cron needs it.

Never copy the connection string into the repo, an issue, or `.planning/`.

## Step 4: Note the restore window

From Vercel, Storage, open the database in the Neon console and note how far back it can be restored (Neon's history retention or restore window setting). It bounds a restore by branching from a timestamp (`docs/operations-runbook.md`, Backups And Recovery). The other Neon projects on this account show 6 hours; confirm this one.

## Step 5: Release

Continue with `docs/cutover.md`. On the first Phase 021 production build, the build log shows:

```text
db-migrate: production database at <host>
db-migrate: applied 0001_identity (<n> statements)
db-migrate: applied 1 of 1 migrations.
```

Later builds show `db-migrate: schema up to date`. Then `/api/health` returns `ok: true` and `storage: "postgres"`. The app's database code already ran against this database from a local machine on 2026-10-19 (read-only); the first build proves it from Vercel's functions.

## Troubleshooting

| Symptom | Meaning | Fix |
| --- | --- | --- |
| Build fails with `db-migrate: DATABASE_URL is not set` | Neon is not connected to Production, or the variables were given a prefix. | Fixing The Connection, then Step 3, then redeploy. A failed build never goes live, so users saw nothing. |
| Build fails with `db-migrate: failed.` | The database refused or did not answer. | Check the database's status in the Neon console; reconnect the integration if the credentials changed. |
| `/api/health` says `unconfigured` after a good build | `DATABASE_URL` was removed or renamed since that build. | Restore it and redeploy. |
| `/api/health` says `database-unreachable` | Neon is down, or the Free plan's monthly compute ran out. | Neon console: project status and usage. Signed-in devices keep working offline meanwhile. |

## Preview Deployments

Preview builds skip migrations unless `DB_MIGRATE_ON_PREVIEW=1`. A preview connected to the production database would run unreviewed code against real accounts, so leave Preview unconnected: previews then report `storage: "unconfigured"` and cannot sign in, which is fine for checking layout. If working previews are wanted later, enable Neon's per-preview database branches for Preview and set `DB_MIGRATE_ON_PREVIEW=1` for the Preview environment only. Never point Preview at the production database.

## History

This runbook previously activated Supabase for Phase 008. On 2026-06-29 the owner connected the Supabase project `fashion-store` (`elkpberfbhwbrkawklnk`, eu-west-3) to this Vercel project, and `/api/health` reported `storage: "supabase"`. That project paused for inactivity on 2026-07-30 and again on 2026-10-02; the second pause is why Phase 021 moved the server database to Neon. The legacy project is decommissioned in Release B, after Phase 021 UAT item 11. Details: `docs/production-persistence.md`.
