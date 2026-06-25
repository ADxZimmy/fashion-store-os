# Context

## Goal

Add a practical CRM channel intake layer so WhatsApp/Instagram-style messages can be captured, reviewed, followed up, and routed into CRM Inbox inquiries.

## Relevant Files

- Path: `src/app.js`
  Why it matters: Owns the app state model, CRM Inbox rendering, inquiry creation, and inquiry-to-order conversion.
- Path: `src/styles.css`
  Why it matters: Owns panel, form, record, and responsive behavior for the CRM Inbox UI.
- Path: `server.js`
  Why it matters: Local backend routes must support the same inbound API shape used in production.
- Path: `api/`
  Why it matters: Vercel serverless routes persist production state through Supabase.
- Path: `.planning/ROADMAP.md`
  Why it matters: Names this phase as the next GSD workstream.

## Decisions

- Decision: Treat channel intake as raw messages feeding the existing CRM Inbox, not as a separate navigation module.
  Reason: The current product already has a CRM Inbox; channel intake should deepen that workflow instead of adding another place to check.
- Decision: Store channel messages inside the existing state document.
  Reason: It keeps local JSON, Supabase production persistence, and browser fallback aligned without introducing a second data store.
- Decision: Add `/api/inbound` as a same-origin JSON endpoint.
  Reason: It gives live testing and future integrations a stable way to append messages without requiring direct state-document writes.

## Risks

- Risk: This is not a real WhatsApp or Instagram API integration.
  Mitigation: Keep the UI and endpoint shaped like an intake adapter, but leave OAuth/webhook platform integrations out of this phase.
- Risk: Prototype auth still allows shared-workspace access.
  Mitigation: Keep production auth hardening as the next planned phase.
