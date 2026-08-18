-- Phase 021 step 5: transit inbox for provider webhooks.
--
-- The one business-data write path that cannot originate from a device: a
-- provider pushes to a server, and a phone that is off cannot receive a
-- webhook. So the server holds undelivered messages only, a signed-in device
-- drains them into its local records, and the rows are deleted on pull. The
-- server is a relay, not a store: nothing here is the durable copy of
-- anything, and undelivered rows expire on their own.
--
-- Messages are stored as a normalized JSON payload rather than exploded
-- columns. The shape belongs to the client's channel-message model, which this
-- table only forwards -- giving it columns here would create a second schema
-- to keep in step for no gain.

create table if not exists public.fashion_store_os_inbox_messages (
  id text primary key,
  store_id text not null references public.fashion_store_os_stores (id) on delete cascade,
  -- Dedup key: channel + provider message id when the provider supplies one,
  -- else a content hash. Ported from the pre-pivot in-document dedup so a
  -- provider retry does not create a second message.
  fingerprint text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- A provider retry must not land twice in the same store.
create unique index if not exists fashion_store_os_inbox_fingerprint_key
  on public.fashion_store_os_inbox_messages (store_id, fingerprint);

create index if not exists fashion_store_os_inbox_store_idx
  on public.fashion_store_os_inbox_messages (store_id, received_at);

-- Serves the expiry sweep run by the keepalive cron.
create index if not exists fashion_store_os_inbox_expires_idx
  on public.fashion_store_os_inbox_messages (expires_at);

alter table public.fashion_store_os_inbox_messages enable row level security;
revoke all on table public.fashion_store_os_inbox_messages from anon, authenticated;
grant select, insert, update, delete on table public.fashion_store_os_inbox_messages to service_role;
