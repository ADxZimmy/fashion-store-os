# Context

## Goal

Turn the feature-complete MVP into a production candidate that can safely support a real studio after the Phase 017 alias cutover and Phase 019 multi-device code bridge.

## Relevant Files

- Path: `src/app.js`
  Why it matters: Generates per-device workspace ids, handles local fallback, permissions, and whole-state saves.
- Path: `api/_store.js`
  Why it matters: Resolves workspace tenancy and persists the `state` and `auth` documents.
- Path: `api/_auth.js`, `api/session.js`, `api/state.js`
  Why it matters: Own session, account, and authorization behavior.
- Path: `api/channel-webhook.js`
  Why it matters: Must bind verified provider traffic to the intended studio workspace.
- Path: `supabase/migrations/`
  Why it matters: Current storage is document-oriented and needs membership/versioning or a normalized operational model.
- Path: `vercel.json`, `docs/operations-runbook.md`
  Why it matters: Security headers, cron protection, monitoring, backup, and release operations live here.

## Decisions

- Decision: Treat Phase 020 as production hardening that follows the Phase 019 multi-device workspace-code bridge.
  Reason: A healthy deployment and password recovery are not sufficient evidence for multi-user data safety.
- Decision: Optimize first for one real studio with multiple staff/devices; do not add billing or broad SaaS administration in this phase.
  Reason: This is the smallest useful production target.
- Decision: Use server-owned workspace membership and server-enforced authorization; a browser-generated header is not an identity boundary.
  Reason: Cross-device invites, provider routing, and permissions all require a durable workspace relationship.

## Risks

- Risk: Replacing the document model in one rewrite could destabilize the validated workflows.
  Mitigation: Introduce versioned compatibility APIs and migrate module-by-module with export/rollback support.
- Risk: Existing test workspaces may not have membership metadata.
  Mitigation: Add an explicit migration/claim path and test it on non-production data first.
- Risk: Security changes can lock out the owner.
  Mitigation: Preserve the Phase 018 recovery path and Phase 019 workspace-code bridge while enforcing the new model.
