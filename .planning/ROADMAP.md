# Roadmap

## Now

- Phase 008: Git-connected production persistence activation.
  Outcome: The Git-connected Vercel production project has Supabase env vars, `/api/health` reports Supabase storage, and the live app passes authenticated read/write/reset smoke tests from the GitHub deployment.
  Status: Planned.

## Next

- Phase 009: Deployment ownership and release lane.
  Outcome: Production releases from GitHub are repeatable, owner/collaborator restrictions are resolved or documented, rollback is defined, and the canonical production URL is clear.
  Status: Planned.
- Phase 010: Data model and tenant hardening.
  Outcome: Persistence moves beyond a single workspace document into a production-safe Supabase shape with migrations, tenant/workspace boundaries, RLS policy review, seed/backup strategy, and data export paths.
  Status: Planned.
- Phase 011: Account lifecycle and RBAC hardening.
  Outcome: Manager/staff roles, invite/onboarding, session expiry, password reset/change, audit history, and protected admin actions are ready for real store operations.
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

## Later

- Phase 012: Production channel rollout.
  Outcome: Real WhatsApp/Instagram credentials, webhook verification, duplicate prevention, consent handling, rate-limit behavior, and channel failure states are production tested without committing secrets.
  Status: Planned.
- Phase 013: Store workflow completion.
  Outcome: Quotes, deposits/payments, fitting appointments, production status changes, order handoff, inventory adjustments, customer follow-up, and manager review flows are complete enough for daily store use.
  Status: Planned.
- Phase 014: Mobile, accessibility, and UX acceptance.
  Outcome: Core workflows pass mobile-first UAT, keyboard/focus checks, accessible labels, contrast review, empty/error/loading states, and no-overflow verification across target phone and desktop widths.
  Status: Planned.
- Phase 015: Observability, backup, and security operations.
  Outcome: Production has runtime monitoring, error visibility, backup/restore rehearsal, secret rotation notes, API abuse controls, and a security review checklist.
  Status: Planned.
- Phase 016: Pilot UAT and launch readiness.
  Outcome: A real-store pilot validates onboarding, CRM intake, quote/order lifecycle, inventory deduction, reports, staff access, and recovery docs with issue triage before public launch.
  Status: Planned.
- Phase 017: Production cutover and post-launch support.
  Outcome: Custom domain, final env vars, release tag, handover docs, rollback plan, monitoring watch window, and post-launch issue process are in place.
  Status: Planned.
