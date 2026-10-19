# Production Smoke Results, 2026-10-19

Operator: Codex, agent mode. Requested scope: Steps 3 to 10 of `docs/production-smoke.md`.

Target: `https://fashion-store-os.vercel.app`, Release A `v2.0.0` (`584277b`). After the test, Vercel confirmed the alias still pointed at deployment `dpl_22mWPFLGf5if5FWwKUJiVei5jkqA` (`fashion-store-8oda3ss4y-sanuske2-2147s-projects.vercel.app`). The public `src/app.js` matched the release tag after normalizing line endings and the UTF-8 BOM.

**Result: Steps 3 to 10 PASS. Cleanup completed; the temporary store was deleted and its account could no longer sign in.**

Two fresh, isolated agent-browser Chromium sessions represented devices A and B. Credentials were randomly generated at runtime, kept in memory, and discarded after cleanup. No test email, passwords, backup passphrase, recovery code, session cookies, or client fields are included here.

| Step | Result | Evidence |
| --- | --- | --- |
| 3: Manager signup and recovery code | PASS | Signup opened business setup. The recovery code appeared there with the save-now, shown-once warning and was retained only in memory for Step 8. |
| 4: Records stay on the device | PASS | Business setup and client records survived refresh while still signed in. An additional client save under network monitoring made zero requests. Reload called only `GET /api/bootstrap` and `GET /api/inbox`, both 200, with no request body. No `/api/state` call or client plaintext left the device. |
| 5: Sign-out keeps records | PASS | Sign-out showed the sign-in screen with the business initials still visible. Signing back in displayed the same clients. |
| 6: Encrypted backup | PASS | Setting the passphrase uploaded the backup with `PUT /api/backup` returning 201. Settings showed status **On**, Last backup **Oct 19, 2026**, and Automatic **Up to date**. |
| 7: Restore on a new device | PASS | Device B initially showed business setup and the new-device restore option. A wrong passphrase showed “That passphrase does not open this backup.” and left the in-memory business state byte-identical. The correct passphrase restored the profile and both clients; the dashboard opened successfully. |
| 8: Recovery round trip | PASS | Redeeming the signup code returned to sign-in. The new password opened the existing records. The old password and reuse of the recovery code each returned 401 with their generic refusal messages. |
| 9: Offline and back | PASS | With networking disabled, reload opened the cached app with the offline chip and existing records. A new client saved offline. After reconnecting, the chip disappeared without reload; a backup PUT returned 201, the backup timestamp advanced, the pending marker cleared, and Automatic returned to **Up to date**. Signing out offline set the pending-signout marker; after reconnecting and reloading, the app stayed signed out and cleared the marker. Signing back in confirmed the offline client persisted. |
| 10: Cleanup | PASS | Settings store deletion using the recovered password signed device A out. A subsequent sign-in returned 401 and Settings was unavailable. Local/session storage, cookies, and caches were cleared, service workers unregistered, and both temporary browser sessions closed without saving auth state. Runtime credentials were discarded. |

Steps 1 and 2 were outside this requested run; their earlier PASS results remain recorded in `docs/cutover.md`. Step 11 (provider inbox) was not run.

Console/page diagnostics: no uncaught page JavaScript errors on either device. The deliberate wrong-passphrase test logged `Restore failed`; deliberate rejected credentials and offline requests logged expected warnings. An extra runner diagnostic used unsupported `GET /api/session` and received 405; this was not an application-flow failure and was not used as session evidence.

The backup timestamp advanced from `2026-10-19T14:55:59.948Z` to `2026-10-19T14:59:59.954Z` after the offline edit. These are backup metadata timestamps, not credentials or business records. The status chip cleared within the guide's approximately one-minute reconnect allowance.

No application code was changed, committed, pushed, or deployed for this run. This closes the production smoke and live identity/backup write evidence; it does not complete the wider Phase 021 UAT, watch window, deployed rate-limit verification, provider integration, or scheduled maintenance evidence.
