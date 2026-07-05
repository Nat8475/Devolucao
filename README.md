This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Fase 2 — Transferências entre filiais

Fase 2 adiciona o ciclo de transferência de uma devolução (`pendente` →
`em_transferencia` → `devolvido`/`pendente` de volta em caso de cancelamento),
com destino para uma filial ou direto para um endereço de fornecedor.

### Novas rotas

- `/transfers` — lista de transferências agrupadas por lote, com filtros por
  status (Todas / Em trânsito / Concluídas / Canceladas / Vencidas).
- `/transfers/[loteId]` — detalhe de um lote: dados do agendamento, ações
  (Dar baixa, Reagendar, Cancelar, Confirmar chegada) e os itens (NFs) do
  lote.
- `/transfers/rotas` — sugestão de rota de coleta: agrupa devoluções
  pendentes por cidade/UF do endereço do fornecedor para programar um lote
  por rota de uma vez. Só aparece com a flag `roteirizacao_coleta` ligada.
- `/settings/branches` — CRUD de filiais (nome, endereço, ativa/inativa) e
  vínculo de usuários responsáveis por cada filial.
- `/settings/features` — liga/desliga as feature flags da Fase 2 e upload do
  logo usado na etiqueta de caixa.
- `/returns/[id]/etiqueta` — etiqueta de caixa 100×100mm (impressão térmica)
  para uma devolução, com a NF em destaque.

### Variáveis de ambiente

Além das variáveis do Supabase já usadas na Fase 1:

- `R2_*` (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_BUCKET_NAME`) — opcionais. Habilitam upload de arquivos (comprovante de
  baixa, assinatura, logo da etiqueta) via Cloudflare R2. Sem elas, os
  endpoints de arquivo respondem `503` e a UI esconde os campos de upload
  (a baixa de transferência continua funcionando normalmente, só sem anexos).
- `SUPABASE_SERVICE_ROLE_KEY` — opcional, necessária apenas para
  `GET /api/users` (lista de usuários para vincular como responsáveis de
  filial em `/settings/branches`). Sem ela, esse endpoint responde `503` e a
  UI mostra "Lista de usuários indisponível neste ambiente."

### Feature flags da Fase 2

Todas desligadas (`enabled=false`) por padrão; configuráveis em
`/settings/features` ou via `PATCH /api/feature-flags/[key]`:

- `confirmacao_chegada_filial` — habilita o botão "Confirmar chegada" no
  detalhe do lote (só para destino filial); ao confirmar, registra
  `arrived_at_branch_at` e atribui a responsabilidade da NF à filial
  (`responsible_branch_id`).
- `assinatura_baixa` — habilita a captura de assinatura (canvas) no fluxo de
  "Dar baixa", além do comprovante opcional (ambos exigem R2 configurado).
- `roteirizacao_coleta` — habilita a página `/transfers/rotas` de sugestão de
  rota de coleta por cidade/UF do fornecedor.
