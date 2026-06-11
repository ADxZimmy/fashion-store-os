grant select, insert, update, delete on table public.fashion_store_os_documents to anon, authenticated;

drop policy if exists "Allow default workspace document API access"
  on public.fashion_store_os_documents;

create policy "Allow default workspace document API access"
  on public.fashion_store_os_documents
  for all
  to anon, authenticated
  using (workspace_id = 'default' and document_key in ('state', 'auth'))
  with check (workspace_id = 'default' and document_key in ('state', 'auth'));
