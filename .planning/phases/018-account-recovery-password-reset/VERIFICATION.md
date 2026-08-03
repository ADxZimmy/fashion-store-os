# Verification

Status: Not started. Phase 018 is planned only; no code has been written. Record results here as steps complete.

## Automated Checks

- Command: `npm run check`
  Result: Pending.
- Command: `npm run launch:check`
  Result: Pending.
- Command: `npm run ops:security`
  Result: Pending.
  Notes: Must confirm no recovery code or hash is written to logs or committed files.

## Manual Checks

- Check: New recovery fields survive a re-save (the `normalizeAuthDocument` trap).
  Result: Pending.
- Check: Redeem happy path — new password works, old password fails.
  Result: Pending.
- Check: Recovery code is single-use.
  Result: Pending.
- Check: Unknown email and wrong code return byte-identical responses.
  Result: Pending.
- Check: Solo-manager dead end from 2026-08-03 is resolvable without clearing `localStorage`.
  Result: Pending.
- Check: Manager-initiated reset of a colleague's password.
  Result: Pending.
- Check: Audit events recorded for issue, redeem, and manager reset.
  Result: Pending.
- Check: Owner-side last-resort procedure rehearsed against a disposable workspace.
  Result: Pending.

## Open Questions

- Should the recovery code expire? The invite flow uses `INVITE_TTL_SECONDS`, but a recovery code is only useful long after issue, so a TTL may defeat its purpose. Leaning toward no expiry with single-use plus audit as the controls.
- Should redeeming a recovery code sign the user in directly, or return them to the sign-in screen with the new password? The second is simpler to reason about and avoids minting a session on a partially trusted path.

## Residual Risk

- Risk: Workspaces created before this phase have no recovery code and stay unrecoverable until a signed-in manager issues one.
  Mitigation: Step 3 exposes issue-on-demand to managers. Workspaces already locked out still need the owner-side procedure.
- Risk: Users lose the recovery code as readily as the password.
  Mitigation: Single-use re-issue is available to any signed-in manager, so the code can be rotated and re-saved. This narrows the gap without closing it; only email-based reset closes it, which is deliberately out of scope.
