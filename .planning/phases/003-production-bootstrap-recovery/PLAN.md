# Plan

## Outcome

Restore confidence in production persistence: health checks must prove Supabase reachability, storage failures must be visible and non-secret, and live `/api/bootstrap` must work again after the Supabase endpoint/config is corrected.

## Scope

- Vercel serverless API storage helper and health route.
- Production Supabase reachability diagnostics.
- GSD planning and verification artifacts for the recovery work.
- GitHub and Vercel deployment after the fix is implemented.

## Steps

1. Confirm the live failure mode for `/api/bootstrap`.
2. Verify whether the configured Supabase project ref resolves and accepts REST requests.
3. Add real storage probing and redacted diagnostics to `/api/health`.
4. Convert Supabase network/request failures into safe 502 storage errors for API routes.
5. Run local syntax and handler checks.
6. Commit and push the recovery branch.
7. Deploy production from the local repo.
8. Re-check live `/api/health`, `/api/bootstrap`, and persistence write/read/reset once an active Supabase endpoint is available.

## Risks

- The documented Supabase project ref may have been deleted, paused, or replaced.
- If a new Supabase project is required, old live smoke-test data may not be recoverable.
- Vercel production env vars may still point at the obsolete ref until updated.

## Rollback

Revert the API route changes in `api/_store.js`, `api/_response.js`, and `api/health.js`, then redeploy the previous known-good commit. If Vercel env vars are changed, restore them from Vercel project history or the verified replacement project details.
