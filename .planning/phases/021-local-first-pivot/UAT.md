# UAT

Owner-run scenarios against the Release A deployment, in a real browser. All must pass before Release B (the destructive release). Item 11's first half is the exception: it runs **before Release A**, because the identity cutover invalidates existing accounts.

1. **Fresh start.** New browser profile → manager signup → set up business profile, add a client and an order → refresh → everything persists. DevTools network tab shows no business-data writes to the server.
2. **Lock without loss.** Sign out → lock screen appears → local data untouched (verify by signing back in: same data).
3. **Offline unlock.** Sign in once → go offline (or block Supabase) → close and reopen the app → app opens with data available → edits persist → back online, session revalidates silently.
4. **Backup.** Set a passphrase → Back up now → inspect the stored blob (Supabase dashboard): ciphertext only, no readable business fields.
5. **Restore.** Second fresh browser profile → sign in with the same account → restore with the passphrase → full dataset present. Then attempt restore with a wrong passphrase → clean failure, no data loss.
6. **Team on the shop device.** Invite a staff account → staff signs in on the same device → sees only their allowed views. Record that this gating is UI-level by design.
7. **Second device reality check.** Sign in on another device without restoring → empty store plus the offer to restore from backup, with the fork warning shown.
8. **Inbox.** Send a signed test webhook → message appears on next device pull → server row deleted (second pull empty) → duplicate delivery does not duplicate the message locally.
9. **Reset split.** Erase local data: local keys (including the workspace key) cleared, account still signs in. Delete account: server identity gone, local data untouched until erased separately.
10. **Abuse control.** Ten rapid wrong-password sign-ins throttle with a clear message; the correct password works after the window passes.
11. **No real server data confirmation.** Owner runs a service-role query in the Supabase dashboard listing all `fashion_store_os_documents` rows (both `state` and `auth` kinds) and confirms nothing beyond seed/test content exists — no real business data *and no real accounts*. Confirmed **before Release A** (the identity cutover invalidates existing accounts) and reconfirmed before Release B (the destructive drop). Default-workspace webhook rows are discarded; no real provider credentials were ever configured.
12. **Recovery round trip.** On the row-based identity plane: recovery code issued at manager signup → sign out → Forgot password with the code → new password set without a session → old code refused on second use → sign in with the new password.
13. **Store mismatch.** Sign in on a device holding another store's local data with a non-member account → offered the explicit locked/erase choice → choosing neither leaves the data intact.
