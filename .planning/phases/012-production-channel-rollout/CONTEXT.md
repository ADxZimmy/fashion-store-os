# Context

## Goal

Prepare webhook intake for production channel rollout with signature enforcement, deduplication, consent tracking, delivery-event visibility, and safer public route behavior.

## Relevant Files

- Path: `api/channel-webhook.js`
  Why it matters: Vercel provider-facing webhook route.
- Path: `server.js`
  Why it matters: Local provider-facing webhook mirror.
- Path: `api/_channel_webhook.js`
  Why it matters: Payload normalization and signature/challenge helpers.
- Path: `api/_channel_intake.js`
  Why it matters: Deduplication and delivery-event recording.
- Path: `docs/channel-integrations.md`
  Why it matters: Provider setup and smoke-test instructions.

## Decisions

- Decision: GET route no longer exposes message records.
  Reason: Provider challenge checks should not leak CRM data.
- Decision: Store consent state on every message.
  Reason: Staff need to know whether outbound follow-up is appropriate.

## Risks

- Risk: Full outbound send APIs remain out of scope.
  Mitigation: Docs state the current phase is inbound production readiness only.
