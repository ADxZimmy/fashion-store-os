-- Phase 021 step 0 -- standing security fix, independent of the pivot.
--
-- Migration 20260611163000 granted anon and authenticated full DML on
-- fashion_store_os_documents and added a policy scoped to the default
-- workspace's state/auth documents. The 20260626191000 hardening revoked
-- anon access on the workspaces, audit, and channel-delivery tables but
-- never this one, so the anon key has been able to read and write the
-- default workspace's password-hash-bearing auth document ever since.
--
-- All application access goes through the service-role key
-- (api/_store.js resolveSupabaseKey). The only anon-key code path is the
-- opt-in FASHION_STORE_ALLOW_PUBLIC_SUPABASE_KEY=1 escape hatch, which is
-- not set in production. service_role bypasses RLS and keeps its explicit
-- DML grant from 20260626191000, so nothing legitimate changes behaviour.

drop policy if exists "Allow default workspace document API access"
  on public.fashion_store_os_documents;

revoke select, insert, update, delete
  on table public.fashion_store_os_documents
  from anon, authenticated;
