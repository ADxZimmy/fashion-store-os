# Verification

Status: Implemented 2026-08-03. Backend, local-server parity, and frontend are complete and verified locally. Not yet exercised against production.

## Automated Checks

- Command: `npm run check`
  Result: Passed on 2026-08-03; 24 JavaScript files checked.
- Command: `npm run launch:check`
  Result: Passed on 2026-08-03; syntax, UX audit, security audit, and production build all green.
- Command: `npm run ops:security`
  Result: Passed on 2026-08-03; no committed secret-looking values.
- Command: Unit suite over `api/_auth.js` recovery paths (37 assertions).
  Result: Passed on 2026-08-03; all 37 passed. Covers issue, redeem, single use, enumeration parity, no-expiry, re-issue invalidation, manager reset, suspended-account refusal, audit trail, and password validation.

## Manual Checks

- Check: New recovery fields survive a re-save (the `normalizeAuthDocument` trap).
  Result: Passed on 2026-08-03. Verified twice — in-process via re-normalization, and through the HTTP layer by triggering a subsequent auth write and re-reading `data/auth.json`.
  Notes: The trap was real and existed in **two** places, not one. `normalizeAuth` in `src/app.js:266` rebuilds users from its own explicit field list, so the client dropped the metadata until it was added there too.
- Check: Redeem happy path — new password works, old password fails.
  Result: Passed on 2026-08-03 in-process and over HTTP.
- Check: Recovery code is single-use.
  Result: Passed on 2026-08-03; the second redeem is rejected.
- Check: Unknown email and wrong code return byte-identical responses.
  Result: Passed on 2026-08-03; both return 401 `Recovery details do not match.` A wrong-length code does not crash `timingSafeEqual`.
- Check: Solo-manager dead end from 2026-08-03 is resolvable without clearing `localStorage`.
  Result: Passed on 2026-08-03; a manager with a lost password redeems their signup code and signs in again.
- Check: Manager-initiated reset of a colleague's password.
  Result: Passed on 2026-08-03. Implemented as issuing a recovery code for the target rather than setting their password, so the manager never learns it. Staff attempting the same action get 403.
- Check: Audit events recorded for issue, redeem, and manager reset.
  Result: Passed on 2026-08-03; `account.recovery_issue` and `account.recovery_redeem` present, and no raw code appears in the audit trail.
- Check: No expiry. A code issued well in the past still redeems.
  Result: Passed on 2026-08-03; a code backdated 400 days redeems successfully.
- Check: Redeem issues no session. The response sets no auth cookie and the client lands on sign-in, not the dashboard.
  Result: Passed on 2026-08-03; response headers contain no `Set-Cookie`, body returns `authenticated: false` and `passwordReset: true`, and all session rows for the account are dropped.
- Check: Raw code is never persisted.
  Result: Passed on 2026-08-03; `data/auth.json` contains `recoveryCodeHash` and does not contain the raw code. `sanitizeAuth` omits both the hash and the code.
- Check: Production smoke of the recovery round trip.
  Result: **Outstanding.** Added as Step 6 of `docs/production-smoke.md`; runs with the rest of the write-path smoke.
- Check: Owner-side last-resort procedure rehearsed against a disposable workspace.
  Result: **Outstanding.** Documented in `docs/operations-runbook.md` but not rehearsed.

## Residual Risk

- Risk: Workspaces created before this phase have no recovery code and stay unrecoverable until a signed-in manager issues one.
  Mitigation: Step 3 exposes issue-on-demand to managers. Workspaces already locked out still need the owner-side procedure.
- Risk: Users lose the recovery code as readily as the password.
  Mitigation: Single-use re-issue is available to any signed-in manager, so the code can be rotated and re-saved. This narrows the gap without closing it; only email-based reset closes it, which is deliberately out of scope.
- Risk: Recovery codes never expire (owner decision, 2026-08-03), so a code leaked from a notes app, screenshot, or chat stays valid indefinitely.
  Mitigation: Single-use redemption, manager re-issue that invalidates the prior code, and audit events on issue and redeem. Accepted deliberately — an expiring code would be dead at the exact moment it is needed. If abuse ever appears, rotation is the response, not a retrofitted TTL.
