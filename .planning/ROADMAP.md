# Roadmap

## Now

- Phase 013: Store workflow completion.
  Outcome: Quotes, deposits/payments, fitting appointments, production status changes, order handoff, inventory adjustments, customer follow-up, and manager review flows are complete enough for daily store use.
  Status: Planned.

## Next

- Phase 008: Git-connected production persistence activation.
  Outcome: The Git-connected Vercel production project has Supabase env vars, `/api/health` reports Supabase storage, and the live app passes authenticated read/write/reset smoke tests from the GitHub deployment.
  Status: Owner-side setup pending.
- Phase 014: Mobile, accessibility, and UX acceptance.
  Outcome: Core workflows pass mobile-first UAT, keyboard/focus checks, accessible labels, contrast review, empty/error/loading states, and no-overflow verification across target phone and desktop widths.
  Status: Planned.

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
- Phase 009: Deployment ownership and release lane.
  Outcome: Production releases from GitHub are documented around the `ADxZimmy` owner lane, preflight checks exist, rollback is documented, and collaborator-authored deploy limits are not a build blocker.
  Status: Complete locally; pending owner release.
- Phase 010: Data model and tenant hardening.
  Outcome: Workspace/audit/channel delivery migrations, workspace id validation, service-role key guidance, and manager-gated sanitized data export were added.
  Status: Complete locally; pending owner Supabase migration.
- Phase 011: Account lifecycle and RBAC hardening.
  Outcome: Staff invites, invite acceptance, password change, staff suspend/reactivate, session cleanup, audit history, and Settings controls were added.
  Status: Complete locally; pending owner release.
- Phase 012: Production channel rollout.
  Outcome: Webhook signature-required mode, dedupe, delivery events, consent metadata, batch limits, and non-leaking GET behavior were added.
  Status: Complete locally; pending provider credentials and owner release.

## Later

- Phase 015: Observability, backup, and security operations.
  Outcome: Production has runtime monitoring, error visibility, backup/restore rehearsal, secret rotation notes, API abuse controls, and a security review checklist.
  Status: Planned.
- Phase 016: Pilot UAT and launch readiness.
  Outcome: A real-store pilot validates onboarding, CRM intake, quote/order lifecycle, inventory deduction, reports, staff access, and recovery docs with issue triage before public launch.
  Status: Planned.
- Phase 017: Production cutover and post-launch support.
  Outcome: Custom domain, final env vars, release tag, handover docs, rollback plan, monitoring watch window, and post-launch issue process are in place.
  Status: Planned.
