# Verification

Status: Implemented and verified locally on 2026-08-03. Migration `20260803120000_create_workspace_codes.sql` was applied to production Supabase project `elkpberfbhwbrkawklnk` on 2026-08-03. Production join/invite verification remains outstanding.

## Deployment Status

Applied with:

```
npx supabase db push
```

`supabase migration list --linked` confirms `20260803120000` exists in both the local and remote ledgers. The `fashion_store_os_workspace_codes` table is now available to the deployed code.

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
  Result: **Initially recorded as passing on 2026-08-03, and that record was wrong.** Corrected the same day after production proved otherwise. Now passes across all four cases: empty workspace with no session → 401, populated workspace with no session → 401, signed-in manager → 201, signed-in staff → 403.
- Check: A code can never point at a manager-less workspace.
  Result: **Failed on first implementation; fixed and re-verified on 2026-08-03.**
  What went wrong: `requireManager` returns `{session: null, user: null}` when a workspace has no accounts — the bootstrap accommodation the other handlers rely on, since a brand new workspace has nobody to authenticate as. The `create` handler inherited it, so an unauthenticated caller could mint a join code for any empty workspace. Both the code comment and the CONTEXT decision asserted the opposite.
  Why the local tests missed it: they only exercised `create` against a workspace that already had a manager, where `requireManager` behaves as expected. The right answer for the wrong reason, then generalised.
  How it surfaced: a production probe returned `502` instead of an auth refusal. The 502 came from the foreign key on `fashion_store_os_workspaces` — `issueWorkspaceCode` does not call `ensureWorkspaceDocument`, so a never-used workspace has no row to reference. The storage error masked the auth hole rather than being the problem.
  Impact if it had shipped unnoticed: low. A code for an empty manager-less workspace grants an empty manager-less workspace, which anyone could already address by sending that id in the header. No privilege was obtainable that was not already available. It was still a false gate, and the docs claimed it held.
  Fix: `create` now requires a real manager user explicitly rather than trusting `requireManager` alone. The foreign key issue becomes unreachable through this path, since any workspace passing the gate has already written an auth document and therefore has a workspace row.
- Check: Abandonment warning fires when the joining device already holds workspace data.
  Result: Implemented; confirmation modal shows the outgoing workspace id. Browser-level verification outstanding with the production smoke.
- Check: Tenancy unweakened.
  Result: Passed by inspection on 2026-08-03. `storeForRequest` still resolves from the header; the new `storeForWorkspace` takes a workspace id that can only come from a redeemed code, and the code lookup returns a workspace id and nothing else.
- Check: New table has RLS enabled and explicit grants.
  Result: Applied to production on 2026-08-03; the migration enables RLS, revokes `anon` and `authenticated`, and grants `service_role`.
- Check: Migration applied to production.
  Result: Passed on 2026-08-03. A bogus redeem against production returned `404` with the generic mismatch message, which requires the table to exist and the lookup to run. A missing table would have returned `502`.
- Check: Production verification of join and cross-device invite, end to end in a browser.
  Result: **Outstanding.** Needs an account, so it runs with the production smoke.

## Resolved Questions

All four are settled; no open questions block implementation.

- TTL: 30 minutes for `join`. Owner decision, 2026-08-03. Set per kind — `invite` keeps `INVITE_TTL_SECONDS` (3 days), because a global 30-minute TTL would expire the workspace-code half of a combined invite string two and a half days before the invite it carries.
- Uses: one. Owner decision, 2026-08-03. Tracked with `redeemed_at` rather than a counter.
- Invite format: one combined string, `<workspaceCode>.<inviteToken>`. Owner decision, 2026-08-03. Separator is `.` because `-` and `_` both occur in `randomToken` base64url output.
- Should a joined workspace refuse manager signup? **No change needed — but the original reasoning was wrong.** It read "issuing a code of either kind goes through `requireManager`, so a code can only exist for a workspace that already has a manager." `requireManager` returns a null user for a workspace with no accounts, so it never carried that guarantee; see the manager-gating checks above. The conclusion holds on the corrected implementation, by a different route for each kind: `join` is guarded explicitly in the issuing handler (`api/workspace-code.js`, `server.js`), and `invite` is issued only after `createStaffInvite` has called `assertManager`, so the null user cannot reach issuance there. On that basis a code of either kind requires a workspace that already has a manager, and `signUpManager` already refuses when a manager is present, so the join path cannot reach a claimable workspace. The residual exposure is a leaked workspace id used directly in the header against a manager-less workspace, which is pre-existing and unchanged by this phase.

## Residual Risk

- Risk: Workspace ids become mobile, so a leaked id plus an unclaimed workspace is easier to squat.
  Mitigation: Codes cannot be issued for a manager-less workspace — `join` checks for a real manager user in the handler, and `invite` is issued only after `createStaffInvite` has asserted one — and signup is already refused where a manager exists. Recorded as verified by an explicit check, which is exactly what makes the first version's failure worth keeping: the check existed but only exercised a workspace that already had a manager, so it passed against the one case the bug did not touch. Production found the rest.
- Risk: This makes multi-device access possible without making it discoverable — a user still has to know to ask for a code.
  Mitigation: Sign-in screen entry point, and the abandonment warning naturally surfaces the concept at the moment it matters.
- Risk: Per-device tenancy remains the underlying model, so losing every device that holds a workspace id still strands the data.
  Mitigation: Not solved here. Account-based tenancy is the real fix and is deliberately out of scope.
- Risk: Rate limiting is in-memory, so it does not span serverless instances.
  Mitigation: None in this phase, and stated plainly rather than implied to be more than it is. It stops a naive loop from one client against one instance. A durable limiter belongs in the storage layer if this ever needs to be a real control.
- Risk: Future code/schema drift could leave workspace-code behavior unavailable.
  Mitigation: Keep `supabase migration list --linked` in release verification and run the production join/invite smoke after schema changes.
