# Roadmap

## Now

- Phase: Production auth hardening.
  Outcome: Replace local prototype passwords and shared workspace access with a production authentication/authorization model.
  Status: Complete locally; pending production deploy.

## Next

- Phase: Intelligence and reporting.
  Outcome: AI reply drafts, auto-quote drafts, smart stock alerts, and richer reports.
  Status: Complete locally; pending production deploy.
- Phase: Real channel integrations.
  Outcome: Signed webhook adapters normalize WhatsApp/Instagram-style provider payloads into the CRM intake queue.
  Status: Complete locally; pending production deploy.

## Done

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

- Phase: GitHub-triggered Vercel deployment polish.
  Outcome: Production deploys flow cleanly from the GitHub branch once team-author restrictions are fully resolved.
  Status: Planned.
