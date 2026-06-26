# Context

## Goal

Harden manager/staff account lifecycle with invitations, status changes, password updates, session cleanup, and audit history.

## Relevant Files

- Path: `api/_auth.js`
  Why it matters: Shared auth, session, RBAC, invite, and audit logic.
- Path: `api/session.js`
  Why it matters: Vercel session route.
- Path: `server.js`
  Why it matters: Local development session route mirror.
- Path: `src/app.js`
  Why it matters: Settings and onboarding controls for invite acceptance and staff status.

## Decisions

- Decision: Staff invites are token-based and displayed once to the manager.
  Reason: Avoids email-provider dependency while enabling real onboarding.
- Decision: Suspended staff sessions are invalidated.
  Reason: Prevents stale cookies from retaining access after manager action.

## Risks

- Risk: Invite token sharing is manual for now.
  Mitigation: Token expires and is shown as a one-time manager handoff; email sending remains a later phase.
