# Context

## Goal

Make the GitHub-to-Vercel release path repeatable while the Vercel project remains constrained by free-plan owner permissions.

## Relevant Files

- Path: `docs/release-lane.md`
  Why it matters: Owner handoff, env, verification, and rollback instructions.
- Path: `scripts/release-preflight.js`
  Why it matters: Local check for clean worktree, expected repo, and owner-authorship warning.
- Path: `package.json`
  Why it matters: Exposes the release preflight command.

## Decisions

- Decision: Do not spoof `ADxZimmy` commit authorship.
  Reason: Vercel can use authenticated GitHub actor permissions, and fake authorship weakens auditability.
- Decision: Keep development moving on `codex/backend-foundation`, then hand off owner release to `ADxZimmy`.
  Reason: Avoids making the free-plan Vercel restriction a product blocker.

## Risks

- Risk: Owner Supabase/Vercel env vars may lag behind code.
  Mitigation: Release checklist requires env verification before relying on production.
