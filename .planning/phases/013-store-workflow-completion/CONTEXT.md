# Context

## Goal

Complete the daily store workflow from quoted order through deposit/payment, fitting, production review, handoff, inventory adjustment, and customer follow-up.

## Relevant Files

- Path: `src/app.js`
  Why it matters: Holds the current single-page app state, order actions, inventory actions, modal rendering, and persistence wiring.
- Path: `src/styles.css`
  Why it matters: Needs compact, touch-safe layouts for new workflow controls.
- Path: `.planning/REQUIREMENTS.md`
  Why it matters: Functional requirements need the new operational workflows captured for future continuation.

## Decisions

- Decision: Keep workflow data inside the existing document state model.
  Reason: Owner-side Supabase setup is pending, and the current local/Supabase-compatible persistence contract should remain unblocked.
- Decision: Add append-only activity-style arrays for payments, fittings, and inventory adjustments.
  Reason: Store staff need a trace of operational decisions without introducing a new backend dependency.

## Risks

- Risk: Workflow actions become too dense on mobile.
  Mitigation: Keep actions grouped, use full-width mobile buttons, and add the Phase 014 UX audit gate.
