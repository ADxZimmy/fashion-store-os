# Plan

## Outcome

A usable local Fashion Studio OS MVP with business onboarding, brand settings, dashboard, clients, inquiries, measurements, style recipes, inventory, orders, production tracking, and estimate learning.

## Scope

Included:

- First-launch setup and persistent business profile.
- CSS-variable based branding and appearance settings.
- Seeded fashion studio sample data.
- Dashboard and core studio modules.
- Practical material estimation and reservation/deduction workflow.

Excluded:

- Real channel integrations.
- Cloud database/authentication.
- Advanced garment pattern calculations.

## Steps

1. Add static app shell and module layout.
2. Add app state, localStorage persistence, seed data, and theme application.
3. Add onboarding and brand settings flows.
4. Add inquiry, client, measurement, order, recipe, inventory, production, and dashboard views.
5. Implement material estimate, reserve, cutting deduction, completion deduction, and learning records.
6. Verify in browser and record results.

## Verification

- Check: Open app locally.
  Expected: Onboarding appears when profile is missing; app shell appears after setup.
- Check: Confirm an order.
  Expected: Estimated materials reserve against inventory and update availability.
- Check: Start cutting and complete order.
  Expected: Actual fabric is deducted, reserve is released/consumed, and learning record is created.

## Rollback

Remove `index.html`, `src/`, and the planning artifacts added in this phase.
