create table if not exists public.fashion_store_os_workspaces (
  workspace_id text primary key,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fashion_store_os_workspaces_status_check check (status in ('active', 'suspended', 'archived')),
  constraint fashion_store_os_workspaces_id_check check (workspace_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$')
);

insert into public.fashion_store_os_workspaces (workspace_id, name)
values ('default', 'Default workspace')
on conflict (workspace_id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fashion_store_os_documents_workspace_fk'
      and conrelid = 'public.fashion_store_os_documents'::regclass
  ) then
    alter table public.fashion_store_os_documents
      add constraint fashion_store_os_documents_workspace_fk
      foreign key (workspace_id)
      references public.fashion_store_os_workspaces (workspace_id)
      on update cascade
      on delete restrict
      not valid;
  end if;
end $$;

alter table public.fashion_store_os_documents
  validate constraint fashion_store_os_documents_workspace_fk;

create index if not exists fashion_store_os_documents_workspace_updated_at_idx
  on public.fashion_store_os_documents (workspace_id, updated_at desc);

create table if not exists public.fashion_store_os_audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.fashion_store_os_workspaces (workspace_id) on update cascade on delete restrict,
  event_type text not null,
  actor_user_id text,
  actor_email text,
  target_user_id text,
  target_email text,
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint fashion_store_os_audit_events_workspace_id_check check (workspace_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$')
);

create index if not exists fashion_store_os_audit_events_workspace_created_at_idx
  on public.fashion_store_os_audit_events (workspace_id, created_at desc);

create table if not exists public.fashion_store_os_channel_delivery_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.fashion_store_os_workspaces (workspace_id) on update cascade on delete restrict,
  channel text,
  provider_message_id text,
  contact text,
  status text not null,
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint fashion_store_os_channel_delivery_status_check check (status in ('accepted', 'duplicate', 'rejected', 'sent', 'failed')),
  constraint fashion_store_os_channel_delivery_workspace_id_check check (workspace_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$')
);

create index if not exists fashion_store_os_channel_delivery_workspace_created_at_idx
  on public.fashion_store_os_channel_delivery_events (workspace_id, created_at desc);

create unique index if not exists fashion_store_os_channel_delivery_provider_unique_idx
  on public.fashion_store_os_channel_delivery_events (workspace_id, lower(coalesce(channel, '')), provider_message_id)
  where provider_message_id is not null and provider_message_id <> '';

create or replace function public.set_fashion_store_os_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_fashion_store_os_workspaces_updated_at
  on public.fashion_store_os_workspaces;

create trigger set_fashion_store_os_workspaces_updated_at
  before update on public.fashion_store_os_workspaces
  for each row
  execute function public.set_fashion_store_os_updated_at();

alter table public.fashion_store_os_workspaces enable row level security;
alter table public.fashion_store_os_audit_events enable row level security;
alter table public.fashion_store_os_channel_delivery_events enable row level security;

revoke all on table public.fashion_store_os_workspaces from anon, authenticated;
revoke all on table public.fashion_store_os_audit_events from anon, authenticated;
revoke all on table public.fashion_store_os_channel_delivery_events from anon, authenticated;
revoke all on function public.set_fashion_store_os_updated_at() from anon, authenticated;

grant select, insert, update, delete on table public.fashion_store_os_workspaces to service_role;
grant select, insert, update, delete on table public.fashion_store_os_documents to service_role;
grant select, insert, update, delete on table public.fashion_store_os_audit_events to service_role;
grant select, insert, update, delete on table public.fashion_store_os_channel_delivery_events to service_role;

drop policy if exists "Server role manages Fashion Store OS workspaces"
  on public.fashion_store_os_workspaces;
drop policy if exists "Server role manages Fashion Store OS audit events"
  on public.fashion_store_os_audit_events;
drop policy if exists "Server role manages Fashion Store OS channel delivery events"
  on public.fashion_store_os_channel_delivery_events;

create policy "Server role manages Fashion Store OS workspaces"
  on public.fashion_store_os_workspaces
  for all
  to service_role
  using (true)
  with check (true);

create policy "Server role manages Fashion Store OS audit events"
  on public.fashion_store_os_audit_events
  for all
  to service_role
  using (true)
  with check (true);

create policy "Server role manages Fashion Store OS channel delivery events"
  on public.fashion_store_os_channel_delivery_events
  for all
  to service_role
  using (true)
  with check (true);
