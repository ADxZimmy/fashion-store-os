# Verification

Status: Implemented and verified locally on 2026-08-03. **The migration has not been applied to the production Supabase project**, which is an owner action; see Deployment below.

## Deployment Prerequisite

`supabase/migrations/20260803120000_create_workspace_codes.sql` must be applied before workspace codes work in production:

```
npx supabase db push
```

Until it runs, `fashion_store_os_workspace_codes` does not exist. The invite path catches that failure and returns a same-device invite, so deploying ahead of the migration degrades to current behaviour rather than breaking invites — but the cross-device fix stays inert, and `/api/workspace-code` returns a storage error.

## Automated Checks

- Command: `npm run check`
  Result: Passed on 2026-08-03; 27 JavaScript files.
- Command: `npm run launch:check`
  Result: Passed on 2026-08-03; syntax, UX, security, and build all green.
- Command: Unit suite over `api/_workspace_codes.js` and `api/_rate_limit.js` (38 assertions).
  Result: Passed on 2026-08-03; all 38.

## Pre-Change Baseline

- Check: Cross-device staff invite fails today.
  Result: **Confirmed failing before the change on 2026-08-03.** A manager created an invite; accepting it with a different `x-workspace-id` and no session returned `Invite details do not match.`
  Notes: Observed accidentally but genuinely — a stale server process still held port 4179, so the first test run hit the pre-change build. The failure recorded is real old-code behaviour, not a simulation.
- Check: A second device cannot reach an existing workspace by any supported route.
  Result: Confirmed. Before this phase the only route was copying `fashion-studio-os-workspace-v1` between browsers by hand.

## Manual Checks

- Check: Cross-device staff invite, end to end, after the fix.
  Result: Passed on 2026-08-03. The same scenario that failed on the pre-change build now returns `authenticated: true` with `joinedWorkspaceId`, using a different `x-workspace-id` and no session cookie.
- Check: Second-device join, end to end.
  Result: Passed on 2026-08-03 at the API level; a manager-created code redeems from an unauthenticated caller and returns the workspace id. Browser-level adoption is covered by the production smoke scenario below.
- Check: A code grants no data on its own.
  Result: Passed on 2026-08-03; redeem returns exactly `{ok, workspaceId}` and nothing else. Reading anything still requires signing in.
- Check: Expiry is per kind.
  Result: Passed on 2026-08-03. `ttlSecondsForKind` returns 1800 for `join` and 259200 for `invite`; a built `invite` record is still usable at 31 minutes where a `join` record is not. A live join code reported ~30 minutes to expiry.
- Check: Single use.
  Result: Passed on 2026-08-03; a second redeem of the same code is refused, as is reuse of a spent combined invite string.
- Check: Unknown and already-redeemed codes return byte-identical responses.
  Result: Passed on 2026-08-03; both return `That code is not valid. Ask for a new one.`
- Check: Combined invite string handling.
  Result: Passed on 2026-08-03; splits on the first separator, preserves tokens containing `-` and `_`, tolerates whitespace, and treats a missing separator as a bad code.
- Check: Redeem endpoint is rate-limited.
  Result: Passed on 2026-08-03; throttles after 10 attempts per minute per client with a 429, does not affect other clients, and resets after the window.
  Notes: In-memory and therefore per serverless instance. It is a speed bump against a naive loop, not a distributed-attack control. Recorded as residual risk rather than overclaimed.
- Check: Only the hash is stored.
  Result: Passed on 2026-08-03; the raw code does not appear in the persisted rows, which contain `code_hash`.
- Check: Human-typing tolerance.
  Result: Passed on 2026-08-03; a code redeems in lowercase with the dash stripped. The alphabet excludes `0`, `O`, `1`, `I`, and `L`, verified across 400 generated codes.
- Check: Issuing is manager-gated.
  Result: Passed on 2026-08-03; an unauthenticated `create` returns `Sign in is required.`
- Check: A code can never point at a manager-less workspace.
  Result: Passed on 2026-08-03 by construction and by test — `create` goes through `requireManager`, so a workspace with no manager cannot produce a code.
- Check: Abandonment warning fires when the joining device already holds workspace data.
  Result: Implemented; confirmation modal shows the outgoing workspace id. Browser-level verification outstanding with the production smoke.
- Check: Tenancy unweakened.
  Result: Passed by inspection on 2026-08-03. `storeForRequest` still resolves from the header; the new `storeForWorkspace` takes a workspace id that can only come from a redeemed code, and the code lookup returns a workspace id and nothing else.
- Check: New table has RLS enabled and explicit grants.
  Result: Written into the migration on 2026-08-03; `anon` and `authenticated` revoked, `service_role` granted. **Not yet applied to production** — see Deployment Prerequisite.
- Check: Production verification of join and cross-device invite.
  Result: **Outstanding.** Blocked on the migration being applied.

## Resolved Questions

All four are settled; no open questions block implementation.

- TTL: 30 minutes for `join`. Owner decision, 2026-08-03. Set per kind — `invite` keeps `INVITE_TTL_SECONDS` (3 days), because a global 30-minute TTL would expire the workspace-code half of a combined invite string two and a half days before the invite it carries.
- Uses: one. Owner decision, 2026-08-03. Tracked with `redeemed_at` rather than a counter.
- Invite format: one combined string, `<workspaceCode>.<inviteToken>`. Owner decision, 2026-08-03. Separator is `.` because `-` and `_` both occur in `randomToken` base64url output.
- Should a joined workspace refuse manager signup? **No change needed.** Issuing a code of either kind goes through `requireManager`, so a code can only exist for a workspace that already has a manager — and `signUpManager` already refuses when a manager is present. The join path therefore cannot reach a claimable workspace. The residual exposure is a leaked workspace id used directly in the header against a manager-less workspace, which is pre-existing and unchanged by this phase. Verify rather than assume: see the check below.

## Residual Risk

- Risk: Workspace ids become mobile, so a leaked id plus an unclaimed workspace is easier to squat.
  Mitigation: Codes cannot be issued for a manager-less workspace, since issuing requires a manager, and signup is already refused where a manager exists. Covered by an explicit check rather than left to reasoning.
- Risk: This makes multi-device access possible without making it discoverable — a user still has to know to ask for a code.
  Mitigation: Sign-in screen entry point, and the abandonment warning naturally surfaces the concept at the moment it matters.
- Risk: Per-device tenancy remains the underlying model, so losing every device that holds a workspace id still strands the data.
  Mitigation: Not solved here. Account-based tenancy is the real fix and is deliberately out of scope.
- Risk: Rate limiting is in-memory, so it does not span serverless instances.
  Mitigation: None in this phase, and stated plainly rather than implied to be more than it is. It stops a naive loop from one client against one instance. A durable limiter belongs in the storage layer if this ever needs to be a real control.
- Risk: Deploying the code before the migration leaves the fix inert.
  Mitigation: The invite path catches the failure and returns a same-device invite, so behaviour degrades to current rather than erroring. `/api/workspace-code` still returns a storage error until the migration runs.
