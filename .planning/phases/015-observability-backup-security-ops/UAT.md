# UAT

## Scenario

A production maintainer checks `/api/health`, checks `/api/readiness`, reviews runtime logs, confirms Supabase backups, rehearses export/restore with non-production data, rotates secrets, and records the result before launch.

## Result

Ready for owner-side rehearsal; local checks passed.

## Notes

No secrets or customer data should be copied into planning artifacts.
