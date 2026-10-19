# Channel Integrations

Last updated: 2026-10-19

How WhatsApp, Instagram, and other provider messages reach a shop after the Phase 021 local-first pivot.

## How It Works

Business records live on each device, but a provider cannot deliver to a device, and a phone that is off cannot receive a webhook. So the server catches provider messages in a **transit inbox** and holds them only until a device collects them:

1. The provider posts to `/api/channel-webhook`. The server verifies the signature and stores each message in the inbox for the bound store.
2. A signed-in device pulls waiting messages (on start, and with **Check for messages** in CRM Inbox), writes them into its own records, and **then** acknowledges them, which deletes them from the server.
3. Anything not collected within 14 days expires.

The order in step 2 is deliberate. If anything fails between storing and acknowledging, the message stays on the server and is pulled again; the device ignores the duplicate. Deleting first would lose messages instead, and a lost enquiry is worse than a repeated one.

Messages typed in by hand in CRM Inbox never touch the server.

## Which Store Gets The Messages

A provider cannot say which store a message is for, so one store is named by configuration: `FASHION_STORE_INBOX_STORE_ID`. Until it is set, the webhook refuses deliveries with **503**, so a misconfigured provider retries rather than silently losing messages or landing them in the wrong store. Supporting more than one store needs per-provider routing, which is out of scope for Phase 021.

To find a store's id, either open the app signed in to that store and read the `fashion-studio-os-store-v1` key in the browser's local storage, or run this in the Neon console:

```sql
select s.id as store_id, a.email as manager_email
from fashion_store_os_stores s
join fashion_store_os_memberships m on m.store_id = s.id and m.role = 'manager'
join fashion_store_os_accounts a on a.id = m.account_id;
```

## Production Environment

Set these in Vercel when connecting a provider app:

```text
FASHION_STORE_INBOX_STORE_ID
CHANNEL_WEBHOOK_VERIFY_TOKEN
CHANNEL_WEBHOOK_SECRET
CHANNEL_WEBHOOK_REQUIRE_SIGNATURE=1
CHANNEL_WEBHOOK_MAX_MESSAGES=25
```

- `CHANNEL_WEBHOOK_VERIFY_TOKEN` is compared with `hub.verify_token` during the provider's subscription check. `GET /api/channel-webhook` only answers that check; it never exposes messages.
- `CHANNEL_WEBHOOK_SECRET` verifies `x-hub-signature-256`: the HMAC SHA-256 of the raw request body with the shared secret, formatted `sha256=<hex>`. `x-fashion-signature` is accepted too, for internal tests.
- `CHANNEL_WEBHOOK_REQUIRE_SIGNATURE=1` makes a missing secret fail closed. Set it in production.
- `CHANNEL_WEBHOOK_MAX_MESSAGES` caps one delivery's batch: default 25, never more than 100. The rest of an oversized batch is counted as rejected.

Never commit provider secrets, access tokens, page tokens, or signing secrets.

`/api/readiness` reports whether signatures are required and whether a store is bound. Both are optional checks: they do not make readiness fail until a provider is connected.

## What The Webhook Does With A Delivery

- Direct and Meta-style payloads (`entry[].changes[].value.messages[]` and `entry[].messaging[]`) are normalized: sender, contact, message text or caption, channel, timestamp, and notes.
- A message with no sender or no content is rejected.
- Duplicates are refused by a unique key on the store and a fingerprint: the provider's message id when it sends one, otherwise channel, contact, text, and date. A provider retrying a delivery therefore never creates a second message.
- The response reports `accepted`, `duplicates`, and `rejected` counts: **201** when something new was queued, **202** when nothing new was (all duplicates or all rejected). Providers treat both as success, which is correct, since retrying would not change the outcome.
- Messages carry `consentStatus` (`Unknown`, `Opted in`, or `Opted out`) so staff can avoid following up a lead who opted out.

Out of scope: sending messages back out, Graph API permission review, and paid WhatsApp onboarding.

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

## Local Smoke

1. Start the app with a store bound to the inbox. You need the store's id first, so sign up once, read the id (see above), then restart with it:
   ```powershell
   $env:FASHION_STORE_INBOX_STORE_ID = "<store id>"; npm.cmd run dev
   ```
2. Post a payload. Without `CHANNEL_WEBHOOK_SECRET` set, local delivery is unsigned:
   ```powershell
   Invoke-RestMethod http://localhost:4179/api/channel-webhook -Method Post -ContentType 'application/json' -Body '{"provider":"instagram","senderName":"Chioma","contact":"@chioma","message":"Need a two-piece set","desiredStyle":"Two-piece set","providerMessageId":"ig.local-001"}'
   ```
   **Expected:** `accepted: 1`. Posting the same body again gives `duplicates: 1`.
3. In the app, CRM Inbox, **Check for messages**. The message appears once; checking again adds nothing.

For a signed test, set `CHANNEL_WEBHOOK_SECRET`, compute `sha256=<hmac>` over the exact body, and send it as `x-hub-signature-256`. With `CHANNEL_WEBHOOK_REQUIRE_SIGNATURE=1`, the same delivery without a signature must be refused.
