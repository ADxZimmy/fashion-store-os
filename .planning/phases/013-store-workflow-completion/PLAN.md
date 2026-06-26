# Plan

## Outcome

Store staff can run a practical garment job end to end: quote, collect deposit/payment, reserve stock, cut, schedule/complete fittings, request/approve manager review, prepare handoff, adjust inventory, and close follow-up.

## Scope

Included:

- Order payment ledger and balance tracking.
- Fitting scheduling and completion.
- Manager review request/approval/change loop.
- Handoff and collection/delivery closeout.
- Customer follow-up status/note capture.
- Inventory restock and adjustment log.

Excluded:

- Online payment provider integration.
- Multi-location inventory bins.
- Native database schema redesign.

## Steps

1. Normalize new order and inventory adjustment fields.
2. Add order workflow modals and action handlers.
3. Add inventory adjustment history and controls.
4. Update order cards with payment, fitting, review, handoff, and follow-up summaries.
5. Verify syntax and targeted workflow behavior.

## Verification

- Check: `npm.cmd run check`
  Expected: Passes all JavaScript syntax checks.
- Check: Targeted Node/browser-adjacent workflow smoke.
  Expected: New form/action strings exist and no native dialogs are present.

## Rollback

Revert the `src/app.js` order/inventory workflow edits and remove this phase artifact if the workflow creates regressions.
