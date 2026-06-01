# Plan

## Outcome

The app can be run with `node server.js`, load/save workspace data through backend API endpoints, show storage status to users, and still fall back to browser storage when the backend is unavailable.

## Scope

Included:

- Node backend with static file serving.
- JSON-backed API for state/auth bootstrap, save, load, and reset.
- Frontend async bootstrap from backend.
- Browser localStorage fallback.
- First-run profile setup restored for brand-agnostic startup.
- UI loading/status treatment using UI/UX Pro Max guidance.
- GSD and handover updates.

Excluded:

- Production database selection.
- Real WhatsApp/Instagram API integration.
- Secure password hashing/session tokens.
- Cloud deployment.

## Steps

1. Add dependency-free backend server and package scripts.
2. Add ignored runtime data directory.
3. Update frontend boot flow to check `/api/bootstrap`.
4. Save state/auth to backend when available and localStorage always.
5. Update reset flow to clear backend data when available.
6. Remove runtime hardcoded brand defaults and require setup when no profile exists.
7. Verify syntax, API routes, browser flow, and fallback behavior.

## Verification

- Check: `node --check src\\app.js`
  Expected: Pass.
- Check: `node --check server.js`
  Expected: Pass.
- Check: `node server.js`
  Expected: App serves at `http://localhost:4179`.
- Check: `GET /api/health`
  Expected: JSON `{ ok: true }`.
- Check: First-run signup/setup in browser.
  Expected: Manager signup leads to business setup, setup opens dashboard, and backend data files are written.
- Check: Reset workspace data.
  Expected: Backend JSON files and browser storage are cleared, then first launch is shown again.

## Rollback

Remove `server.js`, `package.json`, `.gitignore` runtime entries, and the frontend async bootstrap/persistence changes. The app can return to the previous localStorage-only flow.
