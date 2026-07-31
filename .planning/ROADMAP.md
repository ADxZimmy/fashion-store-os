# Roadmap

## Now

- Phase 017: Production cutover and post-launch support.
  Outcome: Custom domain, final env vars, release tag, handover docs, rollback plan, monitoring watch window, and post-launch issue process are in place.
  Status: Repo-side complete on 2026-07-31 — `docs/cutover.md` authored, post-launch watch window and issue intake added to `docs/operations-runbook.md`, handover/roadmap/state updated. Remaining steps are owner-only: Ready-deployment confirmation, annotated release tag, Vercel domain, `/api/health` gate, then DNS.

## Next

- Item: Owner-side cutover execution.
  Outcome: `ADxZimmy` works `docs/cutover.md` steps 1-7, ending with a live public domain and an open watch window.
  Status: Pending owner execution. Also pending owner-side: set `CRON_SECRET`, confirm the `/api/keepalive` cron is registered.

- Item: Real-store pilot UAT.
  Outcome: A live store operator completes `docs/pilot-uat.md` and records issues.
  Status: **Waived by owner decision on 2026-07-31** to proceed directly to cutover. Not executed. The scenarios are reused as the post-cutover smoke set in `docs/cutover.md` Step 6, which means they run after the domain is live rather than gating it. The production write path remains unvalidated by a real operator.

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
- Phase 016: Pilot UAT and launch readiness.
  Outcome: Pilot UAT script, issue triage, and `npm.cmd run launch:check` were added.
  Status: Complete locally; real-store pilot execution waived on 2026-07-31.

## Later

- Item: Post-pilot enhancements and public launch follow-up.
  Outcome: Incorporate pilot feedback before final public cutover.
  Status: Planned after Phase 017.
