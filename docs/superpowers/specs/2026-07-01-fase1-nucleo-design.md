# Fase 1 — Núcleo do sistema de devoluções (design)

> Baseado em `plano-sistema-devolucoes_v4_1.md` (seções 1-3, 6, 11, 12). Cobre a base de todo o sistema: cadastro de fornecedores, lançamento de devolução, máquina de estados, motivos padronizados, lixeira e concorrência em lote. Transferências (`transfers`, filiais, responsabilidade), auditoria (`activity_log`), comunicação e relatórios ficam para fases seguintes.

## 1. Contexto e escopo

O plano completo cobre 11 fases e várias subsistemas independentes (núcleo, transferências, comunicação, segurança, relatórios, auditoria, import de XML, arquivamento, import histórico, UX, colaboração). Este spec cobre **só a Fase 1**, decisão tomada em brainstorming por ser a base de que todo o resto depende — sem `returns` e sua máquina de estados, nenhuma fase seguinte tem onde se apoiar.

Estado inicial do projeto: pasta só com o plano `.md`, sem git, sem `package.json`, sem projeto Supabase. Este spec inclui o setup inicial.

**Infra (free tier, confirmado pelo usuário):**
- Supabase: só banco Postgres + Auth + Realtime. **Nenhum storage de arquivo no Supabase** — 100% Cloudflare R2 (não relevante ainda na Fase 1, que não lida com `files`, mas registrado para não reintroduzir storage no Supabase em fase futura).
- Frontend + API (Next.js): hospedado na Vercel.
- Tudo em plano gratuito — implicação futura (fora de escopo desta fase): Supabase free tier não inclui `pg_cron`; jobs agendados de fases futuras (arquivamento, retenção) precisarão de Vercel Cron ou equivalente externo, não `pg_cron` direto.

## 2. Setup inicial

- Repositório único (sem monorepo). Next.js (App Router) na raiz.
- Pasta `supabase/` gerenciada pelo Supabase CLI — migrations versionadas em `supabase/migrations/`, desenvolvimento local via `supabase start` (Docker) + `supabase db reset` para aplicar migrations do zero em CI/local.
- Supabase Auth básico ligado desde já (login e-mail/senha) — só para ter `auth.users.id` válido como FK em `created_by`/`responsavel`/`deleted_by`. RLS granular por cargo é Fase 4; nesta fase, policy mínima "usuário autenticado tem acesso total" (placeholder documentado como temporário, não é a policy final de produção).
- Camada de API: Next.js Route Handlers (`app/api/...`) usando `@supabase/ssr` para client server-side.
- Testes configurados desde o primeiro PR: Vitest, pgTAP (via Supabase CLI, `supabase test db`), Playwright.

## 3. Modelo de dados

```sql
-- suppliers
create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_key_account boolean not null default false,
  cnpj text,
  contact_emails text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- return_reasons
create table return_reasons (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references suppliers(id),  -- null = genérico, disponível para todos
  label text not null,
  active boolean not null default true
);

-- returns
create table returns (
  id uuid primary key default gen_random_uuid(),
  nf text,   -- nullable: rascunho cobre o caso "XML da NF-e ainda não chegou" (seção 3.9 do plano)
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
  origin_row_ref text,        -- rastro para importação histórica (Fase 9)
  resolved_at timestamptz,    -- passa a ser usado a partir da Fase 9 (arquivamento); já cabe no schema agora
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- índice de apoio à checagem de duplicata (NÃO único — ver seção 5)
create index idx_returns_nf_supplier on returns (nf, supplier_id);

-- trash
create table trash (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null,
  snapshot jsonb not null,       -- linha completa de returns no momento da exclusão
  motivo text not null,
  deleted_by uuid references auth.users(id),
  deleted_at timestamptz not null default now(),
  restored_at timestamptz
);
```

Decisões relevantes:
- `dias_armazenado` **não é coluna** — é calculado em view/query (`now() - data_entrada` ou `now() - resolved_at` quando concluído), evitando desatualização.
- `rascunho` é um valor válido de `status`, mas fica fora da máquina de estados formal (ver seção 4) — só a transição `rascunho → pendente` é permitida a partir dele, via função dedicada.
- Duplicata (`nf` + `supplier_id`) usa **índice não-único**: a checagem é feita na API antes do insert/confirmação, porque o comportamento desejado é "avisar e permitir confirmar mesmo assim" — um índice único de verdade bloquearia sempre, sem essa opção.

## 4. Máquina de estados

**Trigger `BEFORE UPDATE ON returns`** (função `fn_check_status_transition`), guarda final independente de quem faz o UPDATE:

```
Transições válidas:
  rascunho          -> pendente
  pendente          -> em_transferencia, venda
  em_transferencia  -> devolvido
  devolvido, venda  -> pendente   (reabertura — exige NEW.motivo_detalhe não nulo/vazio)

OLD.status = NEW.status -> permitido (updates que não tocam status)
Qualquer outro par (OLD.status, NEW.status) -> RAISE EXCEPTION
```

Nota: `pendente -> em_transferencia` é incluído na tabela de transições já nesta fase (a trigger cobre o par), embora o mecanismo que dispara essa transição (`insert em transfers`) só exista na Fase 2. Isso evita ter que alterar a trigger quando a Fase 2 chegar.

**Funções RPC** (`SECURITY DEFINER`, chamadas via `supabase.rpc(...)`):

| Função | Efeito |
|---|---|
| `fn_confirmar_rascunho(id uuid)` | Exige `nf` preenchido (raise exception se null), revalida duplicata, muda `rascunho → pendente` |
| `fn_dar_baixa_venda(ids uuid[])` | `UPDATE returns SET status='venda' WHERE id = ANY(ids) AND status='pendente' RETURNING id` — retorna afetados vs ignorados (padrão de concorrência da seção 3 do plano) |
| `fn_reabrir(ids uuid[], motivo text)` | `UPDATE returns SET status='pendente', motivo_detalhe=motivo WHERE id = ANY(ids) AND status IN ('devolvido','venda') RETURNING id` |
| `fn_excluir(id uuid, motivo text)` | Só se `status='pendente'`: insere snapshot em `trash`, deleta a linha de `returns` — transação única |

## 5. API (Route Handlers)

```
GET    /api/returns                          -- lista, filtros (status, supplier, período), paginação
POST   /api/returns                           -- cria (status inicial: rascunho ou pendente, conforme payload)
GET    /api/returns/check-duplicate?nf=&supplier_id=
GET    /api/returns/:id
PATCH  /api/returns/:id                       -- edita campos não-status (só rascunho/pendente editáveis)
POST   /api/returns/:id/confirmar             -- chama fn_confirmar_rascunho
POST   /api/returns/batch/venda               -- chama fn_dar_baixa_venda, body {ids: []}
POST   /api/returns/batch/reabrir             -- chama fn_reabrir, body {ids: [], motivo}
DELETE /api/returns/:id                       -- chama fn_excluir, body {motivo}

GET    /api/trash
POST   /api/trash/:id/restaurar

GET    /api/suppliers
POST   /api/suppliers
GET    /api/return-reasons                    -- filtra por supplier_id nulo ou específico
POST   /api/return-reasons
```

Lançamento em lote (múltiplas NFs de uma vez) reaproveita `POST /api/returns` chamado N vezes a partir do client — cada XML é parseado individualmente de qualquer forma, não há ganho em um endpoint batch dedicado nesta fase.

## 6. UI

- **Login** — Supabase Auth (e-mail/senha)
- **Lançamento** — form individual com parse de XML da NF-e client-side (`nNF`, `xNome`, `xProd`, `qCom`, `vUnCom`, `vNF` — lógica portada da seção 8 do plano, adiantada para esta fase para não obrigar digitação manual desde o início); aba "Rascunhos" (só do próprio usuário); botão "Confirmar lançamento"; aviso de duplicata com opção "Confirmar mesmo assim"
- **Lista de devoluções** — tabela com filtro (status, fornecedor, período), busca por NF/NFD, ações em lote (baixa para venda, reabrir) com stepper de 3 passos: seleção → prévia com avisos → confirmação
- **Detalhe da NF** — campos da devolução; sem histórico de auditoria ainda (isso é Fase 6/`activity_log`); botão excluir (exige motivo)
- **Lixeira** — lista de soft-deleted, botão restaurar
- **Configurações → Fornecedores** e **Motivos de devolução** — CRUD simples

## 7. Testes

- **Vitest**: parser de XML (extração de campos), cálculo de `valor_total`, montagem de payload de lançamento
- **pgTAP** (via `supabase test db`): cada transição válida passa a trigger; cada transição inválida é rejeitada (cobrir todos os pares, não só os óbvios); `fn_dar_baixa_venda`/`fn_reabrir` só afetam linhas no status esperado, incluindo teste de concorrência (duas chamadas concorrentes para o mesmo id — só uma deve afetar a linha); `fn_excluir` só funciona quando `status='pendente'`
- **Playwright (E2E)**: lançar individual → aparece na lista com status correto; lançar como rascunho → confirmar → vira pendente; duplicata → aviso → confirma → cria mesmo assim; baixa em lote para venda → status muda; reabertura sem motivo é bloqueada, com motivo funciona; excluir só disponível para pendente → item vai para lixeira → restaurar volta para pendente
- CI roda a suíte inteira (unit + pgTAP + E2E) a cada PR, bloqueando merge se falhar

## 8. Fora de escopo (fica para fases seguintes)

- `transfers`, `branches`, `supplier_addresses`, responsabilidade por filial (Fase 2)
- `email_recipients`, templates, fila de e-mail (Fase 3)
- Cargos customizados, RLS granular por módulo, `feature_flags`, 2FA (Fase 4)
- Relatórios PDF, exportação self-service, dashboard (Fase 5)
- `activity_log`, scorecard, SLA (Fase 6)
- Formalização do import de XML como módulo próprio (Fase 7 — o parse básico já entra na Fase 1 por necessidade de UX, mas sem os refinamentos previstos na seção 8 do plano)
- Arquivamento automático, retenção de anexo (Fase 8 — não há `files` ainda nesta fase)
- Importação de dados históricos (Fase 9)
- Notificações in-app, calendário, onboarding, FAQ, changelog, dashboard de saúde do desenvolvedor (Fase 10)
- Comentários, follow-ups, timeline visual, caixa de trabalho pessoal (Fase 11 / seção 15)
