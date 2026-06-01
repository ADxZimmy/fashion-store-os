# Fashion Store OS

## Mission

Create a brand-agnostic Tailor/Fashion Studio OS that turns client inquiries, custom orders, stock, production, and follow-ups into one operating dashboard.

## Audience

Fashion designers, tailoring studios, garment makers, and small fashion teams that need calmer control over client demand, measurements, inventory reservations, production status, and delivery.

## System Shape

- Runtime: Node-backed local web app with static HTML, CSS, and JavaScript frontend.
- Framework: Dependency-free Node `http` server for this backend foundation slice.
- Data: JSON files under `data/` when served through `node server.js`; browser localStorage remains the fallback for direct file/static-server use.
- Local deployment: Run `node server.js` or `npm start`, then open `http://localhost:4179`.
- Vercel deployment: Static build via `npm run build`, outputting only public assets to `dist/`; production storage remains browser localStorage fallback until a durable cloud database/auth decision is made.
- Section links: The SPA supports hash links such as `/#orders` for direct navigation without splitting modules into separate HTML pages.

## Constraints

- The prompt references an existing Pastry County Kitchen OS, but this workspace only contains docs/assets.
- Keep the product generic; Mo'orafrika direction informs the workflow, but the app must not hardcode that brand.
- Avoid package installation unless a later phase needs it; current backend uses only Node built-ins.
- Do not deploy handover, planning files, prompt documents, PPTX files, backend source, or runtime data as public static assets.

## Working Agreements

- Use repo-local conventions and commands.
- Keep planning artifacts concise and current.
- Record verification before calling work ready.
