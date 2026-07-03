-- PLACEHOLDER RLS for Fase 1 only: any authenticated user has full access.
-- Real per-role policies (owner/admin/custom roles, read-only mode) land in Fase 4 (seção 6 do plano).
-- Soft-deleted rows (returns.deleted_at) are NOT hidden by RLS in this phase — the app layer
-- filters deleted_at is null / is not null (Task 11/12). A real "hide deleted from non-admin"
-- policy is a Fase 4 concern once roles exist.

alter table suppliers enable row level security;
alter table return_reasons enable row level security;
alter table returns enable row level security;
alter table feature_flags enable row level security;

create policy "fase1_authenticated_full_access" on suppliers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "fase1_authenticated_full_access" on return_reasons
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "fase1_authenticated_full_access" on returns
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "fase1_authenticated_full_access" on feature_flags
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
