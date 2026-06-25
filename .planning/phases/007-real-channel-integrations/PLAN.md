# Plan

## Outcome

Fashion Store OS exposes a webhook adapter that can safely normalize provider payloads into CRM channel messages.

## Scope

Included:

- Shared channel webhook normalizer.
- Vercel `/api/channel-webhook` GET challenge and POST adapter.
- Local server mirror for the same route.
- Optional `CHANNEL_WEBHOOK_VERIFY_TOKEN` and `CHANNEL_WEBHOOK_SECRET` support.
- Operator documentation.

Excluded:

- OAuth app setup, Graph API subscription management, outbound replies, and paid WhatsApp Business configuration.

## Steps

1. Add shared webhook normalizer and signature helper.
2. Add Vercel route with GET challenge and POST raw-body handling.
3. Add local server route.
4. Document payloads and environment variables.
5. Verify direct and Meta-style payloads locally.

## Verification

- Check: `npm.cmd run check`
  Expected: JavaScript syntax passes.
- Check: Local direct webhook smoke.
  Expected: Direct payload appends to channel queue.
- Check: Local Meta-style webhook smoke.
  Expected: Message payload normalizes to channel queue.

## Rollback

Remove `/api/channel-webhook`, `api/_channel_webhook.js`, local route wiring, and documentation updates.
