-- Phase 021 server schema on Neon Postgres.
--
-- Supabase paused this project's database twice for inactivity, each time
-- taking sign-in down until someone restored it by hand. Neon scales idle
-- compute to zero and wakes it on the next query instead, so the same idle
-- week costs a slightly slower first request rather than an outage.
--
-- Ported from the Supabase migrations that were written for this phase but
-- never applied there (identity, backups, inbox). What changed in the port:
-- no row-level security and no anon/authenticated/service_role grants. Those
-- protected Supabase's public REST endpoint; Neon exposes no such endpoint,
-- and only this app's server connects, as the database owner. That removes
-- the exposure class the step 0 hotfix had to close, rather than guarding it.
--
-- Applied by scripts/db-migrate.js, which records each file in
-- fashion_store_os_schema_migrations. Keep these files free of dollar-quoted
-- bodies: the runner splits statements itself so they can run in one atomic
-- transaction over Neon's HTTP driver, and it refuses $$ rather than
-- mis-splitting a function body.

-- Global accounts: an email identifies one person across every device.
create table fashion_store_os_accounts (
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

-- The real guard on email uniqueness. The application lowercases first and
-- checks before inserting, but two signups racing past that check are stopped
-- here.
create unique index fashion_store_os_accounts_email_key
  on fashion_store_os_accounts (lower(email));

create table fashion_store_os_stores (
  id text primary key,
  name text not null default '',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table fashion_store_os_memberships (
  account_id text not null references fashion_store_os_accounts (id) on delete cascade,
  store_id text not null references fashion_store_os_stores (id) on delete cascade,
  role text not null check (role in ('manager', 'staff')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  allowed_views jsonb not null default '["dashboard"]'::jsonb,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, store_id)
);

create index fashion_store_os_memberships_store_idx
  on fashion_store_os_memberships (store_id);

create table fashion_store_os_sessions (
  id text primary key,
  account_id text not null references fashion_store_os_accounts (id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create unique index fashion_store_os_sessions_token_key
  on fashion_store_os_sessions (token_hash);

-- Serves the expiry sweep.
create index fashion_store_os_sessions_expires_idx
  on fashion_store_os_sessions (expires_at);

create table fashion_store_os_invites (
  id text primary key,
  store_id text not null references fashion_store_os_stores (id) on delete cascade,
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

-- One open invite per address per store. A re-invite replaces the old row
-- application-side; this catches two invites racing.
create unique index fashion_store_os_invites_open_key
  on fashion_store_os_invites (store_id, lower(email))
  where accepted_at is null;

create index fashion_store_os_invites_email_idx
  on fashion_store_os_invites (lower(email));

create index fashion_store_os_invites_expires_idx
  on fashion_store_os_invites (expires_at);

-- Durable throttle for the identity endpoints: one row per attempt, counted
-- over a window, swept daily.
create table fashion_store_os_rate_limit_events (
  id bigint generated always as identity primary key,
  scope text not null,
  key text not null,
  created_at timestamptz not null default now()
);

create index fashion_store_os_rate_limit_events_lookup_idx
  on fashion_store_os_rate_limit_events (scope, key, created_at);

create index fashion_store_os_rate_limit_events_created_idx
  on fashion_store_os_rate_limit_events (created_at);

-- Identity audit trail per store, retained 90 days by the sweep.
create table fashion_store_os_identity_audit (
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

create index fashion_store_os_identity_audit_store_idx
  on fashion_store_os_identity_audit (store_id, created_at desc);

create index fashion_store_os_identity_audit_created_idx
  on fashion_store_os_identity_audit (created_at);

-- Encrypted backups: one opaque row per store. Ciphertext only; the key is
-- derived on the device from a passphrase that never leaves it.
create table fashion_store_os_backups (
  store_id text primary key references fashion_store_os_stores (id) on delete cascade,
  ciphertext text not null,
  salt text not null,
  iv text not null,
  format integer not null default 1,
  byte_size integer not null default 0,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Transit inbox: provider messages held only until a device pulls and
-- acknowledges them. A relay, never the durable copy.
create table fashion_store_os_inbox_messages (
  id text primary key,
  store_id text not null references fashion_store_os_stores (id) on delete cascade,
  fingerprint text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- A provider retry must not land twice in the same store.
create unique index fashion_store_os_inbox_fingerprint_key
  on fashion_store_os_inbox_messages (store_id, fingerprint);

create index fashion_store_os_inbox_store_idx
  on fashion_store_os_inbox_messages (store_id, received_at);

create index fashion_store_os_inbox_expires_idx
  on fashion_store_os_inbox_messages (expires_at);
