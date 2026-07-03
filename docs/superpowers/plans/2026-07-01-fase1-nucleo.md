# Fase 1 — Núcleo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the core of the returns-control system — supplier/reason registries, the `returns` state machine, batch operations, soft-delete, and a minimal usable UI — on Next.js + Supabase, backed by tests at every layer.

**Architecture:** Next.js App Router (single repo) talks to Supabase Postgres through Route Handlers using `@supabase/ssr`. State-machine safety lives in the database: a `BEFORE UPDATE` trigger rejects invalid `returns.status` transitions no matter who issues the `UPDATE`, and `SECURITY DEFINER` RPC functions are the sanctioned path for every state-changing or batch operation, using the `UPDATE ... WHERE status = :expected` pattern for safe concurrent batch actions.

**Tech Stack:** Next.js (App Router, TypeScript) via `create-next-app@latest` — resolved to Next.js 16 / React 19 / Tailwind v4 (CSS-first config, no `tailwind.config.ts`) as of Task 1's execution on 2026-07-02; accepted as-is rather than pinned to an older major, since no task's code depends on Tailwind v3-only config or Next 14-only APIs. shadcn/ui initialized explicitly with `-b radix --preset nova` (the CLI's own `-d` default is now Base UI, not Radix — Radix was chosen to match what the rest of this plan assumes). Supabase (Postgres, Auth, CLI for local dev), `@supabase/ssr`, `@supabase/supabase-js`, Vitest + jsdom, pgTAP, Playwright.

## Global Constraints

- Config file names follow whatever `create-next-app`/`shadcn` actually generate (`next.config.ts`, `postcss.config.mjs`, no `tailwind.config.ts`) — later tasks should not assume the exact file names originally listed in Task 1, only the tools/behavior they provide.
- shadcn's `form` component isn't installable (empty in the current upstream registry, both Radix and Base UI styles) — no task in this plan uses it; forms are hand-rolled with plain state (see Task 13), so this doesn't block anything.
- **UI/UX (mandatory):** every task that creates or modifies user-facing UI (Tasks 8 login page, 13, 14, 15, 16, 20 — and any future UI change) MUST invoke the `ui-ux-pro-max` skill via the Skill tool BEFORE writing any UI code, and follow the design direction it produces (style, color palette, typography, spacing, interaction states, UX guidelines). The first UI task establishes the design system in `docs/design-system.md`; subsequent UI tasks read that file and stay consistent with it instead of re-deriving a new style. Skipping the skill invocation is a spec violation, not a style preference.
- Supabase provides only Postgres/Auth/Realtime — no file storage there (project uses R2, out of scope for Fase 1, which has no `files` table).
- Frontend + API deploy target is Vercel, free tier.
- `returns.status` transitions are enforced in the database (trigger), never only in the UI.
- Batch status changes must use `UPDATE ... WHERE id = ANY(:ids) AND status = :expected` — never a separate read-then-write.
- `nf`/`nfd` are nullable columns; only `fn_confirmar_rascunho` enforces `nf IS NOT NULL` before leaving `rascunho`.
- Duplicate detection (`nf` + `supplier_id`) is app-level (non-unique index + API query), never a hard unique constraint — user must be able to confirm past a warning.
- RLS in this phase is a documented placeholder ("authenticated full access"), not the final per-role policy (that's Fase 4) — every migration that adds it must comment this explicitly.
- Delete is soft, never a hard `DELETE` from the app layer: `returns.deleted_at` / `delete_reason` / `deleted_by`. No separate `trash` table. `GET /api/returns` always filters `deleted_at is null`; the lixeira view is `deleted_at is not null` on the same table.
- `feature_flags(key, enabled, description)` is seeded in this phase even though nothing in Fase 1 reads it yet — Fase 2/3 flags (`confirmacao_chegada_filial`, `assinatura_baixa`, `roteirizacao_coleta`, `batch_mode`) must not be born without a row to gate on.
- Login supports both Google OAuth (primary, matches current Apps Script users) and email/password (fallback, and the path used by local dev/E2E since Google OAuth needs real provider credentials not available in local Supabase).
- DANFE barcode/QR scan (Task 20) only ever fills `nf` + `supplier_id` in the lançamento form — the scanned chave de acesso is not persisted as its own column, and duplicate-check keeps using `nf`+`supplier_id` exactly as before. Scan and XML upload (Task 9) are complementary input paths into the same form, never a second source of truth.

---

### Task 1: Project scaffold (Next.js, TypeScript, Tailwind, shadcn/ui) — DONE (2026-07-02, commit `1a77f61`)

**Files (as actually generated — see Global Constraints/Tech Stack note on version acceptance):**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `.gitignore`, `.env.local.example` (no `tailwind.config.ts` — Tailwind v4 is CSS-first, configured in `app/globals.css`)
- Create: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Create: `components.json` (shadcn/ui config, `style: radix-nova`)
- Create: `lib/utils.ts` (shadcn `cn` helper)

**Interfaces:**
- Produces: `cn(...)` utility from `lib/utils.ts`, used by every shadcn component in later tasks.

- [ ] **Step 1: Scaffold the Next.js app**

Run:
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm --no-turbopack
```
When prompted about a non-empty directory, confirm proceeding (the plan/spec docs and `.git` already exist there).

- [ ] **Step 2: Verify the dev server boots**

Run: `npm run dev -- --port 3100 &` then `curl -s -o /dev/null -w "%{http_code}" http://localhost:3100`
Expected: `200`. Stop the dev server afterward (`kill %1`).

- [ ] **Step 3: Initialize shadcn/ui**

Run:
```bash
npx shadcn@latest init -d
npx shadcn@latest add button input label table dialog tabs form badge textarea select card
```
This creates `components.json`, `lib/utils.ts`, and `components/ui/*.tsx`.

- [ ] **Step 4: Add project dependencies used by later tasks**

Run:
```bash
npm install @supabase/supabase-js @supabase/ssr zod react-hook-form @hookform/resolvers
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @playwright/test
```

- [ ] **Step 5: Add `.env.local.example`**

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-with-local-anon-key
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.mjs tailwind.config.ts postcss.config.js .gitignore .env.local.example components.json lib/utils.ts components/ui app
git commit -m "chore: scaffold Next.js app with Tailwind and shadcn/ui"
```

---

### Task 2: Supabase local project init

**Files:**
- Create: `supabase/config.toml` (generated by CLI)
- Modify: `package.json` (add `db:*` scripts)

**Interfaces:**
- Produces: `supabase/migrations/` directory that Task 3+ append files to; `npm run db:reset` command used by every later migration task to apply migrations locally.

- [ ] **Step 1: Install Supabase CLI and init**

Run:
```bash
npm install -D supabase
npx supabase init
```
Expected: creates `supabase/config.toml`, `supabase/.gitignore`, `supabase/seed.sql`.

- [ ] **Step 2: Start local Supabase**

Run: `npx supabase start`
Expected: prints local `API URL`, `anon key`, `service_role key`. Copy the anon key into `.env.local` (create from `.env.local.example`, not committed).

- [ ] **Step 3: Add npm scripts**

In `package.json` `"scripts"`:
```json
"db:start": "supabase start",
"db:reset": "supabase db reset",
"db:diff": "supabase db diff -f",
"test:db": "supabase test db"
```

- [ ] **Step 4: Verify reset works with an empty migrations folder**

Run: `npm run db:reset`
Expected: exits `0` (no migrations yet, just resets to empty schema).

- [ ] **Step 5: Commit**

```bash
git add supabase/config.toml supabase/seed.sql package.json
git commit -m "chore: initialize local Supabase project"
```

---

### Task 3: Core reference tables — `suppliers`, `return_reasons`, `feature_flags`

**Files:**
- Create: `supabase/migrations/0001_core_reference_tables.sql`
- Test: `supabase/tests/0001_core_reference_tables.test.sql`

**Interfaces:**
- Produces: tables `suppliers(id, name, is_key_account, cnpj, contact_emails, created_at)`, `return_reasons(id, supplier_id, label, active)`, `feature_flags(key, enabled, description)` — consumed by every task from Task 4 onward (`feature_flags` has no reader yet in Fase 1; it exists so Fase 2/3 flags aren't born without a row).

- [ ] **Step 1: Write the migration**

`supabase/migrations/0001_core_reference_tables.sql`:
```sql
create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_key_account boolean not null default false,
  cnpj text,
  contact_emails text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table return_reasons (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references suppliers(id),
  label text not null,
  active boolean not null default true
);

create table feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text
);

insert into feature_flags (key, description) values
  ('confirmacao_chegada_filial', 'Fase 2: confirmação de chegada na filial'),
  ('assinatura_baixa', 'Fase 2: assinatura na baixa'),
  ('roteirizacao_coleta', 'Fase 2: roteirização de coleta'),
  ('batch_mode', 'Fase 3: e-mail de alerta sempre em lote, nunca item a item'),
  ('email_devolucao_programada', 'Fase 3: e-mail de devolução programada');
```

- [ ] **Step 2: Write the pgTAP test**

`supabase/tests/0001_core_reference_tables.test.sql`:
```sql
begin;
select plan(6);

select has_table('suppliers');
select has_table('return_reasons');
select has_table('feature_flags');
select col_is_pk('suppliers', 'id');
select col_is_fk('return_reasons', 'supplier_id');
select col_is_pk('feature_flags', 'key');

select * from finish();
rollback;
```

- [ ] **Step 3: Apply and run the test**

Run: `npm run db:reset && npm run test:db`
Expected: `6/6` tests pass.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_core_reference_tables.sql supabase/tests/0001_core_reference_tables.test.sql
git commit -m "feat(db): add suppliers, return_reasons, feature_flags tables"
```

---

### Task 4: `returns` table

**Files:**
- Create: `supabase/migrations/0002_returns.sql`
- Test: `supabase/tests/0002_returns.test.sql`

**Interfaces:**
- Consumes: `suppliers(id)`, `return_reasons(id)` from Task 3.
- Produces: table `returns(id, nf, nfd, supplier_id, type, reason_id, motivo_detalhe, descricao, qtd, valor_unitario, valor_total, status, data_entrada, responsavel, priority, origin_row_ref, resolved_at, deleted_at, delete_reason, deleted_by, created_by, created_at, updated_at)` and index `idx_returns_nf_supplier` — consumed by every task from Task 5 onward. Soft-delete lives on this table (`deleted_at`/`delete_reason`/`deleted_by`); there is no separate `trash` table.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0002_returns.sql`:
```sql
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
```

- [ ] **Step 2: Write the pgTAP test**

`supabase/tests/0002_returns.test.sql`:
```sql
begin;
select plan(5);

select has_table('returns');
select has_column('returns', 'valor_total');
select col_is_null('returns', 'nf');
select col_default_is('returns', 'status', 'rascunho');

insert into suppliers (name) values ('Fornecedor Teste');
insert into returns (supplier_id, type, qtd, valor_unitario)
  select id, 'avaria', 10, 5.5 from suppliers where name = 'Fornecedor Teste';
select is(
  (select valor_total from returns limit 1),
  55.0::numeric,
  'valor_total is computed as qtd * valor_unitario'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Apply and run the test**

Run: `npm run db:reset && npm run test:db`
Expected: `5/5` tests pass.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_returns.sql supabase/tests/0002_returns.test.sql
git commit -m "feat(db): add returns table with generated valor_total"
```

---

### Task 5: Status transition trigger

**Files:**
- Create: `supabase/migrations/0003_status_transition_trigger.sql`
- Test: `supabase/tests/0003_status_transition_trigger.test.sql`

**Interfaces:**
- Consumes: `returns(status, motivo_detalhe)` from Task 4.
- Produces: trigger function `fn_check_status_transition()` attached to `returns` — every later `UPDATE` (including RPCs in Task 6) passes through it.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0003_status_transition_trigger.sql`:
```sql
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
```

- [ ] **Step 2: Write the pgTAP test covering every valid and invalid pair**

`supabase/tests/0003_status_transition_trigger.test.sql`:
```sql
begin;
select plan(9);

insert into suppliers (name) values ('Fornecedor Trigger');

-- valid: rascunho -> pendente
insert into returns (supplier_id, type, qtd, valor_unitario, status)
  select id, 'avaria', 1, 1, 'rascunho' from suppliers where name = 'Fornecedor Trigger';
update returns set status = 'pendente' where status = 'rascunho';
select is((select status from returns limit 1), 'pendente', 'rascunho -> pendente allowed');

-- valid: pendente -> em_transferencia
update returns set status = 'em_transferencia' where status = 'pendente';
select is((select status from returns limit 1), 'em_transferencia', 'pendente -> em_transferencia allowed');

-- valid: em_transferencia -> devolvido
update returns set status = 'devolvido' where status = 'em_transferencia';
select is((select status from returns limit 1), 'devolvido', 'em_transferencia -> devolvido allowed');

-- valid: devolvido -> pendente with motivo
update returns set status = 'pendente', motivo_detalhe = 'reaberto por engano' where status = 'devolvido';
select is((select status from returns limit 1), 'pendente', 'devolvido -> pendente allowed with motivo');

-- invalid: devolvido -> pendente without motivo
update returns set status = 'devolvido', motivo_detalhe = null where status = 'pendente';
select throws_ok(
  $$ update returns set status = 'pendente', motivo_detalhe = null where status = 'devolvido' $$,
  'P0001', 'reabertura exige motivo_detalhe preenchido',
  'devolvido -> pendente without motivo rejected'
);

-- invalid: rascunho -> devolvido (skips machine)
update returns set status = 'rascunho', motivo_detalhe = null where status = 'devolvido';
select throws_ok(
  $$ update returns set status = 'devolvido' where status = 'rascunho' $$,
  'P0001', null,
  'rascunho -> devolvido rejected'
);

-- invalid: pendente -> rascunho (backwards)
update returns set status = 'pendente' where status = 'rascunho';
select throws_ok(
  $$ update returns set status = 'rascunho' where status = 'pendente' $$,
  'P0001', null,
  'pendente -> rascunho rejected'
);

-- valid: pendente -> venda
select lives_ok(
  $$ update returns set status = 'venda' where status = 'pendente' $$,
  'pendente -> venda allowed'
);

-- invalid: venda -> em_transferencia
select throws_ok(
  $$ update returns set status = 'em_transferencia' where status = 'venda' $$,
  'P0001', null,
  'venda -> em_transferencia rejected'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Apply and run the test**

Run: `npm run db:reset && npm run test:db`
Expected: `9/9` tests pass.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0003_status_transition_trigger.sql supabase/tests/0003_status_transition_trigger.test.sql
git commit -m "feat(db): enforce returns status machine via trigger"
```

---

### Task 6: RPC functions for state changes and batch operations

**Files:**
- Create: `supabase/migrations/0004_rpc_functions.sql`
- Test: `supabase/tests/0004_rpc_functions.test.sql`

**Interfaces:**
- Consumes: `returns` (Task 4), trigger from Task 5.
- Produces: `fn_confirmar_rascunho(p_id uuid) returns returns`, `fn_dar_baixa_venda(p_ids uuid[]) returns setof uuid`, `fn_reabrir(p_ids uuid[], p_motivo text) returns setof uuid`, `fn_excluir(p_id uuid, p_motivo text) returns void` (soft-delete: sets `deleted_at`/`delete_reason`/`deleted_by`, never deletes the row), `fn_restaurar(p_id uuid) returns returns` (clears the soft-delete fields, sets status back to `pendente`) — consumed by API routes in Task 11 and 12.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0004_rpc_functions.sql`:
```sql
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
```

- [ ] **Step 2: Write the pgTAP test, including concurrent-batch and delete-guard cases**

`supabase/tests/0004_rpc_functions.test.sql`:
```sql
begin;
select plan(11);

insert into suppliers (name) values ('Fornecedor RPC');

-- fn_confirmar_rascunho: missing nf raises
insert into returns (supplier_id, type, qtd, valor_unitario, status)
  select id, 'avaria', 1, 1, 'rascunho' from suppliers where name = 'Fornecedor RPC';
select throws_ok(
  $$ select fn_confirmar_rascunho(id) from returns where status = 'rascunho' limit 1 $$,
  'P0001', null,
  'fn_confirmar_rascunho rejects missing nf'
);

update returns set nf = '1001' where status = 'rascunho';
select lives_ok(
  $$ select fn_confirmar_rascunho(id) from returns where status = 'rascunho' limit 1 $$,
  'fn_confirmar_rascunho succeeds once nf is set'
);
select is((select status from returns where nf = '1001'), 'pendente', 'status is pendente after confirm');

-- fn_dar_baixa_venda: batch, only pendente rows affected
insert into returns (supplier_id, type, qtd, valor_unitario, status, nf)
  select id, 'falta', 2, 3, 'pendente', '1002' from suppliers where name = 'Fornecedor RPC';
insert into returns (supplier_id, type, qtd, valor_unitario, status, nf)
  select id, 'falta', 2, 3, 'em_transferencia', '1003' from suppliers where name = 'Fornecedor RPC';

select results_eq(
  $$ select fn_dar_baixa_venda(array(select id from returns where nf in ('1002','1003')))::text $$,
  $$ select id::text from returns where nf = '1002' $$,
  'fn_dar_baixa_venda only affects the pendente row, ignoring the em_transferencia one'
);

-- fn_reabrir: batch reopen with motivo
select lives_ok(
  $$ select fn_reabrir(array(select id from returns where nf = '1002'), 'erro de digitação') $$,
  'fn_reabrir succeeds with motivo'
);
select is((select motivo_detalhe from returns where nf = '1002'), 'erro de digitação', 'motivo_detalhe recorded');

-- fn_excluir: guarded to pendente only
insert into returns (supplier_id, type, qtd, valor_unitario, status, nf)
  select id, 'falta', 1, 1, 'venda', '1004' from suppliers where name = 'Fornecedor RPC';
select throws_ok(
  $$ select fn_excluir(id, 'teste') from returns where nf = '1004' $$,
  'P0001', null,
  'fn_excluir refuses a non-pendente return'
);

-- fn_excluir: soft-deletes a pendente row (no hard delete, no trash table)
insert into returns (supplier_id, type, qtd, valor_unitario, status, nf)
  select id, 'falta', 1, 1, 'pendente', '1005' from suppliers where name = 'Fornecedor RPC';
select lives_ok(
  $$ select fn_excluir(id, 'lançado por engano') from returns where nf = '1005' $$,
  'fn_excluir succeeds on a pendente row'
);
select is(
  (select deleted_at is not null and delete_reason = 'lançado por engano' from returns where nf = '1005'),
  true,
  'fn_excluir sets deleted_at and delete_reason instead of removing the row'
);

-- fn_restaurar: clears soft-delete fields and reopens as pendente
select lives_ok(
  $$ select fn_restaurar(id) from returns where nf = '1005' $$,
  'fn_restaurar succeeds on a soft-deleted row'
);
select is(
  (select (deleted_at is null and status = 'pendente') from returns where nf = '1005'),
  true,
  'fn_restaurar clears deleted_at and resets status to pendente'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Apply and run the test**

Run: `npm run db:reset && npm run test:db`
Expected: `11/11` tests pass.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0004_rpc_functions.sql supabase/tests/0004_rpc_functions.test.sql
git commit -m "feat(db): add RPC functions for confirm/venda/reabrir/excluir/restaurar (soft-delete)"
```

---

### Task 7: RLS placeholder policies

**Files:**
- Create: `supabase/migrations/0005_rls_placeholder.sql`
- Test: `supabase/tests/0005_rls_placeholder.test.sql`

**Interfaces:**
- Consumes: `suppliers`, `return_reasons`, `returns`, `feature_flags` (Tasks 3-4).
- Produces: RLS enabled with an "authenticated full access" placeholder policy per table, replaced by real per-role policies in Fase 4.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0005_rls_placeholder.sql`:
```sql
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
```

- [ ] **Step 2: Write the pgTAP test**

`supabase/tests/0005_rls_placeholder.test.sql`:
```sql
begin;
select plan(4);

select is(
  (select relrowsecurity from pg_class where relname = 'suppliers'),
  true, 'RLS enabled on suppliers'
);
select is(
  (select relrowsecurity from pg_class where relname = 'returns'),
  true, 'RLS enabled on returns'
);
select policies_are('suppliers', array['fase1_authenticated_full_access']);
select policies_are('returns', array['fase1_authenticated_full_access']);

select * from finish();
rollback;
```

- [ ] **Step 3: Apply and run the test**

Run: `npm run db:reset && npm run test:db`
Expected: `4/4` tests pass.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0005_rls_placeholder.sql supabase/tests/0005_rls_placeholder.test.sql
git commit -m "feat(db): enable placeholder RLS (authenticated full access)"
```

---

### Task 8: Supabase client helpers, auth middleware, login page (Google OAuth + password)

**Files:**
- Create: `lib/supabase/server.ts`, `lib/supabase/client.ts`
- Create: `middleware.ts`
- Create: `app/login/page.tsx`
- Create: `app/auth/callback/route.ts`
- Test: `tests/unit/supabase-clients.test.ts`

**Interfaces:**
- Produces: `createClient()` (server, from `lib/supabase/server.ts`) and `createClient()` (browser, from `lib/supabase/client.ts`) — consumed by every API route (Tasks 10-12) and every client component (Tasks 13-16).
- Login supports two paths: Google OAuth (primary — matches how current Apps Script users already authenticate) and email/password (fallback; also the only path usable in local dev/E2E, since local Supabase has no real Google OAuth credentials configured). Enabling the Google provider for a hosted project is a Supabase dashboard/`config.toml` `[auth.external.google]` step, not covered by this task's automated tests.

- [ ] **Step 1: Write the server client**

`lib/supabase/server.ts`:
```typescript
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // set from a Server Component; middleware refreshes the session
          }
        },
      },
    }
  );
}
```

- [ ] **Step 2: Write the browser client**

`lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 3: Write the auth middleware**

`middleware.ts` (repo root):
```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 4: Write the login page (Google OAuth primary, password fallback)**

`app/login/page.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGoogleLogin() {
    setError(null);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (oauthError) setError(oauthError.message);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push('/returns');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-4 rounded-lg border p-6">
        <h1 className="text-lg font-semibold">Entrar</h1>

        <Button type="button" variant="outline" className="w-full" onClick={handleGoogleLogin}>
          Entrar com Google
        </Button>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          ou com senha
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write the OAuth callback route**

`app/auth/callback/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/returns`);
}
```

- [ ] **Step 6: Write a smoke test confirming both clients construct without throwing**

`tests/unit/supabase-clients.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
});

describe('supabase browser client', () => {
  it('constructs without throwing', async () => {
    const { createClient } = await import('@/lib/supabase/client');
    expect(() => createClient()).not.toThrow();
  });
});
```

- [ ] **Step 7: Run the test**

Run: `npx vitest run tests/unit/supabase-clients.test.ts`
Expected: `1 passed`.

- [ ] **Step 8: Commit**

```bash
git add lib/supabase middleware.ts app/login app/auth/callback tests/unit/supabase-clients.test.ts
git commit -m "feat(auth): add Supabase clients, auth middleware, login (Google OAuth + password)"
```

---

### Task 9: NF-e XML parser

**Files:**
- Create: `lib/xml-parser.ts`
- Test: `tests/unit/xml-parser.test.ts`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `parseNFeXml(xmlString: string): ParsedNFe` where `ParsedNFe = { nf: string; supplierName: string; descricao: string; qtd: number; valorUnitario: number; valorTotal: number }` — consumed by the lançamento UI in Task 13.

- [ ] **Step 1: Write the Vitest config (jsdom environment, needed for DOMParser)**

`vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
```

- [ ] **Step 2: Write the parser**

`lib/xml-parser.ts`:
```typescript
export interface ParsedNFe {
  nf: string;
  supplierName: string;
  descricao: string;
  qtd: number;
  valorUnitario: number;
  valorTotal: number;
}

export function parseNFeXml(xmlString: string): ParsedNFe {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  if (doc.querySelector('parsererror')) {
    throw new Error('XML inválido: não foi possível interpretar o arquivo.');
  }

  const nNF = doc.querySelector('ide > nNF')?.textContent;
  const xNome = doc.querySelector('emit > xNome')?.textContent;
  const firstProd = doc.querySelector('det > prod');
  const xProd = firstProd?.querySelector('xProd')?.textContent;
  const qCom = firstProd?.querySelector('qCom')?.textContent;
  const vUnCom = firstProd?.querySelector('vUnCom')?.textContent;
  const vNF = doc.querySelector('total > ICMSTot > vNF')?.textContent;

  if (!nNF || !xNome || !xProd || !qCom || !vUnCom) {
    throw new Error(
      'XML da NF-e não contém todos os campos esperados (nNF, xNome, xProd, qCom, vUnCom).'
    );
  }

  const qtd = parseFloat(qCom);
  const valorUnitario = parseFloat(vUnCom);

  return {
    nf: nNF,
    supplierName: xNome,
    descricao: xProd,
    qtd,
    valorUnitario,
    valorTotal: vNF ? parseFloat(vNF) : qtd * valorUnitario,
  };
}
```

- [ ] **Step 3: Write the failing test first**

`tests/unit/xml-parser.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { parseNFeXml } from '@/lib/xml-parser';

const SAMPLE_NFE = `<?xml version="1.0"?>
<nfeProc>
  <NFe><infNFe>
    <ide><nNF>123456</nNF></ide>
    <emit><xNome>Fornecedor Exemplo Ltda</xNome></emit>
    <det nItem="1">
      <prod>
        <xProd>Produto de Teste</xProd>
        <qCom>10.0000</qCom>
        <vUnCom>25.50</vUnCom>
      </prod>
    </det>
    <total><ICMSTot><vNF>255.00</vNF></ICMSTot></total>
  </infNFe></NFe>
</nfeProc>`;

describe('parseNFeXml', () => {
  it('extracts nf, supplier, product and values from a valid NF-e XML', () => {
    const result = parseNFeXml(SAMPLE_NFE);
    expect(result).toEqual({
      nf: '123456',
      supplierName: 'Fornecedor Exemplo Ltda',
      descricao: 'Produto de Teste',
      qtd: 10,
      valorUnitario: 25.5,
      valorTotal: 255,
    });
  });

  it('throws on malformed XML', () => {
    expect(() => parseNFeXml('<not-valid')).toThrow('XML inválido');
  });

  it('throws when required fields are missing', () => {
    expect(() => parseNFeXml('<nfeProc><NFe><infNFe><ide></ide></infNFe></NFe></nfeProc>')).toThrow(
      'não contém todos os campos'
    );
  });
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/xml-parser.test.ts`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts lib/xml-parser.ts tests/unit/xml-parser.test.ts
git commit -m "feat: add NF-e XML parser with unit tests"
```

---

### Task 10: Shared types + API routes for `suppliers` and `return_reasons`

**Files:**
- Create: `lib/types.ts`
- Create: `app/api/suppliers/route.ts`
- Create: `app/api/return-reasons/route.ts`
- Test: `tests/unit/api-validation.test.ts`

**Interfaces:**
- Produces: `Supplier`, `ReturnReason`, `ReturnRecord`, `ReturnStatus`, `ReturnType` types from `lib/types.ts` — consumed by all remaining API and UI tasks. `ReturnRecord` carries the soft-delete fields (`deleted_at`, `delete_reason`, `deleted_by`) directly; there is no separate `TrashEntry` type, since there is no separate `trash` table. Produces `validateSupplierPayload`, `validateReturnReasonPayload` exported from the route files' shared validation module, consumed by their own tests.

- [ ] **Step 1: Write shared types**

`lib/types.ts`:
```typescript
export type ReturnStatus = 'rascunho' | 'pendente' | 'em_transferencia' | 'devolvido' | 'venda';
export type ReturnType = 'avaria' | 'falta' | 'rejeicao';

export interface Supplier {
  id: string;
  name: string;
  is_key_account: boolean;
  cnpj: string | null;
  contact_emails: string[];
  created_at: string;
}

export interface ReturnReason {
  id: string;
  supplier_id: string | null;
  label: string;
  active: boolean;
}

export interface ReturnRecord {
  id: string;
  nf: string | null;
  nfd: string | null;
  supplier_id: string;
  type: ReturnType;
  reason_id: string | null;
  motivo_detalhe: string | null;
  descricao: string | null;
  qtd: number;
  valor_unitario: number;
  valor_total: number;
  status: ReturnStatus;
  data_entrada: string;
  responsavel: string | null;
  priority: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
  deleted_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Write the validation schemas module**

`lib/validation.ts`:
```typescript
import { z } from 'zod';

export const supplierSchema = z.object({
  name: z.string().min(1, 'name é obrigatório'),
  is_key_account: z.boolean().optional().default(false),
  cnpj: z.string().nullable().optional(),
  contact_emails: z.array(z.string().email()).optional().default([]),
});

export const returnReasonSchema = z.object({
  supplier_id: z.string().uuid().nullable().optional(),
  label: z.string().min(1, 'label é obrigatório'),
  active: z.boolean().optional().default(true),
});
```

- [ ] **Step 3: Write the suppliers route**

`app/api/suppliers/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supplierSchema } from '@/lib/validation';

export async function GET() {
  const supabase = createClient();
  const { data, error } = await supabase.from('suppliers').select('*').order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = supplierSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase.from('suppliers').insert(parsed.data).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 4: Write the return-reasons route**

`app/api/return-reasons/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { returnReasonSchema } from '@/lib/validation';

export async function GET(request: NextRequest) {
  const supplierId = new URL(request.url).searchParams.get('supplier_id');
  const supabase = createClient();

  let query = supabase.from('return_reasons').select('*').eq('active', true);
  query = supplierId ? query.or(`supplier_id.eq.${supplierId},supplier_id.is.null`) : query;

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = returnReasonSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase.from('return_reasons').insert(parsed.data).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 5: Write validation unit tests**

`tests/unit/api-validation.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { supplierSchema, returnReasonSchema } from '@/lib/validation';

describe('supplierSchema', () => {
  it('rejects a missing name', () => {
    const result = supplierSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts a minimal valid payload and fills defaults', () => {
    const result = supplierSchema.parse({ name: 'Fornecedor X' });
    expect(result).toEqual({ name: 'Fornecedor X', is_key_account: false, contact_emails: [] });
  });
});

describe('returnReasonSchema', () => {
  it('rejects a missing label', () => {
    expect(returnReasonSchema.safeParse({ supplier_id: null }).success).toBe(false);
  });

  it('accepts a generic reason with null supplier_id', () => {
    const result = returnReasonSchema.parse({ supplier_id: null, label: 'Avaria genérica' });
    expect(result.active).toBe(true);
  });
});
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/unit/api-validation.test.ts`
Expected: `4 passed`.

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts lib/validation.ts app/api/suppliers app/api/return-reasons tests/unit/api-validation.test.ts
git commit -m "feat(api): add suppliers and return-reasons CRUD routes"
```

---

### Task 11: `returns` list/create/get/patch + duplicate check API

**Files:**
- Create: `app/api/returns/route.ts`
- Create: `app/api/returns/[id]/route.ts`
- Create: `app/api/returns/check-duplicate/route.ts`
- Modify: `lib/validation.ts` (add `returnCreateSchema`, `returnPatchSchema`)
- Test: `tests/unit/api-validation.test.ts` (append)

**Interfaces:**
- Consumes: `ReturnRecord` type (Task 10), Supabase server client (Task 8).
- Produces: `GET/POST /api/returns`, `GET/PATCH /api/returns/:id`, `GET /api/returns/check-duplicate` — consumed by the lançamento and lista UI (Tasks 13-14). `GET /api/returns` always filters `deleted_at is null`; soft-deleted rows only ever surface through `/api/trash` (Task 12).

- [ ] **Step 1: Add schemas to `lib/validation.ts`**

Append to `lib/validation.ts`:
```typescript
export const returnCreateSchema = z.object({
  nf: z.string().nullable().optional(),
  nfd: z.string().nullable().optional(),
  supplier_id: z.string().uuid(),
  type: z.enum(['avaria', 'falta', 'rejeicao']),
  reason_id: z.string().uuid().nullable().optional(),
  motivo_detalhe: z.string().nullable().optional(),
  descricao: z.string().nullable().optional(),
  qtd: z.number().positive(),
  valor_unitario: z.number().positive(),
  status: z.enum(['rascunho', 'pendente']).optional().default('pendente'),
});

export const returnPatchSchema = returnCreateSchema.partial().omit({ status: true });
```

- [ ] **Step 2: Write the collection route**

`app/api/returns/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { returnCreateSchema } from '@/lib/validation';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const supplierId = searchParams.get('supplier_id');

  const supabase = createClient();
  let query = supabase
    .from('returns')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  if (supplierId) query = query.eq('supplier_id', supplierId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = returnCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('returns')
    .insert({ ...parsed.data, responsavel: user?.id ?? null, created_by: user?.id ?? null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 3: Write the single-resource route**

`app/api/returns/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { returnPatchSchema } from '@/lib/validation';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data, error } = await supabase.from('returns').select('*').eq('id', params.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json();
  const parsed = returnPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('returns')
    .update(parsed.data)
    .eq('id', params.id)
    .in('status', ['rascunho', 'pendente'])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { error: 'devolução não encontrada ou não editável no status atual' },
      { status: 409 }
    );
  }
  return NextResponse.json(data);
}
```

- [ ] **Step 4: Write the duplicate-check route**

`app/api/returns/check-duplicate/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const nf = searchParams.get('nf');
  const supplierId = searchParams.get('supplier_id');

  if (!nf || !supplierId) {
    return NextResponse.json({ error: 'nf e supplier_id são obrigatórios' }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('returns')
    .select('id, status')
    .eq('nf', nf)
    .eq('supplier_id', supplierId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ duplicate: (data?.length ?? 0) > 0, matches: data });
}
```

- [ ] **Step 5: Append schema tests to `tests/unit/api-validation.test.ts`**

```typescript
import { returnCreateSchema } from '@/lib/validation';

describe('returnCreateSchema', () => {
  it('requires a valid supplier_id and positive qtd/valor_unitario', () => {
    expect(
      returnCreateSchema.safeParse({ supplier_id: 'not-a-uuid', type: 'avaria', qtd: 1, valor_unitario: 1 })
        .success
    ).toBe(false);
  });

  it('allows nf to be omitted for a rascunho', () => {
    const result = returnCreateSchema.parse({
      supplier_id: '123e4567-e89b-12d3-a456-426614174000',
      type: 'avaria',
      qtd: 1,
      valor_unitario: 1,
      status: 'rascunho',
    });
    expect(result.nf).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/unit/api-validation.test.ts`
Expected: `6 passed`.

- [ ] **Step 7: Commit**

```bash
git add lib/validation.ts app/api/returns/route.ts app/api/returns/[id]/route.ts app/api/returns/check-duplicate tests/unit/api-validation.test.ts
git commit -m "feat(api): add returns CRUD and duplicate-check routes"
```

---

### Task 12: State-changing `returns` API + `trash` API

**Files:**
- Create: `app/api/returns/[id]/confirmar/route.ts`
- Create: `app/api/returns/batch/venda/route.ts`
- Create: `app/api/returns/batch/reabrir/route.ts`
- Modify: `app/api/returns/[id]/route.ts` (add `DELETE`)
- Create: `app/api/trash/route.ts`
- Create: `app/api/trash/[id]/restaurar/route.ts`

**Interfaces:**
- Consumes: RPC functions from Task 6 (`fn_confirmar_rascunho`, `fn_dar_baixa_venda`, `fn_reabrir`, `fn_excluir`, `fn_restaurar`), `ReturnRecord` type (Task 10).
- Produces: routes consumed by lançamento (Task 13), lista/batch UI (Task 14), lixeira UI (Task 15). `/api/trash` and its restaurar route read/write `returns.deleted_at` — there is no separate `trash` table.

- [ ] **Step 1: Write the confirmar route**

`app/api/returns/[id]/confirmar/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('fn_confirmar_rascunho', { p_id: params.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Write the batch venda route**

`app/api/returns/batch/venda/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const { ids } = await request.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids deve ser uma lista não vazia' }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('fn_dar_baixa_venda', { p_ids: ids });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const affected: string[] = data ?? [];
  return NextResponse.json({
    affected,
    ignored: ids.filter((id: string) => !affected.includes(id)),
  });
}
```

- [ ] **Step 3: Write the batch reabrir route**

`app/api/returns/batch/reabrir/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const { ids, motivo } = await request.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids deve ser uma lista não vazia' }, { status: 400 });
  }
  if (!motivo || typeof motivo !== 'string' || motivo.trim() === '') {
    return NextResponse.json({ error: 'motivo é obrigatório' }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('fn_reabrir', { p_ids: ids, p_motivo: motivo });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const affected: string[] = data ?? [];
  return NextResponse.json({
    affected,
    ignored: ids.filter((id: string) => !affected.includes(id)),
  });
}
```

- [ ] **Step 4: Add `DELETE` to `app/api/returns/[id]/route.ts`**

Append to the existing file:
```typescript
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { motivo } = await request.json();
  if (!motivo || typeof motivo !== 'string' || motivo.trim() === '') {
    return NextResponse.json({ error: 'motivo é obrigatório' }, { status: 400 });
  }

  const supabase = createClient();
  const { error } = await supabase.rpc('fn_excluir', { p_id: params.id, p_motivo: motivo });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Write the trash routes (backed by `returns.deleted_at`, no separate table)**

`app/api/trash/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('returns')
    .select('*')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

`app/api/trash/[id]/restaurar/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('fn_restaurar', { p_id: params.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
```

- [ ] **Step 6: Manual verification against local Supabase**

Run: `npm run db:start` (if not already running), then in a second terminal `npm run dev`, and:
```bash
curl -s -X POST http://localhost:3000/api/returns \
  -H "Content-Type: application/json" \
  -d '{"supplier_id":"<a real supplier id>","type":"avaria","qtd":1,"valor_unitario":10,"status":"rascunho"}'
```
Expected: `201` with a `rascunho` record. This is a manual smoke check — automated coverage of these flows comes from the Playwright suite in Task 17.

- [ ] **Step 7: Commit**

```bash
git add app/api/returns app/api/trash
git commit -m "feat(api): add confirmar/batch-venda/batch-reabrir/excluir and trash routes"
```

---

### Task 13: Lançamento UI (form, XML upload, rascunho tab, duplicate warning)

**Files:**
- Create: `components/returns/xml-upload.tsx`
- Create: `components/returns/return-form.tsx`
- Create: `components/returns/duplicate-warning-dialog.tsx`
- Create: `app/returns/new/page.tsx`

**Interfaces:**
- Consumes: `parseNFeXml` (Task 9), `Supplier`/`ReturnReason` types (Task 10), `/api/returns`, `/api/returns/check-duplicate`, `/api/suppliers`, `/api/return-reasons` (Tasks 10-11).
- Produces: page at `/returns/new`, linked from the lista UI in Task 14.

- [ ] **Step 1: Write the XML upload component**

`components/returns/xml-upload.tsx`:
```tsx
'use client';

import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { parseNFeXml, type ParsedNFe } from '@/lib/xml-parser';

export function XmlUpload({ onParsed }: { onParsed: (data: ParsedNFe) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    try {
      onParsed(parseNFeXml(text));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao ler o XML');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input ref={inputRef} type="file" accept=".xml" onChange={handleFile} className="hidden" id="xml-input" />
      <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
        Importar XML da NF-e
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Write the duplicate warning dialog**

`components/returns/duplicate-warning-dialog.tsx`:
```tsx
'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function DuplicateWarningDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>NF já lançada para este fornecedor</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Já existe uma devolução com esta NF para este fornecedor. Confirmar mesmo assim?
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button onClick={onConfirm}>Confirmar mesmo assim</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Write the return form component**

`components/returns/return-form.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { XmlUpload } from './xml-upload';
import { DuplicateWarningDialog } from './duplicate-warning-dialog';
import type { Supplier, ReturnReason, ReturnType } from '@/lib/types';

interface FormState {
  nf: string;
  supplier_id: string;
  type: ReturnType | '';
  reason_id: string;
  descricao: string;
  qtd: string;
  valor_unitario: string;
}

const EMPTY_FORM: FormState = { nf: '', supplier_id: '', type: '', reason_id: '', descricao: '', qtd: '', valor_unitario: '' };

export function ReturnForm() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [reasons, setReasons] = useState<ReturnReason[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/suppliers').then((r) => r.json()).then(setSuppliers);
  }, []);

  useEffect(() => {
    if (!form.supplier_id) return setReasons([]);
    fetch(`/api/return-reasons?supplier_id=${form.supplier_id}`).then((r) => r.json()).then(setReasons);
  }, [form.supplier_id]);

  function applyParsedXml(nf: string, descricao: string, qtd: number, valorUnitario: number) {
    setForm((f) => ({ ...f, nf, descricao, qtd: String(qtd), valor_unitario: String(valorUnitario) }));
  }

  async function submit(status: 'rascunho' | 'pendente') {
    setError(null);

    if (status === 'pendente' && form.nf && form.supplier_id) {
      const check = await fetch(
        `/api/returns/check-duplicate?nf=${encodeURIComponent(form.nf)}&supplier_id=${form.supplier_id}`
      ).then((r) => r.json());
      if (check.duplicate) {
        setShowDuplicate(true);
        return;
      }
    }

    await doSubmit(status);
  }

  async function doSubmit(status: 'rascunho' | 'pendente') {
    const res = await fetch('/api/returns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nf: form.nf || null,
        supplier_id: form.supplier_id,
        type: form.type || undefined,
        reason_id: form.reason_id || null,
        descricao: form.descricao || null,
        qtd: form.qtd ? Number(form.qtd) : undefined,
        valor_unitario: form.valor_unitario ? Number(form.valor_unitario) : undefined,
        status,
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error);
      return;
    }

    setShowDuplicate(false);
    router.push('/returns');
    router.refresh();
  }

  return (
    <div className="max-w-xl space-y-4">
      <XmlUpload onParsed={(p) => applyParsedXml(p.nf, p.descricao, p.qtd, p.valorUnitario)} />

      <div className="space-y-2">
        <Label htmlFor="nf">NF</Label>
        <Input id="nf" value={form.nf} onChange={(e) => setForm({ ...form, nf: e.target.value })} placeholder="Opcional em rascunho" />
      </div>

      <div className="space-y-2">
        <Label>Fornecedor</Label>
        <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
          <SelectTrigger><SelectValue placeholder="Selecione o fornecedor" /></SelectTrigger>
          <SelectContent>
            {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Tipo</Label>
        <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as ReturnType })}>
          <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="avaria">Avaria</SelectItem>
            <SelectItem value="falta">Falta</SelectItem>
            <SelectItem value="rejeicao">Rejeição</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Motivo</Label>
        <Select value={form.reason_id} onValueChange={(v) => setForm({ ...form, reason_id: v })}>
          <SelectTrigger><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
          <SelectContent>
            {reasons.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea id="descricao" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="qtd">Quantidade</Label>
          <Input id="qtd" type="number" value={form.qtd} onChange={(e) => setForm({ ...form, qtd: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="valor_unitario">Valor unitário</Label>
          <Input id="valor_unitario" type="number" step="0.01" value={form.valor_unitario} onChange={(e) => setForm({ ...form, valor_unitario: e.target.value })} />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => submit('rascunho')}>Salvar rascunho</Button>
        <Button type="button" onClick={() => submit('pendente')}>Confirmar lançamento</Button>
      </div>

      <DuplicateWarningDialog
        open={showDuplicate}
        onCancel={() => setShowDuplicate(false)}
        onConfirm={() => doSubmit('pendente')}
      />
    </div>
  );
}
```

- [ ] **Step 4: Write the page**

`app/returns/new/page.tsx`:
```tsx
import { ReturnForm } from '@/components/returns/return-form';

export default function NewReturnPage() {
  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Lançar devolução</h1>
      <ReturnForm />
    </div>
  );
}
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, open `http://localhost:3000/returns/new`, create one supplier via `/api/suppliers` (curl) beforehand, then fill and submit the form as both rascunho and confirmed lançamento.
Expected: both submissions redirect to `/returns` without console errors. Full automated coverage is added in Task 17 (Playwright).

- [ ] **Step 6: Commit**

```bash
git add components/returns/xml-upload.tsx components/returns/return-form.tsx components/returns/duplicate-warning-dialog.tsx app/returns/new
git commit -m "feat(ui): add lançamento page with XML upload and duplicate warning"
```

---

### Task 14: Lista de devoluções (table, filters, batch stepper)

**Files:**
- Create: `components/returns/returns-table.tsx`
- Create: `components/returns/batch-actions-stepper.tsx`
- Create: `app/returns/page.tsx`

**Interfaces:**
- Consumes: `ReturnRecord` type (Task 10), `/api/returns`, `/api/returns/batch/venda`, `/api/returns/batch/reabrir` (Tasks 11-12).
- Produces: page at `/returns`, the landing page after login (Task 8 middleware redirects here implicitly via the login page's `router.push`).

- [ ] **Step 1: Write the batch actions stepper**

`components/returns/batch-actions-stepper.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

type Step = 'selecao' | 'previa' | 'confirmacao';

export function BatchActionsStepper({
  action,
  selectedIds,
  onDone,
}: {
  action: 'venda' | 'reabrir';
  selectedIds: string[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('selecao');
  const [motivo, setMotivo] = useState('');
  const [result, setResult] = useState<{ affected: string[]; ignored: string[] } | null>(null);

  function start() {
    setStep('previa');
    setOpen(true);
  }

  async function confirm() {
    const res = await fetch(`/api/returns/batch/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action === 'reabrir' ? { ids: selectedIds, motivo } : { ids: selectedIds }),
    });
    const body = await res.json();
    setResult(body);
    setStep('confirmacao');
  }

  function close() {
    setOpen(false);
    setStep('selecao');
    setMotivo('');
    setResult(null);
    onDone();
  }

  return (
    <>
      <Button disabled={selectedIds.length === 0} onClick={start}>
        {action === 'venda' ? 'Dar baixa para venda' : 'Reabrir selecionados'}
      </Button>

      <Dialog open={open} onOpenChange={(v) => !v && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {step === 'previa' ? `Confirmar ação em ${selectedIds.length} item(ns)` : 'Resultado'}
            </DialogTitle>
          </DialogHeader>

          {step === 'previa' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Itens que não estiverem mais no status esperado serão ignorados automaticamente, não geram erro.
              </p>
              {action === 'reabrir' && (
                <Textarea placeholder="Motivo da reabertura" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              )}
              <DialogFooter>
                <Button variant="outline" onClick={close}>Cancelar</Button>
                <Button disabled={action === 'reabrir' && motivo.trim() === ''} onClick={confirm}>Confirmar</Button>
              </DialogFooter>
            </div>
          )}

          {step === 'confirmacao' && result && (
            <div className="space-y-2 text-sm">
              <p>{result.affected.length} item(ns) atualizado(s).</p>
              {result.ignored.length > 0 && <p>{result.ignored.length} item(ns) ignorado(s) (status já havia mudado).</p>}
              <DialogFooter>
                <Button onClick={close}>Fechar</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Write the returns table**

`components/returns/returns-table.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BatchActionsStepper } from './batch-actions-stepper';
import type { ReturnRecord, ReturnStatus } from '@/lib/types';

export function ReturnsTable() {
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReturnStatus | 'todos'>('todos');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function load() {
    const url = statusFilter === 'todos' ? '/api/returns' : `/api/returns?status=${statusFilter}`;
    const data = await fetch(url).then((r) => r.json());
    setReturns(data);
    setSelected(new Set());
  }

  useEffect(() => { load(); }, [statusFilter]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ReturnStatus | 'todos')}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="rascunho">Rascunho</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="em_transferencia">Em Transferência</SelectItem>
            <SelectItem value="devolvido">Devolvido</SelectItem>
            <SelectItem value="venda">Venda</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex gap-2">
          <BatchActionsStepper action="venda" selectedIds={[...selected]} onDone={load} />
          <BatchActionsStepper action="reabrir" selectedIds={[...selected]} onDone={load} />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead></TableHead>
            <TableHead>NF</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Qtd</TableHead>
            <TableHead>Valor total</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {returns.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
              </TableCell>
              <TableCell>{r.nf ?? '—'}</TableCell>
              <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
              <TableCell>{r.qtd}</TableCell>
              <TableCell>{r.valor_total}</TableCell>
              <TableCell><Link href={`/returns/${r.id}`} className="text-sm underline">Ver</Link></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 3: Write the page**

`app/returns/page.tsx`:
```tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ReturnsTable } from '@/components/returns/returns-table';

export default function ReturnsPage() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Devoluções</h1>
        <Link href="/returns/new"><Button>Nova devolução</Button></Link>
      </div>
      <ReturnsTable />
    </div>
  );
}
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open `http://localhost:3000/returns`, filter by status, select rows, run the "Dar baixa para venda" stepper end to end.
Expected: table refreshes after the stepper closes, reflecting new statuses. Automated coverage lands in Task 17.

- [ ] **Step 5: Commit**

```bash
git add components/returns/returns-table.tsx components/returns/batch-actions-stepper.tsx app/returns/page.tsx
git commit -m "feat(ui): add returns list with filters and batch action stepper"
```

---

### Task 15: Detalhe da NF + Lixeira pages

**Files:**
- Create: `app/returns/[id]/page.tsx`
- Create: `components/trash/trash-table.tsx`
- Create: `app/trash/page.tsx`

**Interfaces:**
- Consumes: `ReturnRecord` type (Task 10), `/api/returns/:id`, `/api/returns/:id` (DELETE), `/api/trash`, `/api/trash/:id/restaurar` (Tasks 11-12).

- [ ] **Step 1: Write the detail page**

`app/returns/[id]/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { ReturnRecord } from '@/lib/types';

export default function ReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [record, setRecord] = useState<ReturnRecord | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/returns/${id}`).then((r) => r.json()).then(setRecord);
  }, [id]);

  async function handleDelete() {
    const res = await fetch(`/api/returns/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error);
      return;
    }
    router.push('/returns');
  }

  if (!record) return <div className="p-6">Carregando...</div>;

  return (
    <div className="max-w-xl space-y-4 p-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">NF {record.nf ?? '(sem NF)'}</h1>
        <Badge variant="outline">{record.status}</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">NFD</dt><dd>{record.nfd ?? '—'}</dd>
        <dt className="text-muted-foreground">Tipo</dt><dd>{record.type}</dd>
        <dt className="text-muted-foreground">Descrição</dt><dd>{record.descricao ?? '—'}</dd>
        <dt className="text-muted-foreground">Quantidade</dt><dd>{record.qtd}</dd>
        <dt className="text-muted-foreground">Valor total</dt><dd>{record.valor_total}</dd>
      </dl>

      {record.status === 'pendente' && (
        <Button variant="destructive" onClick={() => setShowDelete(true)}>Excluir</Button>
      )}

      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir devolução</DialogTitle></DialogHeader>
          <Textarea placeholder="Motivo da exclusão" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={motivo.trim() === ''} onClick={handleDelete}>Confirmar exclusão</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Write the trash table component**

`components/trash/trash-table.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import type { ReturnRecord } from '@/lib/types';

export function TrashTable() {
  const [entries, setEntries] = useState<ReturnRecord[]>([]);

  async function load() {
    const data = await fetch('/api/trash').then((r) => r.json());
    setEntries(data);
  }

  useEffect(() => { load(); }, []);

  async function restore(id: string) {
    await fetch(`/api/trash/${id}/restaurar`, { method: 'POST' });
    load();
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>NF</TableHead>
          <TableHead>Motivo</TableHead>
          <TableHead>Excluído em</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((e) => (
          <TableRow key={e.id}>
            <TableCell>{e.nf ?? '—'}</TableCell>
            <TableCell>{e.delete_reason}</TableCell>
            <TableCell>{e.deleted_at ? new Date(e.deleted_at).toLocaleString('pt-BR') : '—'}</TableCell>
            <TableCell><Button size="sm" onClick={() => restore(e.id)}>Restaurar</Button></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 3: Write the trash page**

`app/trash/page.tsx`:
```tsx
import { TrashTable } from '@/components/trash/trash-table';

export default function TrashPage() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Lixeira</h1>
      <TrashTable />
    </div>
  );
}
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, delete a pendente return from its detail page, confirm it appears in `/trash`, restore it, confirm it reappears in `/returns` as pendente.

- [ ] **Step 5: Commit**

```bash
git add app/returns/[id] components/trash app/trash
git commit -m "feat(ui): add NF detail page and lixeira page"
```

---

### Task 16: Configurações — Fornecedores e Motivos de devolução

**Files:**
- Create: `components/settings/suppliers-crud.tsx`
- Create: `components/settings/reasons-crud.tsx`
- Create: `app/settings/suppliers/page.tsx`
- Create: `app/settings/reasons/page.tsx`

**Interfaces:**
- Consumes: `/api/suppliers`, `/api/return-reasons` (Task 10), `Supplier`/`ReturnReason` types (Task 10).

- [ ] **Step 1: Write the suppliers CRUD component**

`components/settings/suppliers-crud.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from '@/components/ui/table';
import type { Supplier } from '@/lib/types';

export function SuppliersCrud() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [name, setName] = useState('');

  async function load() {
    setSuppliers(await fetch('/api/suppliers').then((r) => r.json()));
  }

  useEffect(() => { load(); }, []);

  async function create() {
    if (!name.trim()) return;
    await fetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setName('');
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="Nome do fornecedor" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={create}>Adicionar</Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>CNPJ</TableHead></TableRow></TableHeader>
        <TableBody>
          {suppliers.map((s) => (
            <TableRow key={s.id}><TableCell>{s.name}</TableCell><TableCell>{s.cnpj ?? '—'}</TableCell></TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Write the reasons CRUD component**

`components/settings/reasons-crud.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from '@/components/ui/table';
import type { ReturnReason } from '@/lib/types';

export function ReasonsCrud() {
  const [reasons, setReasons] = useState<ReturnReason[]>([]);
  const [label, setLabel] = useState('');

  async function load() {
    setReasons(await fetch('/api/return-reasons').then((r) => r.json()));
  }

  useEffect(() => { load(); }, []);

  async function create() {
    if (!label.trim()) return;
    await fetch('/api/return-reasons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, supplier_id: null }),
    });
    setLabel('');
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="Motivo (genérico)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button onClick={create}>Adicionar</Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Motivo</TableHead><TableHead>Escopo</TableHead></TableRow></TableHeader>
        <TableBody>
          {reasons.map((r) => (
            <TableRow key={r.id}><TableCell>{r.label}</TableCell><TableCell>{r.supplier_id ? 'específico' : 'genérico'}</TableCell></TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 3: Write the pages**

`app/settings/suppliers/page.tsx`:
```tsx
import { SuppliersCrud } from '@/components/settings/suppliers-crud';

export default function SuppliersSettingsPage() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Fornecedores</h1>
      <SuppliersCrud />
    </div>
  );
}
```

`app/settings/reasons/page.tsx`:
```tsx
import { ReasonsCrud } from '@/components/settings/reasons-crud';

export default function ReasonsSettingsPage() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Motivos de devolução</h1>
      <ReasonsCrud />
    </div>
  );
}
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open `/settings/suppliers` and `/settings/reasons`, create one of each, confirm the new supplier is selectable in `/returns/new`.

- [ ] **Step 5: Commit**

```bash
git add components/settings app/settings
git commit -m "feat(ui): add fornecedores and motivos settings pages"
```

---

### Task 17: Playwright E2E setup and flow tests

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/fixtures.ts`
- Create: `e2e/lancamento.spec.ts`
- Create: `e2e/lista-e-baixa.spec.ts`
- Create: `e2e/reabertura-exclusao.spec.ts`

**Interfaces:**
- Consumes: every page and API route from Tasks 8, 13-16 running against a local Supabase + `next dev` instance.

- [ ] **Step 1: Write the Playwright config**

`playwright.config.ts`:
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 2: Write a login fixture that seeds a test user and supplier**

`e2e/fixtures.ts`:
```typescript
import { test as base, expect } from '@playwright/test';

export const TEST_USER = { email: 'e2e@example.com', password: 'senha-teste-123' };

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.goto('/login');
    await page.getByLabel('E-mail').fill(TEST_USER.email);
    await page.getByLabel('Senha').fill(TEST_USER.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL('/returns');
    await use(page);
  },
});

export { expect };
```

Note: `TEST_USER` must be created ahead of time in the local Supabase instance (`supabase/seed.sql` inserts it via `auth.users`, or it is created once manually with `supabase auth admin`) — add this to `supabase/seed.sql` before running the suite.

- [ ] **Step 3: Write the lançamento flow test**

`e2e/lancamento.spec.ts`:
```typescript
import { test, expect } from './fixtures';

test('lança devolução individual e ela aparece na lista com status pendente', async ({ page }) => {
  await page.goto('/returns/new');
  await page.getByLabel('NF').fill('9001');
  await page.getByText('Selecione o fornecedor').click();
  await page.getByRole('option').first().click();
  await page.getByText('Selecione o tipo').click();
  await page.getByRole('option', { name: 'Avaria' }).click();
  await page.getByLabel('Quantidade').fill('5');
  await page.getByLabel('Valor unitário').fill('10');
  await page.getByRole('button', { name: 'Confirmar lançamento' }).click();

  await page.waitForURL('/returns');
  await expect(page.getByText('9001')).toBeVisible();
  await expect(page.getByText('pendente')).toBeVisible();
});

test('salva rascunho e depois confirma, virando pendente', async ({ page }) => {
  await page.goto('/returns/new');
  await page.getByText('Selecione o fornecedor').click();
  await page.getByRole('option').first().click();
  await page.getByText('Selecione o tipo').click();
  await page.getByRole('option', { name: 'Falta' }).click();
  await page.getByLabel('Quantidade').fill('1');
  await page.getByLabel('Valor unitário').fill('1');
  await page.getByRole('button', { name: 'Salvar rascunho' }).click();

  await page.waitForURL('/returns');
  await page.goto('/returns?status=rascunho');
  await expect(page.getByText('rascunho')).toBeVisible();
});
```

- [ ] **Step 4: Write the lista/baixa flow test**

`e2e/lista-e-baixa.spec.ts`:
```typescript
import { test, expect } from './fixtures';

test('duplicata avisa e permite confirmar mesmo assim', async ({ page }) => {
  const nf = `dup-${Date.now()}`;

  async function lancar() {
    await page.goto('/returns/new');
    await page.getByLabel('NF').fill(nf);
    await page.getByText('Selecione o fornecedor').click();
    await page.getByRole('option').first().click();
    await page.getByText('Selecione o tipo').click();
    await page.getByRole('option', { name: 'Avaria' }).click();
    await page.getByLabel('Quantidade').fill('1');
    await page.getByLabel('Valor unitário').fill('1');
    await page.getByRole('button', { name: 'Confirmar lançamento' }).click();
  }

  await lancar();
  await page.waitForURL('/returns');
  await lancar();

  await expect(page.getByText('NF já lançada para este fornecedor')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar mesmo assim' }).click();
  await page.waitForURL('/returns');
});

test('baixa em lote para venda muda o status dos itens selecionados', async ({ page }) => {
  await page.goto('/returns?status=pendente');
  const firstRow = page.locator('table tbody tr').first();
  await firstRow.locator('input[type=checkbox]').check();
  await page.getByRole('button', { name: 'Dar baixa para venda' }).click();
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText(/item\(ns\) atualizado/)).toBeVisible();
});
```

- [ ] **Step 5: Write the reabertura/exclusão flow test**

`e2e/reabertura-exclusao.spec.ts`:
```typescript
import { test, expect } from './fixtures';

test('reabertura sem motivo fica bloqueada, com motivo funciona', async ({ page }) => {
  await page.goto('/returns?status=venda');
  const firstRow = page.locator('table tbody tr').first();
  await firstRow.locator('input[type=checkbox]').check();
  await page.getByRole('button', { name: 'Reabrir selecionados' }).click();

  const confirmButton = page.getByRole('button', { name: 'Confirmar' });
  await expect(confirmButton).toBeDisabled();

  await page.getByPlaceholder('Motivo da reabertura').fill('Erro de digitação, reabrindo');
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();
  await expect(page.getByText(/item\(ns\) atualizado/)).toBeVisible();
});

test('excluir só disponível em pendente, vai para lixeira, e pode ser restaurado', async ({ page }) => {
  await page.goto('/returns?status=pendente');
  await page.locator('table tbody tr td:last-child a').first().click();

  await expect(page.getByRole('button', { name: 'Excluir' })).toBeVisible();
  await page.getByRole('button', { name: 'Excluir' }).click();
  await page.getByPlaceholder('Motivo da exclusão').fill('Lançado por engano');
  await page.getByRole('button', { name: 'Confirmar exclusão' }).click();

  await page.waitForURL('/returns');
  await page.goto('/trash');
  await page.getByRole('button', { name: 'Restaurar' }).first().click();
  await page.goto('/returns?status=pendente');
  await expect(page.locator('table tbody tr')).not.toHaveCount(0);
});
```

- [ ] **Step 6: Run the suite against local Supabase**

Run: `npm run db:start && npm run db:reset && npx playwright test`
Expected: all specs pass (fix any selector mismatches surfaced by the actual rendered DOM before proceeding).

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts e2e supabase/seed.sql
git commit -m "test(e2e): add Playwright coverage for lançamento, baixa, reabertura, exclusão flows"
```

---

### Task 18: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `npm run test` (Vitest), `npm run test:db` (pgTAP via Supabase CLI), `npx playwright test` — all runnable commands established in Tasks 2, 9-17.

- [ ] **Step 1: Add a root `test` script covering Vitest**

In `package.json` `"scripts"`, add: `"test": "vitest run"`.

- [ ] **Step 2: Write the workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - run: supabase start

      - run: cp .env.local.example .env.local

      - run: npm run test:db

      - run: npm run test

      - run: npx playwright install --with-deps chromium

      - run: npx playwright test
        env:
          CI: true

      - run: supabase stop
        if: always()
```

- [ ] **Step 3: Verify the workflow file is valid YAML**

Run: `npx --yes yaml-lint .github/workflows/ci.yml 2>/dev/null || node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/ci.yml','utf8')); console.log('ok')"`
Expected: prints `ok` (install `js-yaml` as a one-off dev dependency if neither is available, or visually confirm the indentation matches the block above — it must not be committed as a permanent dependency just for this check).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml package.json
git commit -m "ci: run vitest, pgTAP, and playwright on every PR"
```

---

### Task 19: Backup pipeline — daily `pg_dump` → R2 (before any real data enters)

Supabase's free tier has no automatic backup or point-in-time recovery. This task must land before Fase 1 is considered done and before real production data is entered — corruption or accidental deletion with no backup is an existential risk, not a nice-to-have.

**Files:**
- Create: `.github/workflows/backup.yml`

**Interfaces:**
- Consumes: `SUPABASE_DB_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `BACKUP_ENCRYPTION_PASSPHRASE` — all GitHub repo secrets, none committed.
- Produces: a dated, gzip-compressed, encrypted dump uploaded to a dedicated R2 bucket every day (also usable as the manual keep-alive ping candidate from `curl`ing a health endpoint, tracked separately from this task).

- [ ] **Step 1: Write the backup workflow**

`.github/workflows/backup.yml`:
```yaml
name: Backup

on:
  schedule:
    - cron: '0 6 * * *'  # 03:00 America/Sao_Paulo (UTC-3, no DST)
  workflow_dispatch: {}

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Dump, compress, encrypt
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
          PASSPHRASE: ${{ secrets.BACKUP_ENCRYPTION_PASSPHRASE }}
        run: |
          STAMP=$(TZ='America/Sao_Paulo' date +%Y-%m-%d)
          pg_dump "$SUPABASE_DB_URL" --no-owner --format=plain \
            | gzip \
            | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:PASSPHRASE \
            > "backup-$STAMP.sql.gz.enc"
          echo "STAMP=$STAMP" >> "$GITHUB_ENV"

      - name: Upload to R2 (daily/weekly/monthly tiers)
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          ENDPOINT: https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com
        run: |
          FILE="backup-$STAMP.sql.gz.enc"
          aws s3 cp "$FILE" "s3://returns-backups/daily/$FILE" --endpoint-url "$ENDPOINT"
          DOW=$(TZ='America/Sao_Paulo' date +%u)   # 1=Monday
          DOM=$(TZ='America/Sao_Paulo' date +%d)
          if [ "$DOW" = "7" ]; then
            aws s3 cp "$FILE" "s3://returns-backups/weekly/$FILE" --endpoint-url "$ENDPOINT"
          fi
          if [ "$DOM" = "01" ]; then
            aws s3 cp "$FILE" "s3://returns-backups/monthly/$FILE" --endpoint-url "$ENDPOINT"
          fi
```

- [ ] **Step 2: Configure R2 lifecycle rules for retention (one-time, Cloudflare dashboard or `wrangler`)**

Set object-expiration rules per prefix: `daily/` expires after 7 days, `weekly/` after 28 days, `monthly/` after 180 days (7 daily + 4 weekly + 6 monthly, per the adendo). This is bucket configuration, not application code — document the exact rule values here so they're reproducible if the bucket is recreated.

- [ ] **Step 3: Add the secrets to the GitHub repo**

`SUPABASE_DB_URL` (from Supabase project settings → Database → Connection string, the `postgres` user, not `service_role` key), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (R2 API token scoped to the `returns-backups` bucket only), `BACKUP_ENCRYPTION_PASSPHRASE` (generate with `openssl rand -base64 32`, store nowhere else but the GitHub secret and a password manager — losing it makes every backup unrecoverable).

- [ ] **Step 4: Manual smoke test — run once via `workflow_dispatch`**

Trigger the workflow manually from the Actions tab. Expected: a new object appears under `daily/` in the R2 bucket; download it, decrypt with `openssl enc -d -aes-256-cbc -pbkdf2 -pass pass:<passphrase>`, gunzip, and confirm it's a valid `pg_dump` SQL file (`head` shows `-- PostgreSQL database dump`).

- [ ] **Step 5: Document the restore-test runbook (not automated — run quarterly against the sandbox project)**

Add a short runbook note (e.g. `docs/runbooks/restore-test.md`) describing: download latest daily backup → decrypt → gunzip → `psql "$SANDBOX_DB_URL" < backup.sql` against the sandbox Supabase project (which lives paused between uses, per the adendo) → spot-check row counts against production. A backup that has never been restored is not a verified backup.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/backup.yml docs/runbooks/restore-test.md
git commit -m "ci: add daily encrypted pg_dump backup to R2 with tiered retention"
```

---

### Task 20: Leitura de código de barras/QR da DANFE (lançamento)

> Spec: `docs/superpowers/specs/2026-07-02-leitura-danfe-design.md`. Extends the lançamento form (Task 13) and the suppliers route (Task 10). Placed at the end of this document to avoid renumbering Tasks 1-19; there is no real ordering dependency forcing it to run last.

**Files:**
- Create: `lib/danfe-scanner.ts`
- Test: `tests/unit/danfe-scanner.test.ts`
- Create: `components/returns/danfe-scan-input.tsx`
- Create: `components/returns/danfe-scan-camera-dialog.tsx`
- Modify: `components/returns/return-form.tsx` (Task 13) — wire scan input + camera dialog into the form
- Modify: `app/api/suppliers/route.ts` (Task 10) — add `cnpj` query param to `GET`
- Modify: `supabase/seed.sql` (Task 17) — add a supplier with a known `cnpj` for the E2E test
- Create: `e2e/leitura-danfe.spec.ts`

**Interfaces:**
- Consumes: `ReturnForm` (Task 13), `Supplier` type and `GET /api/suppliers` (Task 10), `suppliers.cnpj` column (Task 3).
- Produces: `parseDanfeCode(raw: string): { chaveAcesso: string; cnpjEmitente: string; nNF: string } | null` from `lib/danfe-scanner.ts` — consumed by both new components. Both components call the same `onScan(result: { cnpjEmitente: string; nNF: string }) => void` prop, consumed by `ReturnForm`.

- [ ] **Step 1: Write the failing parser test**

`tests/unit/danfe-scanner.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { parseDanfeCode } from '@/lib/danfe-scanner';

const CHAVE_VALIDA = '35240112345678000199550010000123451123456780';

describe('parseDanfeCode', () => {
  it('parses a raw 44-digit chave de acesso (USB scanner input)', () => {
    expect(parseDanfeCode(CHAVE_VALIDA)).toEqual({
      chaveAcesso: CHAVE_VALIDA,
      cnpjEmitente: '12345678000199',
      nNF: '12345',
    });
  });

  it('parses a QR code URL carrying the chave in the p= param', () => {
    const url = `https://www.sefazvirtual.fazenda.gov.br/nfce/qrcode?p=${CHAVE_VALIDA}|2|1|abcdef1234567890`;
    expect(parseDanfeCode(url)).toEqual({
      chaveAcesso: CHAVE_VALIDA,
      cnpjEmitente: '12345678000199',
      nNF: '12345',
    });
  });

  it('returns null for an empty string', () => {
    expect(parseDanfeCode('')).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(parseDanfeCode('not a valid code at all')).toBeNull();
  });

  it('returns null for a numeric string of the wrong length', () => {
    expect(parseDanfeCode('12345')).toBeNull();
  });

  it('returns null for a QR URL missing the p= param', () => {
    expect(parseDanfeCode('https://example.com/qrcode?x=1')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/danfe-scanner.test.ts`
Expected: FAIL with `Cannot find module '@/lib/danfe-scanner'` (or similar — the file doesn't exist yet).

- [ ] **Step 3: Implement the parser**

`lib/danfe-scanner.ts`:
```typescript
export interface ParsedDanfeCode {
  chaveAcesso: string;
  cnpjEmitente: string;
  nNF: string;
}

function extractChaveFromQrParam(raw: string): string | null {
  try {
    const url = new URL(raw);
    const p = url.searchParams.get('p');
    if (!p) return null;
    return p.split('|')[0];
  } catch {
    return null;
  }
}

export function parseDanfeCode(raw: string): ParsedDanfeCode | null {
  const trimmed = raw.trim();
  const candidate = /^\d{44}$/.test(trimmed) ? trimmed : extractChaveFromQrParam(trimmed);

  if (!candidate || !/^\d{44}$/.test(candidate)) {
    return null;
  }

  const cnpjEmitente = candidate.slice(6, 20);
  const nNF = String(parseInt(candidate.slice(25, 34), 10));

  return { chaveAcesso: candidate, cnpjEmitente, nNF };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/danfe-scanner.test.ts`
Expected: `6 passed`.

- [ ] **Step 5: Add the camera-scanning dependency**

Run: `npm install @zxing/browser`

- [ ] **Step 6: Write the desktop scan-input component (USB scanner, HID keyboard emulation)**

`components/returns/danfe-scan-input.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseDanfeCode, type ParsedDanfeCode } from '@/lib/danfe-scanner';

export function DanfeScanInput({
  onScan,
}: {
  onScan: (result: Pick<ParsedDanfeCode, 'cnpjEmitente' | 'nNF'>) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const raw = e.currentTarget.value;
    const parsed = parseDanfeCode(raw);

    if (!parsed) {
      setError('Código não reconhecido. Tente novamente ou preencha manualmente.');
    } else {
      setError(null);
      onScan(parsed);
    }

    e.currentTarget.value = '';
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="danfe-scan">Leitor de código de barras</Label>
      <Input
        id="danfe-scan"
        autoFocus
        placeholder="Aponte o leitor de código de barras aqui"
        onKeyDown={handleKeyDown}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 7: Write the mobile/fallback camera dialog component**

`components/returns/danfe-scan-camera-dialog.tsx`:
```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { parseDanfeCode, type ParsedDanfeCode } from '@/lib/danfe-scanner';

export function DanfeScanCameraDialog({
  open,
  onClose,
  onScan,
}: {
  open: boolean;
  onClose: () => void;
  onScan: (result: Pick<ParsedDanfeCode, 'cnpjEmitente' | 'nNF'>) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !videoRef.current) return;

    const reader = new BrowserMultiFormatReader();
    let handled = false;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (handled || !result) return;
        const parsed = parseDanfeCode(result.getText());
        if (!parsed) return;
        handled = true;
        onScan(parsed);
        onClose();
      })
      .catch(() => setError('Sem acesso à câmera — preencha manualmente.'));

    return () => {
      handled = true;
      reader.reset();
    };
  }, [open, onClose, onScan]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Escanear código da DANFE</DialogTitle></DialogHeader>
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <video ref={videoRef} className="w-full rounded" />
        )}
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 8: Add the `cnpj` query param to the suppliers route**

In `app/api/suppliers/route.ts`, replace the existing `GET`:
```typescript
export async function GET(request: NextRequest) {
  const cnpj = new URL(request.url).searchParams.get('cnpj');

  const supabase = createClient();
  let query = supabase.from('suppliers').select('*').order('name');
  if (cnpj) query = query.eq('cnpj', cnpj);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 9: Wire both scan components into the lançamento form**

In `components/returns/return-form.tsx`, add the imports:
```tsx
import { useState } from 'react';
import { DanfeScanInput } from './danfe-scan-input';
import { DanfeScanCameraDialog } from './danfe-scan-camera-dialog';
```
(the existing `useState`/`useEffect` import line already covers `useState` — don't duplicate it, just add the two component imports alongside the existing `XmlUpload`/`DuplicateWarningDialog` imports.)

Add state and the scan handler inside `ReturnForm`, alongside the existing `useState` calls:
```tsx
const [showCamera, setShowCamera] = useState(false);
const [scanWarning, setScanWarning] = useState<string | null>(null);

async function handleScan({ cnpjEmitente, nNF }: { cnpjEmitente: string; nNF: string }) {
  setScanWarning(null);
  const matches: Supplier[] = await fetch(`/api/suppliers?cnpj=${cnpjEmitente}`).then((r) => r.json());

  setForm((f) => ({
    ...f,
    nf: nNF,
    supplier_id: matches[0]?.id ?? f.supplier_id,
  }));

  if (matches.length === 0) {
    setScanWarning('CNPJ não cadastrado — selecione o fornecedor manualmente.');
  }
}
```

Add the UI, directly below the existing `<XmlUpload ... />` line:
```tsx
<div className="flex items-center gap-2">
  <DanfeScanInput onScan={handleScan} />
  <Button type="button" variant="outline" onClick={() => setShowCamera(true)}>
    Escanear com câmera
  </Button>
</div>
{scanWarning && <p className="text-sm text-amber-600">{scanWarning}</p>}
<DanfeScanCameraDialog open={showCamera} onClose={() => setShowCamera(false)} onScan={handleScan} />
```

- [ ] **Step 10: Seed a supplier with a known CNPJ for the E2E test**

Append to `supabase/seed.sql`:
```sql
insert into suppliers (name, cnpj) values ('Fornecedor Scan E2E', '12345678000199');
```

- [ ] **Step 11: Write the Playwright test**

`e2e/leitura-danfe.spec.ts`:
```typescript
import { test, expect } from './fixtures';

const CHAVE_CNPJ_CADASTRADO = '35240112345678000199550010000123451123456780';
const CHAVE_CNPJ_DESCONHECIDO = '35240199999999000199550010000067890123456780';

test('scan preenche NF e fornecedor quando o CNPJ está cadastrado', async ({ page }) => {
  await page.goto('/returns/new');
  const scanField = page.getByPlaceholder('Aponte o leitor de código de barras aqui');
  await scanField.fill(CHAVE_CNPJ_CADASTRADO);
  await scanField.press('Enter');

  await expect(page.getByLabel('NF')).toHaveValue('12345');
  await expect(page.getByText('Selecione o fornecedor')).not.toBeVisible();
});

test('scan com CNPJ não cadastrado preenche só o NF e mostra aviso', async ({ page }) => {
  await page.goto('/returns/new');
  const scanField = page.getByPlaceholder('Aponte o leitor de código de barras aqui');
  await scanField.fill(CHAVE_CNPJ_DESCONHECIDO);
  await scanField.press('Enter');

  await expect(page.getByLabel('NF')).toHaveValue('67890');
  await expect(page.getByText('CNPJ não cadastrado')).toBeVisible();
});
```

- [ ] **Step 12: Run the suite against local Supabase**

Run: `npm run db:reset && npx playwright test e2e/leitura-danfe.spec.ts`
Expected: both specs pass (fix any selector mismatches surfaced by the actual rendered DOM before proceeding).

- [ ] **Step 13: Commit**

```bash
git add lib/danfe-scanner.ts tests/unit/danfe-scanner.test.ts components/returns/danfe-scan-input.tsx components/returns/danfe-scan-camera-dialog.tsx components/returns/return-form.tsx app/api/suppliers/route.ts supabase/seed.sql e2e/leitura-danfe.spec.ts package.json package-lock.json
git commit -m "feat(returns): scan DANFE barcode/QR to auto-fill NF and fornecedor"
```

---

## Self-Review Notes

- **Spec coverage:** every section of the Fase 1 design doc (setup, modelo de dados, máquina de estados, API, UI, testes) maps to at least one task above; the "fora de escopo" list from the spec is intentionally not covered here.
- **Fixed during planning:** the spec's `nf text not null` was corrected to nullable before this plan was written (see spec commit `fix(spec): nf/nfd nullable in rascunho status`); Task 4's migration and Task 11's schema both reflect the nullable column.
- **Type consistency checked:** `ReturnRecord`, `Supplier`, `ReturnReason` (Task 10) are the only types referenced by name in Tasks 11-16; RPC function names (`fn_confirmar_rascunho`, `fn_dar_baixa_venda`, `fn_reabrir`, `fn_excluir`, `fn_restaurar`) are identical between Task 6 (definition) and Task 12 (`supabase.rpc(...)` calls).
- **v4→v5 adendo reconciled (2026-07-02):** soft-delete (`returns.deleted_at`/`delete_reason`/`deleted_by`) replaces the earlier `trash` table design across Tasks 3-4, 6-7, 10-12, 15; `feature_flags` seeded in Task 3/7 ahead of Fase 2/3; login (Task 8) supports Google OAuth as primary with password fallback; backup pipeline added as Task 19, ahead of any real data entering the system.
- **DANFE scan added (2026-07-02):** Task 20 adds barcode/QR scanning to the lançamento form per `docs/superpowers/specs/2026-07-02-leitura-danfe-design.md` — auto-fills `nf`+`supplier_id` only (no qtd/valor, no new column), extends Task 13's form and Task 10's suppliers route.
