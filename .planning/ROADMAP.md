# Roadmap

## Now

- Item: Post-launch watch window (14 days from 2026-08-03).
  Outcome: Daily `/api/health` + `/api/readiness` checks, Vercel Cron Jobs and Runtime Log scans, and sev-1..4 triage per the Post-Launch Support section of `docs/operations-runbook.md`.
  Status: Open. Exit criteria are no unresolved sev-1/sev-2 issues and 7 consecutive successful keepalive cron runs.

- Item: Production write-path verification.
  Outcome: `docs/cutover.md` Step 6 browser smoke — manager signup, business setup, refresh persistence, second-browser workspace isolation.
  Status: Outstanding and owner-side. The first exercise of the write path since the Supabase restore; reads and health endpoints are verified, writes are not.

- Phase 020: Production-readiness remediation.
  Outcome: Tenancy is account-bound rather than device-bound; writes are conflict-safe and recoverable; permissions are enforced by the server; public endpoints have durable abuse controls; provider webhooks route to an owned workspace with real secrets.
  Status: Plan drafted (`.planning/phases/020-production-readiness-remediation/`); recommended before broader multi-user production use. Phase 019 now supplies the short-lived code bridge for multi-device access.

## Next

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
  Status: Complete on 2026-06-29; activated against Supabase project `fashion-store` (`elkpberfbhwbrkawklnk`) and verified on the Vercel production aliases.
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
  Status: Complete and deployed; owner-side backup/restore rehearsal pending.
- Phase 019: Multi-device workspace access.
  Outcome: Short-lived human-typable workspace codes let a manager open a workspace on a second device, and invites now carry their workspace so they can be accepted from the invitee's own browser.
  Status: Implemented and verified locally on 2026-08-03; 38 unit assertions plus an API round trip. Migration `20260803120000_create_workspace_codes.sql` was applied to production Supabase on 2026-08-03 and local/remote migration ledgers match. Production join/invite smoke remains outstanding. Account-based tenancy remains deliberately out of scope.

- Phase 018: Account recovery and password reset.
  Outcome: One-time recovery codes issued at manager signup and re-issuable from Settings, manager-issued codes for colleagues, a redeem flow that grants no session, and a documented owner last-resort procedure.
  Status: Implemented, verified locally, and deployed from `2a4a696` on 2026-08-03. Raised by the production smoke test, where a forgotten manager password made a workspace permanently unreachable. Email-based reset stayed out of scope — no mail capability exists and the project constrains new dependencies. Outstanding: the production recovery round trip (`docs/production-smoke.md` Step 6) and a rehearsal of the owner last-resort procedure.

- Phase 016: Pilot UAT and launch readiness.
  Outcome: Pilot UAT script, issue triage, and `npm.cmd run launch:check` were added.
  Status: Complete locally; real-store pilot execution waived on 2026-07-31.

## Later

- Item: Post-launch enhancements.
  Outcome: Incorporate issues surfaced by the watch window and by real usage.
  Status: Planned. Originally scoped as "post-pilot enhancements" fed by pilot feedback; since pilot UAT was waived on 2026-07-31, the input is now watch-window findings and operator reports instead.

- Item: Alerting.
  Outcome: An outage notifies someone instead of waiting to be noticed.
  Status: Not started. The keepalive cron records failures in the Vercel dashboard but pages nobody — this is the gap that let the 2026-07-30 outage run unnoticed for a month.
