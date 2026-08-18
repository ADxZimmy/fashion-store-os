-- Phase 021 step 4: encrypted device backups.
--
-- One row per store, holding an opaque blob the server cannot read. The
-- device derives an AES-GCM key from an owner passphrase via PBKDF2 and
-- encrypts its records before upload; the passphrase never leaves the device
-- and is not recoverable from anything stored here. Losing it means losing the
-- backup, which is the price of the server not being able to read it.
--
-- Deliberately not a history: one current backup per store. Versioned backups
-- would multiply the storage of an opaque blob the operator cannot inspect or
-- choose between, and the recovery story is "restore my records", not "restore
-- Tuesday".

create table if not exists public.fashion_store_os_backups (
  store_id text primary key references public.fashion_store_os_stores (id) on delete cascade,
  -- Base64. Ciphertext only: no plaintext business field is stored anywhere
  -- in this table, which is what makes it consistent with "Supabase holds
  -- identity only".
  ciphertext text not null,
  salt text not null,
  iv text not null,
  -- Envelope format version, so a future scheme change can be detected rather
  -- than producing a decryption failure that looks like a wrong passphrase.
  format integer not null default 1,
  byte_size integer not null default 0,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fashion_store_os_backups enable row level security;
revoke all on table public.fashion_store_os_backups from anon, authenticated;
grant select, insert, update, delete on table public.fashion_store_os_backups to service_role;
