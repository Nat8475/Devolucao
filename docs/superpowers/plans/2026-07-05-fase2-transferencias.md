# Fase 2 — Transferências Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full transfer lifecycle — program (individual/lote), arrival checkpoint, baixa (with optional digital signature), cancel, reschedule, overdue highlight — plus `branches`/`supplier_addresses`/`branch_users` registries, the `files` table with Cloudflare R2 upload, the 100×100mm box label, and the route-suggestion screen (toggle).

**Architecture:** Same shape as Fase 1: state changes live in the database as `SECURITY DEFINER` RPCs using the CAS pattern (`UPDATE ... WHERE status = :expected`), invoked from Next.js Route Handlers validated with zod. `transfers` rows are one-per-return, grouped by `lote_id` (uuid); every lote action (baixa, cancel, reschedule, arrival) is lote-wide. Files (comprovante, assinatura, logo) go to R2 via a server-side upload route (`aws4fetch`), with only the `r2_key` in Postgres and short-lived signed GET URLs.

**Tech Stack:** Existing stack (Next 16 / React 19 / Tailwind v4 / shadcn Radix, Supabase local CLI, pgTAP, Vitest, Playwright) + `aws4fetch` (tiny S3 SigV4 client for R2 — no AWS SDK).

## Global Constraints

- **UI/UX (mandatory):** every task that creates or modifies user-facing UI (Tasks 9–14) MUST invoke the `ui-ux-pro-max` skill via the Skill tool BEFORE writing UI code, read `docs/design-system.md` ("Quiet Authority": navy/terracotta, Lexend + Source Sans 3) and stay consistent with it. Skipping the invocation is a spec violation.
- `returns.status` transitions are enforced in the DB (trigger). Fase 2 adds exactly one new legal shape: `em_transferencia -> pendente` (transfer cancel). The sanctioned path for **all** transfer flows is the RPCs of Task 3 — API routes never `UPDATE returns.status` directly.
- Batch/status changes always use CAS: `UPDATE ... WHERE <ids> AND status = :expected`; 0 rows affected = "ignorado", never an error for batch items, but a hard error when the whole lote missed (nothing to act on).
- `supabase/config.toml` has `auto_expose_new_tables = false`: **every new table needs explicit `GRANT` to `authenticated, service_role`** (Fase 1 learned this the hard way — 0006_grants.sql). Every new function gets `GRANT EXECUTE ... TO authenticated, service_role` and NO grant to public/anon (0007 already flipped default privileges, but grants must be explicit).
- RLS in this phase remains the Fase 1 placeholder ("authenticated full access") on every new table, with the same comment pointing at Fase 4.
- `createClient()` from `@/lib/supabase/server` is **async** — always `await`. API routes rely on proxy.ts for auth gating (unauthenticated `/api/*` gets a redirect, not 401 JSON); client-side fetches must check `r.ok`.
- R2 at runtime is **optional**: when `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET` are unset, `/api/files` returns 503 `{ error: 'R2 não configurado' }` and the UI shows a quiet notice instead of the upload control. E2E does not depend on R2.
- No pg_cron on free tier: "alerta de transferência vencida" in this phase is **visual only** (computed `scheduled_date < today && status = 'em_transferencia'`, badge + filter). E-mail/job wiring is Fase 3 (`alert_rules`).
- Destination XOR is a DB constraint: exactly one of `branch_id` / `supplier_address_id`, matching `destination_type`.
- `supplier_addresses.contact_emails` is `text[]` (mirrors `suppliers.contact_emails` from Fase 1 — the plan doc's "tabela relacionada" is deliberately simplified to the established convention; Fase 3 consumes it the same way).
- Receipt (CTe) and signature files attach to the **lote**: `files.entity_type = 'transfer'`, `entity_id = lote_id` (entity_id is not an FK; the lote is the operational unit of baixa).
- Feature flags gate behavior server-side where it matters: `fn_confirmar_chegada` refuses when `confirmacao_chegada_filial` is off; UI additionally hides gated controls.
- Forms are hand-rolled with plain state (no shadcn `form` component — empty upstream registry, Fase 1 constraint).
- Money/qty rendering follows existing list pages (pt-BR locale helpers already in use — reuse, don't re-implement).

---

### Task 1: Migration 0008 — branches, supplier_addresses, branch_users, returns.responsible_branch_id

**Files:**
- Create: `supabase/migrations/0008_branches_and_addresses.sql`
- Create: `supabase/tests/0008_branches_and_addresses.test.sql`

**Interfaces:**
- Produces: tables `branches(id, name, address, active, created_at)`, `supplier_addresses(id, supplier_id, label, city, uf, address, contact_emails, active, created_at)`, `branch_users(branch_id, user_id)`, column `returns.responsible_branch_id uuid null`.

- [ ] **Step 1: Write the failing pgTAP test**

`supabase/tests/0008_branches_and_addresses.test.sql`:

```sql
begin;
select plan(12);

select has_table('branches');
select has_table('supplier_addresses');
select has_table('branch_users');
select has_column('returns', 'responsible_branch_id');

select col_not_null('branches', 'name');
select col_default_is('branches', 'active', 'true');

select col_not_null('supplier_addresses', 'supplier_id');
select col_not_null('supplier_addresses', 'label');
select col_default_is('supplier_addresses', 'contact_emails', $$'{}'::text[]$$);

-- supplier_addresses.supplier_id must reference suppliers
select fk_ok('supplier_addresses', 'supplier_id', 'suppliers', 'id');

-- branch_users composite PK (no duplicate link)
select col_is_pk('branch_users', array['branch_id', 'user_id']);

-- RLS enabled on the three new tables
select ok(
  (select count(*) = 3 from pg_class c
    where c.relname in ('branches','supplier_addresses','branch_users') and c.relrowsecurity),
  'RLS enabled on branches, supplier_addresses, branch_users'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `supabase test db`
Expected: FAIL (`branches` does not exist).

- [ ] **Step 3: Write the migration**

`supabase/migrations/0008_branches_and_addresses.sql`:

```sql
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
```

- [ ] **Step 4: Reset DB and run tests**

Run: `supabase db reset && supabase test db`
Expected: all pgTAP suites PASS (existing + 12 new).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_branches_and_addresses.sql supabase/tests/0008_branches_and_addresses.test.sql
git commit -m "feat(db): branches, supplier_addresses, branch_users + returns.responsible_branch_id"
```

---

### Task 2: Migration 0009 — transfers table

**Files:**
- Create: `supabase/migrations/0009_transfers.sql`
- Create: `supabase/tests/0009_transfers.test.sql`

**Interfaces:**
- Produces: table `transfers` (one row per return, grouped by `lote_id`), statuses `em_transferencia | concluida | cancelada`, XOR destination constraint. Consumed by RPCs (Task 3), API (Task 8), UI (Tasks 11–12).

- [ ] **Step 1: Write the failing pgTAP test**

`supabase/tests/0009_transfers.test.sql`:

```sql
begin;
select plan(10);

select has_table('transfers');
select col_not_null('transfers', 'return_id');
select col_not_null('transfers', 'lote_id');
select col_not_null('transfers', 'destination_type');
select col_not_null('transfers', 'scheduled_date');
select fk_ok('transfers', 'return_id', 'returns', 'id');

-- seed minimal graph
insert into suppliers (id, name) values ('00000000-0000-0000-0000-00000000a001', 'F XOR');
insert into branches (id, name) values ('00000000-0000-0000-0000-00000000b001', 'Filial XOR');
insert into supplier_addresses (id, supplier_id, label)
  values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000a001', 'CD XOR');
insert into returns (id, supplier_id, type, qtd, valor_unitario, status)
  values ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000a001', 'avaria', 1, 10, 'pendente');

-- XOR: filial com branch_id ok
select lives_ok($$
  insert into transfers (return_id, lote_id, destination_type, branch_id, scheduled_date)
  values ('00000000-0000-0000-0000-00000000d001', gen_random_uuid(), 'filial',
          '00000000-0000-0000-0000-00000000b001', current_date)
$$, 'filial + branch_id inserts');

-- XOR: filial com supplier_address_id junto -> rejeita
select throws_ok($$
  insert into transfers (return_id, lote_id, destination_type, branch_id, supplier_address_id, scheduled_date)
  values ('00000000-0000-0000-0000-00000000d001', gen_random_uuid(), 'filial',
          '00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000c001', current_date)
$$, '23514', null, 'filial with both destinations rejected');

-- XOR: fornecedor sem supplier_address_id -> rejeita
select throws_ok($$
  insert into transfers (return_id, lote_id, destination_type, scheduled_date)
  values ('00000000-0000-0000-0000-00000000d001', gen_random_uuid(), 'fornecedor', current_date)
$$, '23514', null, 'fornecedor without address rejected');

-- freight_type restrito
select throws_ok($$
  insert into transfers (return_id, lote_id, destination_type, branch_id, scheduled_date, freight_type)
  values ('00000000-0000-0000-0000-00000000d001', gen_random_uuid(), 'filial',
          '00000000-0000-0000-0000-00000000b001', current_date, 'gratis')
$$, '23514', null, 'invalid freight_type rejected');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `supabase test db`
Expected: FAIL (`transfers` does not exist).

- [ ] **Step 3: Write the migration**

`supabase/migrations/0009_transfers.sql`:

```sql
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
```

- [ ] **Step 4: Reset DB and run tests**

Run: `supabase db reset && supabase test db`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0009_transfers.sql supabase/tests/0009_transfers.test.sql
git commit -m "feat(db): transfers table with lote grouping and destination XOR"
```

---
### Task 3: Migration 0010 — state-machine extension + transfer RPCs

**Files:**
- Create: `supabase/migrations/0010_transfer_rpcs.sql`
- Create: `supabase/tests/0010_transfer_rpcs.test.sql`

**Interfaces:**
- Consumes: `transfers` (Task 2), `branches`/`supplier_addresses`/`branch_users`/`returns.responsible_branch_id` (Task 1), `feature_flags` (Fase 1).
- Produces (exact signatures — API routes in Task 8 call these via `supabase.rpc`):
  - `fn_programar_transferencia(p_return_ids uuid[], p_destination_type text, p_branch_id uuid, p_supplier_address_id uuid, p_carrier text, p_numero_pedido text, p_freight_type text, p_freight_value numeric, p_scheduled_date date) returns table (lote_id uuid, affected_ids uuid[])`
  - `fn_baixar_transferencia(p_lote_id uuid) returns setof uuid` (return_ids baixados)
  - `fn_cancelar_transferencia(p_lote_id uuid, p_motivo text) returns setof uuid`
  - `fn_confirmar_chegada(p_lote_id uuid) returns setof uuid`
  - `fn_reagendar_transferencia(p_lote_id uuid, p_scheduled_date date) returns setof uuid` (transfer ids reagendados)
  - `fn_reabrir` recreated to also clear `responsible_branch_id`.
  - Trigger `fn_check_status_transition` now also allows `em_transferencia -> pendente`.

- [ ] **Step 1: Write the failing pgTAP test**

`supabase/tests/0010_transfer_rpcs.test.sql`:

```sql
begin;
select plan(16);

-- seed
insert into suppliers (id, name) values ('00000000-0000-0000-0000-0000000a0001', 'F RPC');
insert into suppliers (id, name) values ('00000000-0000-0000-0000-0000000a0002', 'F Outro');
insert into branches (id, name) values ('00000000-0000-0000-0000-0000000b0001', 'Filial RPC');
insert into supplier_addresses (id, supplier_id, label, city, uf)
  values ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000a0001', 'CD SP', 'São Paulo', 'SP');
insert into returns (id, nf, supplier_id, type, qtd, valor_unitario, status) values
  ('00000000-0000-0000-0000-0000000d0001', '101', '00000000-0000-0000-0000-0000000a0001', 'avaria', 1, 10, 'pendente'),
  ('00000000-0000-0000-0000-0000000d0002', '102', '00000000-0000-0000-0000-0000000a0001', 'avaria', 1, 10, 'pendente'),
  ('00000000-0000-0000-0000-0000000d0003', '103', '00000000-0000-0000-0000-0000000a0001', 'avaria', 1, 10, 'venda'),
  ('00000000-0000-0000-0000-0000000d0004', '104', '00000000-0000-0000-0000-0000000a0002', 'avaria', 1, 10, 'pendente');

-- 1) programar: 2 pendentes + 1 venda -> afeta só os 2, cria 2 transfers no mesmo lote
select ok(
  (select array_length(affected_ids, 1) = 2
     from fn_programar_transferencia(
       array['00000000-0000-0000-0000-0000000d0001',
             '00000000-0000-0000-0000-0000000d0002',
             '00000000-0000-0000-0000-0000000d0003']::uuid[],
       'filial', '00000000-0000-0000-0000-0000000b0001', null,
       'Transp X', 'PED-1', 'tabela', null, current_date + 1)),
  'programar affects only pendentes');

select is(
  (select count(*)::int from transfers where status = 'em_transferencia'), 2,
  'two transfer rows created');

select is(
  (select count(distinct lote_id)::int from transfers), 1,
  'both rows share one lote');

select is(
  (select status from returns where id = '00000000-0000-0000-0000-0000000d0001'),
  'em_transferencia', 'return 1 moved to em_transferencia');

select is(
  (select status from returns where id = '00000000-0000-0000-0000-0000000d0003'),
  'venda', 'venda row untouched');

-- 2) programar destino fornecedor exige endereço do MESMO fornecedor das NFs
select throws_ok($$
  select * from fn_programar_transferencia(
    array['00000000-0000-0000-0000-0000000d0004']::uuid[],
    'fornecedor', null, '00000000-0000-0000-0000-0000000c0001',
    null, null, null, null, current_date)
$$, null, null, 'address of another supplier rejected');

-- 3) chegada: flag off -> recusa
select throws_ok($$
  select * from fn_confirmar_chegada((select lote_id from transfers limit 1))
$$, null, null, 'chegada refused with flag off');

-- flag on -> preenche arrived_at_branch_at e responsible_branch_id
update feature_flags set enabled = true where key = 'confirmacao_chegada_filial';

select ok(
  (select count(*) from fn_confirmar_chegada((select lote_id from transfers limit 1))) = 2,
  'chegada confirms both transfers of the lote');

select is(
  (select responsible_branch_id from returns where id = '00000000-0000-0000-0000-0000000d0001'),
  '00000000-0000-0000-0000-0000000b0001'::uuid,
  'responsibility assigned to branch');

select ok(
  (select count(*) = 2 from transfers where arrived_at_branch_at is not null),
  'arrived_at_branch_at stamped');

-- 4) reagendar
select ok(
  (select count(*) from fn_reagendar_transferencia((select lote_id from transfers limit 1), current_date + 7)) = 2,
  'reagendar updates both rows');

-- 5) baixa: lote inteiro -> transfers concluida, returns devolvido + resolved_at
select ok(
  (select count(*) from fn_baixar_transferencia((select lote_id from transfers limit 1))) = 2,
  'baixa hits both returns');

select is(
  (select status from returns where id = '00000000-0000-0000-0000-0000000d0002'),
  'devolvido', 'return devolvido after baixa');

select ok(
  (select resolved_at is not null from returns where id = '00000000-0000-0000-0000-0000000d0002'),
  'resolved_at stamped by baixa');

-- baixa de lote já concluído -> erro (nada elegível)
select throws_ok($$
  select * from fn_baixar_transferencia((select lote_id from transfers limit 1))
$$, null, null, 'baixa on finished lote errors');

-- 6) cancelar: programa nova transferência e cancela -> volta pendente, sem responsável
select lives_ok($$
  with r as (
    update returns set status = 'pendente', motivo_detalhe = 'reaberto p/ teste'
      where id = '00000000-0000-0000-0000-0000000d0001' returning id
  )
  select * from fn_programar_transferencia(
    (select array_agg(id) from r), 'filial', '00000000-0000-0000-0000-0000000b0001',
    null, null, null, null, null, current_date)
$$, 'reprogram after reopen');

select * from finish();
rollback;
```

Note for the implementer: the last `lives_ok` uses a CTE trick; if the reopened-row reprogram proves awkward inside one statement, split it into a plain `update` + separate `select fn_programar_transferencia(...)` and adjust `plan()` accordingly. What matters is coverage of: partial-affect programar, same-supplier address guard, flag-gated chegada, responsibility assignment, reagendar, lote-wide baixa with `resolved_at`, double-baixa error.

Also add a cancel assertion block (fits within the same file; bump `plan()`):

```sql
-- cancelar exige motivo
select throws_ok($$ select * from fn_cancelar_transferencia(gen_random_uuid(), '  ') $$,
  null, null, 'cancel without motivo rejected');
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `supabase test db`
Expected: FAIL (`fn_programar_transferencia` does not exist).

- [ ] **Step 3: Write the migration**

`supabase/migrations/0010_transfer_rpcs.sql`:

```sql
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
  -- selecionadas (a UI já filtra o dropdown, mas o banco não confia na UI)
  if p_destination_type = 'fornecedor' then
    if exists (
      select 1 from returns r
      where r.id = any(p_return_ids)
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
begin
  if p_scheduled_date is null then
    raise exception 'scheduled_date é obrigatório';
  end if;
  return query
    update transfers
      set scheduled_date = p_scheduled_date
      where lote_id = p_lote_id and status = 'em_transferencia'
      returning id;
  if not found then
    raise exception 'lote % não encontrado ou já concluído/cancelado', p_lote_id;
  end if;
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
```

- [ ] **Step 4: Reset DB and run tests**

Run: `supabase db reset && supabase test db`
Expected: PASS (all suites — including Fase 1 state-machine tests, which must still pass with the extended trigger).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0010_transfer_rpcs.sql supabase/tests/0010_transfer_rpcs.test.sql
git commit -m "feat(db): transfer lifecycle RPCs + em_transferencia->pendente cancel path"
```

---

### Task 4: Migration 0011 — files table

**Files:**
- Create: `supabase/migrations/0011_files.sql`
- Create: `supabase/tests/0011_files.test.sql`

**Interfaces:**
- Produces: table `files(id, entity_type, entity_id, file_type, r2_key, filename, content_type, size_bytes, version, uploaded_by, deleted_at, created_at)`. Consumed by `/api/files` (Task 6), baixa modal + etiqueta logo (Tasks 12–13).

- [ ] **Step 1: Write the failing pgTAP test**

`supabase/tests/0011_files.test.sql`:

```sql
begin;
select plan(6);

select has_table('files');
select col_not_null('files', 'entity_type');
select col_not_null('files', 'file_type');
select col_not_null('files', 'r2_key');

-- entity_id nullable ONLY for entity_type = 'system' (logo)
select lives_ok($$
  insert into files (entity_type, entity_id, file_type, r2_key)
  values ('system', null, 'logo', 'system/logo/x.png')
$$, 'system file without entity_id ok');

select throws_ok($$
  insert into files (entity_type, entity_id, file_type, r2_key)
  values ('transfer', null, 'receipt', 'transfer/x/y.pdf')
$$, '23514', null, 'non-system file requires entity_id');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `supabase test db`
Expected: FAIL (`files` does not exist).

- [ ] **Step 3: Write the migration**

`supabase/migrations/0011_files.sql`:

```sql
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
```

- [ ] **Step 4: Reset DB and run tests**

Run: `supabase db reset && supabase test db`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0011_files.sql supabase/tests/0011_files.test.sql
git commit -m "feat(db): unified files table (R2 keys only)"
```

---
### Task 5: Types + zod schemas + unit tests

**Files:**
- Modify: `lib/types.ts` (append)
- Modify: `lib/validation.ts` (append)
- Create: `tests/unit/fase2-validation.test.ts`

**Interfaces:**
- Produces (consumed by every API/UI task below):
  - Types: `Branch`, `SupplierAddress`, `BranchUser`, `TransferStatus`, `DestinationType`, `FreightType`, `TransferRecord`, `TransferWithJoins`, `FileRecord`, `FeatureFlag`
  - Schemas: `branchSchema`, `branchPatchSchema`, `supplierAddressSchema`, `supplierAddressPatchSchema`, `branchUserSchema`, `transferCreateSchema`, `cancelarTransferenciaSchema`, `reagendarSchema`, `featureFlagPatchSchema`
  - `ReturnRecord` gains `responsible_branch_id: string | null`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/fase2-validation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  branchSchema,
  supplierAddressSchema,
  transferCreateSchema,
  cancelarTransferenciaSchema,
  reagendarSchema,
} from '@/lib/validation';

const uuid = '11111111-1111-1111-1111-111111111111';
const uuid2 = '22222222-2222-2222-2222-222222222222';

describe('branchSchema', () => {
  it('requires name', () => {
    expect(branchSchema.safeParse({}).success).toBe(false);
    expect(branchSchema.safeParse({ name: 'Filial A' }).success).toBe(true);
  });
});

describe('supplierAddressSchema', () => {
  it('requires supplier_id and label; validates emails', () => {
    expect(supplierAddressSchema.safeParse({ supplier_id: uuid, label: 'CD SP' }).success).toBe(true);
    expect(
      supplierAddressSchema.safeParse({ supplier_id: uuid, label: 'CD', contact_emails: ['nope'] }).success
    ).toBe(false);
  });
});

describe('transferCreateSchema', () => {
  const base = {
    return_ids: [uuid],
    scheduled_date: '2026-07-10',
  };

  it('filial requires branch_id and rejects supplier_address_id', () => {
    expect(
      transferCreateSchema.safeParse({ ...base, destination_type: 'filial', branch_id: uuid2 }).success
    ).toBe(true);
    expect(
      transferCreateSchema.safeParse({ ...base, destination_type: 'filial' }).success
    ).toBe(false);
    expect(
      transferCreateSchema.safeParse({
        ...base, destination_type: 'filial', branch_id: uuid2, supplier_address_id: uuid2,
      }).success
    ).toBe(false);
  });

  it('fornecedor requires supplier_address_id', () => {
    expect(
      transferCreateSchema.safeParse({ ...base, destination_type: 'fornecedor', supplier_address_id: uuid2 }).success
    ).toBe(true);
    expect(
      transferCreateSchema.safeParse({ ...base, destination_type: 'fornecedor' }).success
    ).toBe(false);
  });

  it('rejects empty return_ids and bad freight_type', () => {
    expect(
      transferCreateSchema.safeParse({
        return_ids: [], destination_type: 'filial', branch_id: uuid2, scheduled_date: '2026-07-10',
      }).success
    ).toBe(false);
    expect(
      transferCreateSchema.safeParse({
        ...base, destination_type: 'filial', branch_id: uuid2, freight_type: 'gratis',
      }).success
    ).toBe(false);
  });
});

describe('cancelarTransferenciaSchema', () => {
  it('requires non-blank motivo', () => {
    expect(cancelarTransferenciaSchema.safeParse({ motivo: '  ' }).success).toBe(false);
    expect(cancelarTransferenciaSchema.safeParse({ motivo: 'sem frete' }).success).toBe(true);
  });
});

describe('reagendarSchema', () => {
  it('requires YYYY-MM-DD date', () => {
    expect(reagendarSchema.safeParse({ scheduled_date: '10/07/2026' }).success).toBe(false);
    expect(reagendarSchema.safeParse({ scheduled_date: '2026-07-10' }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/fase2-validation.test.ts`
Expected: FAIL (schemas not exported).

- [ ] **Step 3: Append types to `lib/types.ts`**

```ts
export type TransferStatus = 'em_transferencia' | 'concluida' | 'cancelada';
export type DestinationType = 'filial' | 'fornecedor';
export type FreightType = 'tabela' | 'valor_icms' | 'valor' | 'cortesia';

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  active: boolean;
  created_at: string;
}

export interface SupplierAddress {
  id: string;
  supplier_id: string;
  label: string;
  city: string | null;
  uf: string | null;
  address: string | null;
  contact_emails: string[];
  active: boolean;
  created_at: string;
}

export interface BranchUser {
  branch_id: string;
  user_id: string;
  created_at: string;
}

export interface TransferRecord {
  id: string;
  return_id: string;
  lote_id: string;
  destination_type: DestinationType;
  branch_id: string | null;
  supplier_address_id: string | null;
  carrier: string | null;
  numero_pedido: string | null;
  freight_type: FreightType | null;
  freight_value: number | null;
  scheduled_date: string;
  status: TransferStatus;
  arrived_at_branch_at: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface TransferWithJoins extends TransferRecord {
  returns: Pick<ReturnRecord, 'id' | 'nf' | 'nfd' | 'supplier_id' | 'valor_total' | 'status'> & {
    suppliers?: Pick<Supplier, 'id' | 'name'> | null;
  };
  branches: Pick<Branch, 'id' | 'name'> | null;
  supplier_addresses: Pick<SupplierAddress, 'id' | 'label' | 'city' | 'uf' | 'supplier_id'> | null;
}

export interface FileRecord {
  id: string;
  entity_type: 'return' | 'transfer' | 'system';
  entity_id: string | null;
  file_type: 'photo' | 'attachment' | 'receipt' | 'document' | 'signature' | 'logo';
  r2_key: string;
  filename: string | null;
  content_type: string | null;
  size_bytes: number | null;
  version: number;
  uploaded_by: string | null;
  deleted_at: string | null;
  created_at: string;
  /** presente só nas respostas da API (URL assinada, expira) */
  url?: string;
}

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string | null;
}
```

Also add to the existing `ReturnRecord` interface:

```ts
  responsible_branch_id: string | null;
```

- [ ] **Step 4: Append schemas to `lib/validation.ts`**

```ts
const dateYmd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data deve ser YYYY-MM-DD');

export const branchSchema = z.object({
  name: z.string().trim().min(1, 'name é obrigatório'),
  address: z.string().nullable().optional(),
  active: z.boolean().optional().default(true),
});

export const branchPatchSchema = branchSchema.partial();

export const supplierAddressSchema = z.object({
  supplier_id: z.string().uuid(),
  label: z.string().trim().min(1, 'label é obrigatório'),
  city: z.string().nullable().optional(),
  uf: z.string().max(2).nullable().optional(),
  address: z.string().nullable().optional(),
  contact_emails: z.array(z.string().email()).optional().default([]),
  active: z.boolean().optional().default(true),
});

export const supplierAddressPatchSchema = supplierAddressSchema.partial().omit({ supplier_id: true });

export const branchUserSchema = z.object({
  branch_id: z.string().uuid(),
  user_id: z.string().uuid(),
});

export const transferCreateSchema = z
  .object({
    return_ids: z.array(z.string().uuid()).min(1, 'selecione ao menos uma devolução'),
    destination_type: z.enum(['filial', 'fornecedor']),
    branch_id: z.string().uuid().nullable().optional(),
    supplier_address_id: z.string().uuid().nullable().optional(),
    carrier: z.string().nullable().optional(),
    numero_pedido: z.string().nullable().optional(),
    freight_type: z.enum(['tabela', 'valor_icms', 'valor', 'cortesia']).nullable().optional(),
    freight_value: z.number().nonnegative().nullable().optional(),
    scheduled_date: dateYmd,
  })
  .superRefine((data, ctx) => {
    if (data.destination_type === 'filial' && (!data.branch_id || data.supplier_address_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'destino filial exige branch_id (e não supplier_address_id)',
        path: ['branch_id'],
      });
    }
    if (data.destination_type === 'fornecedor' && (!data.supplier_address_id || data.branch_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'destino fornecedor exige supplier_address_id (e não branch_id)',
        path: ['supplier_address_id'],
      });
    }
  });

export const cancelarTransferenciaSchema = z.object({
  motivo: z.string().trim().min(1, 'motivo é obrigatório'),
});

export const reagendarSchema = z.object({
  scheduled_date: dateYmd,
});

export const featureFlagPatchSchema = z.object({
  enabled: z.boolean(),
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run`
Expected: PASS (all unit suites, old + new).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/validation.ts tests/unit/fase2-validation.test.ts
git commit -m "feat(lib): fase 2 types and zod schemas (transfers, branches, addresses, files)"
```

---

### Task 6: R2 client + /api/files (upload, list with signed URLs)

**Files:**
- Create: `lib/r2.ts`
- Create: `app/api/files/route.ts`
- Create: `tests/unit/r2.test.ts`
- Modify: `.env.local.example` (append R2 vars)
- Modify: `package.json` (add `aws4fetch`)

**Interfaces:**
- Consumes: `files` table (Task 4), `FileRecord` (Task 5).
- Produces:
  - `lib/r2.ts`: `isR2Configured(): boolean`, `r2Put(key: string, body: ArrayBuffer | Uint8Array, contentType: string): Promise<void>`, `r2SignedGetUrl(key: string, expiresSeconds?: number): Promise<string>` (default 300s)
  - `POST /api/files` — multipart form: `file` (File), `entity_type`, `entity_id` (uuid, omit for system), `file_type` → 201 `FileRecord` (with `url`). 503 when R2 unset. 400 on invalid fields.
  - `GET /api/files?entity_type=&entity_id=` or `?entity_type=system&file_type=logo` → `FileRecord[]` with `url` per row (signed GET), `deleted_at is null` only, newest first.

- [ ] **Step 1: Install aws4fetch**

Run: `npm install aws4fetch`

- [ ] **Step 2: Write the failing unit test**

`tests/unit/r2.test.ts` (signs against fake creds; asserts URL shape — no network):

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isR2Configured, r2SignedGetUrl } from '@/lib/r2';

const ENV_KEYS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('isR2Configured', () => {
  it('false when any var missing', () => {
    delete process.env.R2_BUCKET;
    expect(isR2Configured()).toBe(false);
  });

  it('true when all vars set', () => {
    process.env.R2_ACCOUNT_ID = 'acc';
    process.env.R2_ACCESS_KEY_ID = 'key';
    process.env.R2_SECRET_ACCESS_KEY = 'secret';
    process.env.R2_BUCKET = 'bucket';
    expect(isR2Configured()).toBe(true);
  });
});

describe('r2SignedGetUrl', () => {
  it('produces a presigned URL for the bucket/key with expiry', async () => {
    process.env.R2_ACCOUNT_ID = 'acc';
    process.env.R2_ACCESS_KEY_ID = 'key';
    process.env.R2_SECRET_ACCESS_KEY = 'secret';
    process.env.R2_BUCKET = 'bucket';
    const url = await r2SignedGetUrl('transfer/abc/def.pdf', 300);
    expect(url).toContain('acc.r2.cloudflarestorage.com/bucket/transfer/abc/def.pdf');
    expect(url).toContain('X-Amz-Expires=300');
    expect(url).toContain('X-Amz-Signature=');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/r2.test.ts`
Expected: FAIL (`lib/r2` missing).

- [ ] **Step 4: Implement `lib/r2.ts`**

```ts
import { AwsClient } from 'aws4fetch';

// Cloudflare R2 via S3-compatible API. Bytes never touch Postgres; the app
// stores only r2_key (files table) and serves short-lived signed GET URLs.
// All four env vars are optional at runtime — see isR2Configured().

function env() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  return { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET };
}

export function isR2Configured(): boolean {
  const e = env();
  return Boolean(e.R2_ACCOUNT_ID && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && e.R2_BUCKET);
}

function client(): { aws: AwsClient; base: string } {
  const e = env();
  if (!isR2Configured()) throw new Error('R2 não configurado');
  const aws = new AwsClient({
    accessKeyId: e.R2_ACCESS_KEY_ID!,
    secretAccessKey: e.R2_SECRET_ACCESS_KEY!,
    service: 's3',
    region: 'auto',
  });
  return { aws, base: `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${e.R2_BUCKET}` };
}

export async function r2Put(key: string, body: ArrayBuffer | Uint8Array, contentType: string): Promise<void> {
  const { aws, base } = client();
  const res = await aws.fetch(`${base}/${key}`, {
    method: 'PUT',
    // aws4fetch assina o corpo; BodyInit aceita ArrayBuffer/TypedArray
    body: body as BodyInit,
    headers: { 'Content-Type': contentType },
  });
  if (!res.ok) throw new Error(`falha no upload R2 (${res.status})`);
}

export async function r2SignedGetUrl(key: string, expiresSeconds = 300): Promise<string> {
  const { aws, base } = client();
  const url = new URL(`${base}/${key}`);
  url.searchParams.set('X-Amz-Expires', String(expiresSeconds));
  const signed = await aws.sign(new Request(url, { method: 'GET' }), {
    aws: { signQuery: true },
  });
  return signed.url;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/r2.test.ts`
Expected: PASS.

- [ ] **Step 6: Implement `app/api/files/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isR2Configured, r2Put, r2SignedGetUrl } from '@/lib/r2';

const ENTITY_TYPES = ['return', 'transfer', 'system'] as const;
const FILE_TYPES = ['photo', 'attachment', 'receipt', 'document', 'signature', 'logo'] as const;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — free tier, sem arquivos gigantes

export async function POST(request: NextRequest) {
  if (!isR2Configured()) {
    return NextResponse.json({ error: 'R2 não configurado' }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'multipart/form-data inválido' }, { status: 400 });
  }

  const file = form.get('file');
  const entityType = String(form.get('entity_type') ?? '');
  const entityIdRaw = form.get('entity_id');
  const fileType = String(form.get('file_type') ?? '');

  if (!(file instanceof File)) return NextResponse.json({ error: 'file é obrigatório' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'arquivo acima de 10 MB' }, { status: 400 });
  if (!ENTITY_TYPES.includes(entityType as (typeof ENTITY_TYPES)[number]))
    return NextResponse.json({ error: 'entity_type inválido' }, { status: 400 });
  if (!FILE_TYPES.includes(fileType as (typeof FILE_TYPES)[number]))
    return NextResponse.json({ error: 'file_type inválido' }, { status: 400 });

  const entityId = entityIdRaw ? String(entityIdRaw) : null;
  if (entityType !== 'system' && !entityId)
    return NextResponse.json({ error: 'entity_id é obrigatório fora de system' }, { status: 400 });

  const safeName = (file.name || 'arquivo').replace(/[^\w.\-]+/g, '_').slice(0, 120);
  const key = `${entityType}/${entityId ?? 'system'}/${crypto.randomUUID()}-${safeName}`;

  try {
    await r2Put(key, await file.arrayBuffer(), file.type || 'application/octet-stream');
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'falha no upload' }, { status: 502 });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('files')
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      file_type: fileType,
      r2_key: key,
      filename: file.name || null,
      content_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: userData?.user?.id ?? null,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ...data, url: await r2SignedGetUrl(key) }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entity_type');
  const entityId = searchParams.get('entity_id');
  const fileType = searchParams.get('file_type');

  if (!entityType) return NextResponse.json({ error: 'entity_type é obrigatório' }, { status: 400 });

  const supabase = await createClient();
  let query = supabase
    .from('files')
    .select('*')
    .eq('entity_type', entityType)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (entityId) query = query.eq('entity_id', entityId);
  if (fileType) query = query.eq('file_type', fileType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!isR2Configured()) {
    // lista metadados mesmo sem R2 (sem url) — a UI decide o que mostrar
    return NextResponse.json(data ?? []);
  }
  const withUrls = await Promise.all(
    (data ?? []).map(async (f) => ({ ...f, url: await r2SignedGetUrl(f.r2_key) }))
  );
  return NextResponse.json(withUrls);
}
```

- [ ] **Step 7: Append to `.env.local.example`**

```bash
# Cloudflare R2 (opcional em dev — /api/files responde 503 sem isso)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
```

- [ ] **Step 8: Full unit run + build**

Run: `npx vitest run && npm run build`
Expected: PASS / build OK.

- [ ] **Step 9: Commit**

```bash
git add lib/r2.ts app/api/files/route.ts tests/unit/r2.test.ts .env.local.example package.json package-lock.json
git commit -m "feat(files): R2 client (aws4fetch) + upload/list API with signed URLs"
```

---
### Task 7: Registry APIs — branches, supplier-addresses, branch-users, users, feature-flags

**Files:**
- Create: `app/api/branches/route.ts`
- Create: `app/api/branches/[id]/route.ts`
- Create: `app/api/supplier-addresses/route.ts`
- Create: `app/api/supplier-addresses/[id]/route.ts`
- Create: `app/api/branch-users/route.ts`
- Create: `app/api/users/route.ts`
- Create: `app/api/feature-flags/route.ts`
- Create: `app/api/feature-flags/[key]/route.ts`
- Create: `lib/supabase/admin.ts`
- Test: `tests/unit/fase2-api-shapes.test.ts` (schema-level; route handlers follow the Fase 1 pattern already covered by E2E)

**Interfaces:**
- Consumes: schemas from Task 5; tables from Tasks 1–2.
- Produces (consumed by UI Tasks 9–14):
  - `GET /api/branches[?active=true]` → `Branch[]` (name asc); `POST /api/branches` (branchSchema) → 201 `Branch`
  - `PATCH /api/branches/[id]` (branchPatchSchema) → `Branch`
  - `GET /api/supplier-addresses?supplier_id=<uuid>[&active=true]` → `SupplierAddress[]`; `POST` (supplierAddressSchema) → 201
  - `PATCH /api/supplier-addresses/[id]` (supplierAddressPatchSchema) → `SupplierAddress`
  - `GET /api/branch-users?branch_id=` → `{ branch_id, user_id, email }[]`; `POST` (branchUserSchema) → 201; `DELETE` body `{ branch_id, user_id }` → `{ ok: true }`
  - `GET /api/users` → `{ id, email }[]` (service-role listUsers, server-only)
  - `GET /api/feature-flags` → `FeatureFlag[]`; `PATCH /api/feature-flags/[key]` `{ enabled }` → `FeatureFlag`
  - `lib/supabase/admin.ts`: `createAdminClient()` — service-role client, **never imported from client components**.

All handlers copy the Fase 1 route pattern exactly (see `app/api/suppliers/route.ts` / `app/api/returns/batch/venda/route.ts`): parse with `schema.safeParse`, 400 with `parsed.error.issues[0].message`, `await createClient()`, 500 with `error.message`.

- [ ] **Step 1: `lib/supabase/admin.ts`**

```ts
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Server-only: usa a service-role key (NUNCA exposta ao browser). Necessário
// pra listar usuários do Auth (branch_users UI) — anon/authenticated não têm
// acesso à admin API.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada');
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}
```

Append to `.env.local.example`:

```bash
# Server-only — usada por /api/users (lista usuários pro vínculo filial)
SUPABASE_SERVICE_ROLE_KEY=
```

(Local dev: `supabase status -o env` already emits it; CI Task 18 of Fase 1 already writes it to `.env.local`.)

- [ ] **Step 2: Branches routes**

`app/api/branches/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { branchSchema } from '@/lib/validation';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const supabase = await createClient();
  let query = supabase.from('branches').select('*').order('name');
  if (searchParams.get('active') === 'true') query = query.eq('active', true);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = branchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from('branches').insert(parsed.data).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

`app/api/branches/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { branchPatchSchema } from '@/lib/validation';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = branchPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('branches').update(parsed.data).eq('id', id).select('*').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'filial não encontrada' }, { status: 404 });
  return NextResponse.json(data);
}
```

- [ ] **Step 3: Supplier-addresses routes** — same pattern

`app/api/supplier-addresses/route.ts`: GET requires `supplier_id` query param (400 without it), optional `active=true`; POST uses `supplierAddressSchema`. `app/api/supplier-addresses/[id]/route.ts`: PATCH with `supplierAddressPatchSchema`, 404 on miss — byte-for-byte the branches pattern with the table/schema swapped.

- [ ] **Step 4: Branch-users routes**

`app/api/branch-users/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { branchUserSchema } from '@/lib/validation';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const branchId = searchParams.get('branch_id');
  if (!branchId) return NextResponse.json({ error: 'branch_id é obrigatório' }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.from('branch_users').select('*').eq('branch_id', branchId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // resolve e-mails via admin API (auth.users não é exposto ao PostgREST)
  let emails = new Map<string, string>();
  try {
    const admin = createAdminClient();
    const { data: usersData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    emails = new Map((usersData?.users ?? []).map((u) => [u.id, u.email ?? '']));
  } catch {
    // sem service key (ex.: preview) — devolve sem e-mail, UI mostra o uuid
  }
  return NextResponse.json(
    (data ?? []).map((row) => ({ ...row, email: emails.get(row.user_id) ?? null }))
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = branchUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from('branch_users').insert(parsed.data).select('*').single();
  if (error) {
    const status = error.code === '23505' ? 409 : 500; // já vinculado
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = branchUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from('branch_users')
    .delete()
    .eq('branch_id', parsed.data.branch_id)
    .eq('user_id', parsed.data.user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

`app/api/users/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  // gate: só usuário logado pode listar (proxy já cobre, mas /api/users expõe
  // e-mails — checagem explícita aqui é barata)
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'sem service key' }, { status: 503 });
  }
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data?.users ?? []).map((u) => ({ id: u.id, email: u.email ?? '' })));
}
```

- [ ] **Step 5: Feature-flags routes**

`app/api/feature-flags/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('feature_flags').select('*').order('key');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

`app/api/feature-flags/[key]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { featureFlagPatchSchema } from '@/lib/validation';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = featureFlagPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('feature_flags').update({ enabled: parsed.data.enabled }).eq('key', key).select('*').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'flag não encontrada' }, { status: 404 });
  return NextResponse.json(data);
}
```

- [ ] **Step 6: Shape tests**

`tests/unit/fase2-api-shapes.test.ts` — keep it small: assert `branchUserSchema` rejects non-uuid, `featureFlagPatchSchema` requires boolean (these two weren't covered in Task 5):

```ts
import { describe, expect, it } from 'vitest';
import { branchUserSchema, featureFlagPatchSchema } from '@/lib/validation';

describe('branchUserSchema', () => {
  it('requires two uuids', () => {
    expect(branchUserSchema.safeParse({ branch_id: 'x', user_id: 'y' }).success).toBe(false);
    expect(
      branchUserSchema.safeParse({
        branch_id: '11111111-1111-1111-1111-111111111111',
        user_id: '22222222-2222-2222-2222-222222222222',
      }).success
    ).toBe(true);
  });
});

describe('featureFlagPatchSchema', () => {
  it('requires boolean enabled', () => {
    expect(featureFlagPatchSchema.safeParse({ enabled: 'sim' }).success).toBe(false);
    expect(featureFlagPatchSchema.safeParse({ enabled: true }).success).toBe(true);
  });
});
```

- [ ] **Step 7: Run + build**

Run: `npx vitest run && npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/api/branches app/api/supplier-addresses app/api/branch-users app/api/users app/api/feature-flags lib/supabase/admin.ts tests/unit/fase2-api-shapes.test.ts .env.local.example
git commit -m "feat(api): branches, supplier addresses, branch users, users, feature flags"
```

---

### Task 8: Transfers API

**Files:**
- Create: `app/api/transfers/route.ts`
- Create: `app/api/transfers/lote/[loteId]/route.ts`
- Create: `app/api/transfers/lote/[loteId]/baixa/route.ts`
- Create: `app/api/transfers/lote/[loteId]/cancelar/route.ts`
- Create: `app/api/transfers/lote/[loteId]/reagendar/route.ts`
- Create: `app/api/transfers/lote/[loteId]/chegada/route.ts`

**Interfaces:**
- Consumes: RPCs (Task 3), `transferCreateSchema`/`cancelarTransferenciaSchema`/`reagendarSchema` (Task 5).
- Produces (consumed by UI Tasks 11–12):
  - `POST /api/transfers` (transferCreateSchema) → 201 `{ lote_id, affected, ignored }`; RPC exceptions surface as 409 `{ error }` when the message contains 'nenhuma devolução elegível' or 'não pertence ao fornecedor', else 500.
  - `GET /api/transfers[?status=...][&vencidas=true]` → `TransferWithJoins[]` — select string: `*, returns(id, nf, nfd, supplier_id, valor_total, status, suppliers(id, name)), branches(id, name), supplier_addresses(id, label, city, uf, supplier_id)`, order `scheduled_date asc`. `vencidas=true` adds `.eq('status','em_transferencia').lt('scheduled_date', <today YYYY-MM-DD>)`.
  - `GET /api/transfers/lote/[loteId]` → same select filtered `.eq('lote_id', loteId)`; 404 if empty.
  - `POST .../baixa` (no body) → `{ affected: uuid[] }` (return_ids devolvidos)
  - `POST .../cancelar` `{ motivo }` → `{ affected: uuid[] }`
  - `POST .../reagendar` `{ scheduled_date }` → `{ affected: uuid[] }` (transfer ids)
  - `POST .../chegada` (no body) → `{ affected: uuid[] }`
  - Every lote action maps the RPC "lote não encontrado ou já concluído/cancelado" / "desativada" / "sem transferências elegíveis" exceptions to 409 `{ error: <pg message> }`, other errors to 500.

- [ ] **Step 1: `app/api/transfers/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { transferCreateSchema } from '@/lib/validation';

const SELECT = `*,
  returns(id, nf, nfd, supplier_id, valor_total, status, suppliers(id, name)),
  branches(id, name),
  supplier_addresses(id, label, city, uf, supplier_id)`;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const supabase = await createClient();
  let query = supabase.from('transfers').select(SELECT).order('scheduled_date', { ascending: true });

  const status = searchParams.get('status');
  if (status) query = query.eq('status', status);
  if (searchParams.get('vencidas') === 'true') {
    const today = new Date().toISOString().slice(0, 10);
    query = query.eq('status', 'em_transferencia').lt('scheduled_date', today);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = transferCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_programar_transferencia', {
    p_return_ids: d.return_ids,
    p_destination_type: d.destination_type,
    p_branch_id: d.branch_id ?? null,
    p_supplier_address_id: d.supplier_address_id ?? null,
    p_carrier: d.carrier ?? null,
    p_numero_pedido: d.numero_pedido ?? null,
    p_freight_type: d.freight_type ?? null,
    p_freight_value: d.freight_value ?? null,
    p_scheduled_date: d.scheduled_date,
  });
  if (error) {
    const conflict =
      error.message.includes('nenhuma devolução elegível') ||
      error.message.includes('não pertence ao fornecedor');
    return NextResponse.json({ error: error.message }, { status: conflict ? 409 : 500 });
  }

  // RETURNS TABLE -> array com uma linha { lote_id, affected_ids }
  const row = Array.isArray(data) ? data[0] : data;
  const affected: string[] = row?.affected_ids ?? [];
  return NextResponse.json(
    {
      lote_id: row?.lote_id ?? null,
      affected,
      ignored: d.return_ids.filter((id) => !affected.includes(id)),
    },
    { status: 201 }
  );
}
```

- [ ] **Step 2: Lote detail + action routes**

`app/api/transfers/lote/[loteId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SELECT = `*,
  returns(id, nf, nfd, supplier_id, valor_total, status, suppliers(id, name)),
  branches(id, name),
  supplier_addresses(id, label, city, uf, supplier_id)`;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ loteId: string }> }) {
  const { loteId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('transfers').select(SELECT).eq('lote_id', loteId).order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'lote não encontrado' }, { status: 404 });
  return NextResponse.json(data);
}
```

`app/api/transfers/lote/[loteId]/baixa/route.ts` (chegada is identical with `fn_confirmar_chegada`):

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const CONFLICT_HINTS = ['não encontrado', 'desativada', 'sem transferências elegíveis'];

export async function POST(_request: NextRequest, { params }: { params: Promise<{ loteId: string }> }) {
  const { loteId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_baixar_transferencia', { p_lote_id: loteId });
  if (error) {
    const conflict = CONFLICT_HINTS.some((h) => error.message.includes(h));
    return NextResponse.json({ error: error.message }, { status: conflict ? 409 : 500 });
  }
  return NextResponse.json({ affected: data ?? [] });
}
```

`cancelar/route.ts` — parse body with `cancelarTransferenciaSchema`, call `fn_cancelar_transferencia({ p_lote_id: loteId, p_motivo: parsed.data.motivo })`, same conflict mapping.
`reagendar/route.ts` — parse with `reagendarSchema`, call `fn_reagendar_transferencia({ p_lote_id: loteId, p_scheduled_date: parsed.data.scheduled_date })`.
`chegada/route.ts` — no body, call `fn_confirmar_chegada({ p_lote_id: loteId })`.
All four share the exact `CONFLICT_HINTS` mapping shown above.

- [ ] **Step 3: Build + full unit run**

Run: `npx vitest run && npm run build`
Expected: PASS (behavioral coverage of these routes lands in E2E, Task 15 — same split Fase 1 used).

- [ ] **Step 4: Commit**

```bash
git add app/api/transfers
git commit -m "feat(api): transfers create/list/lote actions over fase 2 RPCs"
```

---
### Task 9: UI — Configurações: Filiais (CRUD + vínculo de usuários) + settings sub-nav

> **Invoke `ui-ux-pro-max` via the Skill tool BEFORE writing any UI code in this task**, and read `docs/design-system.md` first. Follow the existing settings pages (`components/settings/suppliers-crud.tsx`) for structure and tone.

**Files:**
- Create: `components/settings/settings-nav.tsx`
- Create: `components/settings/branches-crud.tsx`
- Create: `app/settings/branches/page.tsx`
- Modify: `app/settings/suppliers/page.tsx` (mount the new `SettingsNav` at the top)
- Modify: `components/site-nav.tsx` (no change to LINKS needed — 'Configurações' already points at `/settings/suppliers`; only verify active-state still highlights for `/settings/branches`)

**Interfaces:**
- Consumes: `GET/POST /api/branches`, `PATCH /api/branches/[id]`, `GET/POST/DELETE /api/branch-users`, `GET /api/users` (Task 7); types `Branch`, `BranchUser` (Task 5).
- Produces: `SettingsNav` component (tabs linking `/settings/suppliers`, `/settings/branches`, `/settings/features`) reused by Tasks 10.

**UI spec:**
- `SettingsNav`: horizontal tab strip under the page title, links styled like the site-nav active pattern (`aria-current="page"` on the active tab). Tabs: "Fornecedores e Motivos" → `/settings/suppliers`, "Filiais" → `/settings/branches`, "Funcionalidades" → `/settings/features`.
- `branches-crud.tsx` (client component, plain state — mirror `suppliers-crud.tsx`):
  - List: table Name / Endereço / Ativa (badge) / Ações. Inactive rows dimmed.
  - Create: inline form (name required, address optional) → `POST /api/branches`, check `r.ok`, refresh list.
  - Toggle active: button per row → `PATCH /api/branches/[id]` `{ active: !active }`. No hard delete anywhere (plan doc: registries with history are deactivated, never deleted).
  - "Responsáveis" per row: expandable panel (or Dialog) that loads `GET /api/branch-users?branch_id=` + `GET /api/users`, shows linked users (email), a select of remaining users + "Vincular" (`POST /api/branch-users`, 409 → mensagem "usuário já vinculado"), and "Remover" per linked user (`DELETE /api/branch-users`). If `/api/users` responds 503 (sem service key), show the note "Lista de usuários indisponível neste ambiente" and keep the panel read-only.
- Loading/error states: follow the existing pages (Fase 1 carried a known minor about missing loading indicators — do include a simple "Carregando…" text state here; don't invent a spinner system).

**Steps:**

- [ ] **Step 1: Invoke `ui-ux-pro-max` (Skill tool) and read `docs/design-system.md`** — deliverable of this step is a 3–5 line design note in the task commit message body (palette/typography already fixed by the design system; note what was reused).
- [ ] **Step 2: Build `SettingsNav` and mount it on `/settings/suppliers`** — verify with `npm run dev`: both pages render the tabs, active state correct.
- [ ] **Step 3: Build `branches-crud.tsx` + `app/settings/branches/page.tsx`** (page = server component shell rendering the client CRUD, same as suppliers page).
- [ ] **Step 4: Manual click-through with `npm run dev` against local Supabase** — create branch, deactivate, link a user, remove link. Fix what breaks.
- [ ] **Step 5: `npx vitest run && npm run build`** — Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add components/settings/settings-nav.tsx components/settings/branches-crud.tsx app/settings/branches app/settings/suppliers/page.tsx
git commit -m "feat(settings): filiais CRUD com vínculo de responsáveis + sub-nav de configurações"
```

---

### Task 10: UI — Configurações: Endereços de fornecedor + Funcionalidades (toggles + logo)

> **Invoke `ui-ux-pro-max` via the Skill tool BEFORE writing any UI code in this task**; read `docs/design-system.md`.

**Files:**
- Modify: `components/settings/suppliers-crud.tsx` (add per-supplier "Endereços" expandable section)
- Create: `components/settings/supplier-addresses-panel.tsx`
- Create: `components/settings/feature-flags-panel.tsx`
- Create: `components/settings/logo-upload.tsx`
- Create: `app/settings/features/page.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/supplier-addresses`, `PATCH /api/supplier-addresses/[id]`, `GET /api/feature-flags`, `PATCH /api/feature-flags/[key]`, `POST/GET /api/files` (logo), `SettingsNav` (Task 9).
- Produces: logo stored as `files` row `entity_type='system', file_type='logo'` — consumed by the etiqueta (Task 13).

**UI spec:**
- `supplier-addresses-panel.tsx`: rendered inside each supplier row's expandable area. Table: Label / Cidade-UF / E-mails (count) / Ativa / Ações. Inline create form: label (required), city, uf (2 chars), address, contact_emails (comma-separated input parsed to array — same convention the suppliers form already uses for `contact_emails`). Deactivate via PATCH. Empty-emails hint: "Sem e-mail próprio — envio usará o e-mail geral do fornecedor" (that's the Fase 3 cascade, stated here so operators cadastram certo).
- `feature-flags-panel.tsx`: lists the flags from `GET /api/feature-flags` with a switch each (shadcn `Switch` if present in `components/ui`, otherwise a simple checkbox styled per design system — check first, don't add new shadcn components without need). Only Fase 2 flags are toggleable; Fase 3 flags (`batch_mode`, `email_devolucao_programada`) render disabled with the note "Disponível na Fase 3". Copy for the three Fase 2 flags explains the behavior in one sentence each (chegada na filial, assinatura na baixa, roteirização).
- `logo-upload.tsx`: card "Logo da etiqueta" — shows current logo (from `GET /api/files?entity_type=system&file_type=logo`, first row) and a file input (accept `image/png, image/svg+xml`; hint: "PNG/SVG em preto sólido — JPEG/foto sai fraco na térmica", straight from the plan doc's thermal-printer note). Upload → `POST /api/files` with `entity_type=system`, `file_type=logo`. On 503, show "Armazenamento (R2) não configurado neste ambiente" instead of the input.
- `app/settings/features/page.tsx`: `SettingsNav` + `feature-flags-panel` + `logo-upload`.

**Steps:**

- [ ] **Step 1: Invoke `ui-ux-pro-max` (Skill tool); read `docs/design-system.md`.**
- [ ] **Step 2: Build `supplier-addresses-panel` and wire it into `suppliers-crud`** — manual check: create address for a supplier, deactivate it, invalid e-mail rejected with field message.
- [ ] **Step 3: Build `feature-flags-panel` + `logo-upload` + `/settings/features` page** — manual check: toggle `confirmacao_chegada_filial` on/off and confirm persistence after reload; logo section shows the 503 notice when R2 unset locally.
- [ ] **Step 4: `npx vitest run && npm run build`** — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add components/settings/supplier-addresses-panel.tsx components/settings/feature-flags-panel.tsx components/settings/logo-upload.tsx app/settings/features components/settings/suppliers-crud.tsx
git commit -m "feat(settings): endereços de fornecedor, toggles de funcionalidades e logo da etiqueta"
```

---

### Task 11: UI — Programar transferência (returns list batch action)

> **Invoke `ui-ux-pro-max` via the Skill tool BEFORE writing any UI code in this task**; read `docs/design-system.md`.

**Files:**
- Create: `components/transfers/transfer-form-dialog.tsx`
- Modify: `components/returns/batch-actions-stepper.tsx` (add "Programar transferência" action)
- Modify: `components/returns/returns-table.tsx` (only if the action wiring requires it — read the current selection plumbing first)

**Interfaces:**
- Consumes: `POST /api/transfers` (Task 8), `GET /api/branches?active=true`, `GET /api/supplier-addresses?supplier_id=&active=true` (Task 7), current stepper selection of `ReturnRecord[]`.
- Produces: `TransferFormDialog` component — props `{ open, onOpenChange, selectedReturns: ReturnRecord[], onSuccess: (result: { lote_id: string; affected: string[]; ignored: string[] }) => void }`. Reused by Roteirização (Task 14) with pre-filled destination.

**UI spec:**
- New batch action "Programar transferência" appears when ≥1 selected row is `pendente`. It follows the existing 3-step stepper pattern (seleção → prévia com avisos → confirmação): the prévia lists selected NFs and flags non-pendente ones as "será ignorada".
- The confirmation step embeds the destination form:
  - Radio **Destino**: Filial / Fornecedor.
  - Filial → select of active branches.
  - Fornecedor → only enabled when **all selected returns share one `supplier_id`** (otherwise show "Selecione NFs de um único fornecedor para devolver direto ao fornecedor" and keep Filial as the only choice). Select of that supplier's active addresses (label + cidade/UF). Empty list → "Este fornecedor não tem endereço de devolução cadastrado" with link to `/settings/suppliers`.
  - Fields: transportadora (`carrier`), nº pedido (`numero_pedido`), tipo de frete (select: Tabela / Valor+ICMS / Valor / Cortesia → values `tabela|valor_icms|valor|cortesia`), valor do frete (number, only when freight_type is `valor_icms`/`valor`), data agendada (date input, required, default hoje+1).
- Submit → `POST /api/transfers`; on 201 show result summary ("2 NFs programadas no lote; 1 ignorada") and call `onSuccess` (stepper refreshes the list — reuse the existing refresh path from venda/reabrir actions). On 409/400 show the API `error` message inline.

**Steps:**

- [ ] **Step 1: Invoke `ui-ux-pro-max` (Skill tool); read `docs/design-system.md`. Read `batch-actions-stepper.tsx` fully before touching it.**
- [ ] **Step 2: Build `TransferFormDialog`** with the destination logic above (plain state + zod parse client-side via `transferCreateSchema.safeParse` before POSTing — reuse the schema, don't duplicate rules).
- [ ] **Step 3: Wire the stepper action** — selection → prévia → confirm dialog; refresh after success.
- [ ] **Step 4: Manual click-through** (`npm run dev`): program 2 pendentes to a filial → both rows show "Em Transferência"; try mixed-supplier selection with destino fornecedor blocked.
- [ ] **Step 5: `npx vitest run && npm run build`** — Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add components/transfers/transfer-form-dialog.tsx components/returns/batch-actions-stepper.tsx components/returns/returns-table.tsx
git commit -m "feat(transfers): programar transferência a partir da lista de devoluções"
```

---

### Task 12: UI — Transferências: lista por lote + detalhe com baixa/cancelar/reagendar/chegada

> **Invoke `ui-ux-pro-max` via the Skill tool BEFORE writing any UI code in this task**; read `docs/design-system.md`.

**Files:**
- Create: `app/transfers/page.tsx`
- Create: `app/transfers/[loteId]/page.tsx`
- Create: `components/transfers/transfers-table.tsx`
- Create: `components/transfers/lote-actions.tsx`
- Create: `components/transfers/signature-pad.tsx`
- Modify: `components/site-nav.tsx` (add `{ href: '/transfers', label: 'Transferências' }` after 'Devoluções'; keep `isLinkActive` semantics)

**Interfaces:**
- Consumes: `GET /api/transfers`, `GET /api/transfers/lote/[loteId]`, the four action POSTs (Task 8), `GET /api/feature-flags`, `POST/GET /api/files` (Task 6).
- Produces: `SignaturePad` component — props `{ onCapture: (blob: Blob) => void, disabled?: boolean }`; canvas with pointer events (mouse + touch), "Limpar" button, exports PNG via `canvas.toBlob`.

**UI spec:**
- `/transfers` list: rows grouped **by lote** client-side (`Map<lote_id, TransferWithJoins[]>` from the flat GET): columns Data agendada / Destino (nome da filial ou label + cidade do endereço) / NFs (count + soma `valor_total`) / Transportadora / Status / badge **Vencida** (destaque terracotta) when `status === 'em_transferencia' && scheduled_date < today`. Filter chips: Em trânsito / Concluídas / Canceladas / **Vencidas** (uses `?vencidas=true`). Row click → `/transfers/[loteId]`.
- `/transfers/[loteId]` detail:
  - Header: destino, data agendada, frete (tipo + valor), transportadora, nº pedido, status, `arrived_at_branch_at` timestamp when present ("Chegou na filial em …").
  - Items table: NF / NFD / Fornecedor / Valor / status atual do return.
  - Files section: lists `GET /api/files?entity_type=transfer&entity_id=<loteId>` (comprovantes/assinaturas com link assinado); hidden section header when empty and R2 off.
  - `lote-actions.tsx` (client) renders per current lote status:
    - **Confirmar chegada** — only when flag `confirmacao_chegada_filial` on AND `destination_type === 'filial'` AND status em trânsito AND `arrived_at_branch_at` null. POST chegada; on success re-fetch.
    - **Dar baixa** — status em trânsito. Opens Dialog: comprovante file input (optional; hidden with notice when R2 off) + **assinatura** (SignaturePad) only when flag `assinatura_baixa` on. Flow: `POST .../baixa` first; if 2xx, upload comprovante (`file_type=receipt`) and signature blob (`file_type=signature`, filename `assinatura.png`) with `entity_type=transfer`, `entity_id=<loteId>` — upload failures after a successful baixa show a warning ("Baixa concluída; falha ao anexar arquivo") but do not roll back.
    - **Cancelar** — status em trânsito. Dialog with required motivo (textarea) → `POST .../cancelar`. Success → NFs voltam a Pendente (mostrar aviso com contagem).
    - **Reagendar** — status em trânsito. Dialog with date input → `POST .../reagendar`.
  - All 409s render the API error message verbatim in the dialog (the RPC messages are already user-readable pt-BR).
- `SignaturePad`: fixed-height canvas (e.g. 160px, full dialog width), white background, 2px dark stroke, `touch-action: none`, redraw-safe on devicePixelRatio. No external lib.

**Steps:**

- [ ] **Step 1: Invoke `ui-ux-pro-max` (Skill tool); read `docs/design-system.md`.**
- [ ] **Step 2: Build list page + table grouping + filters + nav link.** Manual check with seeded lote from Task 11.
- [ ] **Step 3: Build detail page + `lote-actions` (chegada, cancelar, reagendar first — no files involved).** Manual check: cancel round-trip returns NFs to Pendente.
- [ ] **Step 4: Build `SignaturePad` + baixa dialog with uploads.** Manual check with R2 unset: baixa works, upload section shows the notice.
- [ ] **Step 5: `npx vitest run && npm run build`** — Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add app/transfers components/transfers components/site-nav.tsx
git commit -m "feat(transfers): lista por lote e detalhe com baixa, cancelamento, reagendamento e chegada"
```

---
### Task 13: UI — Etiqueta de caixa 100×100mm

> **Invoke `ui-ux-pro-max` via the Skill tool BEFORE writing any UI code in this task**; read `docs/design-system.md`. The print sheet itself intentionally ignores the app theme — pure black on white for thermal printing.

**Files:**
- Create: `app/returns/[id]/etiqueta/page.tsx`
- Create: `components/returns/etiqueta.tsx`
- Modify: `app/returns/[id]/page.tsx` (add "Imprimir etiqueta" button linking to the etiqueta route, `target="_blank"`)

**Interfaces:**
- Consumes: `GET /api/returns/[id]` (Fase 1), `GET /api/files?entity_type=system&file_type=logo` (Task 6), supplier name via the return payload (check the existing detail page for how supplier is resolved — reuse).

**UI spec (from plano v4.1 seção 3, "Etiqueta de caixa"):**
- Page CSS (in the component, scoped):

```css
@media print {
  @page { size: 100mm 100mm; margin: 0; }
  body * { visibility: hidden; }
  .etiqueta, .etiqueta * { visibility: visible; }
  .etiqueta { position: fixed; inset: 0; }
}
.etiqueta {
  width: 100mm; height: 100mm; padding: 4mm;
  background: #fff; color: #000;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
  font-weight: 700;
}
```

- Layout: logo header (from files logo row; skip the img entirely when absent or R2 off — never a broken image on a printed label), **NF gigante** (biggest element, readable at 1 m — e.g. `font-size: 14mm; font-weight: 900`), then secondary rows: NFD, Fornecedor, Tipo, Motivo, Qtd, Data de entrada, Status — all present, truncation with `overflow: hidden; text-overflow: ellipsis` per line rather than dropping fields.
- Screen view shows the label centered with a "Imprimir" button calling `window.print()`; the print CSS isolates the label.
- No ZPL in this phase (plan doc marks it "não essencial pro MVP").

**Steps:**

- [ ] **Step 1: Invoke `ui-ux-pro-max` (Skill tool); read `docs/design-system.md`.**
- [ ] **Step 2: Build the etiqueta component + route; wire the button on the detail page.**
- [ ] **Step 3: Manual check:** open `/returns/<id>/etiqueta`, browser print preview shows a single 100×100mm page, NF dominant, no clipped fields; with no logo uploaded the header simply omits the img.
- [ ] **Step 4: `npx vitest run && npm run build`** — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add app/returns/[id]/etiqueta components/returns/etiqueta.tsx app/returns/[id]/page.tsx
git commit -m "feat(etiqueta): etiqueta de caixa 100x100mm com logo e NF em destaque"
```

---

### Task 14: UI — Sugestão de rota de coleta (toggle roteirizacao_coleta)

> **Invoke `ui-ux-pro-max` via the Skill tool BEFORE writing any UI code in this task**; read `docs/design-system.md`.

**Files:**
- Create: `lib/rotas.ts`
- Create: `tests/unit/rotas.test.ts`
- Create: `app/transfers/rotas/page.tsx`
- Create: `components/transfers/rota-groups.tsx`
- Modify: `app/transfers/page.tsx` (show "Sugestão de rota" link/button only when flag on)

**Interfaces:**
- Consumes: `GET /api/returns?status=pendente` (Fase 1 list route — confirm the exact query-param contract by reading `app/api/returns/route.ts` first; if status filtering isn't supported, filter client-side), `GET /api/supplier-addresses?supplier_id=`, `TransferFormDialog` (Task 11), flag via `GET /api/feature-flags`.
- Produces: `groupPendingByCity(returns: ReturnRecord[], addressesBySupplier: Map<string, SupplierAddress[]>): RotaGroup[]` where `RotaGroup = { city: string; uf: string; addresses: SupplierAddress[]; returns: ReturnRecord[] }`.

**Grouping rule (MVP per plano v4.1 seção 4):** a pendente return joins group "city/UF" when its supplier has ≥1 active address in that city/UF. Suppliers with no address → group `{ city: 'Sem endereço cadastrado', uf: '' }` (rendered last, com link pra Configurações, sem botão de programar). A supplier with addresses in two cities appears in both groups (operator picks where to actually send).

- [ ] **Step 1: Write the failing unit test**

`tests/unit/rotas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { groupPendingByCity } from '@/lib/rotas';
import type { ReturnRecord, SupplierAddress } from '@/lib/types';

const ret = (id: string, supplier_id: string) =>
  ({ id, supplier_id, status: 'pendente' }) as ReturnRecord;
const addr = (id: string, supplier_id: string, city: string, uf: string) =>
  ({ id, supplier_id, city, uf, active: true, label: id }) as SupplierAddress;

describe('groupPendingByCity', () => {
  it('groups returns by their supplier address city/UF', () => {
    const returns = [ret('r1', 's1'), ret('r2', 's2'), ret('r3', 's3')];
    const addresses = new Map([
      ['s1', [addr('a1', 's1', 'Campinas', 'SP')]],
      ['s2', [addr('a2', 's2', 'Campinas', 'SP'), addr('a3', 's2', 'Curitiba', 'PR')]],
    ]);
    const groups = groupPendingByCity(returns, addresses);

    const campinas = groups.find((g) => g.city === 'Campinas');
    expect(campinas?.returns.map((r) => r.id).sort()).toEqual(['r1', 'r2']);

    const curitiba = groups.find((g) => g.city === 'Curitiba');
    expect(curitiba?.returns.map((r) => r.id)).toEqual(['r2']);

    const semEndereco = groups[groups.length - 1];
    expect(semEndereco.city).toBe('Sem endereço cadastrado');
    expect(semEndereco.returns.map((r) => r.id)).toEqual(['r3']);
  });

  it('ignores inactive addresses and city-less addresses', () => {
    const addresses = new Map([
      ['s1', [{ ...addr('a1', 's1', 'Campinas', 'SP'), active: false }]],
      ['s2', [addr('a2', 's2', '', 'SP')]],
    ]);
    const groups = groupPendingByCity([ret('r1', 's1'), ret('r2', 's2')], addresses);
    expect(groups).toHaveLength(1);
    expect(groups[0].city).toBe('Sem endereço cadastrado');
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — `npx vitest run tests/unit/rotas.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `lib/rotas.ts`**

```ts
import type { ReturnRecord, SupplierAddress } from '@/lib/types';

export interface RotaGroup {
  city: string;
  uf: string;
  addresses: SupplierAddress[];
  returns: ReturnRecord[];
}

const SEM_ENDERECO = 'Sem endereço cadastrado';

// MVP da roteirização (plano v4.1 seção 4): agrupamento por cidade/UF do
// endereço de devolução. Fornecedor com endereços em duas cidades aparece
// nos dois grupos — o operador decide pra onde mandar.
export function groupPendingByCity(
  returns: ReturnRecord[],
  addressesBySupplier: Map<string, SupplierAddress[]>
): RotaGroup[] {
  const groups = new Map<string, RotaGroup>();
  const orphans: ReturnRecord[] = [];

  for (const r of returns) {
    const addrs = (addressesBySupplier.get(r.supplier_id) ?? []).filter(
      (a) => a.active && a.city && a.city.trim() !== ''
    );
    if (addrs.length === 0) {
      orphans.push(r);
      continue;
    }
    const seen = new Set<string>();
    for (const a of addrs) {
      const key = `${a.city!.trim()}|${(a.uf ?? '').trim().toUpperCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let g = groups.get(key);
      if (!g) {
        g = { city: a.city!.trim(), uf: (a.uf ?? '').trim().toUpperCase(), addresses: [], returns: [] };
        groups.set(key, g);
      }
      if (!g.addresses.some((x) => x.id === a.id)) g.addresses.push(a);
      g.returns.push(r);
    }
  }

  const sorted = [...groups.values()].sort(
    (a, b) => b.returns.length - a.returns.length || a.city.localeCompare(b.city)
  );
  if (orphans.length > 0) {
    sorted.push({ city: SEM_ENDERECO, uf: '', addresses: [], returns: orphans });
  }
  return sorted;
}
```

- [ ] **Step 4: Run the test** — `npx vitest run tests/unit/rotas.test.ts` → PASS.

- [ ] **Step 5: Invoke `ui-ux-pro-max` (Skill tool), then build the page.**

`/transfers/rotas` (client page): guard — fetch flags; when `roteirizacao_coleta` off, render "A roteirização de coleta está desativada" + link `/settings/features`. When on: fetch pendente returns + each distinct supplier's addresses (parallel `Promise.all`), run `groupPendingByCity`, render one card per group: "Campinas/SP — 4 NFs, R$ 12.340" + NF list (checkboxes, all checked by default) + button **"Programar lote para esta rota"** que abre o `TransferFormDialog` (Task 11) com `selectedReturns` = NFs marcadas e destino pré-selecionado `fornecedor` + o endereço do grupo quando há um só (mais de um endereço no grupo → dropdown já filtrado a eles). Mixed-supplier groups: destination fornecedor requires one supplier — quando o grupo tem 2+ fornecedores, o dialog mantém a regra da Task 11 (bloqueia fornecedor, permite filial); mostrar hint "NFs de fornecedores diferentes — programe um lote por fornecedor ou destino filial". After success, refresh groups.

- [ ] **Step 6: Manual click-through** with flag on: two suppliers with addresses in the same city produce one group; programming the lote moves the NFs out of the screen.
- [ ] **Step 7: `npx vitest run && npm run build`** — Expected: PASS.
- [ ] **Step 8: Commit**

```bash
git add lib/rotas.ts tests/unit/rotas.test.ts app/transfers/rotas components/transfers/rota-groups.tsx app/transfers/page.tsx
git commit -m "feat(rotas): sugestão de rota de coleta agrupada por cidade (toggle roteirizacao_coleta)"
```

---

### Task 15: E2E (Playwright) — transfer lifecycle + docs/nav polish

**Files:**
- Create: `e2e/transferencias.spec.ts`
- Modify: `README.md` (Fase 2 section: novas rotas, envs R2/SERVICE_ROLE, flags)

**Interfaces:**
- Consumes: everything above; existing `e2e/fixtures.ts` + `global-setup.ts` (login/session plumbing — read them first and reuse; NFs must use unique `e2e-${Date.now()}` values and row-scoped assertions, the Fase 1 convention).

**Scenarios (one spec file, serial where state chains):**

```ts
import { expect, test } from '@playwright/test';

// Convenções da suíte (Fase 1): NF única por run, assertions com escopo de
// linha, setup de dados via API logada (request context), nunca literais fixos.

test.describe.serial('transferências', () => {
  const nfA = `e2e-tr-${Date.now()}-a`;
  const nfB = `e2e-tr-${Date.now()}-b`;
  const nfC = `e2e-tr-${Date.now()}-c`;

  test('programar lote para filial e dar baixa -> Devolvido', async ({ page, request }) => {
    // 1. via API: cria fornecedor, filial e 2 returns pendentes (nfA, nfB)
    // 2. UI /returns: seleciona as duas linhas, ação "Programar transferência",
    //    destino Filial, data amanhã, confirma
    // 3. asserts: linhas nfA/nfB mostram "Em Transferência"
    // 4. UI /transfers: lote aparece com 2 NFs; abre o detalhe
    // 5. "Dar baixa" (sem comprovante — R2 off no CI) -> confirma
    // 6. asserts: detalhe mostra Concluída; /returns mostra nfA/nfB "Devolvido"
  });

  test('cancelar transferência exige motivo e devolve NF a Pendente', async ({ page, request }) => {
    // cria nfC pendente via API, programa via UI para filial,
    // abre lote, "Cancelar": confirma que o botão exige motivo (submit
    // desabilitado/erro com textarea vazio), preenche motivo, confirma,
    // assert nfC volta a "Pendente" e lote mostra "Cancelada"
  });

  test('chegada na filial só com flag ligada e atribui responsabilidade', async ({ page, request }) => {
    // liga flag via PATCH /api/feature-flags/confirmacao_chegada_filial {enabled:true}
    // programa nova NF p/ filial; no detalhe do lote clica "Confirmar chegada";
    // assert: timestamp de chegada visível; desliga a flag no teardown
  });

  test('etiqueta renderiza NF em destaque', async ({ page, request }) => {
    // abre /returns/<id>/etiqueta de uma NF criada acima;
    // assert: elemento .etiqueta visível contendo o número da NF
  });
});
```

The implementer fills the bodies following `e2e/lista-e-baixa.spec.ts` patterns (login/session via existing fixtures, `request` context with stored cookies for API setup calls). Keep selectors accessible-first (roles/labels), same as the Fase 1 specs.

**Steps:**

- [ ] **Step 1: Read `e2e/fixtures.ts`, `e2e/global-setup.ts`, `e2e/lista-e-baixa.spec.ts`** — reuse the auth/setup helpers.
- [ ] **Step 2: Write the four scenarios (they will fail against current `main` — that's the point of writing them now).**
- [ ] **Step 3: Run the full E2E suite live** — `supabase db reset` first for a clean state, then `npx playwright test`. Expected: ALL specs pass (Fase 1's 8 + these 4). Fix app code, not tests, when a scenario exposes a real gap.
- [ ] **Step 4: Update `README.md`** — Fase 2 blurb: rotas novas (`/transfers`, `/transfers/rotas`, `/settings/branches`, `/settings/features`, `/returns/[id]/etiqueta`), env vars (`R2_*` opcionais, `SUPABASE_SERVICE_ROLE_KEY` para /api/users), flags da fase e o que cada uma liga.
- [ ] **Step 5: Full local gate** — `supabase test db && npx vitest run && npm run build && npx playwright test`. Expected: everything green.
- [ ] **Step 6: Commit**

```bash
git add e2e/transferencias.spec.ts README.md
git commit -m "test(e2e): ciclo de transferência (programar, baixa, cancelar, chegada) + docs fase 2"
```

---

## Final gate (after all tasks)

1. `supabase db reset && supabase test db` — all pgTAP suites green.
2. `npx vitest run` — all unit suites green.
3. `npm run build` — clean build.
4. `npx playwright test` — full E2E green, live against local Supabase.
5. **REQUIRED SUB-SKILL:** `superpowers:requesting-code-review` — whole-branch review (Fase 1 found 2 Criticals at this gate; budget for a fix round).
6. **REQUIRED SUB-SKILL:** `superpowers:finishing-a-development-branch` — push branch, open PR to `main` with the Fase 2 summary, CI must pass (Node 22 workflow already in place).

**Deferred (registered, not in this phase):** e-mail/alert wiring for transferência vencida and notificar-filial (Fase 3, `alert_rules`/`scheduled_emails`); `activity_log` timeline events for chegada (Fase 6); ZPL nativo pra etiqueta (fora do MVP); geocoding real na roteirização (fora do MVP); alçada/2FA (Fase 4). Follow-ups pendentes da Fase 1 continuam em `.claude/worktrees/fase1-nucleo/.superpowers/sdd/progress.md` — não entram nesta branch a menos que um reviewer os promova.
