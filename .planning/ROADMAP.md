# Roadmap

## Now

- Phase 021: Local-first pivot.
  Outcome: Each device owns its business data locally; the server database (Neon Postgres since 2026-10-02) holds identity (global accounts, memberships, sessions, invites, recovery codes), a transit inbox for provider webhooks, and opaque encrypted backups, and nothing else. Offline unlock, encrypted backup and restore onto a new device, and durable identity-plane rate limits ship with it.
  Status: Steps 0 to 7 built as of 2026-10-19. Step 0 (hotfix) reached production on 2026-08-18; steps 1 to 7 shipped in **Release A**, `v2.0.0` (`584277b`), on 2026-10-19. The server database moved from Supabase to Neon on 2026-10-02 after a second free-tier pause took production down. On 2026-10-19 the owner connected Neon (Frankfurt), UAT item 11's first confirmation passed (the legacy Supabase project holds no business data and no accounts), the build migrated Neon, and health, readiness, and the retired endpoints passed in production. Production smoke Steps 3 to 10 then passed in agent mode, including recovery, offline sign-out, and mandatory cleanup (`docs/production-smoke-2026-10-19.md`). Remaining, in order: the 14-day watch window, the Phase 021 UAT, Release B.

## Next

- Item: Pilot on the local-first model.
  Outcome: One real store runs a full operating cycle on its shop device (`docs/pilot-uat.md`, rewritten for the local-first model on 2026-10-19).
  Status: Release A is live; waiting for the Phase 021 UAT and for three product decisions the 2026-10-20 audit raised (`handover.md`, Open Questions). The pre-pivot pilot was waived on 2026-07-31.

- Item: Custom domain, if wanted.
  Outcome: A branded domain replaces the `fashion-store-os.vercel.app` alias as the public target.
  Status: Not done. v1.0.0 launched on the existing Vercel alias, so `docs/cutover.md` Steps 3 and 5 were skipped. Those steps remain written and applicable whenever a domain is registered.

- Item: Vercel ownership decision.
  Outcome: Collaborator-authored commits can deploy without owner intervention.
  Status: Open. `TEAM_ACCESS_REQUIRED` still blocks non-owner deploys on the Hobby plan, so emergency fixes require `ADxZimmy`.

## Done

- Phase 001: Initial Fashion Store OS MVP.
  Outcome: Brand-agnostic setup, dashboard, clients, inquiries, orders, measurements, catalog, inventory, production, settings, and local persistence were established.
  Status: Complete.
- Phase 002: Backend persistence foundation.
  Outcome: The static prototype runs behind a local backend API with server-backed state/auth persistence and local fallback.
  Status: Complete.
- Phase 003: Production persistence and bootstrap recovery.
  Outcome: Vercel API routes, Supabase document storage, storage diagnostics, and production bootstrap recovery were added and verified.
  Status: Complete.
- Phase 004: CRM channel intake.
  Outcome: WhatsApp/Instagram-style inbound messages can become CRM inbox inquiries with source, contact, message, routing status, and follow-up state.
  Status: Complete.
- Phase 005: Production auth hardening.
  Outcome: Server-backed auth stores password hashes/session hashes, issues HttpOnly cookies, returns sanitized auth, and gates staff changes behind manager sessions.
  Status: Complete and deployed.
- Phase 006: Intelligence and reporting.
  Outcome: Reports workspace shows conversion, revenue, workload, stock risk, reply drafts, quote drafts, stock alerts, production load, and learning insights.
  Status: Complete and deployed.
- Phase 007: Real channel integrations.
  Outcome: `/api/channel-webhook` normalizes direct and Meta-style provider payloads into the CRM intake queue with optional challenge/signature verification.
  Status: Complete and deployed.
- Phase 008: Git-connected production persistence activation.
  Outcome: The Git-connected Vercel production project has Supabase env vars, `/api/health` reports Supabase storage, and the live app passes authenticated read/write/reset smoke tests from the GitHub deployment.
  Status: Complete on 2026-06-29; activated against Supabase project `fashion-store` (`elkpberfbhwbrkawklnk`) and verified on the Vercel production aliases. Superseded by the move to Neon (Phase 021): `docs/owner-activation-runbook.md` now connects Neon instead.
- Phase 009: Deployment ownership and release lane.
  Outcome: Production releases from GitHub are documented around the `ADxZimmy` owner lane, preflight checks exist, rollback is documented, and collaborator-authored deploy limits are not a build blocker.
  Status: Complete and owner release verified.
- Phase 010: Data model and tenant hardening.
  Outcome: Workspace/audit/channel delivery migrations, workspace id validation, service-role key guidance, and manager-gated sanitized data export were added.
  Status: Complete and owner Supabase migration applied.
- Phase 011: Account lifecycle and RBAC hardening.
  Outcome: Staff invites, invite acceptance, password change, staff suspend/reactivate, session cleanup, audit history, and Settings controls were added.
  Status: Complete and deployed.
- Phase 012: Production channel rollout.
  Outcome: Webhook signature-required mode, dedupe, delivery events, consent metadata, batch limits, and non-leaking GET behavior were added.
  Status: Complete and deployed; pending provider credentials.
- Phase 013: Store workflow completion.
  Outcome: Payments, fittings, production activity, manager review, handoff, follow-up, and inventory adjustments were added to the daily store workflow.
  Status: Complete and deployed; pending pilot validation.
- Phase 014: Mobile, accessibility, and UX acceptance.
  Outcome: Toast live region, touch targets, reduced motion, mobile drawer regression checks, and `npm.cmd run ux:audit` were added.
  Status: Complete locally.
- Phase 015: Observability, backup, and security operations.
  Outcome: `/api/readiness`, local readiness parity, operations runbook, and `npm.cmd run ops:security` were added.
  Status: Complete and deployed. The local-first production backup/restore rehearsal passed on 2026-10-19 (smoke Steps 6 and 7; `docs/production-smoke-2026-10-19.md`).
- Phase 020: Production-readiness remediation.
  Outcome: Planned account-bound server-owned tenancy, conflict-safe server writes, server-enforced RBAC, durable abuse controls, and provider routing.
  Status: **Superseded on 2026-08-18 by the Phase 021 local-first pivot**, which inverts its premise. Surviving items were re-homed: abuse controls (rate limits, validation, quotas, retention) into 021 step 1, the anon-grant removal into 021 step 0 (applied 2026-08-18), CSP/security headers and a CI push gate into 021 step 6 (built 2026-10-19). Alerting is deliberately deferred and stays tracked as the Later item below. The plan documents remain as the record of the server-data-plane direction not taken.

- Phase 019: Multi-device workspace access.
  Outcome: Short-lived human-typable workspace codes let a manager open a workspace on a second device, and invites now carry their workspace so they can be accepted from the invitee's own browser.
  Status: Implemented and verified locally on 2026-08-03; 38 unit assertions plus an API round trip. Migration `20260803120000_create_workspace_codes.sql` was applied to production Supabase on 2026-08-03 and local/remote migration ledgers match. Production join/invite smoke remains outstanding. Account-based tenancy remains deliberately out of scope. **Retired in Phase 021**: global accounts made sign-in from any device replace the join-code bridge. `/api/workspace-code` returns 410 until Release B deletes it.

- Phase 018: Account recovery and password reset.
  Outcome: One-time recovery codes issued at manager signup and re-issuable from Settings, manager-issued codes for colleagues, a redeem flow that grants no session, and a documented owner last-resort procedure.
  Status: Implemented, verified locally, and deployed from `2a4a696` on 2026-08-03. Raised by the production smoke test, where a forgotten manager password made a workspace permanently unreachable. Email-based reset stayed out of scope: no mail capability exists, and the project constrains new dependencies. Rebuilt on the row-based identity plane in Phase 021. The production recovery round trip passed on 2026-10-19 (`docs/production-smoke.md` Step 8; evidence in `docs/production-smoke-2026-10-19.md`). The owner last-resort procedure was rewritten for Neon and checked against the real code path on 2026-10-19, locally; it has not been run against production.

- Phase 016: Pilot UAT and launch readiness.
  Outcome: Pilot UAT script, issue triage, and `npm.cmd run launch:check` were added.
  Status: Complete locally; real-store pilot execution waived on 2026-07-31. The script was rewritten for the local-first model on 2026-10-19 (see Next).

- Item: v1.0.0 post-launch watch window (14 days from 2026-08-03).
  Outcome: Daily health and readiness checks, cron and log scans, and sev-1 to sev-4 triage.
  Status: Superseded. The window elapsed on 2026-08-17 without its exit evidence (seven consecutive cron runs) being gathered, and the deployment it watched has been down since the 2026-10-02 pause. A new 14-day window starts at Release A (`docs/operations-runbook.md`, Post-Launch Support).

- Item: v1.0.0 production write-path verification.
  Outcome: A browser smoke of manager signup, business setup, and server persistence.
  Status: Superseded, never run. Phase 021 removed the server write path it existed to verify. The local-first smoke is `docs/production-smoke.md`.

- Item: Order workflow audit fixes.
  Outcome: Defects found by reading `src/app.js` against the original brief were fixed and guarded: Advance completing an order and stranding its reserved stock, an inquiry converting into duplicate orders, false learning records, an inch-only size allowance, cancelled orders counted on the dashboard, a theme preset that erased the business identity, stale manager copy, and a branded favicon.
  Status: Released 2026-10-20 as `0ec6175` and verified in production (STATE, Verification Snapshot).

- Item: Feature sweep fixes.
  Outcome: A full feature sweep in a browser found three defects every suite had passed, now fixed and guarded: Record payment refused every ordinary amount, price fields took only whole thousands, and Load from a file replaced the device's records with any JSON, unasked.
  Status: Released 2026-10-21 as `9b58c13` and verified in production (STATE, Verification Snapshot). Minor sweep findings are tracked under STATE, Known Defects.

## Later

- Item: Post-launch enhancements.
  Outcome: Incorporate issues surfaced by the watch window and by real usage.
  Status: Planned. Originally scoped as "post-pilot enhancements" fed by pilot feedback; since pilot UAT was waived on 2026-07-31, the input is now watch-window findings and operator reports instead.

- Item: Alerting.
  Outcome: An outage notifies someone instead of waiting to be noticed.
  Status: Not started. The daily maintenance cron records failures in the Vercel dashboard but pages nobody: the gap that let the 2026-07-30 outage run unnoticed for a month. Since Phase 021 a database outage no longer stops signed-in shops, but it still blocks sign-in on new devices, backups, recovery, and the inbox.
