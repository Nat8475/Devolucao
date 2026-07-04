-- Fix for a schema gap found while wiring Task 17 (E2E suite): with the newer
-- Supabase CLI default `auto_expose_new_tables = false` (see supabase/config.toml,
-- [api] section), tables created by earlier migrations are NOT reachable through
-- PostgREST for ANY role — including service_role — without an explicit GRANT.
-- Without this migration every API route in the app (Tasks 8-16) 500s locally
-- with "permission denied for table X" (Postgres error 42501), regardless of
-- RLS policies (0005_rls_placeholder.sql) or auth state. This was never caught
-- before because Tasks 13-16 shipped without a live Supabase instance to click
-- through against.
--
-- RLS already restricts real access to `authenticated` users (fase1_authenticated_full_access
-- policies); `anon` is intentionally left out here since the proxy (proxy.ts) redirects
-- unauthenticated requests before they reach any API route.

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on
  public.suppliers,
  public.return_reasons,
  public.returns,
  public.feature_flags
to authenticated, service_role;

grant execute on function fn_confirmar_rascunho(uuid) to authenticated, service_role;
grant execute on function fn_dar_baixa_venda(uuid[]) to authenticated, service_role;
grant execute on function fn_reabrir(uuid[], text) to authenticated, service_role;
grant execute on function fn_excluir(uuid, text) to authenticated, service_role;
grant execute on function fn_restaurar(uuid) to authenticated, service_role;
