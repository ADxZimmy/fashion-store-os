# UAT

Status: Pending.

## Scenario

A manager creates a studio, invites a staff member who joins from a second fresh device, both users complete an inquiry-to-handoff workflow with overlapping activity, a temporary network failure occurs during a save, a signed provider event reaches the same workspace, and the manager exports/recover-checks the final records.

## Result

Not run.

## Notes

- No silent overwrite, cross-workspace access, unauthorized action, duplicate provider event, or unrecoverable local change is acceptable.
- Complete the six business scenarios in `docs/pilot-uat.md` after this Phase 020 security/concurrency scenario passes.
