# Roadmap

## Now

- Phase: GitHub-triggered Vercel deployment polish.
  Outcome: Production deploys flow cleanly from the GitHub branch once team-author restrictions are fully resolved.
  Status: Planned.

## Next

- Phase: To be selected after live UAT.
  Outcome: Pick the next product slice from data workflows, validation, accessibility, or GitHub-triggered deployment polish.
  Status: Open.

## Done

- Phase: Production auth hardening.
  Outcome: Server-backed auth stores password hashes/session hashes, issues HttpOnly cookies, returns sanitized auth, and gates staff changes behind manager sessions.
  Status: Complete and deployed.
- Phase: Intelligence and reporting.
  Outcome: Reports workspace shows conversion, revenue, workload, stock risk, reply drafts, quote drafts, stock alerts, production load, and learning insights.
  Status: Complete and deployed.
- Phase: Real channel integrations.
  Outcome: `/api/channel-webhook` normalizes direct and Meta-style provider payloads into the CRM intake queue with optional challenge/signature verification.
  Status: Complete and deployed.
- Phase: Backend persistence foundation.
  Outcome: The static prototype runs behind a local backend API with server-backed state/auth persistence and local fallback.
  Status: Complete.
- Phase: Production bootstrap recovery.
  Outcome: Vercel production APIs accurately report Supabase reachability, `/api/bootstrap` no longer masks storage failures, and the live app can persist/reload state from an active Supabase project.
  Status: Complete.
- Phase: CRM channel intake.
  Outcome: WhatsApp/Instagram-style inbound messages can become CRM inbox inquiries with source, contact, message, routing status, and follow-up state.
  Status: Complete.

## Later
