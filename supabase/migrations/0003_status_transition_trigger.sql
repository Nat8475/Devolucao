create or replace function fn_check_status_transition() returns trigger as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status = 'rascunho' and new.status = 'pendente' then
    return new;
  elsif old.status = 'pendente' and new.status in ('em_transferencia', 'venda') then
    return new;
  elsif old.status = 'em_transferencia' and new.status = 'devolvido' then
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

create trigger trg_returns_status_transition
  before update on returns
  for each row execute function fn_check_status_transition();
