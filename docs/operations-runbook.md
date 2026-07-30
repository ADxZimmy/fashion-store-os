# Fashion Store OS Operations Runbook

Last updated: 2026-06-26

## Release Lane

- Owner lane: `ADxZimmy` pushes or merges the GitHub branch that the free Vercel project deploys from.
- Collaborator lane: continue building locally and pushing to GitHub for review. Do not spoof commit authorship to bypass Vercel Hobby permissions.
- Before owner release:
  - Run `npm.cmd run launch:check`.
  - Run `npm.cmd run release:preflight` after the release commit is clean.
  - Confirm `/api/readiness` on the target deployment.

## Health And Readiness

- `/api/health` checks whether the storage layer is reachable.
- `/api/readiness` checks whether production prerequisites are present without exposing secrets.
- `/api/keepalive` is the daily Vercel Cron target. It runs the same storage probe as `/api/health`, but returns `503` instead of `200` when the probe fails.

Note that `/api/readiness` reports configuration, not connectivity. It returns `ok: true` whenever the env vars are present, even if the database behind them is unreachable — on 2026-07-30 readiness was green while `/api/health` reported `supabase-unreachable`. Always read `/api/health` (or the cron result) for liveness.

- A production-ready response should show:
  - production storage configured,
  - server-side Supabase key preferred,
  - valid workspace id,
  - webhook signatures required,
  - owner release lane set to `ADxZimmy`.

## Vercel Observability

Use Vercel's project dashboard after each owner release:

- Check Deployment status is Ready.
- Review Runtime Logs for 5xx errors after smoke tests.
- Check Function activity for `/api/bootstrap`, `/api/state`, `/api/session`, `/api/channel-webhook`, `/api/data`, `/api/health`, `/api/keepalive`, and `/api/readiness`.
- Check the Cron Jobs tab. A failed `/api/keepalive` invocation means production storage is unreachable — treat it as an incident, not a cron glitch.
- Keep in mind that log retention depends on the Vercel plan; Vercel documents Runtime Logs and Observability at:
  - https://vercel.com/docs/logs/runtime
  - https://vercel.com/docs/observability

Smoke checks:

```powershell
Invoke-RestMethod https://YOUR-DEPLOYMENT/api/health
Invoke-RestMethod https://YOUR-DEPLOYMENT/api/readiness
```

## Supabase Storage Operations

Owner-side production env vars:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or another server-side Supabase key supported by `api/_store.js`
- `FASHION_STORE_WORKSPACE_ID`
- `CHANNEL_WEBHOOK_REQUIRE_SIGNATURE=1` before real provider traffic

Supabase security requirements:

- Keep Row Level Security enabled on exposed tables.
- Use explicit grants and policies from `supabase/migrations/`.
- Prefer server-side keys in Vercel API routes; public key fallback is for temporary diagnostics only.
- Supabase API/RLS guidance:
  - https://supabase.com/docs/guides/api/securing-your-api

### Keeping The Project Warm

Supabase free-tier projects pause after roughly 7 days without activity, and a paused project stops resolving in DNS — the app then reports `storage: "supabase-unreachable"` even though every Vercel env var is still correct. This is what happened between the 2026-06-29 activation and 2026-07-30, when the project sat idle waiting on pilot UAT.

A daily Vercel Cron calls `/api/keepalive`, which issues a real Supabase query and resets the pause timer:

```json
"crons": [{ "path": "/api/keepalive", "schedule": "0 6 * * *" }]
```

- Daily is deliberate. The Vercel Hobby plan permits one invocation per day per job, which still leaves ~7x margin against the pause window.
- Set `CRON_SECRET` in Vercel project env vars to restrict the route. Vercel sends it automatically as `Authorization: Bearer $CRON_SECRET` on cron invocations. If `CRON_SECRET` is unset the route stays open, matching `/api/health`.
- The cron only prevents *idle* pauses. It does not revive an already-paused or deleted project, and it does not substitute for the plan's backup guidance below.
- Vercel Cron docs: https://vercel.com/docs/cron-jobs

## Backups And Restore Rehearsal

Supabase backup guidance is plan-dependent. Current docs cover daily backups and Point-in-Time Recovery:

- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/deployment/going-into-prod

Minimum production routine:

1. Confirm automatic backups are enabled for the production project.
2. Record the backup retention available on the current Supabase plan.
3. Before launch, rehearse restore using non-production data or a cloned/restored project where the plan allows it.
4. After restore, run migrations and check `/api/health`, `/api/readiness`, signup/session, state write/read, and reset/export behavior.
5. Record the restore date, operator, source backup, target project, and outcome outside this repo if it includes customer data.

Do not place database dumps, customer records, service keys, or recovery passwords in this repository or `.planning/`.

## Secret Rotation

Rotate secrets when a maintainer leaves, a token may have leaked, or a provider credential changes.

1. Create replacement Supabase/service/provider secret.
2. Add it to the Vercel project environment variables.
3. Trigger an owner release or redeploy from the Vercel dashboard.
4. Verify `/api/health`, `/api/readiness`, auth/session, and webhook smoke tests.
5. Revoke the old secret only after the new deployment passes.

## API Abuse Controls

Current controls:

- Request body limit in `api/_response.js`.
- Manager-gated data export in `api/data.js`.
- Optional signature-required mode for provider webhooks.
- Webhook batch limit and dedupe in the channel webhook layer.
- Auth/session cookies are HttpOnly in server-backed environments.

Before real provider traffic:

- Set `CHANNEL_WEBHOOK_REQUIRE_SIGNATURE=1`.
- Configure provider secret env vars.
- Send a valid signed test event.
- Confirm unsigned events fail.

## Incident Checklist

1. Capture the deployment URL, commit, timestamp, and failing route.
2. Check `/api/health` and `/api/readiness`.
3. Review Vercel Runtime Logs for 5xx errors.
4. If storage is unhealthy, check Supabase project status, env vars, and migrations.
5. If data was changed incorrectly, stop writes, export evidence through the manager-gated API, and restore from the chosen backup path.
6. Roll back to the prior known-good owner deployment if needed.
