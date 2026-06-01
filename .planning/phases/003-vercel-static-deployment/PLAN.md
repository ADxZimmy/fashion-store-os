# Plan

## Outcome

The repo can produce a Vercel-safe static build, direct section links work through URL hashes, and the remaining Vercel account authentication step is explicit.

## Scope

Included:

- Add `npm run build` for static deploy output.
- Copy only public assets into `dist/`.
- Add Vercel project config.
- Add `dist/` and `.vercel/` to git ignore rules.
- Add hash-based section links such as `/#orders`.
- Update GSD and handover documentation.

Excluded:

- Durable cloud database.
- Vercel account/team authentication.
- Vercel custom domain.
- Replacing prototype auth.

## Steps

1. Confirm collaborator's pushed branch and switch to the latest `main`.
2. Add a static build script that writes only publishable assets to `dist/`.
3. Add `vercel.json` using `npm run build` and `dist` output.
4. Add hash-based section routing for shareable section links.
5. Verify syntax, build output, private-file exclusion, and local static load.
6. Attempt Vercel deployment.
7. Record the authentication blocker and next deployment command.

## Rollback

Remove `scripts/build-static.js`, `vercel.json`, the package `build` script, hash-link changes in `src/app.js`, and the new planning/handover notes.

