-- Phase 019: multi-device workspace access.
--
-- A workspace code lets a second browser learn which workspace id to address.
-- It is looked up by a caller who does not yet know the workspace, which is the
-- one lookup the per-workspace document store cannot express. Hence a table of
-- its own rather than another document key.
--
-- Only the hash is stored. The raw code is returned once at issue time.

create table if not exists public.fashion_store_os_workspace_codes (
  code_hash text primary key,
  workspace_id text not null references public.fashion_store_os_workspaces (workspace_id) on update cascade on delete cascade,
  kind text not null,
  created_by_user_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  constraint fashion_store_os_workspace_codes_kind_check check (kind in ('join', 'invite'))
);

-- Redemption looks a code up by hash (the primary key). This index serves the
-- housekeeping sweep of expired rows instead.
create index if not exists fashion_store_os_workspace_codes_expires_at_idx
  on public.fashion_store_os_workspace_codes (expires_at);

create index if not exists fashion_store_os_workspace_codes_workspace_idx
  on public.fashion_store_os_workspace_codes (workspace_id, created_at desc);

alter table public.fashion_store_os_workspace_codes enable row level security;

-- New tables get no implicit access under the current Supabase Data API model,
-- so the grants below are required, and anon/authenticated must stay revoked.
-- Reaching this table from a browser key would expose the workspace mapping.
revoke all on table public.fashion_store_os_workspace_codes from anon, authenticated;

grant select, insert, update, delete on table public.fashion_store_os_workspace_codes to service_role;
