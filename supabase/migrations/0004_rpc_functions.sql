create or replace function fn_confirmar_rascunho(p_id uuid)
returns returns
security definer
language plpgsql as $$
declare
  v_return returns;
begin
  select * into v_return from returns where id = p_id and status = 'rascunho';
  if not found then
    raise exception 'devolução % não encontrada ou não está em rascunho', p_id;
  end if;

  if v_return.nf is null or btrim(v_return.nf) = '' then
    raise exception 'nf é obrigatório para confirmar o lançamento';
  end if;

  update returns set status = 'pendente' where id = p_id returning * into v_return;
  return v_return;
end;
$$;

create or replace function fn_dar_baixa_venda(p_ids uuid[])
returns setof uuid
security definer
language sql as $$
  update returns
    set status = 'venda'
    where id = any(p_ids) and status = 'pendente'
    returning id;
$$;

create or replace function fn_reabrir(p_ids uuid[], p_motivo text)
returns setof uuid
security definer
language sql as $$
  update returns
    set status = 'pendente', motivo_detalhe = p_motivo
    where id = any(p_ids) and status in ('devolvido', 'venda')
    returning id;
$$;

create or replace function fn_excluir(p_id uuid, p_motivo text)
returns void
security definer
language plpgsql as $$
begin
  update returns
    set deleted_at = now(), delete_reason = p_motivo, deleted_by = auth.uid()
    where id = p_id and status = 'pendente' and deleted_at is null;

  if not found then
    raise exception 'devolução % não encontrada ou não está pendente', p_id;
  end if;
end;
$$;

create or replace function fn_restaurar(p_id uuid)
returns returns
security definer
language plpgsql as $$
declare
  v_return returns;
begin
  update returns
    set deleted_at = null, delete_reason = null, deleted_by = null, status = 'pendente'
    where id = p_id and deleted_at is not null
    returning * into v_return;

  if not found then
    raise exception 'devolução % não encontrada na lixeira', p_id;
  end if;
  return v_return;
end;
$$;
