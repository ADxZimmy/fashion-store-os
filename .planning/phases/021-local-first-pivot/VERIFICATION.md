# Verification

Status: Planned on 2026-08-18. Step 0 executed the same day; steps 1-7 not yet implemented. This file records evidence as steps land; the checks below mirror PLAN.md and must each carry a dated result before the phase closes.

## Checks To Run

- Step 0 hotfix applied: `supabase migration list --linked` shows `20260818090000` in both ledgers, and an anon-key request against `fashion_store_os_documents` is refused.
  Result: **Partially passed on 2026-08-18.** Migration applied via `npx supabase db push`; `supabase migration list --linked` shows all five versions matching in both ledgers. Production `/api/health` (200, `storage: "supabase"`) and `/api/readiness` (200) confirmed green after the revoke, so the service-role path is unaffected. The anon-key refusal probe is **outstanding** — it needs the anon key, which is owner-side (Supabase dashboard); the grant removal is in the applied migration, but per this project's rule the refusal is verified by probe, not inferred from the SQL.
- Identity restructure: sign-in from a second browser with no prior localStorage succeeds; all four manager-gate cases return 401/401/2xx/403 on every new identity endpoint; concurrent identity operations from two sessions do not lose writes.
  Result: **Passed locally on 2026-08-18, production verification outstanding.** Built on branch `phase-021-release-a` (`128ae7d`, remediated by `bc72529`). 115 assertions in `scripts/test-identity.js` run the real core against a file-backed adapter, including all four gate cases for every manager-gated action. An adversarial review confirmed 20 defects in the first cut; all material ones are fixed and regression-tested. Two are recorded as accepted: unverified signup can permanently squat a global email, and the "accept your invite first" sign-in hint reveals that an address has a pending invite — both inherited from the legacy plane, both throttled.
  Not yet evidenced: `api/_identity_supabase.js` has **zero test coverage** — every PostgREST filter, Prefer header, expected-status list, and the 409 conflict mapping execute for the first time against real Supabase. The local adapter cannot exercise them. This is the largest known risk in step 1 and needs a live round trip against the deployed identity tables before Release A ships.
  Also outstanding: the migration `20260818120000_create_identity_tables.sql` is written but **not applied** to production.
- Local-primary flip: no code path PUTs business state to the server (grep plus network-log evidence); bootstrap response carries no state; session responses carry no state.
- Trust direction: expired session → lock screen, local dataset byte-identical before and after; a non-member sign-in over existing local data gets the locked/erase choice, never a silent wipe.
- Offline shell: with the server unreachable, a previously signed-in device opens via the service worker and works; a never-signed-in device cannot unlock.
- Storage hardening: quota exhaustion surfaces an error in the UI and the previous dataset survives; persistent storage requested.
- Backup/restore: round trip on a fresh profile; blob opacity; wrong-passphrase failure is side-effect free; an oversized dataset is refused client-side before upload with a visible error.
- Recovery: full round trip on the row-based plane — issue at signup, redeem without a session, single-use, grants only a password reset.
- Transit inbox: signed delivery → pull → server deletion → duplicate provider delivery deduped at insert; unsigned delivery refused when signature mode is on; retention sweep removes expired inbox rows and expired sessions/invites/codes/rate-limit rows on the next cron run.
- Rate limits: durable across instances (verified against deployed serverless, not local memory).
- Route parity: every endpoint add/change/delete landed in both `api/` and `server.js`, asserted by an updated check script.
- Suites: `npm run check`, `npm run launch:check` green at every landed step; security-audit assertions updated in the same commits that change the asserted files; the CI workflow observed red on a deliberately broken push once.

## Notes

The 2026-08-03 lesson stands: a check that passes only against the case the bug does not touch is worse than no check. Every gate here must be exercised against the empty/bootstrap case explicitly, and production behaviour is verified by probe, not inferred from local tests.
