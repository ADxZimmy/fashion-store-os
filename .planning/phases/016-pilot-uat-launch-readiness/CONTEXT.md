# Context

## Goal

Prepare a real-store pilot and launch-readiness gate that validates onboarding, CRM intake, quote/order lifecycle, inventory deduction, reports, staff access, and recovery docs.

## Relevant Files

- Path: `docs/pilot-uat.md`
  Why it matters: Provides the pilot test script and issue triage flow.
- Path: `scripts/launch-readiness.js`
  Why it matters: Aggregates local release checks into one launch gate.
- Path: `.planning/ROADMAP.md`
  Why it matters: Needs to mark phases through pilot readiness accurately.

## Decisions

- Decision: Treat owner-side GitHub/Vercel/Supabase setup as a deployment lane, not a product-build blocker.
  Reason: Work can continue locally and be pushed for `ADxZimmy` to release when ready.
- Decision: Keep pilot readiness as a checkable artifact and command.
  Reason: It reduces context loss and helps non-developer reviewers follow the launch criteria.

## Risks

- Risk: Launch-readiness command cannot prove live production env vars are set.
  Mitigation: Include owner-side live checks in the pilot UAT document and readiness route output.
