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
- Check: Expired code refused (backdate `expires_at`).
  Result: Pending.
- Check: Exhausted code refused (`uses_remaining` at zero).
  Result: Pending.
- Check: Unknown, expired, and exhausted codes return byte-identical responses.
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

## Open Questions

- What TTL? Long enough to walk to another device, short enough that a leaked code is worthless. 15-60 minutes is the range; leaning 30.
- How many uses per code? One is safest and forces a re-issue for each device. A small allowance is friendlier for onboarding several staff at once.
- Should a joined workspace refuse manager signup outright? A workspace with no manager can currently be claimed by whoever holds its id. Making ids mobile makes that easier to reach, though it is not new.
- Does the invite become one combined string that carries both the workspace code and the invite token, or two fields? One string is far easier to hand to a person; two are easier to reason about and to revoke independently.

## Residual Risk

- Risk: Workspace ids become mobile, so a leaked id plus an unclaimed workspace is easier to squat.
  Mitigation: Covered by the checks above; consider refusing signup on joined workspaces.
- Risk: This makes multi-device access possible without making it discoverable — a user still has to know to ask for a code.
  Mitigation: Sign-in screen entry point, and the abandonment warning naturally surfaces the concept at the moment it matters.
- Risk: Per-device tenancy remains the underlying model, so losing every device that holds a workspace id still strands the data.
  Mitigation: Not solved here. Account-based tenancy is the real fix and is deliberately out of scope.
