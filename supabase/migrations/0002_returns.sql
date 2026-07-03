create table returns (
  id uuid primary key default gen_random_uuid(),
  nf text,
  nfd text,
  supplier_id uuid not null references suppliers(id),
  type text not null check (type in ('avaria','falta','rejeicao')),
  reason_id uuid references return_reasons(id),
  motivo_detalhe text,
  descricao text,
  qtd numeric not null,
  valor_unitario numeric not null,
  valor_total numeric generated always as (qtd * valor_unitario) stored,
  status text not null default 'rascunho'
    check (status in ('rascunho','pendente','em_transferencia','devolvido','venda')),
  data_entrada date not null default current_date,
  responsavel uuid references auth.users(id),
  priority text,
  origin_row_ref text,
  resolved_at timestamptz,
  deleted_at timestamptz,
  delete_reason text,
  deleted_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- non-unique: duplicate detection is app-level (warn + allow confirm), never a hard block
create index idx_returns_nf_supplier on returns (nf, supplier_id);

create or replace function fn_touch_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger trg_returns_touch_updated_at
  before update on returns
  for each row execute function fn_touch_updated_at();
