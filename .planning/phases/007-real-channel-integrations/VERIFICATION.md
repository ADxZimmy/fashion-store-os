# Verification

## Automated Checks

- Command: `npm.cmd run check`
  Result: Passed on 2026-06-25.
  Notes: Checked 17 JavaScript files after channel webhook files were added.
- Command: `npm.cmd run build`
  Result: Passed on 2026-06-25.
  Notes: Built 6 public files into `dist/`.
- Command: Local direct webhook smoke against `POST /api/channel-webhook`.
  Result: Passed on 2026-06-25.
  Notes: Direct Instagram-style payload returned `accepted: 1` and normalized into a channel message.
- Command: Local Meta-style webhook smoke against `POST /api/channel-webhook`.
  Result: Passed on 2026-06-25.
  Notes: WhatsApp-style `entry[].changes[].value.messages[]` payload returned `accepted: 1` and normalized with channel `WhatsApp`.
- Command: Live production webhook smoke against `POST /api/channel-webhook`.
  Result: Passed on 2026-06-25.
  Notes: Direct Instagram-style payload returned `accepted: 1`, appeared in authenticated bootstrap state, and was removed by cleanup.

## Manual Checks

- Check: Operator documentation.
  Result: Passed on 2026-06-25.
  Notes: Added `docs/channel-integrations.md` and updated production persistence environment notes for `CHANNEL_WEBHOOK_VERIFY_TOKEN` and `CHANNEL_WEBHOOK_SECRET`.

## Residual Risk

- Risk: Production provider apps still require platform-side configuration outside this repository.
  Owner: Deployment/operator follow-up.
