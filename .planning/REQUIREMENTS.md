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
  Acceptance: When served through the app backend, state and auth records load from and save to server-managed JSON files, while direct/static usage falls back to localStorage.
- Requirement: Vercel-hosted static preview.
  Acceptance: The app can be built to a deployable static folder that excludes private planning/handover/backend/runtime files and runs on Vercel using browser storage fallback.
- Requirement: Shareable section links.
  Acceptance: Section navigation can be opened directly with hash links such as `/#orders` while retaining the current single-page app structure.

## Non-Functional

- Requirement: Responsive, modern, calm operations UI.
  Acceptance: The app works on desktop and narrow screens without overlapping content.
- Requirement: Persistent workspace state.
  Acceptance: Refreshing the browser retains profile, records, reservations, auth/session records, and theme settings through backend storage when available or browser storage as fallback.
- Requirement: Clear async feedback.
  Acceptance: The app shows a loading state while checking backend storage and exposes whether records are using server storage or browser fallback.

## Out Of Scope

- Item: Real WhatsApp/Instagram integrations.
- Item: Production multi-user authentication and cloud database.
- Item: Durable Vercel server-side persistence.
- Item: Advanced pattern-making mathematics.

## Open Questions

- Question: Should a later phase migrate this static MVP into the missing existing app framework if that source tree is provided?
  Status: Open.
- Question: Which production backend should replace the current JSON-file persistence layer?
  Status: Open; current slice intentionally keeps persistence dependency-free.
- Question: Which Vercel account/team should own the production deployment?
  Status: Open; local Vercel CLI is not authenticated.
