# Context

## Goal

Cut Fashion Store OS over to a stable public production target and stand up the post-launch support process: custom domain, finalized production env vars, a tagged release, current handover/rollback docs, a monitoring watch window, and a documented issue intake path.

## Dependency

Phase 008 (Git-connected production persistence activation) is complete as of 2026-06-29: `/api/health` reports `storage: "supabase"` against Supabase project `elkpberfbhwbrkawklnk`. Phase 017 now waits on real-store pilot sign-off and owner-side domain/DNS actions. The domain/DNS switch remains the last step and must still be gated on a fresh green `/api/health` check on the final public target.

## Relevant Files

- Path: `docs/release-lane.md`
  Why it matters: Defines the owner release flow, env var list, and rollback stance the cutover must follow.
- Path: `docs/production-persistence.md`
  Why it matters: Authoritative env var names, Supabase refs, and the `/api/health` expectations the cutover verifies against.
- Path: `docs/operations-runbook.md`
  Why it matters: Already holds Health/Readiness, Vercel observability, backup/restore, secret rotation, and incident checklist sections the watch window references.
- Path: `docs/pilot-uat.md`
  Why it matters: The pilot must pass before cutover; its scenarios become the post-cutover smoke set.
- Path: `api/readiness.js`
  Why it matters: `/api/readiness` is the production self-report the monitoring watch window polls.
- Path: `handover.md`
  Why it matters: Top-level handover that must be updated with the final domain, release tag, and support process at cutover.
- Path: `.planning/ROADMAP.md` / `.planning/STATE.md`
  Why it matters: Must reflect cutover completion and the move from "build" to "operate."

## Decisions

- Decision: Split Phase 017 into repo-side work (can be done now) and owner-side cutover actions (domain, DNS, final env vars, tag push).
  Reason: Keeps the phase progressable without being blocked on owner Vercel/Supabase/registrar access, and makes the owner handoff a short checklist.
- Decision: Do not register a domain or change DNS from inside this repo/session.
  Reason: Domain purchase, DNS, and the production env vars are owner-authenticated actions; spoofing or guessing them would corrupt the release trail. They belong to `ADxZimmy`.
- Decision: Roll back by promoting the previous known-good Vercel deployment, not by force-resetting Git.
  Reason: Matches `docs/release-lane.md`; preserves an auditable release history.
- Decision: Tag the release from the commit that the owner deploys to `main`, using an annotated `v1.0.0`-style tag.
  Reason: Gives a precise rollback/reference anchor that maps to a single Vercel deployment.

## Risks

- Risk: Domain is pointed at the Git-connected deployment without a fresh health check or pilot sign-off.
  Mitigation: Gate the DNS switch on pilot approval and a green `/api/health` (`storage: "supabase"`) check; make it the explicit last step in the plan.
- Risk: Collaborator-authored pushes still fail with `TEAM_ACCESS_REQUIRED`, so an emergency fix cannot be deployed by a non-owner.
  Mitigation: Document the owner-only deploy path and a rollback that any owner can trigger from the Vercel dashboard; record the Vercel plan decision as an open item.
- Risk: No live monitoring, so a post-launch outage goes unnoticed.
  Mitigation: Define a watch-window checklist against `/api/health` and `/api/readiness` and a Vercel/Supabase log scan cadence in the runbook.
- Risk: Secrets leak into planning artifacts or the tag message during cutover.
  Mitigation: Keep all real env values owner-side in Vercel; artifacts reference variable names only.
