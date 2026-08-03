# Context

## Goal

Give a locked-out user a way back into their workspace. Today a forgotten manager password permanently destroys access to a workspace, and the data it holds — client records, orders, measurements — becomes unreachable through any supported path.

## Trigger

Found on 2026-08-03 during the v1.0.0 production write-path smoke test. The operator's browser was bound to an existing workspace, signup returned "Manager access already exists" (`api/_auth.js:143`), and sign-in was impossible because the credentials were not known. Three independent facts made it unrecoverable:

- `sanitizeAuth` blanks `name` and `email` for unauthenticated callers (`api/_auth.js:98-104`), so the account to sign in as cannot be discovered. This is correct — it prevents user enumeration on a workspace you do not own — and must not be weakened.
- No password reset, forgot-password, or recovery flow exists anywhere in the codebase.
- The browser's workspace id is the only pointer to the workspace (`src/app.js:170`). Clearing it to escape the dead end orphans the old workspace's rows in Supabase with no UI path to reach or delete them.

The workaround used was to clear `localStorage` and start a fresh workspace. That is acceptable for a test workspace and unacceptable for a real store.

## Dependency

Phase 011 (account lifecycle and RBAC hardening) supplies the mechanism this phase extends: `create-staff-invite` issues a random token, stores only `hashToken(inviteToken)` on the user record, returns the raw token exactly once through `sanitizeInvite`, and `accept-invite` redeems it against an expiry. Password recovery is the same shape with a different entry point.

Phase 017 is complete; v1.0.0 is live on `https://fashion-store-os.vercel.app` with no real customers yet, so this can land before real data is at risk.

## Relevant Files

- Path: `api/_auth.js`
  Why it matters: Holds signup, invite issue/accept, `change-password`, `hashToken`, `randomToken`, and the password record helpers. All recovery logic belongs here.
- Path: `api/_auth.js` → `normalizeAuthDocument`
  Why it matters: Rebuilds every user record from an explicit field list. **Any new field not added there is silently dropped on the next write.** This is the most likely way an implementation looks correct and loses recovery data.
- Path: `api/session.js`
  Why it matters: Action router; new actions are registered alongside `signup`/`signin`/`accept-invite`/`change-password`.
- Path: `src/app.js`
  Why it matters: Auth screens, toasts, and the workspace id logic that binds a browser to a workspace.
- Path: `docs/operations-runbook.md`
  Why it matters: Home for the owner-side recovery procedure and its safety rules.
- Path: `docs/production-smoke.md`
  Why it matters: The smoke procedure should cover recovery once it exists.

## Decisions

- Decision: No email-based reset in this phase.
  Reason: The codebase has no mail capability of any kind — no nodemailer, SMTP, Resend, SendGrid, or equivalent — and `PROJECT.md` constrains the project to avoid package installation unless a phase needs it. Adding a provider means a dependency, an API key, domain verification, and deliverability handling. That is a larger phase and should be chosen deliberately, not smuggled in under "password reset."
- Decision: Issue a one-time recovery code when the first manager is created, shown once, redeemable to set a new password.
  Reason: It is the only self-service option that works for a solo manager, which is the exact case that broke. Dependency-free, and it reuses the proven invite token shape.
- Decision: Store only a hash of the recovery code, never the code itself.
  Reason: Matches `inviteTokenHash` and the password record. A recovery code at rest is a second password.
- Decision: Add manager-to-manager reset for workspaces that have more than one manager.
  Reason: Cheap given the invite machinery already exists, and it covers staff lockouts without touching the recovery code path.
- Decision: Document an owner-side recovery procedure using the service-role key, and treat it as the last resort rather than the primary answer.
  Reason: It works today with no code change, so it closes the gap immediately. It also requires the service-role key and direct Supabase access, which is exactly why it must not become routine support.
- Decision: Do not weaken `sanitizeAuth`.
  Reason: Revealing which email owns a workspace to unauthenticated callers would trade a recovery problem for a user-enumeration vulnerability.

## Risks

- Risk: Recovery code becomes a second, weaker credential — a permanent bypass that never expires and that users paste into notes apps.
  Mitigation: Single-use, invalidated on redemption; redeeming forces setting a new password; issuing a replacement invalidates the old one; every issue and redemption writes an audit event.
- Risk: The reset endpoint becomes a brute-force or enumeration surface.
  Mitigation: Constant-time comparison as in `verifyPassword`, identical error text whether the email is unknown or the code is wrong, and no confirmation that a workspace or account exists.
- Risk: Recovery data is silently dropped because `normalizeAuthDocument` was not updated.
  Mitigation: Called out explicitly in the plan steps and covered by a persistence test that writes, re-reads, and asserts the field survived.
- Risk: Existing workspaces created before this phase have no recovery code and stay unrecoverable.
  Mitigation: Offer code generation to any signed-in manager, not only at signup, so existing managers can self-issue. Workspaces already locked out still need the owner-side procedure.
- Risk: The owner-side procedure leaks the service-role key or customer data into the repo.
  Mitigation: Procedure references variable names only and states that no dumps, keys, or records go in the repo or `.planning/`, consistent with the existing runbook rule.
