# Production Persistence

Fashion Store OS now has Vercel serverless API routes for production persistence.

## Current Production Setup

- Previously verified Vercel production project: `nnazimuzoos-projects/fashion-store-os`
- Previously verified live URL: `https://fashion-store-os-navy.vercel.app`
- Git-connected Vercel project in this workspace: `sanuske2-2147s-projects/fashion-store-os`
- Git-connected production alias: `https://fashion-store-os-sanuske2-2147s-projects.vercel.app`
- Git-connected project ID: `prj_3oNJjdlNXi5yTKkqenDEzY2jVELi`
- Verified Git-triggered deploy from setup can be inspected with `vercel inspect https://fashion-store-gnm1h1k6x-sanuske2-2147s-projects.vercel.app`
- Supabase project: `Fashion Store OS`
- Supabase ref: `duimatbeahwfeghcviju`
- Supabase URL: `https://duimatbeahwfeghcviju.supabase.co`
- Region: `us-east-1`

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
- Local development can still run `npm.cmd start` and use `server.js` with JSON files under `data/`.
- Vercel production uses files under `api/` and stores documents in Supabase.

## Supabase Schema

The schema lives in:

```text
supabase/migrations/20260611160501_create_fashion_store_os_documents.sql
supabase/migrations/20260611163000_allow_default_workspace_document_api_access.sql
```

It creates `public.fashion_store_os_documents`, a small JSON document table keyed by:

- `workspace_id`
- `document_key`, currently `state` or `auth`

RLS is enabled. The first migration revokes public access; the second migration grants tightly scoped document access for the default workspace so Vercel functions can use a server-side Supabase REST key.

Recovery note: on 2026-06-25 the Supabase project was found `INACTIVE`, restored, and the committed migrations were reapplied. If the API host returns DNS failures or Cloudflare upstream errors again, check the project status before changing application code.

## Vercel Environment Variables

These are required on any Vercel production project that serves the serverless APIs. They are set on the previously verified production deployment, but the Git-connected `sanuske2-2147s-projects/fashion-store-os` project currently has no environment variables (`vercel env ls` returned none on 2026-06-26):

```text
SUPABASE_URL
SUPABASE_REST_API_KEY
FASHION_STORE_WORKSPACE_ID
CHANNEL_WEBHOOK_VERIFY_TOKEN
CHANNEL_WEBHOOK_SECRET
```

`FASHION_STORE_WORKSPACE_ID` can stay `default` until the app has a multi-workspace model.

`CHANNEL_WEBHOOK_VERIFY_TOKEN` and `CHANNEL_WEBHOOK_SECRET` are optional for local testing but should be set for production webhook subscriptions. The verify token is used for provider challenge checks. The secret verifies `x-hub-signature-256` HMAC SHA-256 signatures over the raw request body.

When available, `SUPABASE_SERVICE_ROLE_KEY` can be used instead of `SUPABASE_REST_API_KEY`. Keep both server-side only in Vercel. Do not expose either value in frontend code or with a public env var prefix.

The current production `SUPABASE_REST_API_KEY` can be a Supabase publishable key because RLS and grants restrict access to `workspace_id = 'default'` and `document_key in ('state', 'auth')`. Prefer the publishable key over a service-role key unless a later server-only workflow needs elevated access.

## Verification

Useful verification commands:

```powershell
Invoke-RestMethod https://fashion-store-os-navy.vercel.app/api/health
Invoke-RestMethod https://fashion-store-os-navy.vercel.app/api/bootstrap
```

Expected:

- `/api/health` returns `ok: true`, `storage: "supabase"`, the redacted `supabaseHost`, and `workspace: "default"`.
- `/api/bootstrap` returns sanitized auth and only returns state when no accounts exist or the request has a valid session cookie.
- `/api/session` handles manager signup, signin, signout, and manager-gated staff access changes with HttpOnly cookies.
- `/api/inbound` requires a session when accounts exist.
- `/api/channel-webhook` accepts signed provider payloads and appends normalized messages to `state.channelMessages`.
- Creating a manager/profile in the live app persists after refresh and across browsers.

If storage is unreachable, `/api/health` still returns HTTP 200 with `ok: false` and `storage: "supabase-unreachable"` so monitors and humans can distinguish an app outage from an upstream Supabase issue.

Latest verification:

- Supabase project is active and healthy after the 2026-06-25 restore.
- Both migrations have been reapplied to the restored project.
- Supabase security and performance advisors reported no lints after recovery.
- Vercel production deployment is Ready.
- Current verified production alias: `https://fashion-store-os-navy.vercel.app`.
- Live `/api/health` returns `ok: true`, `storage: "supabase"`, `supabaseHost: "duimatbeahwfeghcviju.supabase.co"`, and `workspace: "default"`.
- Live API write/read/delete test passed through the production URL on 2026-06-25.
- Live `/api/inbound` post/read/bootstrap/cleanup test passed on 2026-06-25 after confirming the workspace was empty.
- Live session signup, protected state write, webhook append, authenticated bootstrap read, and reset cleanup passed on 2026-06-25 after the next-three-phase production deployment.
- Live Reports browser smoke reached the Reports workspace and confirmed no desktop horizontal overflow on 2026-06-25.
- Supabase document table was clean after smoke-test cleanup.
- Vercel production runtime error/fatal log scan found no entries after smoke testing.

## Deployment Caveat

GitHub-triggered deployment is now wired to the Git-connected project and `main` is the production branch. Pushes to `main` create Vercel production deployments. A verified owner-authored GitHub deployment is Ready:

```text
Deployment: dpl_GKDe4822iJSPiRTHJWzYgzV79mRH
URL: https://fashion-store-gnm1h1k6x-sanuske2-2147s-projects.vercel.app
State: READY
Author: ADxZimmy
```

The Ready deployment serves the frontend, but `/api/health` returns `ok: false` with `storage: "unconfigured"` because the Git-connected project has no Supabase environment variables yet.

Collaborator-authored GitHub deploys remain blocked. The Vercel API maps `NnazimuzoO` to Vercel user `nnazimuzoo`, but `nnazimuzoo` is not a confirmed member of the Vercel team/project. Attempting to invite `nnazimuzoo@nitechsoftware.com.ng` failed because the project team is on Vercel Hobby, which does not permit team members. Resolve this by upgrading/enabling collaboration, moving the project to an account/team that can include the commit authors, or making production Git commits from a Vercel owner/member account with contributing access.

After the Supabase env vars are added to the Git-connected project, re-run `/api/health` before retiring the older local/CLI deployment.
