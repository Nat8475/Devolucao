-- Fase 2: transfer lifecycle RPCs. All status flips use the CAS pattern
-- (WHERE status = expected) — mandatory project-wide (plano v4.1 seção 3).

-- 1) State machine: allow em_transferencia -> pendente (cancel path only;
--    the sanctioned caller is fn_cancelar_transferencia).
create or replace function fn_check_status_transition() returns trigger as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status = 'rascunho' and new.status = 'pendente' then
    return new;
  elsif old.status = 'pendente' and new.status in ('em_transferencia', 'venda') then
    return new;
  elsif old.status = 'em_transferencia' and new.status in ('devolvido', 'pendente') then
    -- devolvido: baixa; pendente: cancelamento de transferência (Fase 2)
    return new;
  elsif old.status in ('devolvido', 'venda') and new.status = 'pendente' then
    if new.motivo_detalhe is null or btrim(new.motivo_detalhe) = '' then
      raise exception 'reabertura exige motivo_detalhe preenchido';
    end if;
    return new;
  else
    raise exception 'transição de status inválida: % -> %', old.status, new.status;
  end if;
end;
$$ language plpgsql;

-- 2) Programar: cria um lote de transfers para as NFs elegíveis (pendente,
--    não deletadas). NFs que mudaram de status entram como "ignoradas" (CAS).
create or replace function fn_programar_transferencia(
  p_return_ids uuid[],
  p_destination_type text,
  p_branch_id uuid,
  p_supplier_address_id uuid,
  p_carrier text,
  p_numero_pedido text,
  p_freight_type text,
  p_freight_value numeric,
  p_scheduled_date date
)
returns table (lote_id uuid, affected_ids uuid[])
security definer
set search_path = public, pg_catalog
language plpgsql as $$
declare
  v_lote uuid := gen_random_uuid();
  v_affected uuid[];
begin
  if p_destination_type not in ('filial', 'fornecedor') then
    raise exception 'destination_type inválido: %', p_destination_type;
  end if;
  if p_destination_type = 'filial' and (p_branch_id is null or p_supplier_address_id is not null) then
    raise exception 'destino filial exige branch_id (e não supplier_address_id)';
  end if;
  if p_destination_type = 'fornecedor' and (p_supplier_address_id is null or p_branch_id is not null) then
    raise exception 'destino fornecedor exige supplier_address_id (e não branch_id)';
  end if;
  if p_scheduled_date is null then
    raise exception 'scheduled_date é obrigatório';
  end if;

  -- endereço de fornecedor precisa pertencer ao fornecedor de TODAS as NFs
  -- elegíveis (pendente + não deletadas). Linhas não elegíveis são ignoradas.
  -- (a UI já filtra o dropdown, mas o banco não confia na UI)
  if p_destination_type = 'fornecedor' then
    if exists (
      select 1 from returns r
      where r.id = any(p_return_ids)
        and r.status = 'pendente' and r.deleted_at is null
        and r.supplier_id <> (select sa.supplier_id from supplier_addresses sa where sa.id = p_supplier_address_id)
    ) then
      raise exception 'endereço de devolução não pertence ao fornecedor das NFs selecionadas';
    end if;
  end if;

  -- CAS: só pendentes e não deletadas mudam de status
  with moved as (
    update returns
      set status = 'em_transferencia'
      where id = any(p_return_ids) and status = 'pendente' and deleted_at is null
      returning id
  ), ins as (
    insert into transfers (return_id, lote_id, destination_type, branch_id, supplier_address_id,
                           carrier, numero_pedido, freight_type, freight_value, scheduled_date, created_by)
    select m.id, v_lote, p_destination_type, p_branch_id, p_supplier_address_id,
           p_carrier, p_numero_pedido, p_freight_type, p_freight_value, p_scheduled_date, auth.uid()
    from moved m
    returning return_id
  )
  select array_agg(return_id) into v_affected from ins;

  if v_affected is null then
    raise exception 'nenhuma devolução elegível (pendente) entre as selecionadas';
  end if;

  return query select v_lote, v_affected;
end;
$$;

-- 3) Baixa: conclui o lote inteiro; NFs irmãs viram devolvido + resolved_at.
create or replace function fn_baixar_transferencia(p_lote_id uuid)
returns setof uuid
security definer
set search_path = public, pg_catalog
language plpgsql as $$
declare
  v_return_ids uuid[];
begin
  with done as (
    update transfers
      set status = 'concluida', completed_at = now()
      where lote_id = p_lote_id and status = 'em_transferencia'
      returning return_id
  )
  select array_agg(return_id) into v_return_ids from done;

  if v_return_ids is null then
    raise exception 'lote % não encontrado ou já concluído/cancelado', p_lote_id;
  end if;

  return query
    update returns
      set status = 'devolvido', resolved_at = now()
      where id = any(v_return_ids) and status = 'em_transferencia' and deleted_at is null
      returning id;
end;
$$;

-- 4) Cancelamento: motivo obrigatório; NFs voltam a pendente e perdem
--    responsabilidade de filial.
create or replace function fn_cancelar_transferencia(p_lote_id uuid, p_motivo text)
returns setof uuid
security definer
set search_path = public, pg_catalog
language plpgsql as $$
declare
  v_return_ids uuid[];
begin
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'cancelamento exige motivo';
  end if;

  with cancelled as (
    update transfers
      set status = 'cancelada', cancel_reason = p_motivo
      where lote_id = p_lote_id and status = 'em_transferencia'
      returning return_id
  )
  select array_agg(return_id) into v_return_ids from cancelled;

  if v_return_ids is null then
    raise exception 'lote % não encontrado ou já concluído/cancelado', p_lote_id;
  end if;

  return query
    update returns
      set status = 'pendente', responsible_branch_id = null
      where id = any(v_return_ids) and status = 'em_transferencia' and deleted_at is null
      returning id;
end;
$$;

-- 5) Chegada na filial (checkpoint opcional — feature flag). Transfere a
--    responsabilidade física pra filial (plano v4.1 seção 4).
create or replace function fn_confirmar_chegada(p_lote_id uuid)
returns setof uuid
security definer
set search_path = public, pg_catalog
language plpgsql as $$
declare
  v_pairs record;
  v_return_ids uuid[] := '{}';
begin
  if not exists (select 1 from feature_flags where key = 'confirmacao_chegada_filial' and enabled) then
    raise exception 'confirmação de chegada está desativada (feature flag confirmacao_chegada_filial)';
  end if;

  for v_pairs in
    update transfers
      set arrived_at_branch_at = now()
      where lote_id = p_lote_id and status = 'em_transferencia'
        and destination_type = 'filial' and arrived_at_branch_at is null
      returning return_id, branch_id
  loop
    update returns set responsible_branch_id = v_pairs.branch_id
      where id = v_pairs.return_id and deleted_at is null;
    v_return_ids := v_return_ids || v_pairs.return_id;
  end loop;

  if coalesce(array_length(v_return_ids, 1), 0) = 0 then
    raise exception 'lote % sem transferências elegíveis para chegada (destino filial, em trânsito, sem chegada prévia)', p_lote_id;
  end if;

  return query select unnest(v_return_ids);
end;
$$;

-- 6) Reagendamento (lote-wide, só em trânsito).
create or replace function fn_reagendar_transferencia(p_lote_id uuid, p_scheduled_date date)
returns setof uuid
security definer
set search_path = public, pg_catalog
language plpgsql as $$
declare
  v_ids uuid[];
begin
  if p_scheduled_date is null then
    raise exception 'scheduled_date é obrigatório';
  end if;

  with rescheduled as (
    update transfers
      set scheduled_date = p_scheduled_date
      where lote_id = p_lote_id and status = 'em_transferencia'
      returning id
  )
  select array_agg(id) into v_ids from rescheduled;

  if v_ids is null then
    raise exception 'lote % não encontrado ou já concluído/cancelado', p_lote_id;
  end if;

  return query select unnest(v_ids);
end;
$$;

-- 7) Reabertura agora também limpa a responsabilidade de filial
--    (plano v4.1 seção 4: "volta a null se ... o item for reaberto").
create or replace function fn_reabrir(p_ids uuid[], p_motivo text)
returns setof uuid
security definer
set search_path = public, pg_catalog
language sql as $$
  update returns
    set status = 'pendente', motivo_detalhe = p_motivo, responsible_branch_id = null
    where id = any(p_ids) and status in ('devolvido', 'venda') and deleted_at is null
    returning id;
$$;

-- Grants: 0007 already revoked PUBLIC defaults for future functions, but be
-- explicit — authenticated/service_role only, never anon.
revoke execute on function fn_programar_transferencia(uuid[], text, uuid, uuid, text, text, text, numeric, date) from public, anon;
revoke execute on function fn_baixar_transferencia(uuid) from public, anon;
revoke execute on function fn_cancelar_transferencia(uuid, text) from public, anon;
revoke execute on function fn_confirmar_chegada(uuid) from public, anon;
revoke execute on function fn_reagendar_transferencia(uuid, date) from public, anon;

grant execute on function fn_programar_transferencia(uuid[], text, uuid, uuid, text, text, text, numeric, date) to authenticated, service_role;
grant execute on function fn_baixar_transferencia(uuid) to authenticated, service_role;
grant execute on function fn_cancelar_transferencia(uuid, text) to authenticated, service_role;
grant execute on function fn_confirmar_chegada(uuid) to authenticated, service_role;
grant execute on function fn_reagendar_transferencia(uuid, date) to authenticated, service_role;
grant execute on function fn_reabrir(uuid[], text) to authenticated, service_role;
