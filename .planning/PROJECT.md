# Fashion Store OS

## Mission

Create a brand-agnostic Tailor/Fashion Studio OS that turns client inquiries, custom orders, stock, production, and follow-ups into one operating dashboard.

## Audience

Fashion designers, tailoring studios, garment makers, and small fashion teams that need calmer control over client demand, measurements, inventory reservations, production status, and delivery.

## System Shape

Local-first since Phase 021 (Release A, `v2.0.0`, 2026-10-19).

- Client: static HTML, CSS, and JavaScript with no framework and no bundler: `index.html`, `src/app.js` (the app), `src/storage.js` (IndexedDB device storage), `src/backup.js` (WebCrypto backup), `src/sw.js` (offline app shell), `src/styles.css`.
- Data: business records live on each shop device, in IndexedDB. The server database, Neon Postgres, holds only identity (accounts, stores, memberships, sessions, invites, recovery codes, rate-limit events, the identity audit), one encrypted backup per store that it cannot read, and a short-lived inbox for provider messages. Schema: `db/migrations/`.
- Server: serverless functions on Vercel under `api/`, reaching Neon through `@neondatabase/serverless`.
- Local development: `npm run dev` runs `server.js` at `http://localhost:4179`. It mirrors every API route and runs the same SQL adapter on PGlite, an embedded Postgres under `data/pglite/`; the test suites use in-memory PGlite.
- Deployment: Git-connected Vercel project. Every push to `main` deploys to `https://fashion-store-os.vercel.app`, with functions in Frankfurt (`fra1`) next to the database. Production builds apply new schema files before the deployment goes live.

## Constraints

- The prompt references an existing Pastry County Kitchen OS, but this workspace only contains docs/assets.
- Keep the product generic; Mo'orafrika direction informs the workflow, but the app must not hardcode that brand.
- Keep dependencies minimal. The only runtime dependency is `@neondatabase/serverless`; PGlite is a dev dependency for local development and tests, and the Supabase CLI stays one until Release B decommissions the legacy Supabase project.
- No business data reaches the server. What leaves the device is sign-in traffic, the encrypted backup, and inbox acknowledgements (message ids); guards in `scripts/test-local-first.js` and the security audit enforce it.
- Production health and readiness must prove database reachability with a real round trip, not just configuration.
- The Vercel Hobby plan allows at most 12 functions per deployment and deploys only commits authored by `ADxZimmy`; a guard and `npm run release:preflight` check both.

## Working Agreements

- Use repo-local conventions and commands; the development rules are in `handover.md`.
- Keep planning artifacts concise and current.
- Record verification before calling work ready.
