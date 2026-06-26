# Plan

## Outcome

Production releases from GitHub are repeatable, owner/collaborator restrictions are documented, rollback is defined, and the canonical handoff path is clear.

## Scope

Included:
- Owner-release documentation.
- Repo-local release preflight script.
- NPM script for preflight.

Excluded:
- Vercel account upgrade or team membership changes.
- Commit-author spoofing.

## Steps

1. Document the ADxZimmy owner-release lane.
2. Add a release preflight command.
3. Verify the preflight command reports current branch and owner-authorship warning.

## Verification

- Check: `npm.cmd run release:preflight`
  Expected: Prints clean/repo checks and warns when latest commit is not owner-authored.

## Rollback

Remove `docs/release-lane.md`, `scripts/release-preflight.js`, and the package script.
