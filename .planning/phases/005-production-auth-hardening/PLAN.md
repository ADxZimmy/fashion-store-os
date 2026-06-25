# Plan

## Outcome

Server-backed Fashion Store OS uses hashed credentials, HttpOnly sessions, sanitized auth bootstrap, and manager-only staff mutations.

## Scope

Included:

- Shared API auth helper with password hashing, session creation, cookie parsing, and sanitized users.
- Vercel `/api/session` route for signup, signin, signout, staff create, staff access update, and staff deletion.
- Local `server.js` mirror for the same auth/session contract.
- Frontend rewiring to prefer `/api/session` when server storage is available and keep local fallback when not.

Excluded:

- Supabase Auth user pools.
- OAuth, SSO, email verification, password reset, and tenant-level account recovery.

## Steps

1. Add shared auth/session helper.
2. Gate bootstrap/auth API responses through sanitized auth and session resolution.
3. Add `/api/session` in Vercel and local server.
4. Rewire browser auth/staff flows to use server actions when available.
5. Verify no plaintext passwords are synced through server-backed flows.

## Verification

- Check: `npm.cmd run check`
  Expected: All JavaScript files pass syntax validation.
- Check: Local API signup/signin/staff smoke.
  Expected: Stored auth document contains hashes and sessions, not plaintext passwords.
- Check: Browser smoke.
  Expected: Manager can sign up, create staff, sign out, sign in, and keep access after refresh.

## Rollback

Revert `api/_auth.js`, `/api/session`, the auth/bootstrap route changes, the local server auth routing, and the frontend auth rewiring.
