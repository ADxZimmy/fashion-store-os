# UAT

## Scenario

Send a webhook payload to `/api/channel-webhook`, open CRM Inbox, and verify the normalized message appears with sender, contact, channel, message text, source note, routing state, and follow-up state.

## Result

Passed locally on 2026-06-25.

## Notes

Production should set webhook verification secrets in Vercel environment variables, not in source files. Platform-side app subscription setup remains outside the repo.
