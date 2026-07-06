-- Fase 2 registries. Branch = physical destination of an internal transfer
-- (depósito próprio). supplier_addresses = endereços de devolução do fornecedor
-- (um fornecedor pode ter N CDs). They stay as two tables on purpose — see
-- plano v4.1 seção 4 ("por que filial e endereço de fornecedor não viraram
-- uma tabela só").

create table branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table supplier_addresses (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id),
  label text not null,
  city text,
  uf text,
  address text,
  -- text[] mirrors suppliers.contact_emails (Fase 1 convention). Empty array
  -- => Fase 3 e-mail resolution falls back to suppliers.contact_emails.
  contact_emails text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_supplier_addresses_supplier on supplier_addresses (supplier_id);

-- Who answers for a branch (encarregado + backup). Consumed by
-- responsibility assignment (this phase) and branch notifications (Fase 3).
create table branch_users (
  branch_id uuid not null references branches(id),
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (branch_id, user_id)
);

-- Physical responsibility: set by fn_confirmar_chegada (0010), cleared on
-- cancel/reopen. Distinct from returns.responsavel (who is handling it).
alter table returns add column responsible_branch_id uuid references branches(id);

-- PLACEHOLDER RLS for Fase 2: any authenticated user has full access.
-- Real per-role policies land in Fase 4 (seção 6 do plano).
alter table branches enable row level security;
alter table supplier_addresses enable row level security;
alter table branch_users enable row level security;

create policy "fase2_authenticated_full_access" on branches
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "fase2_authenticated_full_access" on supplier_addresses
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "fase2_authenticated_full_access" on branch_users
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- auto_expose_new_tables = false: explicit grants required (see 0006).
grant select, insert, update, delete on
  public.branches,
  public.supplier_addresses,
  public.branch_users
to authenticated, service_role;
