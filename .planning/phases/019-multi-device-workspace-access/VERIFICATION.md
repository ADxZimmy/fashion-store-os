# Verification

Status: Not started. Phase 019 is planned only; no code has been written.

## Automated Checks

- Command: `npm run check`
  Result: Pending.
- Command: `npm run launch:check`
  Result: Pending.
- Command: `npm run ops:security`
  Result: Pending.
  Notes: Must confirm no raw workspace code reaches logs, audit events, or committed files.

## Pre-Change Baseline

Record these before implementing. The phase claims to fix a live bug, and that claim is only credible if the failure is observed first.

- Check: Cross-device staff invite fails today.
  Result: Pending.
  Notes: Manager invites staff on browser A; staff attempts to accept on browser B. Expected current behaviour is "Invite details do not match", because `acceptStaffInvite` looks for the invited user inside browser B's own empty workspace.
- Check: A second device cannot reach an existing workspace by any supported route.
  Result: Pending.

## Manual Checks

- Check: Second-device join, end to end.
  Result: Pending.
- Check: Cross-device staff invite, end to end, after the fix.
  Result: Pending.
- Check: A code grants no data on its own — bootstrap after redeem but before sign-in is locked and empty.
  Result: Pending.
- Check: Expiry is per kind — `join` refused after 30 minutes, `invite` still valid at 30 minutes and refused after 3 days.
  Result: Pending.
  Notes: A single shared TTL passes the `join` half and fails the `invite` half. That is the trap this check exists to catch.
- Check: Single use — a code with `redeemed_at` set is refused on a second attempt.
  Result: Pending.
- Check: Unknown, expired, and already-redeemed codes return byte-identical responses.
  Result: Pending.
- Check: Combined invite string `<workspaceCode>.<inviteToken>` splits correctly, tolerates surrounding whitespace, and a value with no separator gives the same generic error as a bad code.
  Result: Pending.
- Check: Redeem endpoint is rate-limited against brute force.
  Result: Pending.
  Notes: The code is deliberately short so it can be typed. TTL alone does not make a short code safe.
- Check: Only the hash is stored; the raw code appears in no table, log, or audit event.
  Result: Pending.
- Check: Abandonment warning fires when the joining device already holds workspace data, and shows the outgoing id.
  Result: Pending.
- Check: Tenancy unweakened — a request carrying workspace A's header cannot read workspace B, and `storeForRequest` is still the only route to document reads and writes.
  Result: Pending.
  Notes: The workspace-code lookup is the one deliberate exemption. Confirm it can return a workspace id and nothing else.
- Check: New table has RLS enabled and explicit grants.
  Result: Pending.
  Notes: Phase 010 established that new tables get no implicit access under the current Supabase Data API model.
- Check: A code can never point at a manager-less workspace.
  Result: Pending.
  Notes: Confirms the reasoning in Resolved Questions rather than trusting it. Issuing requires `requireManager`, so no code should be obtainable for a workspace without a manager. If any path ever issues one, joining it would hand a stranger an unclaimed workspace.

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
