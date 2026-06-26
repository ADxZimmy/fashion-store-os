# Verification

## Automated Checks

- Command: `npm.cmd run check`
  Result: Passed; checked 19 JavaScript files.
  Notes: Includes channel normalization, dedupe helper, and route changes.
- Command: `npm.cmd run build`
  Result: Passed; built 6 public files into `dist/`.
  Notes: Confirms CRM intake UI changes build.
- Command: Local signed webhook smoke.
  Result: Passed.
  Notes: Signed payload accepted, retry counted as duplicate, public GET did not expose messages, consent metadata persisted, and delivery events were recorded.

## Manual Checks

- Check: CRM Inbox shows consent/provider metadata on channel messages.
  Result: Partially verified.
  Notes: Markup/build verified; live browser smoke skipped because Playwright/npx hung and Chrome/Edge were not available on PATH.

## Residual Risk

- Risk: Production provider credentials are not configured in this repository.
  Owner: Release owner.
