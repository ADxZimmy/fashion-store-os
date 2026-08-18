-- Phase 021 step 1: global identity tables.
--
-- Identity moves out of the per-workspace "auth" JSON document into rows.
-- Accounts are global (email unique regardless of device), sessions bind to
-- accounts rather than (cookie, workspace-header) pairs, invites exist as
-- their own rows so no account is created until acceptance, and rate-limit
-- events give the identity endpoints a durable throttle. Recovery codes stay
-- as columns on accounts: the semantics are single-active-code-per-account
-- (issuing replaces the previous one), which columns model exactly.
--
-- Additive only. The legacy documents/workspaces/workspace_codes tables are
-- untouched until Release B drops them.

create table if not exists public.fashion_store_os_accounts (
  id text primary key,
  email text not null,
  name text not null default '',
  password_hash text not null default '',
  password_salt text not null default '',
  password_iterations integer not null default 120000,
  password_digest text not null default 'sha256',
  password_updated_at timestamptz,
  recovery_code_hash text not null default '',
  recovery_issued_at timestamptz,
  recovery_redeemed_at timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Global email uniqueness, case-insensitive. The application lowercases
-- before writing; the index guards concurrent signups racing past the check.
create unique index if not exists fashion_store_os_accounts_email_key
  on public.fashion_store_os_accounts (lower(email));

create table if not exists public.fashion_store_os_stores (
  id text primary key,
  name text not null default '',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fashion_store_os_memberships (
  account_id text not null references public.fashion_store_os_accounts (id) on delete cascade,
  store_id text not null references public.fashion_store_os_stores (id) on delete cascade,
  role text not null check (role in ('manager', 'staff')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  allowed_views jsonb not null default '["dashboard"]'::jsonb,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, store_id)
);

create index if not exists fashion_store_os_memberships_store_idx
  on public.fashion_store_os_memberships (store_id);

create table if not exists public.fashion_store_os_sessions (
  id text primary key,
  account_id text not null references public.fashion_store_os_accounts (id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create unique index if not exists fashion_store_os_sessions_token_key
  on public.fashion_store_os_sessions (token_hash);

-- Serves the expiry sweep run by the keepalive cron.
create index if not exists fashion_store_os_sessions_expires_idx
  on public.fashion_store_os_sessions (expires_at);

create table if not exists public.fashion_store_os_invites (
  id text primary key,
  store_id text not null references public.fashion_store_os_stores (id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null check (role in ('manager', 'staff')),
  allowed_views jsonb not null default '["dashboard"]'::jsonb,
  token_hash text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz
);

-- One open invite per email per store; a new invite for the same address
-- replaces the old row application-side before insert.
create unique index if not exists fashion_store_os_invites_open_key
  on public.fashion_store_os_invites (store_id, lower(email))
  where accepted_at is null;

create index if not exists fashion_store_os_invites_email_idx
  on public.fashion_store_os_invites (lower(email));

-- Serves the expiry sweep.
create index if not exists fashion_store_os_invites_expires_idx
  on public.fashion_store_os_invites (expires_at);

-- Durable throttle for the identity endpoints: one row per attempt, counted
-- over a window. Inserts are atomic, so this is accurate under concurrency,
-- unlike the in-memory limiter it replaces. Swept daily.
create table if not exists public.fashion_store_os_rate_limit_events (
  id bigint generated always as identity primary key,
  scope text not null,
  key text not null,
  created_at timestamptz not null default now()
);

create index if not exists fashion_store_os_rate_limit_events_lookup_idx
  on public.fashion_store_os_rate_limit_events (scope, key, created_at);

create index if not exists fashion_store_os_rate_limit_events_created_idx
  on public.fashion_store_os_rate_limit_events (created_at);

-- Identity audit trail, per store, retained 90 days by the sweep. Replaces
-- the 200-event log embedded in the legacy auth document. (The schema-only
-- fashion_store_os_audit_events table from 20260626191000 was never used and
-- is dropped in Release B.)
create table if not exists public.fashion_store_os_identity_audit (
  id text primary key,
  store_id text not null,
  type text not null,
  actor_account_id text not null default '',
  actor_email text not null default '',
  target_account_id text not null default '',
  target_email text not null default '',
  detail text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists fashion_store_os_identity_audit_store_idx
  on public.fashion_store_os_identity_audit (store_id, created_at desc);

create index if not exists fashion_store_os_identity_audit_created_idx
  on public.fashion_store_os_identity_audit (created_at);

-- Service-role only, same posture as fashion_store_os_workspace_codes.
alter table public.fashion_store_os_accounts enable row level security;
alter table public.fashion_store_os_stores enable row level security;
alter table public.fashion_store_os_memberships enable row level security;
alter table public.fashion_store_os_sessions enable row level security;
alter table public.fashion_store_os_invites enable row level security;
alter table public.fashion_store_os_rate_limit_events enable row level security;
alter table public.fashion_store_os_identity_audit enable row level security;

revoke all on table public.fashion_store_os_accounts from anon, authenticated;
revoke all on table public.fashion_store_os_stores from anon, authenticated;
revoke all on table public.fashion_store_os_memberships from anon, authenticated;
revoke all on table public.fashion_store_os_sessions from anon, authenticated;
revoke all on table public.fashion_store_os_invites from anon, authenticated;
revoke all on table public.fashion_store_os_rate_limit_events from anon, authenticated;
revoke all on table public.fashion_store_os_identity_audit from anon, authenticated;

grant select, insert, update, delete on table public.fashion_store_os_accounts to service_role;
grant select, insert, update, delete on table public.fashion_store_os_stores to service_role;
grant select, insert, update, delete on table public.fashion_store_os_memberships to service_role;
grant select, insert, update, delete on table public.fashion_store_os_sessions to service_role;
grant select, insert, update, delete on table public.fashion_store_os_invites to service_role;
grant select, insert, update, delete on table public.fashion_store_os_rate_limit_events to service_role;
grant select, insert, update, delete on table public.fashion_store_os_identity_audit to service_role;
