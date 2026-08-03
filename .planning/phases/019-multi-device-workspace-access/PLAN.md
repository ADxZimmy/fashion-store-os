# Plan

## Outcome

A manager can open their workspace on a second device, and an invited staff member can accept an invite from their own browser. Both go through a short-lived, human-typable workspace code that resolves which tenant a browser addresses and grants nothing else — sign-in or invite acceptance still decides access.

## Scope

Included:

- A `fashion_store_os_workspace_codes` table with the same grant and RLS treatment as the Phase 010 tables.
- Issue a workspace code from Settings, manager only, with a short TTL and limited uses.
- Redeem a code on a second device: the browser adopts the workspace id, then authenticates normally.
- Cross-device staff invites: an invite token resolves its own workspace, so it can be accepted from the invitee's browser.
- A warning before a device abandons a workspace that still holds data.
- Audit events for code issue, redemption, and workspace adoption.
- Docs: update `docs/pilot-uat.md` (its "One browser = one studio" rule stops being true), `docs/operations-runbook.md`, and `docs/production-smoke.md`.

Excluded:

- Account-based tenancy, where the workspace is derived from the signed-in identity. See the CONTEXT decision; it is the conventional design and a much larger change.
- Any global directory that maps an email to a workspace, which would reintroduce the user enumeration `sanitizeAuth` prevents.
- Device management, trusted-device lists, or per-device revocation.
- Merging two workspaces. A device joins one or the other.

## Steps

1. Migration `supabase/migrations/<timestamp>_create_workspace_codes.sql`: table `fashion_store_os_workspace_codes` with `code_hash` (primary key), `workspace_id`, `kind` (`join` or `invite`), `created_by_user_id`, `created_at`, `expires_at`, `redeemed_at`. Enable RLS and add explicit grants, modelled on `20260626191000_harden_workspaces_audit_and_channel_events.sql`. New tables get no implicit access under the current Supabase Data API model.
   - Codes are single use, so `redeemed_at` replaces a counter. A non-null value means spent.
   - TTL is set per `kind` at issue time: `join` is 30 minutes, `invite` reuses `INVITE_TTL_SECONDS` (3 days). Do not introduce one shared constant — see the CONTEXT decision; a global 30-minute TTL would expire invites two and a half days early.
2. Add a `codes` module in `api/_store.js` — or a sibling `api/_workspace_codes.js` — with `issueWorkspaceCode`, `lookupWorkspaceCode`, and `consumeWorkspaceCode`. These are the only storage calls that intentionally operate **outside** `storeForRequest`, because the caller does not yet know the workspace. Comment that exemption at the definition so it is not mistaken for a tenancy leak.
3. Generate codes from an unambiguous alphabet (no `0`/`O`, `1`/`I`/`l`), formatted in groups for transcription, hashed with `hashToken` before storage. Return the raw code exactly once, matching the invite and recovery patterns.
4. Add `POST /api/workspace-code` actions: `create` (manager only, via `requireManager`) and `redeem` (unauthenticated — the caller has no session on the new device yet). `redeem` returns only the workspace id, stamps `redeemed_at`, and returns a single generic error for expired, unknown, and already-redeemed codes.
5. Rate-limit `redeem` by IP. A short human-typable code without a rate limit is brute-forceable regardless of TTL.
6. Client: on redeem, write the returned id to `fashion-studio-os-workspace-v1`, clear cached `deviceWorkspaceId`, drop local state and auth caches, and reload so every subsequent request carries the new header.
7. Client: before adopting, if the current workspace holds data, show the outgoing workspace id and require confirmation. Abandoning a workspace orphans its rows with no UI path back.
8. Fix cross-device invites: `createStaffInvite` also issues an `invite`-kind workspace code and returns **one combined string**, `<workspaceCode>.<inviteToken>`. The accept-invite screen takes that single value, splits on the first `.`, adopts the workspace, then runs `acceptStaffInvite`. Use `.` as the separator — `-` and `_` both appear in `randomToken` base64url output and would make the split ambiguous. This is the existing-bug fix, not an enhancement.
   - Accept a pasted string with surrounding whitespace, and reject a value with no separator using the same generic error as a bad code.
   - The workspace-code half and the invite token must carry the same expiry, or the string half-dies: the invite would still be valid while the workspace code it travels with has expired. This is why `invite`-kind codes take `INVITE_TTL_SECONDS` rather than the 30-minute join TTL.
9. Add UI: "Open on another device" in Settings showing the code with its expiry, and a "Have a workspace code?" entry on the sign-in screen.
10. Audit `workspace.code_issue`, `workspace.code_redeem`, and `workspace.adopted` via `appendAuditEvent`.
11. Update `docs/pilot-uat.md` (the "One browser = one studio" rule changes), `docs/operations-runbook.md` (how to help someone who cannot join), and `docs/production-smoke.md` (a cross-device scenario).

## Verification

- Check: `npm run check` and `npm run launch:check`
  Expected: pass.
- Check: Second-device join, end to end.
  Expected: manager issues a code on browser A, redeems it on a genuinely separate browser profile, signs in with existing credentials, and sees the same workspace data.
- Check: Cross-device staff invite, end to end.
  Expected: a manager on browser A invites staff; the staff member accepts from browser B and reaches the workspace. **This fails today** — confirm it fails before the change so the fix is demonstrably real.
- Check: A code grants no data by itself.
  Expected: redeeming and then calling `/api/bootstrap` without signing in returns a locked, empty payload with `authenticated: false`.
- Check: Expiry, per kind.
  Expected: a `join` code is refused 30 minutes after issue; an `invite` code is still valid at 30 minutes and refused after 3 days. Simulate by backdating `expires_at`. A single shared TTL passes the first half of this check and fails the second.
- Check: Single use.
  Expected: a code with `redeemed_at` set is refused on a second attempt.
- Check: No enumeration.
  Expected: unknown, expired, and already-redeemed codes return byte-identical status and message.
- Check: Combined invite string handling.
  Expected: `<workspaceCode>.<inviteToken>` splits correctly, tolerates surrounding whitespace, and a value with no separator fails with the same generic error as a bad code.
- Check: Rate limiting.
  Expected: repeated bad redeems from one client are throttled.
- Check: Hash only at rest.
  Expected: the raw code appears in no table, log, or audit event.
- Check: Abandonment warning.
  Expected: joining from a device whose workspace holds data warns first and shows the outgoing id.
- Check: Tenancy is not weakened.
  Expected: a request carrying workspace A's header can still never read workspace B, and `storeForRequest` remains the only path to document reads and writes.
- Check: `npm run ops:security`
  Expected: passes.

## Rollback

Revert the phase commit. The client falls back to generating a per-device id as before, and the join UI disappears. The migration can stay — an unused table is inert — but drop it if reverting before any code is issued. Note that workspaces already joined keep working: the second device holds a real workspace id in `localStorage`, and nothing about the header contract changes on revert.
