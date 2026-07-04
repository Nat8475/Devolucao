-- Fixes for Fase 1 whole-branch review findings before merge:
--
-- C1: Postgres grants EXECUTE to PUBLIC by default on newly created functions.
--     Combined with PostgREST's RPC endpoint, that meant `anon` could call all
--     5 SECURITY DEFINER RPCs directly with just the published anon key,
--     bypassing any expectation that only `authenticated` sessions act on
--     returns. 0006_grants.sql only ever *added* grants for authenticated/
--     service_role and never revoked the PUBLIC default.
--
-- I4: fn_dar_baixa_venda / fn_reabrir / fn_confirmar_rascunho matched rows by
--     status alone, so a soft-deleted (deleted_at is not null) row could still
--     be updated by these batch RPCs even though it's supposed to be inert in
--     the trash.
--
-- I5: only UPDATE was guarded by trg_returns_status_transition (0003). Nothing
--     stopped a row being INSERTed directly as 'em_transferencia'/'devolvido'/
--     'venda', skipping the state machine's entry point entirely.

-- C1: lock down function execution --------------------------------------

-- Stop future functions in this schema from defaulting to PUBLIC-executable.
alter default privileges in schema public revoke execute on functions from public;

-- Revoke the PUBLIC default (which implicitly included anon) from the 5
-- existing RPCs. authenticated/service_role keep their explicit grants from
-- 0006_grants.sql (CREATE OR REPLACE below does not reset existing grants).
revoke execute on function fn_confirmar_rascunho(uuid) from public, anon;
revoke execute on function fn_dar_baixa_venda(uuid[]) from public, anon;
revoke execute on function fn_reabrir(uuid[], text) from public, anon;
revoke execute on function fn_excluir(uuid, text) from public, anon;
revoke execute on function fn_restaurar(uuid) from public, anon;

-- I4: batch RPCs must ignore soft-deleted rows ----------------------------

create or replace function fn_confirmar_rascunho(p_id uuid)
returns returns
security definer
set search_path = public, pg_catalog
language plpgsql as $$
declare
  v_return returns;
begin
  select * into v_return from returns where id = p_id and status = 'rascunho' and deleted_at is null;
  if not found then
    raise exception 'devolução % não encontrada ou não está em rascunho', p_id;
  end if;

  if v_return.nf is null or btrim(v_return.nf) = '' then
    raise exception 'nf é obrigatório para confirmar o lançamento';
  end if;

  update returns set status = 'pendente'
    where id = p_id and status = 'rascunho' and deleted_at is null
    returning * into v_return;
  if not found then
    raise exception 'devolução % não encontrada ou não está em rascunho', p_id;
  end if;
  return v_return;
end;
$$;

create or replace function fn_dar_baixa_venda(p_ids uuid[])
returns setof uuid
security definer
set search_path = public, pg_catalog
language sql as $$
  update returns
    set status = 'venda'
    where id = any(p_ids) and status = 'pendente' and deleted_at is null
    returning id;
$$;

create or replace function fn_reabrir(p_ids uuid[], p_motivo text)
returns setof uuid
security definer
set search_path = public, pg_catalog
language sql as $$
  update returns
    set status = 'pendente', motivo_detalhe = p_motivo
    where id = any(p_ids) and status in ('devolvido', 'venda') and deleted_at is null
    returning id;
$$;

-- Re-apply the intended grants (belt-and-suspenders: CREATE OR REPLACE keeps
-- prior grants when the signature is unchanged, but this makes the intent
-- explicit and self-contained within this migration).
grant execute on function fn_confirmar_rascunho(uuid) to authenticated, service_role;
grant execute on function fn_dar_baixa_venda(uuid[]) to authenticated, service_role;
grant execute on function fn_reabrir(uuid[], text) to authenticated, service_role;
grant execute on function fn_excluir(uuid, text) to authenticated, service_role;
grant execute on function fn_restaurar(uuid) to authenticated, service_role;

-- I5: rows must not be born past the state machine's entry points --------

create or replace function fn_check_initial_status() returns trigger as $$
begin
  if new.status not in ('rascunho', 'pendente') then
    raise exception 'status inicial inválido: % (deve ser rascunho ou pendente)', new.status;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_returns_initial_status
  before insert on returns
  for each row execute function fn_check_initial_status();
