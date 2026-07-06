-- Every file in the system, one table (plano v4.1 seção 3). Postgres stores
-- only the R2 key; bytes live in Cloudflare R2, read via short-lived signed
-- URLs. entity_id is NOT an FK on purpose: for transfers it holds the
-- lote_id (operational unit of baixa), and 'system' rows (logo da etiqueta)
-- have no entity at all.

create table files (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('return', 'transfer', 'system')),
  entity_id uuid,
  file_type text not null check (file_type in ('photo', 'attachment', 'receipt', 'document', 'signature', 'logo')),
  r2_key text not null,
  filename text,
  content_type text,
  size_bytes bigint,
  version int not null default 1,
  uploaded_by uuid references auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),

  constraint files_entity_id_required check (entity_id is not null or entity_type = 'system')
);

create index idx_files_entity on files (entity_type, entity_id);

alter table files enable row level security;

-- PLACEHOLDER RLS (Fase 4 will replace) — same pattern as 0005/0008/0009.
create policy "fase2_authenticated_full_access" on files
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant select, insert, update, delete on public.files to authenticated, service_role;
