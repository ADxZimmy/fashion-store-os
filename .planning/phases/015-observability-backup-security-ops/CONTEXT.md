# Context

## Goal

Add production operations readiness: readiness diagnostics, safe logging, backup/restore guidance, security review checks, and API abuse guardrails.

## Relevant Files

- Path: `api/health.js`
  Why it matters: Existing production storage health probe.
- Path: `api/readiness.js`
  Why it matters: New deployment readiness probe for owner handoff.
- Path: `server.js`
  Why it matters: Local backend should mirror readiness behavior for testing.
- Path: `docs/operations-runbook.md`
  Why it matters: Human-readable production operations handoff.
- Path: `scripts/security-audit.js`
  Why it matters: Repeatable local security hygiene gate.

## Decisions

- Decision: Readiness must not expose secrets.
  Reason: It may be called during deployment handoff and should return only safe configuration status.
- Decision: Keep operations scripts dependency-free.
  Reason: The project is intentionally lightweight and should remain easy for `ADxZimmy` to run before owner release.

## Risks

- Risk: Supabase backup and Vercel observability still require owner-side project access.
  Mitigation: Document exact handoff checks and keep local readiness unblocked.
