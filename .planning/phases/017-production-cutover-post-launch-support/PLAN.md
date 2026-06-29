# Plan

## Outcome

Fashion Store OS serves the pilot-validated build from a stable public production URL with Supabase persistence active, an annotated release tag points at the deployed commit, handover/rollback/monitoring docs are current, and there is a written post-launch issue intake and watch-window process.

## Scope

Included:

- Repo-side cutover assets: a cutover runbook (`docs/cutover.md`), a post-launch watch-window + issue-intake section, and updated `handover.md` / `STATE.md` / `ROADMAP.md`.
- An annotated release tag created from the commit the owner deploys.
- A rollback procedure validated against `docs/release-lane.md` and the Vercel promote/rollback flow.
- A documented domain-cutover sequence that is gated on a green `/api/health`.

Excluded:

- The already-completed Phase 008 activation work (Supabase env vars, migrations, and production health gate).
- The actual domain purchase, DNS record changes, and any final provider env var entry — owner-side (`ADxZimmy`) actions executed from the runbook.
- Post-pilot feature enhancements — deferred to the "Later" roadmap item.

## Steps

1. Confirm prerequisites: Phase 008 remains green (`/api/health` → `storage: "supabase"` on the Git-connected deployment) and pilot UAT in `docs/pilot-uat.md` passed. If pilot has not passed, stop here — repo-side drafting (steps 2-5) may proceed but the cutover (steps 6-8) is blocked.
2. Author `docs/cutover.md`: ordered cutover checklist (preflight → tag → domain → verify → watch), explicitly marking owner-only steps and the `/api/health` gate before DNS.
3. Add a "Post-Launch Support" section (watch-window cadence against `/api/health` + `/api/readiness`, Vercel/Supabase log scan, and an issue intake/triage path) — extend `docs/operations-runbook.md` rather than duplicate it.
4. Update `handover.md` with placeholders for the final domain, release tag, and the support process so the owner fills concrete values at cutover; update `.planning/ROADMAP.md` and `.planning/STATE.md` to move Phase 017 to in-progress and reflect the operate phase.
5. Run local gates (`npm run launch:check`, `npm run release:preflight`) and prepare the branch for the owner.
6. Owner (`ADxZimmy`): confirm the current `main` deployment is Ready and `/api/health` is green on the Git-connected deployment.
7. Owner: create and push the annotated release tag from the deployed commit; add the custom domain in Vercel and point DNS only after the health gate passes.
8. Post-cutover: run the pilot scenarios as a production smoke test, start the watch window, and record results in this phase's VERIFICATION.md / UAT.md.

## Verification

- Check: `npm run launch:check`
  Expected: syntax, UX, security, and build gates all pass locally.
- Check: `npm run release:preflight`
  Expected: clean worktree; warns if the latest commit is not owner-authored.
- Check: `docs/cutover.md` exists with an ordered, owner-gated checklist and the `/api/health` DNS gate.
- Check (owner, post-cutover): `curl https://<final-domain>/api/health`
  Expected: `ok: true`, `storage: "supabase"`, redacted `supabaseHost`, `workspace: "default"`.
- Check (owner, post-cutover): `git tag` shows the annotated release tag on the deployed commit.
- Check (owner, post-cutover): pilot UAT scenarios pass against the live domain.

## Rollback

- Pre-cutover: revert the cutover docs/tag commit; no production impact.
- Post-cutover: in Vercel, promote the previous known-good deployment (do not force-reset Git). If a domain change is bad, repoint DNS back to the prior target / Vercel alias. Record the rollback in `docs/operations-runbook.md` incident log.
