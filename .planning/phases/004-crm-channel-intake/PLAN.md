# Plan

## Outcome

The CRM Inbox shows a channel intake queue where inbound WhatsApp/Instagram-style messages can be captured, tracked by routing/follow-up status, and converted into normal inquiries.

## Scope

Included:

- Add `channelMessages` to the app state model and seed data.
- Add a manual channel message form inside CRM Inbox.
- Add message cards with source, sender/contact, raw message, desired garment, deadline, routing status, and follow-up status.
- Add actions to route a message into an inquiry or archive it.
- Add a production/local `/api/inbound` endpoint for JSON message posting.
- Verify local checks, endpoint behavior, and live production after deploy.

Excluded:

- Real WhatsApp Business API, Instagram Graph API, OAuth, or webhook signature verification.
- Multi-workspace routing beyond the current `default` workspace.
- Production auth hardening.

## Steps

1. Extend the state model with normalized channel message records.
2. Add shared inbound-message validation/normalization for API routes.
3. Implement `/api/inbound` in Vercel serverless routes and the local Node server.
4. Update CRM Inbox UI to include a compact intake form and queue.
5. Wire route/archive/follow-up handlers.
6. Run syntax/build checks and targeted endpoint/UI smoke checks.
7. Update GSD state and verification artifacts.
8. Commit, push, deploy, and verify live production.

## Verification

- Check: `npm.cmd run check`
  Expected: Passes all JavaScript parse checks.
- Check: `npm.cmd run build`
  Expected: Builds static files into `dist/`.
- Check: Local `/api/inbound` POST then `/api/bootstrap`.
  Expected: Posted message appears in `state.channelMessages`.
- Check: Live `/api/inbound` POST then `/api/bootstrap`.
  Expected: Posted message appears, can be cleaned up, and persistence remains healthy.
- Check: Mobile-width browser smoke.
  Expected: CRM Inbox does not horizontally overflow and intake controls remain tappable.

## Rollback

Revert the `channelMessages` model, `/api/inbound` route, CRM Inbox UI additions, and related CSS. Existing inquiry/order/client data remains compatible because this phase only adds a new optional state array.
