# Production Smoke Test — Write Path

Last updated: 2026-08-03

Self-contained instructions for verifying the Fashion Store OS production **write** path. Hand this to an operator or a coworking agent; it assumes no prior context.

## Why This Exists

Fashion Store OS v1.0.0 released on 2026-08-03 to `https://fashion-store-os.vercel.app`. Its Supabase database paused after a month idle and was restored on 2026-07-31.

Since that restore, only the **read** path has been verified: `/api/health`, `/api/readiness`, and a `/api/bootstrap` read all pass. **No data has been written.** A restored database can serve reads correctly while insert grants or row-level-security write policies are broken, so this gap is real, not theoretical.

Real-store pilot UAT was waived, so this smoke test is the only validation the write path gets.

## Read This Before Starting

- **This is live production**, not a staging environment. There is no staging environment.
- The app is **multi-tenant per device**. Each browser generates a random workspace id, stores it locally, and sends it as an `x-workspace-id` header. A fresh browser profile or a new incognito window therefore gets its **own isolated workspace**. Real users are not affected by what you do in yours.
- Because of that isolation: **use a fresh incognito window** and do not clear site data mid-test. Clearing storage abandons the workspace — the data stays in the cloud but becomes unreachable from that browser.
- **Do not touch the `default` workspace.** It is the fallback used by webhooks and health diagnostics, not a user workspace.
- **Clean up when done** (Step 6). Test data left in production is real data.

## What The Operator Must Supply

The person running this supplies the test account credentials and performs the signup step themselves. An agent driving this test should ask for them rather than inventing them, and must not write them into logs, reports, or this repo.

- A test email address
- A password for the test manager account

Use a throwaway address you control. You will delete this account in Step 6.

## Procedure

Record the result of every step. If any step fails, stop and go to **If Something Fails**.

### Step 1 — API baseline

```powershell
Invoke-RestMethod https://fashion-store-os.vercel.app/api/health
Invoke-RestMethod https://fashion-store-os.vercel.app/api/readiness
```

**Pass:** health returns `ok: true` and `storage: "supabase"`. Readiness returns `ok: true` with 6 passing checks.

Do not call `/api/keepalive` as a liveness check. It returns `401` to any caller without the cron bearer token, which is correct behavior and tells you nothing about storage.

### Step 2 — Fresh workspace loads

Open `https://fashion-store-os.vercel.app` in a **new incognito window**.

**Pass:** the app loads and shows manager signup — not a dashboard, not seed or demo content, no leftover data from another tester. A brand-new workspace is a true clean slate.

**Fail signals:** a JavaScript error in the console, a spinner that never resolves, or any pre-existing business data on a first visit.

### Step 3 — Manager signup ← the write path

The operator performs this step with their own credentials.

Create the manager account.

**Pass:** signup succeeds and lands on business setup.

**This is the test.** A failure here — a 500, a "could not save" error, or a hang — most likely means the restored Supabase project is missing write grants or RLS policies. That is the exact failure this smoke test exists to catch. Capture the full error and the browser console output.

### Step 4 — Business setup persists

Enter a business name, contact details, units, and brand colors. Save. Then **refresh the page**.

**Pass:** the dashboard reopens with the saved business identity intact. The save indicator reads "All changes saved".

A refresh is what distinguishes a real server write from something held in browser memory. Do not skip it.

### Step 5 — Workspace isolation

Open the site in a **second, different browser** (not another tab, not another window of the same profile — a different browser or a separate incognito session).

**Pass:** the second browser shows a clean manager signup with none of the data from Step 4. Two devices must not share a workspace.

### Step 6 — Recovery code round trip

At signup (Step 3) the app shows a **recovery code once**, with a "save this now" warning. Copy it before dismissing.

1. Sign out.
2. On the sign-in screen choose **Forgot password**.
3. Enter the test email, the saved recovery code, and a new password.

**Pass:** the reset succeeds and returns you to the **sign-in screen** — not the dashboard. You are deliberately not signed in; redeeming grants no session.

4. Sign in with the new password.

**Pass:** sign-in succeeds. The old password no longer works.

5. Try **Forgot password** again with the same code.

**Pass:** it is rejected. Recovery codes are single use.

**Fail signals:** landing on the dashboard straight after redeeming (a session was minted when it should not have been), the same code working twice, or the code being rejected immediately after signup.

### Step 7 — Cleanup (mandatory)

While still signed in as the manager from Step 3, delete the test workspace's data:

```
DELETE https://fashion-store-os.vercel.app/api/data
```

This is manager-gated and requires the authenticated session cookie from the browser you signed in with — easiest from that browser's devtools console:

```javascript
await fetch('/api/data', { method: 'DELETE', credentials: 'include' }).then(r => r.json())
```

**Pass:** the response is `{"ok": true}`. Refresh: the workspace returns to manager signup.

This removes the `state` and `auth` documents for that workspace only. It does not touch other workspaces.

## Report Back

```text
Date / operator:
Step 1 API baseline:      PASS / FAIL
Step 2 fresh workspace:   PASS / FAIL
Step 3 manager signup:    PASS / FAIL   <- the write path
Step 4 persistence:       PASS / FAIL
Step 5 isolation:         PASS / FAIL
Step 6 recovery code:     PASS / FAIL
Step 7 cleanup:           PASS / FAIL
Console errors:           none / details
Notes:
```

Do not include the test password, session cookies, or any customer data in the report.

## If Something Fails

Severity, per `docs/operations-runbook.md`:

- **Step 3 or 4 fails** → sev-1. The production write path is broken. Users cannot sign up or save anything. Work the Incident Checklist in the operations runbook, check the Supabase project's grants and RLS policies against `supabase/migrations/`, and consider rolling back by promoting the previous known-good deployment in Vercel.
- **Step 5 fails** (workspaces bleeding together) → sev-1. That is a tenant isolation defect and a data-exposure risk. Stop and escalate immediately.
- **Step 2 fails** → sev-2 unless the app is entirely unreachable, in which case sev-1.
- **Step 6 fails** → sev-2. Recovery is the only way back into an account with a lost password; if it does not work, a forgotten password means a lost workspace. If redeeming signs the user straight into the dashboard, treat it as sev-2 regardless of the reset succeeding — a session is being minted on a path that must not grant one.
- **Step 7 fails** → sev-3, but say so explicitly in the report, because it means test data is still sitting in production.

Fixes go to `main` as `ADxZimmy` and deploy on push — see `docs/release-lane.md`. There is no staging branch, so every fix is a production release.
