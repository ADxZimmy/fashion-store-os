# UAT

## Scenario

A signed provider webhook sends a message, retries the same message, and staff review the accepted lead with consent/provider metadata in CRM Inbox.

## Result

Pass for local API behavior. Provider production credentials remain owner-side setup.

## Notes

Expected API response shows one accepted message and one duplicate across retry attempts.
