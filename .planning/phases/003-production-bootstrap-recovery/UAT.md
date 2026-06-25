# UAT

## Scenario

Open the live Vercel site on a fresh browser profile after production storage recovery.

## Expected Result

- The app loads without a backend 500 during bootstrap.
- `/api/health` reports `ok: true`, `storage: "supabase"`, the redacted Supabase host, and the active workspace.
- `/api/bootstrap` returns HTTP 200 with either existing state/auth documents or `stateExists: false` and `authExists: false`.
- Completing first-launch setup persists through the Vercel API and remains after refresh.
- Resetting workspace data clears the Supabase-backed state/auth records and returns the app to first launch.

## Observed Result

Passed on 2026-06-25 through direct live API UAT at `https://fashion-store-os-navy.vercel.app`: health was green, bootstrap returned successfully, probe state/auth records persisted through write/read, reset cleared both documents, and the Supabase table was empty afterward.
