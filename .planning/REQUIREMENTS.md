# Requirements

## Functional

- Requirement: First-launch business setup.
  Acceptance: When no profile exists, the app shows setup for business identity, contact details, currency, measurement/fabric units, logo, and brand colors, then persists it.
- Requirement: Brand-agnostic operating dashboard.
  Acceptance: The dashboard uses the saved business name and shows inquiries, active orders, due work, fittings, production workload, low stock, reserved materials, revenue, and production status.
- Requirement: Client, inquiry, order, measurement, catalog, recipe, inventory, and production modules.
  Acceptance: Each module has usable records, creation/edit flows where needed, and fashion/tailoring terminology.
- Requirement: Style recipe and material estimation.
  Acceptance: Garment recipes calculate practical estimated material needs from base fabric, fabric width, wastage, and selected design modifiers.
- Requirement: Inventory reservation and deduction workflow.
  Acceptance: Confirmed orders reserve estimated materials; cutting deducts actual fabric and releases unused reserve; completion deducts finishing items and records estimate-vs-actual learning.
- Requirement: Appearance/branding settings.
  Acceptance: Users can update display name, logo, primary/accent/sidebar/success colors, background mode, and contact details.
- Requirement: Backend-backed persistence foundation.
  Acceptance: When served through the local app backend, state and auth records load from and save to server-managed JSON files; when deployed on Vercel, the same API contract persists state and auth records to Supabase; direct/static usage falls back to localStorage.
- Requirement: CRM channel intake.
  Acceptance: WhatsApp/Instagram-style messages can be captured as raw channel records with source, sender/contact, message, desired garment, deadline, routing status, and follow-up state, then routed into the CRM inquiry pipeline.
- Requirement: Production auth hardening.
  Acceptance: Server-backed environments store password hashes and session-token hashes instead of plaintext passwords, issue HttpOnly session cookies, sanitize auth data returned to the browser, and keep staff access changes behind manager authorization.
- Requirement: Intelligence and reporting.
  Acceptance: The app provides a Reports workspace with conversion, revenue, workload, stock-risk, reply-draft, quote-draft, and learning-insight outputs derived from current Studio OS records.
- Requirement: Real channel webhook adapters.
  Acceptance: A server API accepts direct and Meta-style webhook payloads, optionally verifies challenge/signature secrets from environment variables, normalizes provider messages, and appends them to the existing CRM channel queue without committing third-party tokens.

## Non-Functional

- Requirement: Responsive, modern, calm operations UI.
  Acceptance: The app works on desktop and narrow screens without overlapping content.
- Requirement: Persistent workspace state.
  Acceptance: Refreshing the browser retains profile, records, reservations, auth/session records, and theme settings through backend storage when available or browser storage as fallback.
- Requirement: Clear async feedback.
  Acceptance: The app shows a loading state while checking backend storage and exposes whether records are using server storage or browser fallback.
- Requirement: Production storage observability.
  Acceptance: `/api/health` performs a real Supabase reachability probe, returns a redacted host/workspace summary, and reports storage failures without exposing secrets.

## Out Of Scope

- Item: Platform OAuth setup, paid WhatsApp Business onboarding, Graph API permission review, and outbound send APIs.
- Item: Database-native per-tenant RBAC beyond the current single-workspace document model.
- Item: Advanced pattern-making mathematics.

## Open Questions

- Question: Should a later phase migrate this static MVP into the missing existing app framework if that source tree is provided?
  Status: Open.
- Question: Which production backend should replace the current JSON-file persistence layer?
  Status: Answered for the current slice; Vercel production uses Supabase document storage while the local backend remains dependency-free.
