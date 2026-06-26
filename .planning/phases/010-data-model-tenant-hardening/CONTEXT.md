# Context

## Goal

Move the persistence model toward production-safe workspace boundaries, explicit Supabase grants/RLS, audit events, delivery events, and safer server-side key usage while preserving the current app API.

## Relevant Files

- Path: `api/_store.js`
  Why it matters: Server-side Supabase REST helper and workspace selection.
- Path: `supabase/migrations/20260626191000_harden_workspaces_audit_and_channel_events.sql`
  Why it matters: Adds workspace, audit, and channel delivery tables.
- Path: `docs/production-persistence.md`
  Why it matters: Documents env vars, migrations, and verification expectations.

## Decisions

- Decision: Keep the existing `state` / `auth` document table for app compatibility.
  Reason: Avoids a risky full data migration while adding production scaffolding.
- Decision: Prefer `SUPABASE_SERVICE_ROLE_KEY` for Vercel/server runtime.
  Reason: New production tables are server-managed and explicitly grant `service_role`.

## Risks

- Risk: Migration was added manually because the local Supabase CLI shim was unavailable.
  Mitigation: Validate SQL syntax with static checks and document the CLI issue in verification.
