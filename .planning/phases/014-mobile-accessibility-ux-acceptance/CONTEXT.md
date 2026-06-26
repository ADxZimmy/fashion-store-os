# Context

## Goal

Protect the mobile-first drawer layout, accessible feedback, focus visibility, reduced motion, touch target sizing, and no-overflow behavior.

## Relevant Files

- Path: `index.html`
  Why it matters: Hosts live regions and the app mount.
- Path: `src/styles.css`
  Why it matters: Holds mobile drawer, focus, touch target, and reduced motion rules.
- Path: `scripts/ux-audit.js`
  Why it matters: Will provide a repeatable static UX gate.

## Decisions

- Decision: Use a static UX audit gate in addition to code review.
  Reason: Browser automation has been unreliable on this workstation, but mobile regressions still need a repeatable check.
- Decision: Preserve the existing off-canvas mobile drawer.
  Reason: It addresses the earlier phone-navigation complaint and should be protected rather than redesigned again.

## Risks

- Risk: Static checks cannot prove every viewport behavior.
  Mitigation: Pair static checks with manual/live checks when browser tooling is available.
