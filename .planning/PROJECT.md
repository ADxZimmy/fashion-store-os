# Fashion Store OS

## Mission

Create a brand-agnostic Tailor/Fashion Studio OS that turns client inquiries, custom orders, stock, production, and follow-ups into one operating dashboard.

## Audience

Fashion designers, tailoring studios, garment makers, and small fashion teams that need calmer control over client demand, measurements, inventory reservations, production status, and delivery.

## System Shape

- Runtime: Node-backed local web app with static HTML, CSS, and JavaScript frontend.
- Framework: Dependency-free Node `http` server for this backend foundation slice.
- Data: JSON files under `data/` when served through `node server.js`; Supabase document storage behind Vercel serverless API routes in production; browser localStorage remains the fallback when no backend API is available.
- Deployment: Local development runs with `node server.js` or `npm start` at `http://localhost:4179`; Git-connected production is deployed on Vercel at `https://fashion-store-os.vercel.app`.

## Constraints

- The prompt references an existing Pastry County Kitchen OS, but this workspace only contains docs/assets.
- Keep the product generic; Mo'orafrika direction informs the workflow, but the app must not hardcode that brand.
- Avoid package installation unless a phase needs it; the app backend uses Node built-ins, and Supabase CLI is installed as a local dev dependency for owner activation.
- Production API health must prove storage reachability, not just env-var presence.

## Working Agreements

- Use repo-local conventions and commands.
- Keep planning artifacts concise and current.
- Record verification before calling work ready.
