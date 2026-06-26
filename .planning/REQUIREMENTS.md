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
- Requirement: Owner-safe GitHub/Vercel release lane.
  Acceptance: The repo documents the `ADxZimmy` owner-release path, provides a preflight command, and does not rely on spoofed commit authorship to bypass Vercel Hobby permissions.
- Requirement: Workspace-aware production persistence.
  Acceptance: Supabase migrations define workspace metadata, audit events, and channel delivery events with explicit grants/RLS; server code validates workspace ids and prefers server-side Supabase keys.
- Requirement: Manager-gated data export.
  Acceptance: Managers can call a server API to export workspace state and sanitized auth/audit metadata without exposing password hashes or session-token hashes.
- Requirement: Staff lifecycle management.
  Acceptance: Managers can create staff invites, staff can accept invites and set passwords, users can change passwords, managers can suspend/reactivate staff, and lifecycle events appear in audit history.
- Requirement: Production channel rollout safeguards.
  Acceptance: Provider webhooks can require signatures, cap batch size, deduplicate retries, record delivery events, preserve consent status, and avoid exposing message queues through public GET requests.
- Requirement: Daily store order workflow.
  Acceptance: Orders support payment records, balance tracking, fitting scheduling/completion, manager review request/approval/change states, handoff details, customer follow-up state, and activity history.
- Requirement: Audited inventory adjustments.
  Acceptance: Restocks and manual inventory adjustments update stock while recording item, quantity before/after, reason, note, actor, and timestamp; adjustments below reserved quantity are blocked.
- Requirement: Production readiness diagnostics.
  Acceptance: `/api/readiness` returns safe readiness checks for storage configuration, server-side Supabase key usage, workspace id, webhook signature mode, owner release lane, and operations runbook presence.
- Requirement: Pilot launch readiness.
  Acceptance: A pilot UAT document and `npm.cmd run launch:check` validate core local gates before owner-side production release.

## Non-Functional

- Requirement: Responsive, modern, calm operations UI.
  Acceptance: The app works on desktop and narrow screens without overlapping content.
- Requirement: Persistent workspace state.
  Acceptance: Refreshing the browser retains profile, records, reservations, auth/session records, and theme settings through backend storage when available or browser storage as fallback.
- Requirement: Clear async feedback.
  Acceptance: The app shows a loading state while checking backend storage and exposes whether records are using server storage or browser fallback.
- Requirement: Production storage observability.
  Acceptance: `/api/health` performs a real Supabase reachability probe, returns a redacted host/workspace summary, and reports storage failures without exposing secrets.
- Requirement: Runtime log hygiene.
  Acceptance: Expected 4xx auth/client responses do not emit error stacks, while 5xx failures still log for diagnosis.
- Requirement: Repeatable mobile/accessibility acceptance.
  Acceptance: `npm.cmd run ux:audit` verifies drawer navigation, live feedback, focus visibility, reduced motion, touch target sizing, overscroll/no-overflow protections, and absence of native dialogs.
- Requirement: Repeatable security hygiene check.
  Acceptance: `npm.cmd run ops:security` checks body-limit presence, webhook signature-required support, manager-gated export, owner release lane, native-dialog absence, and secret-looking values.

## Out Of Scope

- Item: Platform OAuth setup, paid WhatsApp Business onboarding, Graph API permission review, and outbound send APIs.
- Item: Database-native per-tenant RBAC beyond the current single-workspace document model.
- Item: Advanced pattern-making mathematics.

## Open Questions

- Question: Should a later phase migrate this static MVP into the missing existing app framework if that source tree is provided?
  Status: Open.
- Question: Which production backend should replace the current JSON-file persistence layer?
  Status: Answered for the current slice; Vercel production uses Supabase document storage while the local backend remains dependency-free.
