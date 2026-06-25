# UAT

## Scenario

On a server-backed app, create a manager account, complete setup, create a staff account with limited access, sign out, sign in as staff, verify limited navigation, then sign back in as manager and remove the staff account.

## Result

Passed locally on 2026-06-25.

## Notes

The local fallback still supports browser-only auth for direct static use, but server-backed storage no longer persists plaintext passwords. Full account recovery and email verification remain future work.
