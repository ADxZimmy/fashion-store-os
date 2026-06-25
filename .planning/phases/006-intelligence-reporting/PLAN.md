# Plan

## Outcome

The app includes a Reports workspace with actionable, record-derived operational intelligence.

## Scope

Included:

- Reports nav item and view.
- Conversion/revenue/workload/stock KPIs.
- Reply drafts from channel messages.
- Quote drafts from inquiries and matching style recipes.
- Smart stock and production alerts.
- Estimate-learning summary from completed usage records.

Excluded:

- External LLM/API calls.
- Export to PDF/CSV.
- Forecasting models beyond transparent calculations.

## Steps

1. Add reports navigation, titles, and access handling.
2. Add report calculation helpers.
3. Render reports with compact responsive UI.
4. Add CSS for report panels and draft blocks.
5. Verify desktop and mobile layout.

## Verification

- Check: `npm.cmd run check`
  Expected: JavaScript syntax passes.
- Check: Browser reports smoke at phone and desktop widths.
  Expected: Reports loads without errors or horizontal overflow.

## Rollback

Remove the reports nav item, helpers, view renderer, and report-specific CSS.
