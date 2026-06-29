# Production Persistence

Fashion Store OS now has Vercel serverless API routes for production persistence.

## Current Production Setup

- Previously verified Vercel production project: `nnazimuzoos-projects/fashion-store-os`
- Previously verified live URL: `https://fashion-store-os-navy.vercel.app`
- Git-connected Vercel project in this workspace: `sanuske2-2147s-projects/fashion-store-os`
- Git-connected production alias: `https://fashion-store-os-sanuske2-2147s-projects.vercel.app`
- Current public Vercel alias: `https://fashion-store-os.vercel.app`
- Git-connected project ID: `prj_3oNJjdlNXi5yTKkqenDEzY2jVELi`
- Inspect the current Git-triggered production deployment with `vercel inspect https://fashion-store-os.vercel.app` or `vercel ls fashion-store-os --scope sanuske2-2147s-projects`.
- Supabase project: `fashion-store`
- Supabase ref: `elkpberfbhwbrkawklnk`
- Supabase URL: `https://elkpberfbhwbrkawklnk.supabase.co`
- Region: `eu-west-3`

## Runtime Shape

- Browser app keeps calling the existing API contract:
  - `GET /api/health`
  - `GET /api/bootstrap`
  - `GET /api/state`
  - `PUT /api/state`
  - `GET /api/auth`
  - `GET /api/session`
  - `POST /api/session`
  - `DELETE /api/data`
  - `GET /api/inbound`
  - `POST /api/inbound`
  - `GET /api/channel-webhook`
  - `POST /api/channel-webhook`
  - `GET /api/data`
- Local development can still run `npm.cmd start` and use `server.js` with JSON files under `data/`.
- Vercel production uses files under `api/` and stores documents in Supabase.

## Supabase Schema

The schema lives in:

```text
supabase/migrations/20260611160501_create_fashion_store_os_documents.sql
supabase/migrations/20260611163000_allow_default_workspace_document_api_access.sql
supabase/migrations/20260626191000_harden_workspaces_audit_and_channel_events.sql
```

It creates:

- `public.fashion_store_os_documents`, the compatibility document table keyed by:
  - `workspace_id`
  - `document_key`, currently `state` or `auth`
- `public.fashion_store_os_workspaces`, the workspace registry used before document writes.
- `public.fashion_store_os_audit_events`, the normalized audit-event table for the next account-lifecycle storage step.
- `public.fashion_store_os_channel_delivery_events`, the normalized channel delivery log table for webhook rollout.

RLS is enabled. The newer migration follows Supabase's 2026 explicit-grants direction: new production tables grant access to `service_role` and revoke `anon` / `authenticated`. The original document-table grant remains for compatibility with already-running deployments until they switch to a server-only key.

Recovery note: on 2026-06-25 the earlier Supabase project `duimatbeahwfeghcviju` was found `INACTIVE`, restored, and the committed migrations were reapplied for the older deployment lane. On 2026-06-29 that ref returned a 403 privilege error from this owner workspace, so the Git-connected production lane was activated against `elkpberfbhwbrkawklnk`. If the API host returns DNS failures or Cloudflare upstream errors again, check the active project's status before changing application code.

## Vercel Environment Variables

These are required on any Vercel production project that serves the serverless APIs. On 2026-06-29 the Git-connected `sanuske2-2147s-projects/fashion-store-os` project was updated with the required production env vars for Supabase persistence:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
FASHION_STORE_WORKSPACE_ID
CHANNEL_WEBHOOK_REQUIRE_SIGNATURE
CHANNEL_WEBHOOK_MAX_MESSAGES
```

Provider-specific webhook secrets are optional until a real WhatsApp/Instagram/provider app is connected:

```text
CHANNEL_WEBHOOK_VERIFY_TOKEN
CHANNEL_WEBHOOK_SECRET
```

`FASHION_STORE_WORKSPACE_ID` can stay `default` until the app has a multi-workspace model.

`CHANNEL_WEBHOOK_VERIFY_TOKEN` and `CHANNEL_WEBHOOK_SECRET` are optional for local testing but should be set for production webhook subscriptions. The verify token is used for provider challenge checks. The secret verifies `x-hub-signature-256` or `x-fashion-signature` HMAC SHA-256 signatures over the raw request body. Set `CHANNEL_WEBHOOK_REQUIRE_SIGNATURE=1` in production so a missing signing secret fails closed. `CHANNEL_WEBHOOK_MAX_MESSAGES` defaults to `25` and caps one webhook batch.

Use `SUPABASE_SERVICE_ROLE_KEY` for the Vercel/server runtime. Keep it server-side only in Vercel. Do not expose it in frontend code or with a public env var prefix.

`SUPABASE_REST_API_KEY` remains supported as a legacy server-side variable. A public/publishable-key fallback is disabled unless `FASHION_STORE_ALLOW_PUBLIC_SUPABASE_KEY=1` is set deliberately for an existing deployment. Do not use that fallback for the production-ready lane.

## Verification

Useful verification commands:

```powershell
Invoke-RestMethod https://fashion-store-os.vercel.app/api/health
Invoke-RestMethod https://fashion-store-os.vercel.app/api/bootstrap
Invoke-RestMethod https://fashion-store-os-sanuske2-2147s-projects.vercel.app/api/health
```

Expected:

- `/api/health` returns `ok: true`, `storage: "supabase"`, the redacted `supabaseHost`, and `workspace: "default"`.
- `/api/bootstrap` returns sanitized auth and only returns state when no accounts exist or the request has a valid session cookie.
- `/api/session` handles manager signup, signin, signout, and manager-gated staff access changes with HttpOnly cookies.
- `/api/inbound` requires a session when accounts exist.
- `/api/channel-webhook` accepts signed provider payloads, deduplicates normalized messages, records delivery status in state, and appends accepted messages to `state.channelMessages`. Its GET route answers provider challenge checks but does not expose the message queue.
- `GET /api/data` is manager-gated and returns a sanitized workspace export for backup/review. It excludes password hashes and session-token hashes.
- Creating a manager/profile in the live app persists after refresh and across browsers.

If storage is unreachable, `/api/health` still returns HTTP 200 with `ok: false` and `storage: "supabase-unreachable"` so monitors and humans can distinguish an app outage from an upstream Supabase issue.

Latest verification:

- Supabase CLI owner auth succeeded on 2026-06-29.
- Active owner Supabase project is `fashion-store` (`elkpberfbhwbrkawklnk`) in `eu-west-3`.
- Old target `duimatbeahwfeghcviju` returned a Supabase 403 for this owner workspace and is retained here only as historical recovery context.
- `npx supabase db push` applied the document, default-workspace API, and workspace/audit/channel-delivery migrations to `elkpberfbhwbrkawklnk`.
- Vercel production env vars are present on the Git-connected project; secret values are not stored in the repo.
- Vercel production deployment is Ready on the Git-connected project.
- Current verified production aliases: `https://fashion-store-os.vercel.app` and `https://fashion-store-os-sanuske2-2147s-projects.vercel.app`.
- Live `/api/health` returns `ok: true`, `storage: "supabase"`, `supabaseHost: "elkpberfbhwbrkawklnk.supabase.co"`, and `workspace: "default"`.
- Live activation smoke passed on 2026-06-29: temporary manager signup, state write/read, manager export, cleanup, and final empty bootstrap.
- Supabase document state/auth records were clean after smoke-test cleanup.

## Deployment Caveat

GitHub-triggered deployment is wired to the Git-connected project and `main` is the production branch. Pushes to `main` create Vercel production deployments. A verified owner-authored GitHub deployment with Supabase persistence active is Ready:

```text
Inspect: vercel inspect https://fashion-store-os.vercel.app
State: READY on latest production deployment
Author: ADxZimmy
```

Collaborator-authored GitHub deploys remain blocked. The Vercel API maps `NnazimuzoO` to Vercel user `nnazimuzoo`, but `nnazimuzoo` is not a confirmed member of the Vercel team/project. Attempting to invite `nnazimuzoo@nitechsoftware.com.ng` failed because the project team is on Vercel Hobby, which does not permit team members. Resolve this by upgrading/enabling collaboration, moving the project to an account/team that can include the commit authors, or making production Git commits from a Vercel owner/member account with contributing access.

Before retiring the older local/CLI deployment, run the pilot UAT script against the Git-connected deployment and keep `/api/health` green on the final public alias.
