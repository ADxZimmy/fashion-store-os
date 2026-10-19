# Production Smoke Test

Last updated: 2026-10-19

Self-contained instructions for verifying a production deployment of Fashion Store OS after the Phase 021 local-first pivot. Hand this to an operator or an agent; it assumes no prior context. Run it after every deploy that touches sign-in, storage, backup, or the inbox, and always after Release A.

## What Changed, And Why This Test Changed With It

Before Phase 021 the server stored every business record, and this test checked that writes reached it. That write path no longer exists. Records now live on the device, and the server holds only identity, an encrypted backup, and a short-lived message inbox. So this test checks four things instead:

1. Records persist on the device and **never reach the server**.
2. A **lost session never costs data**: signing out or expiring locks the screen and keeps the records.
3. The **encrypted backup restores onto a new device**, and a wrong passphrase changes nothing.
4. The app **works offline** and recovers by itself when the connection returns.

## Read This Before Starting

- **This is live production.** There is no staging environment.
- Use a **separate fresh browser profile** for each device in the test, for example a Chrome incognito window as device A and an Edge InPrivate window as device B. Each profile is a separate "device" with its own records. Two incognito windows of the same browser share their storage, so they count as one device.
- Test accounts are global: an email can only be used once across the whole system. Use addresses nobody owns (below).
- **Clean up when done** (Step 10). A test store left in production is a live store.

## What The Operator Must Supply

The test creates a manager account and sets a backup passphrase.

### Operator mode

You supply a throwaway email, a password, and a backup passphrase, and type them yourself. An agent driving the rest should ask for them rather than invent them.

### Agent mode (end to end, no human in the loop)

An agent may run the whole procedure unattended only if all four of these hold:

1. **Generate every credential at runtime:** an address at a domain that receives no mail (`fso-smoke-<random>@example.com`), a random password of at least 20 characters, and a random backup passphrase of at least 20 characters. The app sends no email, so the address never needs to be real.
2. **Keep them ephemeral.** Hold them in memory for the run only. Never write them, or the recovery code, into the report, logs, a file, or this repo.
3. **Never reuse a real credential.**
4. **Complete Step 10.** It deletes the store and its account. An abandoned account with a generated password nobody holds is unrecoverable by design.

If any of the four cannot be satisfied, stop and hand back to operator mode.

## Procedure

Record the result of every step. If a step fails, stop and go to **If Something Fails**.

### Step 1: API baseline

```powershell
Invoke-RestMethod https://fashion-store-os.vercel.app/api/health
Invoke-RestMethod https://fashion-store-os.vercel.app/api/readiness
Invoke-WebRequest https://fashion-store-os.vercel.app/api/state -SkipHttpErrorCheck | Select-Object StatusCode
```

**Pass:** health returns `ok: true` and `storage: "postgres"`. Readiness returns `ok: true`; its "database configured" and "database reachable" checks pass (the channel checks may be false until a provider is connected; they are optional). `/api/state` returns **410**.

The 410 is the quickest proof the Phase 021 build is live: the pre-pivot build answered that route. If `storage` says `"supabase"`, the old build is still serving.

### Step 2: The app loads clean

Open `https://fashion-store-os.vercel.app` in a fresh profile ("device A").

**Pass:** the sign-in screen appears with no business data and no console errors. In DevTools, Application, Service Workers, `/sw.js` is activated.

### Step 3: Manager signup, recovery code

Sign up a manager.

**Pass:** you land on business setup, and a **recovery code** is shown there with a "save this now" warning. Copy it before dismissing; Step 8 needs it. If no recovery code appears, that is a failure: it is shown exactly once.

### Step 4: Records stay on the device

Fill in the business setup, then add one client. Open DevTools, Network, before saving, and keep it open. Then **refresh the page**.

**Pass:**
- After the refresh you are still signed in and the business profile and client are there.
- No request carries business data. The only API calls are `/api/bootstrap`, `/api/session`, and `/api/inbox`. A request to `/api/state` or any body containing the client's name is a failure.

### Step 5: Signing out keeps the records

Sign out. Then sign back in.

**Pass:** sign-out shows the sign-in screen with the business mark still visible, and signing back in shows the same client. Nothing was lost by signing out.

### Step 6: Encrypted backup

Settings, Backup, **Back up now**. Set a passphrase (at least 10 characters) when asked.

**Pass:** the panel shows status **On** and today's date under Last backup.

### Step 7: Restore onto a new device

Open a second fresh profile ("device B") and sign in with the same account. A new device has no records, so it shows business setup with a **Restoring onto a new device?** option.

1. Choose **Restore from backup** and enter a **wrong** passphrase.
   **Pass:** "That passphrase does not open this backup." and device B is unchanged.
2. Restore again with the **correct** passphrase.
   **Pass:** device B opens the dashboard with the business profile and the client from Step 4.

### Step 8: Recovery round trip

On device A: sign out, choose **Forgot password**, and enter the email, the recovery code from Step 3, and a new password.

**Pass:** you return to the **sign-in screen**, not the dashboard (redeeming grants no session). Signing in with the new password works, the old password is refused, and using the same recovery code again is rejected.

### Step 9: Offline and back

On device A, signed in: DevTools, Network, set **Offline**, then reload.

**Pass:** the app still opens, shows "Offline: working on this device", and the records are there. Add a second client; it saves.

Set the network back to **No throttling**.

**Pass:** within about a minute the offline chip disappears without a reload, and in Settings, Backup, the last-backup time updates shortly after (the offline change caught up). Sign out while offline once, go online, reload: the app must stay **signed out**.

### Step 10: Cleanup (mandatory)

On device A, signed in as the manager: Settings, **Delete this store**, enter the password, **Delete store permanently**.

**Pass:** you are signed out, and signing in with the test account is refused. Then on each profile used, Settings is no longer reachable, so remove the leftover records by clearing site data for `fashion-store-os.vercel.app` in the browser (or just close the incognito windows).

Deleting the store removes the account, sessions, invites, the backup, and inbox messages from the server. It does not touch device records, which is why the profiles are cleared separately.

### Step 11 (optional): Channel inbox

Only if a provider is connected and `FASHION_STORE_INBOX_STORE_ID` names a live store. Send one signed test message to `/api/channel-webhook`, then in the app open CRM Inbox and **Check for messages**.

**Pass:** the message appears once; checking again adds nothing.

## Report Back

```text
Date / operator:
Mode:                     operator / agent
Deployment checked:       (Vercel deployment URL or commit)
Step 1 API baseline:      PASS / FAIL
Step 2 clean load:        PASS / FAIL
Step 3 signup + code:     PASS / FAIL
Step 4 local only:        PASS / FAIL
Step 5 sign-out keeps:    PASS / FAIL
Step 6 backup:            PASS / FAIL
Step 7 restore:           PASS / FAIL
Step 8 recovery:          PASS / FAIL
Step 9 offline:           PASS / FAIL
Step 10 cleanup:          PASS / FAIL
Step 11 inbox:            PASS / FAIL / not run
Console errors:           none / details
Notes:
```

Never include the test email, any password or passphrase, the recovery code, session cookies, or customer data. If Step 10 did not complete, say so at the top of the report: an undeleted test store is a live store.

## If Something Fails

Severity, per `docs/operations-runbook.md`:

- **Step 4 shows business data leaving the device** → sev-1. The local-first boundary is broken; that is a data-exposure defect.
- **Step 5 loses records**, or **Step 9's offline sign-out reopens after reload** → sev-1. Losing records on sign-out destroys the only copy; a sign-out that does not stick hands a shared device to whoever opens it next.
- **Step 1 fails** with `unconfigured` → sev-1: `DATABASE_URL` is missing. With `database-unreachable` → sev-1 for sign-in, but signed-in devices keep working offline.
- **Step 3 shows no recovery code, or Step 7 or 8 fails** → sev-2. Backup and recovery are the only ways back after a lost device or password.
- **Step 2 or 9 fails otherwise** → sev-2 unless the app will not load at all (sev-1).
- **Step 10 fails** → sev-3, but report it at the top.

Roll back by promoting the previous known-good deployment in Vercel. Fixes go to `main` as `ADxZimmy` and deploy on push; see `docs/release-lane.md`.
