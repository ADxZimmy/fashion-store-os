# Context

## Goal

Add a real webhook adapter layer so direct, WhatsApp-like, and Instagram/Meta-style payloads can enter the existing CRM channel queue safely.

## Relevant Files

- Path: `api/_inbound.js`, `api/inbound.js`
  Why it matters: Existing CRM intake normalization and persistence.
- Path: `server.js`
  Why it matters: Local webhook behavior should mirror production.
- Path: `docs/production-persistence.md`
  Why it matters: Production operators need environment variable and endpoint notes.

## Decisions

- Decision: Add `/api/channel-webhook` instead of overloading `/api/inbound`.
  Reason: Webhook verification, provider payload shapes, and raw-body signatures are distinct from manual intake.
- Decision: Support optional environment-based verification.
  Reason: Local testing stays simple, while production can enforce provider challenge/signature secrets without committing tokens.

## Risks

- Risk: Platform payloads vary by product and API version.
  Mitigation: Normalize common direct and Meta-style shapes and preserve source context in notes.
