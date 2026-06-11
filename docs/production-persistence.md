# Production Persistence

Fashion Store OS now has Vercel serverless API routes for production persistence.

## Current Production Setup

- Vercel project: `nnazimuzoos-projects/fashion-store-os`
- Live URL: `https://fashion-store-os-navy.vercel.app`
- Current deployment: `dpl_CJmKYfZibLyp74kzKt5CAjP9LF9Q`
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
  - `PUT /api/auth`
  - `DELETE /api/data`
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

## Vercel Environment Variables

These are set on the Vercel production project:

```text
SUPABASE_URL
SUPABASE_REST_API_KEY
FASHION_STORE_WORKSPACE_ID
```

`FASHION_STORE_WORKSPACE_ID` can stay `default` until the app has a multi-workspace model.

When available, `SUPABASE_SERVICE_ROLE_KEY` can be used instead of `SUPABASE_REST_API_KEY`. Keep both server-side only in Vercel. Do not expose either value in frontend code or with a public env var prefix.

## Verification

Useful verification commands:

```powershell
Invoke-RestMethod https://fashion-store-os-navy.vercel.app/api/health
Invoke-RestMethod https://fashion-store-os-navy.vercel.app/api/bootstrap
```

Expected:

- `/api/health` returns `storage: "supabase"`.
- `/api/bootstrap` returns state/auth payloads or `stateExists: false`, `authExists: false`.
- Creating a manager/profile in the live app persists after refresh and across browsers.

Latest verification:

- Supabase project is active and healthy.
- Both migrations are recorded.
- Vercel production deployment is Ready.
- Live `/api/health` returns `ok: true`, `storage: "supabase"`, and `workspace: "default"`.
- Live API write/read/delete test passed through the production URL.
- Supabase document table was clean after smoke-test cleanup.
- Vercel production runtime error/fatal log scan found no entries in the last hour.

## Deployment Caveat

Direct deployment from the Git repo is currently blocked by Vercel team-collaboration protection because the latest Git commit author, `info@nitechsoftware.com.ng`, is not a member of the Vercel team.

The successful production deployment was created from a clean temporary staging copy without `.git` metadata, generated from local commit `f7413d0`:

```powershell
vercel deploy <temp-staging-path> --prod --yes --no-wait --project fashion-store-os --scope nnazimuzoos-projects
```

Before relying on GitHub-triggered deployments, commit the Vercel/Supabase config changes and resolve the Git author/team access issue.
