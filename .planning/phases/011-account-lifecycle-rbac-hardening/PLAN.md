# Plan

## Outcome

Manager/staff roles, invite/onboarding, session expiry, password change, audit history, and protected admin actions are ready for real store operations.

## Scope

Included:
- Staff invite and accept-invite flow.
- Staff suspend/reactivate.
- User password change.
- Audit events in sanitized auth state.
- Settings UI controls for lifecycle actions.

Excluded:
- Email delivery.
- Supabase Auth provider migration.
- Per-record RBAC beyond current section access.

## Steps

1. Extend shared auth model with statuses, invites, and audit events.
2. Add session route actions for invite acceptance and lifecycle changes.
3. Add Settings/onboarding UI for account security and staff invites.
4. Run local API smoke tests for manager/staff lifecycle.

## Verification

- Check: Local API smoke.
  Expected: Signup, invite, accept, change password, suspend/reactivate, and staff access restrictions work.

## Rollback

Revert auth/session/server/frontend changes; existing manager/staff create/delete flow remains.
