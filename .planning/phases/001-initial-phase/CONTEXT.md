# Context

## Goal

Create a first usable Fashion Studio OS control room inspired by Prompt 1 and the Mo'orafrika Studio OS deck.

## Relevant Files

- Path: `docs/Prompt 1.txt`
  Why it matters: Primary requirements for domain conversion, onboarding, modules, recipes, inventory, and deliverables.
- Path: `docs/Moorafrika-Studio-OS.pptx`
  Why it matters: Product direction: control room for CRM inbox, orders, inventory, production, catalog, reports, and automation.
- Path: `docs/IMG-20260528-WA0025.jpg`, `docs/IMG-20260528-WA0028.jpg`, `docs/IMG-20260528-WA0029.jpg`
  Why it matters: Brand references only; the app itself remains generic.

## Decisions

- Decision: Build as a static local app for phase 1.
  Reason: No existing app codebase, package manifest, routes, or components are present to adapt.
- Decision: Use localStorage for persistence.
  Reason: It satisfies first-launch setup and record persistence without adding infrastructure.

## Risks

- Risk: Static MVP may need migration if the original Kitchen OS code is later supplied.
  Mitigation: Keep data models explicit and UI modular in `src/app.js`.
