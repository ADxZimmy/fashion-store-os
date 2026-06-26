# Verification

## Automated Checks

- Command: `npm.cmd run check`
  Result: Passed; checked 19 JavaScript files.
  Notes: Includes shared auth/session/frontend changes.
- Command: `npm.cmd run build`
  Result: Passed; built 6 public files into `dist/`.
  Notes: Settings/onboarding UI renders into the static build.
- Command: Local API lifecycle smoke.
  Result: Passed.
  Notes: Manager signup, staff invite, invite acceptance, password change, staff suspend/reactivate, staff sign-in with changed password, and suspended-staff 401 check passed.

## Manual Checks

- Check: Settings UI exposes invite, password change, staff status, and audit history without mobile overflow.
  Result: Partially verified.
  Notes: Build passed and mobile-safe CSS was reviewed; Playwright/npx browser tooling hung and Chrome/Edge were not available on PATH, so live browser smoke was skipped.

## Residual Risk

- Risk: Manual invite-token delivery is less polished than email invites.
  Owner: Future email/auth phase.
