# Verification

Status: Planned on 2026-08-18. Step 0 executed the same day; steps 1-7 not yet implemented. This file records evidence as steps land; the checks below mirror PLAN.md and must each carry a dated result before the phase closes.

## Checks To Run

- Step 0 hotfix applied: `supabase migration list --linked` shows `20260818090000` in both ledgers, and an anon-key request against `fashion_store_os_documents` is refused.
  Result: **Partially passed on 2026-08-18.** Migration applied via `npx supabase db push`; `supabase migration list --linked` shows all five versions matching in both ledgers. Production `/api/health` (200, `storage: "supabase"`) and `/api/readiness` (200) confirmed green after the revoke, so the service-role path is unaffected. The anon-key refusal probe is **outstanding** — it needs the anon key, which is owner-side (Supabase dashboard); the grant removal is in the applied migration, but per this project's rule the refusal is verified by probe, not inferred from the SQL.
- Identity restructure: sign-in from a second browser with no prior localStorage succeeds; all four manager-gate cases return 401/401/2xx/403 on every new identity endpoint; concurrent identity operations from two sessions do not lose writes.
  Result: **Passed locally on 2026-08-18, production verification outstanding.** Built on branch `phase-021-release-a` (`128ae7d`, remediated by `bc72529`). 115 assertions in `scripts/test-identity.js` run the real core against a file-backed adapter, including all four gate cases for every manager-gated action. An adversarial review confirmed 20 defects in the first cut; all material ones are fixed and regression-tested. Two are recorded as accepted: unverified signup can permanently squat a global email, and the "accept your invite first" sign-in hint reveals that an address has a pending invite — both inherited from the legacy plane, both throttled.
  Superseded on 2026-10-02 by the move to Neon (CONTEXT, "Provider change"). The untested Supabase adapter was deleted. Its replacement, `api/_identity_pg.js`, is the code the suites run: 116 identity, 45 backup, and 35 inbox assertions against PGlite (real Postgres), plus a 22-step HTTP round trip through the dev server (signup, cookie session, identity-only bootstrap, backup round trip, inbox drain, maintenance, readiness, the four 410s, sign-out). The schema is `db/migrations/0001_identity.sql`, applied automatically by production builds.
  Still not evidenced: Neon's HTTP driver against a live Neon database. Needs the owner to add Neon to the Vercel project; the first production build then migrates, and a live sign-up round trip closes it.
- Local-primary flip: no code path PUTs business state to the server (grep plus network-log evidence); bootstrap response carries no state; session responses carry no state.
- Trust direction: expired session → lock screen, local dataset byte-identical before and after; a non-member sign-in over existing local data gets the locked/erase choice, never a silent wipe.
  Result: **Passed in a real browser on 2026-10-19** (dev server on embedded Postgres). Sign-out locked the UI, cleared the offline identity cache, and left the records in IndexedDB; signing back in showed the same records. Signing up a second account on the same device raised the mismatch screen with nothing changed; erasing from it cleared both IndexedDB records and re-tagged the device. Saving a profile and a client sent no request to the server: the only API calls were identity checks, the signup, and one inbox pull.
- Offline shell: with the server unreachable, a previously signed-in device opens via the service worker and works; a never-signed-in device cannot unlock.
  Result: **Passed in a real browser on 2026-10-19** after one fix. The worker had never registered locally: the build serves it at /sw.js but the dev server only at /src/sw.js, so it 404'd. With that fixed, the worker activated, precached all seven shell assets, and with the server stopped the app opened from cache, unlocked from the cached identity, showed the offline chip, and saved a new client to IndexedDB. A session that opened offline went back online by itself about a minute after the server returned, without a reload (reconnect check added in this session; before it, offline mode lasted until a reload).
- Storage hardening: quota exhaustion surfaces an error in the UI and the previous dataset survives; persistent storage requested.
- Backup/restore: round trip on a fresh profile; blob opacity; wrong-passphrase failure is side-effect free; an oversized dataset is refused client-side before upload with a visible error.
  Result: **Passed in a real browser on 2026-10-19** after fixes, except the oversized case (not exercised). Setting a passphrase backed up immediately; the server blob held no plaintext business field and the passphrase was stored nowhere, only the derived key. A wrong passphrase failed with the generic message and left the local dataset byte-identical. Restoring onto an emptied device brought the profile and clients back. Defects found and fixed: restore was unreachable on a new device (setup screen only, no restore option); offline edits never reached the backup; an erase within three minutes of an edit would have let the queued backup overwrite the store's good backup with an empty one. Each fix was re-run in the browser and is pinned by a static guard.
- Recovery: full round trip on the row-based plane — issue at signup, redeem without a session, single-use, grants only a password reset.
- Transit inbox: signed delivery → pull → server deletion → duplicate provider delivery deduped at insert; unsigned delivery refused when signature mode is on; retention sweep removes expired inbox rows and expired sessions/invites/codes/rate-limit rows on the next cron run.
- Rate limits: durable across instances (verified against deployed serverless, not local memory).
- Route parity: every endpoint add/change/delete landed in both `api/` and `server.js`, asserted by an updated check script.
- Suites: `npm run check`, `npm run launch:check` green at every landed step; security-audit assertions updated in the same commits that change the asserted files; the CI workflow observed red on a deliberately broken push once.

## Notes

The 2026-08-03 lesson stands: a check that passes only against the case the bug does not touch is worse than no check. Every gate here must be exercised against the empty/bootstrap case explicitly, and production behaviour is verified by probe, not inferred from local tests.

## Browser session, 2026-10-19

First run of the client flows from steps 2 to 5 in a real browser (the dev server on embedded Postgres, driven through the in-app browser). Ten defects found, all fixed, each re-run in the browser and pinned by a guard in scripts/test-local-first.js:

1. A dead "Have a workspace code" button and its copy survived step 2: that step's first edit script did not handle CRLF line endings and silently missed its multi-line replacements while reporting success.
2. The service worker 404'd on the dev server (served at /src/sw.js, registered at /sw.js), so offline could only ever have been seen in production.
3. The signup recovery code rendered only in Settings, but signup lands on setup: a manager who reloaded first lost it (pre-existing since Phase 018, made worse by the pivot). Now shown on setup and on the mismatch screen.
4. The locked sign-in screen said "No account exists yet" on every device, false once accounts became global.
5. Restore onto a new device was unreachable: a device with no profile shows only setup, and restore lived in Settings.
6. The setup screen had no sign-out, so a wrong sign-in on a fresh device could only be escaped by inventing a business profile.
7. Offline edits were never backed up, because automatic backup only followed an online edit, and an offline session never noticed the server returning.
8. An erase within three minutes of an edit would have let the queued backup upload the emptied device over the store's good backup.
9. **Security:** sign-out while offline only locked the device. The HttpOnly session cookie stayed valid, so the next online start unlocked the device as whoever signed out; a dropped network during an online sign-out left the UI unlocked. A sign-out the server never heard about is now recorded and completed before any later "still signed in" answer is trusted.
10. Stale and non-compliant copy: the erase dialog still said there was no server copy to restore from, the storage panel promised backups "coming next", the mismatch screen named stores by internal id, and several strings used em-dashes.

Not exercised: the oversized-backup refusal, logo downscaling (needs a file upload), the plain file export (a download), persistent storage being granted (this browser declined, and the "Evictable" warning showed as designed), and the transit inbox beyond an empty pull.
