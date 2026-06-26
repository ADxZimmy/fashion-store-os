# UAT

## Scenario

A production maintainer applies the new migration to a Supabase project, sets server-side env vars in Vercel, and verifies `/api/health` plus state/auth read/write.

## Result

Pass for local API/export behavior. Pending owner-side Supabase migration application.

## Notes

The current app contract remains compatible with `state` and `auth` documents.
