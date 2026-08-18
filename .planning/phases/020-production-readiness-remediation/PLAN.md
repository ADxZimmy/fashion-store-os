# Plan

## Outcome

A real studio can onboard a manager, invite staff on another device, work without lost updates, enforce role permissions at the API, receive verified provider messages in the correct workspace, and recover/operate the service with repeatable tests and monitoring.

## Scope

Included:

- Server-owned workspace membership and cross-device invite/join flow.
- Conflict detection, retry/recovery, and explicit save failure handling.
- Server-enforced role/capability checks for state-changing operations.
- Rate limits/quotas, security headers, secret-complete webhook configuration, and provider-to-workspace routing.
- Automated API/browser checks, CI release gate, backup/restore rehearsal, alerting, and pilot evidence.

Excluded:

- Billing, subscription tiers, public marketplace features, and advanced analytics.
- More than one real channel provider in the first production candidate.
- Broad UI redesign unrelated to launch blockers.

## Steps

1. Replace the implicit per-device tenant boundary with account-bound server-owned workspaces and memberships, retaining the Phase 019 short-lived code bridge and Phase 018 recovery path during migration.
2. Add a version/revision contract to writes, reject stale updates, queue/retry failed saves, and provide a visible conflict recovery flow. Decide whether to keep versioned documents temporarily or normalize core order/inventory/payment records now.
3. Move authorization to the API. Use command/module endpoints or validated diffs so staff can change only the records/actions allowed by their role; add tests for horizontal and vertical privilege escalation.
4. Add public abuse controls: signup/sign-in rate limits, failed-login throttling, workspace/user/storage quotas, request schema validation, and cleanup/retention rules.
5. Bind provider credentials/events to an owned workspace, configure `CHANNEL_WEBHOOK_SECRET` and `CHANNEL_WEBHOOK_VERIFY_TOKEN`, retain `CRON_SECRET` protection, and run signed/unsigned/retry delivery tests.
6. Add CSP and standard security headers, remove the legacy anon grant/policy for the `default` documents, and run database/security lint or advisors successfully.
7. Add CI for syntax/build/security checks plus API and browser end-to-end tests covering manager signup, recovery, second-device invite acceptance, concurrent-write conflict, RBAC denial, order lifecycle, export, and cleanup.
8. Rehearse backup/restore, configure actionable alerts for health/cron/5xx failures, run the real-store pilot with no open P0/P1 issues, and record post-launch evidence.

## Verification

- Check: A manager invite is accepted from a fresh browser/device and both users resolve the same server-owned workspace.
  Expected: Staff sees only assigned capabilities and cannot access or mutate another workspace.
- Check: Two authenticated devices edit overlapping data from the same base revision.
  Expected: The stale write is rejected or merged explicitly; no silent data loss occurs.
- Check: Simulated network failure during save, followed by reload/recovery.
  Expected: Unsynced work is retained, retried, or presented for resolution rather than overwritten.
- Check: Signed provider challenge/message/retry flow.
  Expected: Valid traffic reaches the intended studio; unsigned/invalid traffic is rejected; duplicates are idempotent.
- Check: CI, dependency audit, database lint/advisors, security headers, backup/restore rehearsal, and pilot UAT.
  Expected: All pass with no open P0/P1 issue before broader production use.

## Rollback

Keep the current document APIs available behind a temporary compatibility flag until migrated workspaces pass export/import and UAT. Roll back application deployment through Vercel promotion, and restore schema changes only through forward migrations; do not reset Git or delete production data.
