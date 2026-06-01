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

## Non-Functional

- Requirement: Responsive, modern, calm operations UI.
  Acceptance: The app works on desktop and narrow screens without overlapping content.
- Requirement: Persistent local state.
  Acceptance: Refreshing the browser retains profile, records, reservations, and theme settings.

## Out Of Scope

- Item: Real WhatsApp/Instagram integrations.
- Item: Multi-user authentication and cloud database.
- Item: Advanced pattern-making mathematics.

## Open Questions

- Question: Should a later phase migrate this static MVP into the missing existing app framework if that source tree is provided?
  Status: Open.
