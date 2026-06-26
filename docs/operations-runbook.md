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
- Check Function activity for `/api/bootstrap`, `/api/state`, `/api/session`, `/api/channel-webhook`, `/api/data`, `/api/health`, and `/api/readiness`.
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
