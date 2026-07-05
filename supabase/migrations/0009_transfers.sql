-- One row per return; lote_id groups the NFs programmed together (one frete).
-- Baixa/cancel/reagendamento/chegada are always lote-wide (plano v4.1 seção 4:
-- "a baixa de uma baixa todas as 'irmãs' do lote").

create table transfers (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references returns(id),
  lote_id uuid not null,
  destination_type text not null check (destination_type in ('filial', 'fornecedor')),
  branch_id uuid references branches(id),
  supplier_address_id uuid references supplier_addresses(id),
  carrier text,
  numero_pedido text,
  freight_type text check (freight_type in ('tabela', 'valor_icms', 'valor', 'cortesia')),
  freight_value numeric,
  scheduled_date date not null,
  status text not null default 'em_transferencia'
    check (status in ('em_transferencia', 'concluida', 'cancelada')),
  arrived_at_branch_at timestamptz,
  cancel_reason text,
  created_by uuid references auth.users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),

  -- exactly one destination, matching destination_type — never both, never none
  constraint transfers_destination_xor check (
    (destination_type = 'filial' and branch_id is not null and supplier_address_id is null)
    or
    (destination_type = 'fornecedor' and supplier_address_id is not null and branch_id is null)
  )
);

create index idx_transfers_lote on transfers (lote_id);
create index idx_transfers_return on transfers (return_id);
create index idx_transfers_status_scheduled on transfers (status, scheduled_date);

alter table transfers enable row level security;

-- PLACEHOLDER RLS (Fase 4 will replace) — same pattern as 0005/0008.
create policy "fase2_authenticated_full_access" on transfers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant select, insert, update, delete on public.transfers to authenticated, service_role;
