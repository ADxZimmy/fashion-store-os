# Channel Integrations

Fashion Store OS has two channel intake APIs:

- `/api/inbound` is the authenticated same-origin intake route used by the app and internal tests.
- `/api/channel-webhook` is the provider-facing adapter route for webhooks.

## Production Environment

Set these in Vercel when connecting a provider app:

```text
CHANNEL_WEBHOOK_VERIFY_TOKEN
CHANNEL_WEBHOOK_SECRET
CHANNEL_WEBHOOK_REQUIRE_SIGNATURE=1
CHANNEL_WEBHOOK_MAX_MESSAGES=25
```

`CHANNEL_WEBHOOK_VERIFY_TOKEN` is compared against `hub.verify_token` during webhook subscription challenge requests.

`CHANNEL_WEBHOOK_SECRET` verifies the `x-hub-signature-256` header. The signature value should be the HMAC SHA-256 digest of the raw JSON request body using the shared secret, formatted as `sha256=<hex>`. The adapter also accepts `x-fashion-signature` for internal smoke tests.

Set `CHANNEL_WEBHOOK_REQUIRE_SIGNATURE=1` in production. With that flag enabled, the webhook fails closed if the signing secret is missing. `CHANNEL_WEBHOOK_MAX_MESSAGES` caps one webhook batch; the default is `25`, and the server clamps the value to `100`.

Do not commit provider app secrets, access tokens, page tokens, phone-number tokens, or signing secrets to this repository.

The provider-facing `GET /api/channel-webhook` route only handles subscription challenge checks and returns a minimal status payload otherwise. It does not expose the message queue.

## Production Intake Behavior

- Direct and Meta-style provider payloads normalize into `state.channelMessages`.
- Messages are deduplicated by provider message id when available, otherwise by channel/contact/message/date.
- Accepted, duplicate, and rejected webhook events are recorded in `state.channelDeliveryEvents` for operational review.
- Manual and webhook-created messages carry `consentStatus` (`Unknown`, `Opted in`, or `Opted out`) so staff can avoid outbound follow-up when a lead has opted out.
- Outbound send APIs, Graph permission review, and paid WhatsApp onboarding remain out of scope for this phase.

## Direct Test Payload

```json
{
  "provider": "whatsapp",
  "senderName": "Adaeze N.",
  "contact": "+234 800 000 0000",
  "message": "Can you make a corset dress for a wedding?",
  "desiredStyle": "Corset dress",
  "occasion": "Wedding",
  "deadline": "2026-07-10",
  "budget": 150000,
  "consentStatus": "Opted in",
  "providerMessageId": "wamid.test-001"
}
```

## Meta-Style Payload

The adapter accepts common WhatsApp/Instagram webhook shapes under `entry[].changes[].value.messages[]` and `entry[].messaging[]`. It extracts sender/contact, message text or captions, provider channel, timestamp, and source notes, then appends normalized records to `state.channelMessages`.

## Local Smoke

Run the app locally and post a direct payload:

```powershell
npm.cmd start
Invoke-RestMethod http://localhost:4179/api/channel-webhook -Method Post -ContentType 'application/json' -Body '{"provider":"instagram","senderName":"Chioma","contact":"@chioma","message":"Need a two-piece set","desiredStyle":"Two-piece set"}'
```

Then open CRM Inbox and confirm the message appears in the channel intake queue.

For signed local smoke tests, compute `sha256=<hmac>` over the exact JSON body with `CHANNEL_WEBHOOK_SECRET`, then send it as `x-hub-signature-256`.
