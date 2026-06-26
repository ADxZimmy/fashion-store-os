# Plan

## Outcome

Persistence moves beyond a single workspace document into a production-safe Supabase shape with migrations, tenant/workspace boundaries, RLS policy review, seed/backup strategy, and data export paths.

## Scope

Included:
- Workspace registry migration.
- Audit and channel delivery event tables.
- Explicit grants/RLS for new tables.
- Workspace id validation and server-side key preference.
- Production persistence docs update.

Excluded:
- Full normalized replacement for all app records.
- Applying migrations to the owner Supabase project.

## Steps

1. Add Supabase migration for workspace/audit/channel delivery tables.
2. Harden `api/_store.js` key selection and workspace validation.
3. Update docs/env example for service-role production runtime.
4. Verify JavaScript and build checks.

## Verification

- Check: `npm.cmd run check`
  Expected: All JavaScript files parse.
- Check: `npm.cmd run build`
  Expected: Static build succeeds.

## Rollback

Revert the migration and `_store.js` changes; existing document persistence remains the fallback model.
