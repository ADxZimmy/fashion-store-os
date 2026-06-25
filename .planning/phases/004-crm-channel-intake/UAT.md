# UAT

## Scenario

In CRM Inbox, paste or submit a WhatsApp/Instagram-style message from a potential client, review it in the channel intake queue, set the follow-up state, and route it into the inquiry pipeline.

## Result

Passed on 2026-06-25.

## Notes

The local browser smoke confirmed a raw channel message can be saved, follow-up state can be changed, the message can be routed into the inquiry pipeline, and the generated inquiry keeps the source/request context. The live endpoint smoke confirmed `/api/inbound` can persist a WhatsApp/Instagram-style payload into production state and that cleanup returns the Supabase table to an empty state.
