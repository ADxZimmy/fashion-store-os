# Roadmap

## Now

- Phase: Production bootstrap recovery.
  Outcome: Vercel production APIs accurately report Supabase reachability, `/api/bootstrap` no longer masks storage failures, and the live app can persist/reload state from an active Supabase project.
  Status: In progress.

## Next

- Phase: CRM channel intake.
  Outcome: WhatsApp/Instagram-style inbound messages can become CRM inbox inquiries with source, contact, message, routing status, and follow-up state.
  Status: Next.
- Phase: Production auth hardening.
  Outcome: Replace local prototype passwords and shared workspace access with a production authentication/authorization model.
  Status: Planned.

## Done

- Phase: Backend persistence foundation.
  Outcome: The static prototype runs behind a local backend API with server-backed state/auth persistence and local fallback.
  Status: Complete.

## Later

- Phase: Intelligence and reporting.
  Outcome: AI reply drafts, auto-quote drafts, smart stock alerts, and richer reports.
  Status: Planned.
