# UAT

Status: Pending. Run after the owner cutover, using `docs/pilot-uat.md` scenarios against the live custom domain.

## Scenario

Owner opens the live custom domain, completes workspace setup, runs one CRM-intake-to-handoff order, checks Reports, and confirms data persists across a refresh and a second browser.

## Result

Not run.

## Notes

- Cutover UAT reuses the six pilot scenarios in `docs/pilot-uat.md`; this file records the production-domain run, not a separate script.
- Capture the final domain, release tag, and deployment id here once cutover completes.
