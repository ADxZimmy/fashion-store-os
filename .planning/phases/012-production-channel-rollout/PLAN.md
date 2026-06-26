# Plan

## Outcome

Real WhatsApp/Instagram credentials, webhook verification, duplicate prevention, consent handling, rate-limit behavior, and channel failure states are production tested without committing secrets.

## Scope

Included:
- Signature-required mode.
- Webhook batch limits.
- Duplicate detection.
- Delivery events.
- Consent status in manual and webhook intake.
- Safer webhook GET response.
- Channel docs update.

Excluded:
- Outbound send APIs.
- Provider OAuth/permission review.
- Paid WhatsApp Business onboarding.

## Steps

1. Harden webhook verification and public GET behavior.
2. Add dedupe/delivery event helper.
3. Persist consent/provider metadata into channel messages.
4. Update docs and run signed webhook smoke.

## Verification

- Check: Local webhook smoke.
  Expected: Signed payload accepted, duplicate payload counted as duplicate, public GET does not expose messages.

## Rollback

Revert channel helper/handler/frontend/doc changes; previous webhook append-only behavior returns.
