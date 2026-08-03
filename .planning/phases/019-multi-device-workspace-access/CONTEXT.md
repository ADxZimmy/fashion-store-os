# Context

## Goal

Let a person open the same workspace from more than one device. Today a workspace is reachable only from the single browser that created it, and there is no supported way to attach a second device to it.

## Trigger

Found on 2026-08-03. An operator switched machines and could not reach their workspace: the new browser generated a fresh `x-workspace-id`, landed in an empty workspace, and their existing account was not there. The only workaround available was to read `fashion-studio-os-workspace-v1` out of `localStorage` on the first machine and paste it into the second — an internal implementation detail handed to a user because no product path exists.

## The Larger Finding

Staff invites are already broken for their stated purpose, and this is shipped behaviour rather than a missing feature.

`acceptStaffInvite` resolves the workspace from the `x-workspace-id` header, then looks for the invited user inside it (`api/_auth.js`). A staff member opening the app on their own device is in a brand-new empty workspace, so the invited user does not exist there and the invite fails with "Invite details do not match." The invite can only be redeemed on the same browser that created it, which defeats the point of inviting anyone.

Phase 011 built invites, and Phase 018 built manager-issued recovery codes on the same assumption. Both are handed to another person, and both currently require that person to be sitting at the manager's browser.

## Dependency

Phase 018 is complete and supplies the pattern to reuse: generate a token, store only `hashToken(...)`, return the raw value once, redeem it against a stored hash with `crypto.timingSafeEqual`. This phase applies the same shape to a different problem.

Phase 010 added `fashion_store_os_workspaces`, `fashion_store_os_audit_events`, and `fashion_store_os_channel_delivery_events` alongside `fashion_store_os_documents`, so adding a table is an established move here rather than a new kind of change.

## The Constraint That Shapes Everything

All storage is workspace-scoped. `storeForRequest` binds every read and write to the workspace resolved from the header, deliberately, so a handler cannot touch another tenant's documents.

A join code has to be looked up by someone who does **not** yet know the workspace, which is the one lookup the current model cannot express. That is why this needs a small table outside the per-workspace document store, not another document key.

## Relevant Files

- Path: `api/_store.js`
  Why it matters: `resolveWorkspaceId`, `validateWorkspaceId`, and `storeForRequest` define how a request is bound to a tenant. The join lookup must sit outside that binding without weakening it.
- Path: `api/_auth.js`
  Why it matters: Holds the invite and recovery token patterns to reuse, and `acceptStaffInvite`, which needs to work cross-device.
- Path: `src/app.js`
  Why it matters: `getWorkspaceId` / `generateWorkspaceId` own the device's workspace id and the `x-workspace-id` header. Adoption happens here.
- Path: `supabase/migrations/`
  Why it matters: A new table needs a migration with explicit grants and RLS, matching `20260626191000_harden_workspaces_audit_and_channel_events.sql`.
- Path: `docs/pilot-uat.md`
  Why it matters: States "One browser = one studio" as a rule for testers. That guidance changes when this ships.

## Decisions

- Decision: A join code resolves to a workspace id and nothing else. It is not authentication.
  Reason: Keeps the security story simple and true — the code tells a browser which tenant to address, and the existing sign-in or invite flow still decides whether you get in. A code alone must never yield data.
- Decision: Join codes expire, in deliberate contrast to Phase 018 recovery codes.
  Reason: The two have opposite usage shapes. A recovery code is used long after issue, so a TTL would defeat it. A join code is read off one screen and typed into another within minutes, so a short TTL costs nothing and sharply limits a leaked or brute-forced code. Do not copy Phase 018's no-expiry reasoning here.
- Decision: Codes are short and human-typable, from an alphabet excluding visually ambiguous characters.
  Reason: The real use is someone reading a code off a phone and typing it on a laptop. A base64url token is fine to paste and miserable to transcribe. Shortness is paid for with the TTL, limited uses, and rate limiting rather than with entropy alone.
- Decision: Store only a hash of the code, and audit issue and redemption.
  Reason: Matches `inviteTokenHash` and `recoveryCodeHash`. A join code at rest is a standing invitation to a tenant.
- Decision: Fix `accept-invite` to carry its workspace rather than adding a parallel mechanism.
  Reason: Invites are already the flow for onboarding another person onto a device they own. Making the invite token resolve its workspace fixes the existing bug and avoids a second concept users have to learn.
- Decision: Do not move to account-based tenancy in this phase.
  Reason: Deriving the workspace from the signed-in identity is the conventional architecture, but it needs a global email-to-workspace directory, which changes the enumeration properties `sanitizeAuth` was built to protect and rewrites the auth model. That is a separate, larger decision and should not be smuggled in behind a usability fix.

## Risks

- Risk: The join code becomes a way to enumerate or squat on workspaces.
  Mitigation: Hash at rest, constant-time compare, generic failure message, short TTL, limited uses, and rate limiting on the lookup endpoint. Redeeming a code grants no data and no session.
- Risk: A workspace with no manager can be claimed by anyone holding its id, because signup is only refused when a manager already exists.
  Mitigation: Present in the current model too, but joining makes ids more mobile. Verify the behaviour explicitly and consider refusing signup on any workspace that was joined rather than created.
- Risk: Adopting a workspace silently abandons the device's current one, orphaning its rows exactly as the 2026-08-03 workaround did.
  Mitigation: Warn before switching when the current workspace holds data, and surface the outgoing id so it can be recorded.
- Risk: A partial implementation leaves invites broken in a new way.
  Mitigation: Treat the cross-device invite as a verification gate, not a nice-to-have — a staff member on a genuinely separate browser profile must be able to redeem an invite end to end.
- Risk: The new table drifts from the RLS and grant conventions of the existing ones.
  Mitigation: Model the migration on the Phase 010 hardening migration, with explicit grants and RLS enabled.
