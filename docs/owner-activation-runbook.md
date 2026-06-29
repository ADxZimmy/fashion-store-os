# Owner Activation Runbook — Phase 008

Audience: `ADxZimmy` (Vercel/Supabase/GitHub owner). Goal: make the **Git-connected** Vercel project persist to Supabase so `/api/health` reports `storage: "supabase"`. This is the one prerequisite that unblocks the Phase 017 production cutover.

Time: ~15-20 minutes. You need owner access to the Vercel project, the Supabase project, and the GitHub repo. Do all of this from your own owner account — do not ask a collaborator to run it (their pushes/deploys are blocked by `TEAM_ACCESS_REQUIRED` on Hobby).

Status: completed on 2026-06-29. The old target `duimatbeahwfeghcviju` returned a Supabase 403 for this owner account, so the Git-connected production lane was activated against the accessible owner project `fashion-store` (`elkpberfbhwbrkawklnk`).

## Targets

| Thing | Value |
| --- | --- |
| Git-connected Vercel project | `sanuske2-2147s-projects/fashion-store-os` |
| Vercel project ID | `prj_3oNJjdlNXi5yTKkqenDEzY2jVELi` |
| Production branch | `main` |
| Supabase project | `fashion-store` |
| Supabase ref | `elkpberfbhwbrkawklnk` |
| Supabase URL | `https://elkpberfbhwbrkawklnk.supabase.co` |
| Supabase region | `eu-west-3` |

> Verify the Supabase project is **Active** before starting (it has gone `INACTIVE` before — see `docs/production-persistence.md`). Supabase dashboard → project should show "Active / Healthy".

## Step 1 — Apply database migrations to the owner Supabase project

Three migration files must be applied (idempotent; safe to re-run):

```text
supabase/migrations/20260611160501_create_fashion_store_os_documents.sql
supabase/migrations/20260611163000_allow_default_workspace_document_api_access.sql
supabase/migrations/20260626191000_harden_workspaces_audit_and_channel_events.sql
```

Pick one path:

- **Dashboard (no CLI):** Supabase → SQL Editor → paste each file's contents in order → Run. Then Database → Tables and confirm `fashion_store_os_documents`, `fashion_store_os_workspaces`, `fashion_store_os_audit_events`, and `fashion_store_os_channel_delivery_events` exist with RLS enabled.
- **CLI:** `npx supabase link --project-ref elkpberfbhwbrkawklnk --yes` then `npx supabase db push`.

## Step 2 — Get the Supabase service-role key

Supabase → Project Settings → API → **`service_role` secret** (NOT the anon/publishable key). Treat it like a password. The app's storage helper prefers, in order: `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SECRET_KEY` → `SUPABASE_SERVICE_KEY` → `SUPABASE_REST_API_KEY`. Use `SUPABASE_SERVICE_ROLE_KEY`.

## Step 3 — Set production env vars on the Git-connected Vercel project

These are the variables the serverless API reads. Set them on the **`sanuske2-2147s-projects/fashion-store-os`** project for the **Production** environment.

| Variable | Value | Required |
| --- | --- | --- |
| `SUPABASE_URL` | `https://elkpberfbhwbrkawklnk.supabase.co` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role secret from Step 2 | Yes |
| `FASHION_STORE_WORKSPACE_ID` | `default` | Yes (fallback only) |
| `CHANNEL_WEBHOOK_REQUIRE_SIGNATURE` | `1` | Recommended (fail closed) |
| `CHANNEL_WEBHOOK_SECRET` | your webhook HMAC secret | If using webhooks |
| `CHANNEL_WEBHOOK_VERIFY_TOKEN` | your provider challenge token | If using webhooks |
| `CHANNEL_WEBHOOK_MAX_MESSAGES` | `25` (default if omitted) | Optional |

Do **not** set `FASHION_STORE_ALLOW_PUBLIC_SUPABASE_KEY` — the production lane must use the server-side service-role key, not a public key.

> Note: the app is multi-tenant per device. Each browser generates its own workspace id and sends it as the `x-workspace-id` header; the API scopes data to that workspace. `FASHION_STORE_WORKSPACE_ID` is only the fallback default (used for `/api/health` and provider webhooks), not the workspace real users land in. No per-tenant configuration is required.

Pick one path:

- **Dashboard:** Vercel → project → Settings → Environment Variables → add each for the Production environment.
- **CLI:** link, then add each (you'll be prompted for the value; select **Production**):

  ```powershell
  vercel link --project fashion-store-os --scope sanuske2-2147s-projects
  vercel env add SUPABASE_URL production
  vercel env add SUPABASE_SERVICE_ROLE_KEY production
  vercel env add FASHION_STORE_WORKSPACE_ID production
  vercel env add CHANNEL_WEBHOOK_REQUIRE_SIGNATURE production
  # plus CHANNEL_WEBHOOK_SECRET / CHANNEL_WEBHOOK_VERIFY_TOKEN if using webhooks
  ```

Confirm with `vercel env ls` (should no longer be empty).

## Step 4 — Redeploy so the new env vars take effect

Env var changes do **not** apply to existing deployments. Trigger a fresh production build:

- **Simplest:** push an owner-authored commit to `main` (the branch is promoted from `codex/backend-foundation`). Vercel auto-deploys.
- **Or CLI:** `vercel --prod --scope sanuske2-2147s-projects`.
- **Or dashboard:** Deployments → latest → Redeploy.

## Step 5 — Verify persistence is live (the gate)

```powershell
Invoke-RestMethod https://fashion-store-os-sanuske2-2147s-projects.vercel.app/api/health
```

Expected:

```json
{ "ok": true, "storage": "supabase", "supabaseHost": "elkpberfbhwbrkawklnk.supabase.co", "workspace": "default" }
```

Then confirm a real round-trip: open the live URL, complete manager signup + workspace setup, refresh, and confirm the workspace persists. Open it in a second browser to confirm it is server-backed, not local.

Troubleshooting:

- `storage: "unconfigured"` → env vars not set on **this** project or you redeployed before saving them. Recheck Step 3, redeploy.
- `storage: "supabase-unreachable"` (HTTP 200, `ok: false`) → Supabase project is down/inactive or the URL/key is wrong. Check the Supabase project status first (Step 0 note), then the key.

## Done — handoff back to Phase 017

When `/api/health` is green on the Git-connected deployment, Phase 008 is complete. This was verified on 2026-06-29 on the deployment URL, the project alias, and `https://fashion-store-os.vercel.app`; a temporary manager/signup state round-trip and cleanup also passed. Proceed to real-store pilot UAT, then Phase 017: tag the release, add the custom domain, and point DNS **only after** this health check passes on the final target.
