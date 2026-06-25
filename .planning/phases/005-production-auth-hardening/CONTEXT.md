# Context

## Goal

Replace prototype browser-stored passwords with server-owned password hashing, HttpOnly session cookies, sanitized auth responses, and manager-gated staff access actions.

## Relevant Files

- Path: `src/app.js`
  Why it matters: Contains sign-up, sign-in, staff access, logout, bootstrap, and local fallback flows.
- Path: `api/auth.js`, `api/bootstrap.js`
  Why it matters: Currently expose persisted auth records directly.
- Path: `server.js`
  Why it matters: Local backend must mirror Vercel API behavior for testing.
- Path: `api/_store.js`
  Why it matters: Production auth records are stored as Supabase documents.

## Decisions

- Decision: Use Node built-in crypto for PBKDF2 password hashes and random session tokens.
  Reason: Keeps the repo dependency-free while removing plaintext passwords from server storage.
- Decision: Keep browser localStorage auth as a static-file fallback only.
  Reason: Direct `file://` use is still useful for demos, but server-backed environments should own auth.
- Decision: Do not adopt Supabase Auth in this phase.
  Reason: The current product is a single-workspace document app; a custom server session layer is the smallest hardening step without tenant/schema churn.

## Risks

- Risk: Existing plaintext auth documents may exist in production.
  Mitigation: Server auth helpers migrate legacy user passwords to hashes the next time auth is read or an auth action runs.
- Risk: Client code may still try to PUT full auth documents.
  Mitigation: Disable full auth PUT in server-backed APIs and route staff changes through session actions.
