# Plan

## Outcome

A user locked out of a Fashion Store OS workspace can regain access without owner intervention: a solo manager redeems a one-time recovery code, a manager resets a colleague's password, and the owner has a documented last-resort procedure for workspaces with neither. No recovery path reveals whether an account or workspace exists.

## Scope

Included:

- One-time recovery code issued at manager signup and re-issuable by any signed-in manager.
- A redeem flow that verifies the code and sets a new password in one step.
- Manager-initiated password reset for another user in the same workspace.
- Audit events for issue, re-issue, redeem, and manager-initiated reset.
- Owner-side last-resort recovery procedure in `docs/operations-runbook.md`.
- Coverage for the new paths in `docs/production-smoke.md`.

Excluded:

- Email-based reset and any mail provider dependency — see the CONTEXT decision. Revisit as its own phase if self-service reset without a saved code becomes a requirement.
- SMS, TOTP, or any second factor.
- Cross-workspace account recovery, or any way to list or search workspaces. The per-device workspace id stays the only pointer.
- Recovering the workspace already orphaned on 2026-08-03; it holds only test data.

## Steps

1. Extend the user record with `recoveryCodeHash`, `recoveryIssuedAt`, and `recoveryRedeemedAt`. **Add all three to `normalizeAuthDocument` in the same commit** — it rebuilds records from an explicit field list, so a field missing there is silently dropped on the next write and the feature will appear to work until the first re-save.
2. Add `issueRecoveryCode(auth, currentUser)` in `api/_auth.js`: generate with `randomToken`, store only `hashToken(...)`, return the raw code exactly once, mirroring `createStaffInvite`/`sanitizeInvite`. Issuing replaces any existing code.
3. Call it during manager signup so the first manager receives a code at account creation, and expose it as a `create-recovery-code` action for signed-in managers so pre-existing workspaces can self-issue.
4. Add `redeemRecoveryCode(auth, payload)`: match on email plus code, compare with `crypto.timingSafeEqual` and a length guard as in `verifyPassword`, require a new password meeting `assertPassword`, then clear `recoveryCodeHash`, stamp `recoveryRedeemedAt`, and invalidate existing sessions for that user. Return the identical public error for unknown email and wrong code.
   - **No expiry check.** Deliberately unlike `acceptStaffInvite`, which rejects on `inviteExpiresAt`. Do not copy that guard across; single use is the control here, not time.
   - **Do not issue a session or set an auth cookie.** Redemption ends by returning the user to sign-in to authenticate with the new password. Redeeming and signing in stay separate steps.
5. Add `reset-user-password` for managers: a manager sets a colleague's password or issues them a fresh invite token. Reuse the existing invite path rather than adding a parallel token type.
6. Register `create-recovery-code`, `redeem-recovery-code`, and `reset-user-password` in `api/session.js` alongside the existing actions.
7. Append audit events for every one of those operations via `appendAuditEvent`, matching the `staff.invite` convention.
8. Frontend in `src/app.js`: show the recovery code once at signup with explicit "save this now, it will not be shown again" copy; add a "Recover access" entry point on the sign-in screen; add recovery-code issue and colleague-reset controls to the Settings team panel. After a successful redeem, land the user on the sign-in screen with a confirmation toast rather than the dashboard — the new password is entered immediately, which proves the reset worked.
9. Document the owner-side last-resort procedure in `docs/operations-runbook.md`: locate the workspace row by `workspace_id`, and clear or replace the auth document's password record using the service-role key. State plainly that it requires Supabase access, that it is a last resort rather than routine support, and that no keys, dumps, or customer records go in the repo or `.planning/`.
10. Extend `docs/production-smoke.md` with a recovery scenario: issue a code, sign out, redeem it, confirm sign-in with the new password, and confirm the code cannot be redeemed twice.

## Verification

- Check: `npm run check`
  Expected: passes.
- Check: `npm run launch:check`
  Expected: syntax, UX, security, and build gates pass.
- Check: Persistence of new fields.
  Expected: issue a code, trigger a subsequent auth write, re-read the document, and confirm `recoveryCodeHash` survived — this is the `normalizeAuthDocument` trap from Step 1.
- Check: Redeem happy path.
  Expected: correct email plus code sets a new password; the user signs in with it; the old password fails.
- Check: Single use.
  Expected: redeeming the same code twice fails on the second attempt.
- Check: No enumeration.
  Expected: unknown email and wrong code return byte-identical status and message.
- Check: Solo-manager case end to end.
  Expected: reproduce the 2026-08-03 dead end — a workspace whose only manager's password is unknown — and confirm the recovery code resolves it without clearing `localStorage`.
- Check: Audit trail.
  Expected: issue, redeem, and manager-initiated reset each appear in manager-visible audit events.
- Check: `npm run ops:security`
  Expected: passes, with no recovery code or hash written to logs or committed files.

## Rollback

Revert the phase commit. The feature is additive: new user-record fields, new actions, and new UI entry points. Existing signup, sign-in, invite, and change-password paths are untouched, so reverting restores current behavior exactly — including the recovery gap. The owner-side runbook procedure is documentation only and can stay regardless, since it depends on nothing this phase ships.
