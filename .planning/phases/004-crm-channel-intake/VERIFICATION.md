# Verification

## Automated Checks

- Command: `npm.cmd run check`
  Result: Passed on 2026-06-25; 13 JavaScript files checked.
  Notes: Covered the new `api/_inbound.js` helper and `api/inbound.js` route.
- Command: `npm.cmd run build`
  Result: Passed on 2026-06-25; 6 public files built into `dist/`.
  Notes:

## Endpoint Checks

- Check: Local `/api/inbound` POST then `/api/bootstrap`.
  Result: Passed on 2026-06-25; a lowercase `instagram` payload normalized to `Instagram`, appeared in `state.channelMessages`, and cleanup removed test data.
  Notes:
- Check: Live `/api/inbound` POST then `/api/bootstrap`.
  Result: Passed on 2026-06-25; live POST normalized lowercase source/status values, appeared in `/api/inbound` and `/api/bootstrap`, and `/api/data` cleanup returned state/auth to absent.
  Notes: Smoke test only ran after confirming the live workspace was empty.
- Check: Supabase cleanup verification.
  Result: Passed on 2026-06-25; `public.fashion_store_os_documents` document count returned to 0 after cleanup.
  Notes:

## Manual Checks

- Check: Local browser smoke at 390px and 1280px.
  Result: Passed on 2026-06-25; the CRM Inbox rendered channel intake, saved a channel message, updated follow-up state, routed it to an inquiry, and had no horizontal overflow.
  Notes: Used a temporary Playwright script under `output/playwright/`, then removed the generated script and artifacts.
- Check: Live asset check.
  Result: Passed on 2026-06-25; production `src/app.js` contains channel intake, route action, and intake queue code.
  Notes:
- Check: Vercel runtime error scan.
  Result: Passed on 2026-06-25; no production error/fatal serverless logs found after live smoke testing.
  Notes:

## Residual Risk

- Risk: Real channel platform webhook verification is not implemented in this phase.
  Owner: Future channel integration phase.
