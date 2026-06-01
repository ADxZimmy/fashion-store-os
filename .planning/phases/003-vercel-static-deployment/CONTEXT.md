# Context

## Goal

Make Fashion Store OS testable from a hosted Vercel URL so contributors do not need to start the local Windows/Node server for every review.

## Findings

- The collaborator's latest work is on `origin/main` and `origin/codex/backend-foundation` at `93e407d`.
- The app now has a local Node backend with JSON-file persistence.
- Vercel is a good fit for the current frontend preview, but JSON-file persistence should not be treated as durable cloud storage.
- Keeping the app as a single-page operational workspace is the right shape for now.
- Hash links such as `/#orders` provide direct section links without splitting shared state across independent pages.

## Deployment Decision

Use a Vercel static build for this phase. It publishes only the public app assets and relies on browser storage fallback. Choose a durable production database/auth stack before promising shared server-side state on Vercel.

