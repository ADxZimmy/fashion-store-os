# Context

## Goal

Turn the static prototype into the first working product slice by adding a backend persistence layer and wiring the frontend to it without losing local fallback behavior.

## Relevant Files

- Path: `server.js`
  Why it matters: New backend entry point serving static files and JSON persistence APIs.
- Path: `src/app.js`
  Why it matters: Current app state, auth, onboarding, settings, inventory, and production workflows live here.
- Path: `src/styles.css`
  Why it matters: Loading and storage-status UI must follow the existing visual system.
- Path: `design-system/fashion-store-os/MASTER.md`
  Why it matters: Persisted UI/UX Pro Max guidance for productization.
- Path: `handover.md`
  Why it matters: External collaborators should understand what changed and what comes next.

## Decisions

- Decision: Use dependency-free Node `http` and JSON files for this first backend slice.
  Reason: It starts real backend persistence without slowing the project down with package installs or database selection.
- Decision: Keep localStorage as a fallback.
  Reason: The app still needs to run from `index.html` or a plain static server while backend work is in progress.
- Decision: Make first launch truly profile-driven by defaulting seed state to `profile: null`.
  Reason: Prompt 1 requires business setup when no profile exists and brand-agnostic UI.

## Risks

- Risk: JSON files are not a production multi-user database.
  Mitigation: Mark database/auth hardening as the next productization decision.
- Risk: Prototype auth still stores plaintext passwords.
  Mitigation: Keep this called out in handover and planning until a real auth layer replaces it.
