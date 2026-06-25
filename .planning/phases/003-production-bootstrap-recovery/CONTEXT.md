# Context

## Why This Phase Exists

Production is deployed and serving the updated mobile navigation assets, but the live persistence API is no longer healthy. `/api/health` reported `ok: true` because it only checked for Supabase env vars, while `/api/bootstrap` returned HTTP 500 from a serverless `fetch failed` error.

## Current Evidence

- Live site: `https://fashion-store-os-navy.vercel.app`.
- Current production deployment: `dpl_CPcyGFnXNDYnJBgWrr7YkdaBUuMS`.
- Live `/api/bootstrap` returned HTTP 500 on 2026-06-25.
- Vercel runtime logs previously showed `TypeError: fetch failed` for `/api/bootstrap`.
- Public DNS lookup for `duimatbeahwfeghcviju.supabase.co` returned NXDOMAIN on 2026-06-25.
- Supabase MCP SQL/log probes for project `duimatbeahwfeghcviju` timed out on 2026-06-25.

## Relevant Constraints

- Do not expose Supabase keys or service-role secrets in diagnostics, docs, frontend code, or planning artifacts.
- Keep production API routes dependency-free unless a later phase deliberately adopts a client library.
- Preserve local JSON-file backend behavior in `server.js`; this phase targets Vercel serverless API routes under `api/`.
- Avoid destructive Supabase or Vercel env changes unless the current target project/ref is confirmed obsolete and the replacement endpoint is verified.
