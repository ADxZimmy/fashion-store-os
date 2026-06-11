create table if not exists public.fashion_store_os_documents (
  workspace_id text not null default 'default',
  document_key text not null,
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fashion_store_os_documents_pkey primary key (workspace_id, document_key),
  constraint fashion_store_os_documents_key_check check (document_key in ('state', 'auth'))
);

create index if not exists fashion_store_os_documents_updated_at_idx
  on public.fashion_store_os_documents (updated_at desc);

alter table public.fashion_store_os_documents enable row level security;

create or replace function public.set_fashion_store_os_documents_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_fashion_store_os_documents_updated_at
  on public.fashion_store_os_documents;

create trigger set_fashion_store_os_documents_updated_at
  before update on public.fashion_store_os_documents
  for each row
  execute function public.set_fashion_store_os_documents_updated_at();

revoke all on table public.fashion_store_os_documents from anon, authenticated;
revoke all on function public.set_fashion_store_os_documents_updated_at() from anon, authenticated;
