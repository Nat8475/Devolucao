# Sistema de Controle de Devoluções — Plano Técnico (v4, baseado no código real)

> **Nota de versão (v4):** consolida as sugestões validadas nas rodadas de brainstorm sobre a v3 — responsabilidade de devolução por filial, roteirização de coleta, confiabilidade de e-mail (teste de envio, retry, bounce, cascata), dashboard de saúde voltado ao desenvolvedor, rascunho de lançamento, modo simulação, e um conjunto de melhorias de UX (notificações in-app, calendário, onboarding, changelog, FAQ contextual, 2FA opcional para admin).

## 1. Contexto

Migração de um sistema hoje operado em **Google Sheets + Apps Script + Google Drive** (v6.2, já publicado também como Web App) para uma aplicação própria. Este plano foi reescrito depois da leitura completa do `Código.gs` e de todos os HTMLs do sistema atual — várias suposições da v1 deste documento estavam erradas e foram corrigidas aqui.

O sistema controla devoluções de mercadoria para **fornecedores**, hoje organizadas em abas por conta-chave (`Britania`, `Unilever`, `Fornecedores Variados` + abas extras criadas sob demanda), com um ciclo de status estrito:

```
Pendente → Em Transferência → Devolvido
Pendente → Venda
(qualquer concluído) → Pendente   [reabertura, com motivo]
```

`Devolvido` e `Em Transferência` **não podem ser definidos manualmente** — só por fluxo automático (baixa de transferência, geração de PDF de devolução). Isso é uma regra de máquina de estados, não só validação de formulário, e precisa virar uma constraint real no banco novo.

Suporta dois modos de entrada em produção:
- **Importação de dados históricos** da planilha atual (notas, comentários, histórico de e-mail, fotos do Drive)
- **Início do zero**, sem migração

---

## 2. Stack tecnológico

| Camada | Tecnologia | Papel |
|---|---|---|
| Frontend | Next.js (App Router) + Tailwind + shadcn/ui | Interface web moderna, SSR, dark mode |
| Backend / API | Next.js Route Handlers + Supabase Edge Functions (Deno) | Regras de negócio, PDF, e-mail, importação |
| Banco de dados | Supabase (Postgres) | Dados estruturados, Auth, Realtime, RLS, `pg_cron` |
| Storage de arquivos | Cloudflare R2 | Fotos de avaria, PDFs, XMLs importados, backups |
| E-mails | Resend ou SendGrid, via Edge Function | Notificações automáticas, relatórios, alertas |
| Geração de PDF | `@react-pdf/renderer` (padrão) / Puppeteer (grid de fotos) | Protocolos, laudos, relatórios, etiquetas |
| Notificações in-app | Supabase Realtime | Alertas dentro do próprio WebApp |
| Autenticação | Supabase Auth | Login com RLS por cargo custom |
| Agendamento | `pg_cron` + Edge Functions | Relatórios agendados, alertas diários |
| Observabilidade | Sentry (ou similar) | Captura de erro com stack trace, agrupamento e alerta — substitui o painel de "erros recentes" caseiro do sistema atual |

**Por que separar Supabase (dados) do R2 (arquivos):** evita custo de storage/egress do Supabase; o Postgres guarda só a `key` do arquivo, com URLs assinadas geradas sob demanda.

---

## 3. Modelo de dados — Núcleo

### `suppliers`
Fornecedores. A categorização por conta-chave (Britania/Unilever/variados) é um agrupamento do fornecedor, **não uma filial física**. Campos: `id`, `name`, `is_key_account` (bool), `cnpj`, `contact_emails`.

### `branches` — filiais de destino (nova, a pedido)
Filial é o **destino físico da transferência** — pra onde a mercadoria devolvida vai. Cadastrada pela tela de Configurações (CRUD simples), não pelo fluxo de fornecedor. Campos: `id`, `name`, `address`, `active` (bool, permite desativar sem apagar histórico).

### `returns` — cabeçalho da devolução
`id`, `nf`, `nfd`, `supplier_id`, `type` (avaria/falta/rejeição), `reason_id` (FK, ver `return_reasons` abaixo), `motivo_detalhe` (texto livre complementar, opcional), `descricao`, `qtd`, `valor_unitario`, `valor_total` (gerado), `status`, `data_entrada`, `responsavel`, `dias_armazenado` (calculado), `priority`, `origin_row_ref` (rastro pra importação).

**Constraint de máquina de estados** (via trigger ou check function, não só na aplicação):
- `Pendente → Em Transferência` — só por `transfers` insert
- `Em Transferência → Devolvido` — só por baixa de transferência
- `Pendente → Venda` — baixa direta
- `Devolvido/Venda → Pendente` — reabertura, exige `motivo`
- Qualquer outra transição é rejeitada no banco, não só na UI

**Concorrência em ações em lote (melhoria sobre o sistema atual).** No Apps Script, `LockService` resolve isso travando a execução inteira enquanto processa. No Postgres não dá pra depender só de checar o status antes de agir — dois usuários dando baixa na mesma NF ao mesmo tempo podem passar pela checagem juntos. Toda ação em lote (baixa, reabertura, cancelamento de transferência) precisa incluir a condição de status **dentro** do próprio `UPDATE`, não como uma leitura separada antes:
```sql
UPDATE returns SET status = 'devolvido' WHERE id = :id AND status = 'em_transferencia';
-- se 0 linhas afetadas, o item já mudou de status por outra ação — reportar como "ignorado", não erro
```
Isso vira um padrão documentado e obrigatório em qualquer Edge Function que altera status em lote, não fica implícito.

### `return_reasons` — motivo padronizado (melhoria sobre o sistema atual)
Hoje `motivo` é texto livre — a mesma coisa escrita de formas diferentes ("avaria transporte" vs "avaria no transporte") polui o scorecard e o relatório de "motivos frequentes". Vira uma tabela: `id`, `supplier_id` (nulo = motivo genérico disponível pra todos; preenchido = específico daquele fornecedor), `label`, `active`. O formulário de lançamento usa autocomplete sobre essa lista, com opção de "outro" que grava em `motivo_detalhe` sem travar o operador quando o motivo realmente não existir ainda na lista.

### `files` — todo arquivo do sistema, numa tabela só
O sistema atual tem fotos de avaria, anexo principal da NF, comprovante de transferência (CTe) e PDFs gerados (relatório, laudo, protocolo) como conceitos espalhados. Como todos são "um arquivo no R2 ligado a alguma coisa", viram uma única tabela: `id`, `entity_type` (`return` / `transfer` / `report`), `entity_id`, `file_type` (`photo` / `attachment` / `receipt` / `document`), `r2_key`, `version` (mantém o histórico das últimas 5 versões de anexo, igual ao sistema atual, mas agora genérico pra qualquer tipo de arquivo), `uploaded_by`, `created_at`.

Isso substitui `return_photos`, `return_attachments`, o campo `receipt_url` de `transfers` e a tabela de documentos gerados dos relatórios — uma query com `WHERE entity_type = 'return' AND entity_id = :id` já traz tudo (fotos + anexo + versões) pra montar a galeria da NF; o mesmo padrão serve pro comprovante da transferência e pros PDFs de relatório.

**Upload de foto direto da câmera (melhoria sobre o sistema atual).** Foto de avaria normalmente é tirada na hora, na doca, pelo celular — o componente de upload no frontend precisa aceitar captura direta da câmera (`<input capture="environment">` ou equivalente em componente customizado), não só seleção de arquivo já existente. Vale garantir isso desde o design da tela, porque é fácil implementar só "escolher arquivo" e descobrir depois que o operador sempre teve que tirar a foto antes, num app separado, e depois anexar.

### Etiqueta de caixa — 100×100mm, térmica
O sistema atual já gera etiqueta nesse formato (100×100mm, pensada pra impressora térmica) — mantém o mesmo tamanho de página no CSS de impressão (`@page{size:100mm 100mm;margin:0}`), só reforçando o que já funciona:
- **Logo da empresa** no cabeçalho da etiqueta, puxada de `files` (upload único em Configurações, não por etiqueta)
- **NF em destaque** — maior que os demais campos, primeira coisa que o olho vê a 1 metro de distância (é o dado mais consultado na conferência de doca)
- Demais campos (NFD, fornecedor, tipo, motivo, quantidade, data, status) em tamanho secundário, mas todos presentes — nada cortado por causa do formato pequeno

**Nota técnica — impressão fraca em impressora térmica.** Imprimir via `window.print()` do navegador tende a sair mais fraco em impressora térmica do que impressão nativa (ZPL/EPL), porque o browser renderiza texto/bordas com anti-aliasing (cinza nas bordas, não preto puro) e a impressora modula calor pela intensidade do pixel — cinza sai fraco. Mitigações no CSS de impressão: `-webkit-print-color-adjust: exact; print-color-adjust: exact;`, `font-weight` alto no texto principal, logo em preto sólido (SVG ou PNG 1-bit, nunca JPEG/foto). Se a impressora usada suportar, vale considerar geração de **ZPL nativo** como alternativa opcional pra quem tiver volume alto de doca — sai mais nítido e não depende do diálogo de impressão do navegador, mas é trabalho adicional (não essencial pro MVP).

### `trash` (lixeira)
Soft-delete: exclusão só é permitida para itens `Pendente`, exige motivo, e move o registro completo pra cá antes de limpar a linha original. Restauração devolve pro status `Pendente`.

### Rascunho antes de confirmar (nova funcionalidade)
Hoje o lançamento é direto (com ou sem alçada de aprovação já cobrindo o pós-confirmação). Falta um estado intermediário pra quando o operador não tem todos os dados na hora — ex: XML da NF-e ainda não chegou, ou falta conferir quantidade física.

- Novo status `Rascunho`, **fora** da máquina de estados formal da seção acima — não conta em nenhum KPI/relatório operacional, não soma no contador de arquivamento automático (seção 9), e não é visível pra fornecedor em nenhum canal.
- Só o próprio criador (ou admin) vê e edita seus rascunhos, numa aba própria dentro de Lançamento.
- Transição única e explícita: `Rascunho → Pendente`, disparada pelo botão "Confirmar lançamento" — a partir daí passa a valer a máquina de estados normal (`Pendente → Em Transferência/Venda`, etc.).
- Rascunho não exige `nf`/`nfd` únicos ainda (permite salvar incompleto); a confirmação reaplica a validação de duplicidade normal antes de virar `Pendente`.
- Rascunhos antigos sem confirmação (ex: 15 dias) podem gerar um lembrete automático via `alert_rules`, evitando acúmulo esquecido.

---

## 4. Transferências — a maior simplificação da migração

No sistema atual, programar uma transferência **apaga fisicamente a linha** da aba de origem e **recria** numa aba `Transferencias` de 30 colunas (20 espelhando a nota + 10 de controle). Na baixa, a linha volta pra aba de origem. Isso existe só por limitação de planilha — **no banco relacional não precisa mover nada**.

**Nota sobre o modelo de negócio (transportadora):** neste sistema a empresa é transportadora — coleta no fornecedor, entrega no cliente final, e **se houver devolução, ela vai primeiro pro depósito próprio e depois volta pro fornecedor** (nunca pro cliente de entrega). O "cliente" da operação de entrega não participa do fluxo de devolução, então não existe uma entidade `clients` separada aqui — o destino de uma transferência de devolução é sempre **filial própria** (depósito) ou **endereço do fornecedor** (que pode ter mais de um).

**Por que filial e endereço de fornecedor não viraram uma tabela só:** ambos são "destino de transferência", mas os atributos são diferentes — endereço de fornecedor pertence a um `supplier_id` e pode ter e-mail de contato próprio; filial é local interno, sem vínculo de fornecedor. Forçar isso numa tabela só geraria colunas nulas pra metade dos casos. Em vez disso, ficam relacionados pelo padrão comum em `transfers` (`destination_type` + FK condicional) e pela mesma tela de Configurações — unificados na experiência, não forçados no schema.

### `transfers`
`id`, `return_id`, `lote_id` (agrupa múltiplas NFs numa única programação de frete — a baixa de uma baixa todas as "irmãs" do lote), `destination_type` (`filial` ou `fornecedor` — devolução volta pro depósito próprio ou direto pro endereço do fornecedor), `branch_id` (preenchido só quando `destination_type = filial`), `supplier_address_id` (preenchido só quando `destination_type = fornecedor`), `carrier` / `numero_pedido`, `freight_type` (Tabela / Valor+ICMS / Valor / Cortesia), `freight_value`, `scheduled_date`, `status` (em_transferencia / concluida / cancelada), `created_by`, `completed_at`, `cancel_reason`. O comprovante (CTe/protocolo) fica em `files` com `entity_type = transfer` — não precisa de coluna própria pra isso.

Constraint: exatamente um dos dois (`branch_id` xor `supplier_address_id`) deve estar preenchido, de acordo com `destination_type` — nunca os dois, nunca nenhum. Como `supplier_address_id` já pertence a um fornecedor específico (FK direta em `supplier_addresses`), não existe risco de selecionar endereço de outro fornecedor — o dropdown já vem filtrado pelo `supplier_id` da NF, e não precisa de constraint cruzada extra pra validar isso.

Um `UPDATE returns SET status = 'em_transferencia'` + insert em `transfers` substitui o "mover linha entre abas". Alerta de **transferência vencida** (agendamento passou da data) roda como job diário comparando `transfers.scheduled_date < now()`.

### Assinatura digital na baixa (melhoria sobre o sistema atual, com toggle)
Hoje a baixa de transferência só aceita foto do comprovante (CTe/protocolo). Adicionar captura de assinatura (dedo no touch/mouse, componente tipo canvas assinável) do motorista/recebedor no momento da confirmação, salva como imagem em `files` (`entity_type = transfer`, `file_type = signature`). Controlado por `feature_flags.key = 'assinatura_baixa'` — **desligado** por padrão, a baixa continua só com upload de comprovante como hoje; **ligado**, o campo de assinatura aparece no modal de confirmação de baixa (obrigatório ou opcional, configurável junto do toggle). Fica registrada junto da NF/lote na documentação de carga.

### Confirmação de coleta no depósito próprio (nova funcionalidade, com toggle)
Hoje só existe um marco de baixa (fim do ciclo). Quando `destination_type = filial`, falta um checkpoint intermediário — "chegou fisicamente no depósito" — entre programar a transferência e a baixa final, útil pra rastrear a devolução em trânsito interno e pra sustentar a atribuição de responsabilidade abaixo.

Controlado por `feature_flags.key = 'confirmacao_chegada_filial'` — **desligado** por padrão, o fluxo segue igual ao já descrito (só baixa final, sem checkpoint intermediário, e `responsible_branch_id` não é usado); **ligado**, habilita:

- Novo evento em `transfers`: `arrived_at_branch_at` (timestamp, nulo até a chegada), preenchido por uma ação simples ("Confirmar chegada") disponível pra quem tem módulo de transferências — não precisa de assinatura, é só um checkpoint operacional, diferente da baixa final que já é mais formal.
- É esse evento que **transfere a responsabilidade** da devolução pra filial (ver subseção seguinte) — antes da chegada, a responsabilidade ainda é de quem programou a transferência.
- Aparece na timeline da NF junto dos demais eventos de `activity_log`, sem precisar de tabela nova — é só mais um `field_change` com `payload.campo = 'arrived_at_branch_at'`.

Faz sentido como toggle porque nem toda operação quer esse passo extra de conferência — quem tem fluxo simples (poucas filiais, baixo volume) pode preferir ir direto pra baixa final, sem o checkpoint intermediário.

### Atribuição de responsabilidade por filial (nova funcionalidade)
Hoje a responsabilidade por resolver uma devolução pendente é difusa — cai genericamente em `returns.responsavel`, sem vínculo com a filial física que efetivamente está com a mercadoria em mãos. Isso muda o modelo pra refletir a realidade operacional: **quem está de posse física da mercadoria é quem deve ser cobrado/notificado**, não só o lançador original.

**Depende do toggle `confirmacao_chegada_filial` (acima) estar ligado** — sem o checkpoint de chegada, não existe o evento que dispara a atribuição de responsabilidade, então essa funcionalidade fica automaticamente inerte quando o toggle está desligado (não precisa de flag própria separada).

- **`branch_users`** — tabela de vínculo `branch_id` + `user_id`, define quem são os responsáveis cadastrados de cada filial (N usuários por filial; normalmente o encarregado do depósito e um backup).
- **`returns.responsible_branch_id`** — preenchido automaticamente quando `transfers.arrived_at_branch_at` é confirmado (ver acima); volta a `null` se a transferência for cancelada ou se o item for reaberto e reprogramado pra outro destino.
- **Notificação recorrente enquanto a responsabilidade estiver com a filial** — reaproveita `alert_rules` (seção 13): uma nova regra `key = 'devolucao_parada_filial'` dispara periodicamente (ex: a cada X dias, configurável) pros usuários de `branch_users` daquela filial, enquanto o item permanecer em `Em Transferência` com `responsible_branch_id` preenchido e sem baixa final — o alerta escala (frequência aumenta, ou soma o `developer_email`/admin em cópia) se ultrapassar um segundo limiar, evitando que a mercadoria fique esquecida no depósito.
- O dashboard por filial (ver seção 10) passa a mostrar, além dos KPIs gerais, um bloco "Sob responsabilidade desta filial" — quantidade e valor parado, com o mesmo cálculo de `dias_armazenado` já usado por NF, mas agora também agregado por filial responsável.
- Isso não substitui `returns.responsavel` (que continua sendo "quem lançou/está tratando"), é uma camada adicional de responsabilidade física — as duas coisas podem apontar pra pessoas/times diferentes.

### Roteirização de coleta de devolução (nova funcionalidade, com toggle)
Como a empresa é a própria transportadora, várias `transfers` com `destination_type = fornecedor` pro mesmo endereço ou região podem se acumular esperando frete. Em vez de programar cada uma isoladamente:

Controlado por `feature_flags.key = 'roteirizacao_coleta'` — **desligado** por padrão, cada transferência é programada individualmente como hoje; **ligado**, habilita:

- Tela de "Sugestão de rota" que agrupa `transfers` pendentes de agendamento por proximidade de `supplier_addresses` (mesma cidade/região) e sugere consolidar num único `lote_id` — mesmo caminhão, mesma data — reaproveitando o agrupamento por lote que já existe no modelo.
- Critério de agrupamento simples pro MVP: mesma cidade/UF do endereço de destino; evolução futura (fora do MVP) poderia usar distância real via API de geocoding.
- A confirmação da rota sugerida programa todas as `transfers` do grupo de uma vez, reduzindo cliques repetidos e reduzindo custo de frete por rota mais cheia.

Faz sentido como toggle porque só compensa pra operação com volume/dispersão geográfica suficiente pra formar rotas — quem tem poucas transferências por período não ganha nada com a sugestão e só teria uma tela a mais no caminho.

### `supplier_addresses` — endereços de devolução do fornecedor
Substitui o conceito de "cliente" do plano anterior. Alguns fornecedores têm mais de um endereço/CD que recebe devolução — este cadastro resolve isso sem criar uma entidade nova de negócio:
- `id`, `supplier_id` (FK), `label` (ex: "CD São Paulo", "Matriz"), `city`, `address`, `active`
- `contact_emails` (tabela relacionada, N e-mails por endereço — **opcional**: se vazio, o envio cai no fallback `suppliers.contact_emails`, porque nem todo fornecedor tem e-mail separado por endereço, alguns usam só o geral)

Um endereço pertence a um fornecedor. Isso resolve o vínculo de e-mail (seção 5) e o destino de transferência (seção 4) **com o mesmo registro**.

### Cadastro de filiais e endereços de fornecedor (tela de Configurações)

Nova aba dentro de Configurações com duas listagens: **Filiais** (depósitos próprios) e **Endereços de Fornecedor**. Filiais continuam simples (nome, endereço, ativa/inativa). O cadastro de endereço de fornecedor é o descrito acima — normalmente preenchido dentro do próprio cadastro do fornecedor, não como tela isolada. Nenhum dos dois pode ser excluído de verdade se já tiver transferência associada — só desativado.

O formulário de programar transferência (individual e em lote) ganha:
1. Um seletor **Destino: Filial / Fornecedor**
2. Um segundo campo que muda conforme a escolha — dropdown de filiais, ou dropdown de endereços **já filtrado pelo fornecedor da NF selecionada** (o endereço já pertence a um fornecedor só, então a lista nunca mistura fornecedores)

A documentação de carga (PDF) e o e-mail de devolução puxam o nome, cidade e e-mails do destino correto automaticamente, seja filial ou endereço de fornecedor.

---

## 5. Comunicação — destinatários unificados numa tabela só

**Validação de e-mail sem restrição de domínio.** Todos os campos de destinatário devem aceitar qualquer domínio válido — `@empresa.com.br` e `@gmail.com` igualmente. Não colocar allowlist de domínio corporativo; a validação é só formato de e-mail (`algo@dominio.tld`), igual ao sistema atual.

O sistema atual tinha três tabelas separadas fazendo essencialmente a mesma coisa (uma lista de e-mails com papel `to`/`cc`/`bcc` amarrada a algum escopo). Unificando:

### `email_recipients` — tabela única pras 3 camadas
`id`, `scope` (`geral` / `alerta` / `fornecedor`), `scope_key` (nulo quando `geral`; o tipo de alerta — atraso/semanal/mensal/diário/pendências/transferência — quando `alerta`; o `supplier_id` quando `fornecedor`), `role` (`to`/`cc`/`bcc`), `email`.

- **Lista geral** = linhas com `scope = geral` (recebe todos os relatórios e o resumo semanal)
- **CC/BCC por tipo de alerta** = linhas com `scope = alerta` e `scope_key = <tipo>`
- **CC/BCC por fornecedor** (antes `supplier_email_config`) = linhas com `scope = fornecedor` e `scope_key = <supplier_id>`

Uma tela de configuração só, com um seletor de escopo no topo, resolve as três telas que existiam separadas no sistema atual. Os **e-mails de endereço de fornecedor continuam fora dessa tabela** de propósito — eles moram no cadastro do endereço (`supplier_addresses`, seção 4) porque são um atributo do destino físico, não uma configuração de notificação; na hora de enviar, a tela resolve os e-mails do endereço de destino da transferência e oferece como checkbox adicional, somados ao que vier de `email_recipients` com `scope = fornecedor`.

### Resolução de e-mail do fornecedor — fallback em cascata
Nem todo fornecedor cadastra e-mail por endereço/CD — alguns só têm o e-mail geral mesmo. A resolução na hora de enviar segue cascata simples: se `supplier_addresses.contact_emails` do destino tiver algo cadastrado, usa esses; senão, cai pro `suppliers.contact_emails` geral. Isso cobre os dois casos (fornecedor com e-mail por endereço e fornecedor só com e-mail geral) sem precisar de flag extra — resolvido só pela presença ou ausência de registro.

### E-mail de devolução programada — opcional e com escopo por fornecedor
Diferente do fluxo de alerta (seção acima), este é disparado no **evento** de programar uma transferência de devolução, e cada fornecedor pode ter uma preferência diferente sobre ser avisado ou não:

```sql
suppliers
  ...
  scheduled_return_email_enabled  bool default false,
  scheduled_return_email_scope    text  -- 'interno' | 'interno_e_fornecedor'
```

- `enabled = false` (padrão) → nenhum e-mail é disparado ao programar a transferência
- `enabled = true` + `scope = 'interno'` → dispara só pra `email_recipients` (equipe interna); o fornecedor não é avisado
- `enabled = true` + `scope = 'interno_e_fornecedor'` → dispara pra interno **e** pros e-mails resolvidos do endereço de destino (cascata acima)

Configurável na própria tela de cadastro do fornecedor, junto dos endereços.

### E-mail para a filial ao programar nova transferência (nova funcionalidade, com toggle) — a pedido

Simétrico ao recurso acima, só que pro outro lado do `destination_type`: a seção anterior já cobre avisar o **fornecedor** quando `destination_type = fornecedor`; faltava o equivalente pra quando `destination_type = filial` — avisar quem vai *receber* a mercadoria no depósito próprio assim que a transferência é programada. É a peça solta que fecha o par — os dois lados possíveis do destino de uma transferência (filial e fornecedor) passam a ter a mesma capacidade de notificação automática, cada um resolvido pelo cadastro que já lhe pertence (`branch_users` de um lado, `supplier_addresses`/`suppliers.contact_emails` do outro).

- **Toggle único e global** — `feature_flags.key = 'notificar_filial_nova_transferencia'`, editável na mesma tela de Configurações onde ficam os cadastros de filial (seção 4) — **desligado por padrão**, seguindo o mesmo padrão de todo toggle deste documento.
- **Evento de disparo**: o mesmo `INSERT` em `transfers` (seção 4) quando `destination_type = 'filial'`. Importante notar que isso é **independente** do toggle `confirmacao_chegada_filial` e do checkpoint de chegada — é um aviso imediato de "uma transferência foi programada com destino a você", diferente do alerta recorrente de "item parado na filial" (esse último continua condicionado ao checkpoint, como já descrito). São dois eventos distintos do mesmo par `transfers`/filial: um na criação, outro enquanto fica parado.
- **Destinatários**: e-mails dos usuários vinculados em `branch_users` daquela filial — reaproveita a mesma tabela já criada pra atribuição de responsabilidade, em vez de duplicar um cadastro de contatos por filial só pra isso. Se a filial de destino não tiver nenhum `branch_users` vinculado, o envio é pulado silenciosamente (registra em `activity_log` como "notificação pulada — sem destinatário", sem gerar erro visível pro operador que programou a transferência).
- **Reaproveita a infraestrutura de e-mail já especificada** em vez de abrir um caminho paralelo: entra em `email_templates` (novo tipo, ex.: `nova_transferencia_filial`) e passa pela fila `scheduled_emails` com a mesma idempotência/retry da seção acima — herda de graça o botão de "Enviar teste" e o agrupamento por `batch_mode` (relevante se um lote de transferências for programado de uma vez pra mesma filial).
- Cada disparo — ou skip por falta de destinatário — vira uma linha em `activity_log`, seguindo o mesmo padrão de auditoria da seção 7, e fica visível na timeline da NF.

### `email_templates`
Templates por tipo de motivo (avaria/falta/rejeição), com variáveis `{forn}`, `{qtd}`, `{tipo}` substituídas no assunto.

### `scheduled_emails`
Fila de e-mails agendados pra data futura (o formulário de envio de devolução tem campo de agendamento).

**Idempotência e retry (nova funcionalidade).** Se a Edge Function de envio falhar no meio do processamento (timeout, erro do provedor), o item da fila precisa de uma chave de idempotência (`idempotency_key`, ex: hash de `return_id + tipo + destinatário`) pra garantir que um retry automático não duplica o envio nem perde o e-mail. Estado da fila ganha `status` (`pendente`/`enviando`/`enviado`/`falha`) e `attempts` (contador, com backoff entre tentativas); depois de N falhas, o item para de tentar sozinho e aparece no dashboard do desenvolvedor (seção 13) pra intervenção manual.

**Rate limit / agrupamento no envio de alerta (nova funcionalidade).** Se muitos itens vencerem no mesmo dia (ex: fim de mês, pico sazonal), o comportamento ingênuo dispara um e-mail por item — vira spam interno e pode até esbarrar em limite de envio do provedor (Resend/SendGrid). Em vez disso, `alert_rules` agrupa por destinatário: todos os itens que bateriam a mesma regra no mesmo dia entram num único e-mail resumido ("12 NFs atrasadas — ver lista"), não um e-mail por NF. Configurável por regra (`alert_rules.batch_mode: bool`), já que alguns alertas fazem mais sentido individuais (ex: transferência vencida específica) e outros em lote (ex: atraso geral).

### Teste de envio (nova funcionalidade)
Na própria tela de configuração de `email_recipients` e de `scheduled_return_email` (por fornecedor), um botão "Enviar teste" dispara o template real (com dados de exemplo ou de uma NF real escolhida) só pro e-mail do usuário logado, sem gravar em `activity_log` como envio de produção. Reduz o risco de só descobrir um template quebrado ou uma cascata de e-mail mal configurada quando o fornecedor real já recebeu algo errado.

### Webhook WhatsApp/Telegram
Config `{ ativo, tipo, telegram: {token, chatIds[]}, whatsapp: {url, ctoken, phones[]} }` — dispara junto com o alerta de atraso. Vira `notification_channels` no banco novo.

---

## 6. Segurança e permissões — mais granular do que "roles" simples

- **Dono** (sempre admin, detectado via owner da planilha hoje — no banco novo é só o primeiro usuário/flag `is_owner`)
- **Admins extras** — lista configurável, acesso total
- **Cargos customizados** (`roles`) — nome livre + lista de módulos permitidos (`notas`, `lancamento`, `email`, `frete`, `configuracoes`, `auditoria`, `relatorios`, `backup`) + flag `somente_leitura`
- **Vínculo usuário → cargo** (`user_roles`) — usuário sem cargo vinculado vira "Visualizador" (todos os módulos, somente leitura)
- **Modo somente-leitura global** — um único toggle que sobrepõe tudo (menos admins)

No Postgres: `roles`, `role_permissions` (módulo), `user_roles`, `system_config.readonly_global` (bool), tudo aplicado via RLS policy que primeiro checa `is_owner`/admin, depois `readonly_global`, depois o cargo do usuário.

### `feature_flags` — toggles de funcionalidade opcional
Padrão reaproveitado do sistema atual pra qualquer funcionalidade que nem toda operação vai querer ligada: `id`, `key`, `enabled` (bool), `scope` (`global` ou por fornecedor/filial, quando fizer sentido). Toda melhoria desta seção que menciona "ativável" usa essa mesma tabela — não precisa de uma coluna de config nova a cada feature nova.

### Alçada de aprovação por valor (melhoria sobre o sistema atual, com toggle)
Hoje a aprovação de lançamento é fixa: liga/desliga pra todo mundo, com uma lista de aprovadores. Evolução: `approval_rules` ganha `min_value` (nulo = aplica a partir de R$ 0, ou seja, todo lançamento) — lançamentos abaixo do valor configurado seguem direto, sem aprovação; acima, entram na fila de aprovação existente. Controlado por `feature_flags.key = 'aprovacao_por_alcada'`: **desligado** (padrão), o comportamento é o mesmo do sistema atual (aprovação liga/desliga geral, sem faixa de valor); **ligado**, passa a respeitar `min_value`. Isso evita forçar esse comportamento em quem não precisa dele.

---

## 7. Auditoria e analytics — já implementados, só portar pra SQL

O sistema atual já calcula tudo isso em Apps Script; no banco novo isso vira views/queries. Os quatro logs que existiam separados (auditoria, acesso, e-mails enviados, exportações) são, no fundo, "algo aconteceu, feito por alguém, em algum momento" com detalhes que variam por tipo — viram uma tabela só:

### `activity_log` — tabela única pros 4 logs
`id`, `event_type` (`field_change` / `access` / `email_sent` / `export`), `actor` (usuário), `entity_type` (`return` / `transfer` / `page` / etc.), `entity_id`, `payload` (jsonb — guarda o que for específico de cada tipo: valor anterior/novo pra `field_change`, página acessada pra `access`, destinatários/assunto/anexos pra `email_sent`, formato/quantidade pra `export`), `created_at`.

Uma tabela com índice em `event_type` e `created_at` cobre a trilha de auditoria genérica, o log de acesso, o histórico de e-mails enviados e o log de exportações, sem manter 4 schemas paralelos que fazem a mesma coisa com nomes de coluna diferentes.

**Correção — verificação de duplicidade por match exato.** O sistema atual checa "e-mail já enviado pra essa NFD" com `indexOf` numa string concatenada — a NFD "10" bate como substring dentro de "110" ou "1023", gerando falso positivo (ou, em outros casos, falso negativo). No banco novo isso é uma query relacional exata (`WHERE payload->>'nfd' = :nfd`), o problema desaparece pelo próprio modelo, mas vale registrar o porquê pra não reintroduzir comparação por texto em nenhuma busca parecida (NF, NFD, chave de acesso) no sistema novo.

- **Scorecard de fornecedores** — ranking por volume/valor + motivos mais frequentes por fornecedor
- **SLA por fornecedor** — tempo médio (dias) entre entrada e resolução, cruzando `returns.data_entrada` com o evento `field_change` de status em `activity_log`
- **Comparativo entre dois períodos** customizados (quantidade, valor, pendentes, devolvidos, fornecedores únicos, top motivos)
- **`supplier_stats_mv`** — view materializada alimentando as abas por fornecedor do dashboard, o gráfico de barras comparativo, o donut de status e a tendência mensal (com seletor de 3/6/12 meses)

O scorecard ganha dois complementos na seção 15, a pedido: **agrupamento automático por problema recorrente** (15.12) e um **índice de qualidade do fornecedor** (15.13) que combina SLA, recorrência de motivo e valor devolvido numa nota única — ambos consultam a mesma `supplier_stats_mv` acima, não precisam de fonte de dado nova.

### Exportação self-service filtrada (nova funcionalidade)
Além dos 5 relatórios PDF fixos (seção 11), uma tela onde qualquer usuário com permissão de relatório monta seu próprio filtro (fornecedor, filial responsável, período, status, motivo, tipo) e exporta CSV/XLSX direto da consulta — sem depender de um relatório pré-formatado pra necessidade pontual (ex: "só as NFs da filial X paradas há mais de 20 dias"). Reaproveita a mesma camada de RLS/permissão dos relatórios existentes, é só uma UI de query builder simples sobre `returns`/`transfers`/`activity_log`.

---

## 8. Importação de XML da NF-e

O formulário de lançamento atual já faz parse client-side do XML (tags `nNF`, `xNome`, `xProd`, `qCom`, `vUnCom`, `vNF`) e preenche o formulário automaticamente. Essa lógica é portável quase 1:1 pro frontend novo — não precisa reescrever o parser, só adaptar pro componente React. Mantém a mesma UX: usuário sobe o XML, campos são preenchidos, ele revisa e confirma.

---

## 9. Arquivamento automático por volume

Diferente de um cron por tempo, o sistema atual arquiva automaticamente quando o contador de itens concluídos (`Devolvido`/`Venda`) atinge 40. No banco novo isso vira um trigger:

```sql
-- Pseudocódigo: após UPDATE que conclui um item, checa o total e dispara arquivamento
AFTER UPDATE ON returns
WHEN NEW.status IN ('devolvido','venda')
EXECUTE FUNCTION check_and_archive_if_threshold_reached();
```

Existe também **arquivamento manual forçado** (botão no menu principal) e **retenção configurável** (quantos dias manter histórico antes de arquivar).

### Correção — retenção de anexo em janela de 10 dias, não exclusão imediata
O sistema atual apaga o anexo da NF do Drive **no momento do arquivamento** (`_apagarAnexoDrive`), inclusive quando isso é disparado automaticamente pelo envio de e-mail de tipo "Falta" — o usuário perde o arquivo sem perceber, e como reabertura só olha abas ativas, é praticamente irreversível. Ao mesmo tempo, guardar o anexo pra sempre depois de resolvido não faz sentido pro negócio (a nota já foi resolvida).

O correto é uma **janela de carência**: o anexo continua acessível por 10 dias após a resolução (baixa/venda), e só depois disso é excluído de fato — dando tempo de reabrir e corrigir caso necessário, sem acumular arquivo pra sempre.

- `returns.resolved_at` — timestamp de quando o status virou `Devolvido`/`Venda` (preenchido pelo mesmo fluxo que já muda o status, não precisa de trigger extra)
- Job diário (`pg_cron`) busca `files` cujo `return_id` aponta pra um `return` com `resolved_at < now() - interval '10 days'` e ainda `status IN ('devolvido','venda')`, apaga do R2 e marca a linha como `deleted_at`
- Se o item for **reaberto** dentro da janela de 10 dias, `resolved_at` volta a `null` — o job para de considerar esse arquivo, ele nunca é apagado enquanto o item não estiver resolvido de novo
- O período (10 dias) fica em `system_config.attachment_retention_days`, configurável — dá pra ajustar sem mudar código se decidirem que precisa de mais tempo pra algum tipo de devolução

### Modo simulação pra regras de arquivamento e alertas (nova funcionalidade)
Antes de mudar o `threshold_value` de uma `alert_rule` (seção 13) ou o limite de 40 itens do arquivamento automático, rodar em modo dry-run contra os dados reais e mostrar quantos itens/registros seriam afetados com o novo valor, sem executar nada — evita susto em produção (ex: baixar o threshold de atraso de 30 pra 15 dias e disparar alerta pra 200 NFs de uma vez sem aviso prévio). Aplica-se a qualquer regra baseada em `feature_flags`/`alert_rules`, não precisa de mecanismo separado por tipo de regra.

---

## 10. Estrutura geral / UX (herdada da v1 deste documento, ainda válida)

- Command palette (Ctrl+K) — client-side, sem tabela própria
- Painel de saúde do sistema — checagem ao vivo (Supabase/R2/e-mail), sem histórico persistido por padrão (versão rápida e pra qualquer usuário; a versão consolidada com histórico, só pra desenvolvedor, é o dashboard da seção 13)
- Ações rápidas "Verificar atrasos agora" / "Forçar arquivamento manual" — disparam manualmente as mesmas Edge Functions dos crons
- Notas rápidas — bloco de texto livre por usuário (`user_notes`), pessoal e sem vínculo com nenhuma NF (não confundir com os comentários por NF da seção 15.1, que são compartilhados e ligados a um `return`/`transfer` específico)
- Badge de pendências/vencidas no menu — reaproveita contagem dos KPIs
- Stepper de pré-visualização reutilizável para baixa em lote, reabertura e baixa para venda (padrão de 3 passos: seleção → prévia com avisos de item não localizado → confirmação)
- Busca unificada ativos + histórico, com badge de origem
- Atalhos de teclado documentados em painel de ajuda (`?`)

### Central de notificações in-app com histórico (nova funcionalidade)
O plano já prevê alerta via Supabase Realtime (seção 2), mas isso é só o "toast" no momento em que acontece — falta um lugar persistente pra revisar notificações passadas dentro do próprio sistema. Um sino no header com lista (lidas/não lidas), alimentado pelos mesmos eventos que já disparam `alert_rules` e responsabilidade por filial (seção 4) — não precisa de fonte de dado nova, é uma view/inbox sobre o que já é gerado. A seção 15 usa essa mesma fonte pra alimentar a "caixa de trabalho" pessoal (15.5) e as @menções de comentário (15.1), em vez de criar um segundo sistema de notificação paralelo.

### Calendário visual de transferências agendadas (nova funcionalidade)
Visão de agenda/mês, além da lista já prevista, mostrando `transfers.scheduled_date` — útil pra enxergar concentração de coletas/entregas num dia específico e replanejar rota (complementa a roteirização de coleta da seção 4).

### Trilha "antes/depois" inline na tela da NF (nova funcionalidade)
O `activity_log` já grava `field_change` com valor anterior/novo (seção 7), mas hoje isso só é consultado na tela de Auditoria separada. Mostrar um mini-histórico direto na tela de detalhe da NF (sem precisar trocar de tela) agiliza conferência de quem mudou o quê, incluindo as novas transições de responsabilidade por filial. A seção 15 generaliza esse mini-histórico numa **linha do tempo visual** única (15.4), que também absorve comentários (15.1) e comunicações (15.3) na mesma tela — em vez de três widgets separados de "coisas que aconteceram nessa NF".

### Onboarding guiado pra usuário novo (nova funcionalidade)
Tour interativo na primeira vez que cada módulo é aberto — o sistema tem bastante regra de negócio não óbvia pra quem chega agora (ex: por que não dá pra marcar "Devolvido" manualmente, ou por que a responsabilidade de uma NF pode pertencer a uma filial e não à pessoa que lançou).

### Central de ajuda contextual — FAQ por tela (nova funcionalidade)
Estende o painel de ajuda (`?`) que já existe pra atalhos de teclado, adicionando uma aba de FAQ específica por módulo (ex: FAQ de Transferências explica o fluxo de responsabilidade por filial; FAQ de Configurações explica escopo de `email_recipients`). Conteúdo estático versionado junto do código, sem precisar de CMS.

### Changelog visível in-app (nova funcionalidade)
Página simples listando o que mudou a cada release — o sistema atual já tem um histórico de versão extenso (`v6.0`, `v6.1`, `v6.2`...) só em comentário de código, invisível pro usuário final. Uma tabela `changelog_entries` (ou até um arquivo markdown versionado servido estático) com data, versão e bullets do que mudou resolve isso sem burocracia.

---

## 11. Roadmap de implementação (revisado)

1. **Fase 1 — Núcleo com máquina de estados**: `suppliers`, `returns` com constraint de transição de status, status `Rascunho` opcional (fora da máquina formal), `return_reasons`, lançamento individual/lote, detecção de NF duplicada, lixeira, padrão de concorrência em ações de lote
2. **Fase 2 — Transferências**: `transfers` com lotes, destino filial/fornecedor, checkpoint opcional de "chegada no depósito" (`arrived_at_branch_at`, toggle `confirmacao_chegada_filial`), baixa (com assinatura digital opcional), cancelamento (com motivo obrigatório), reagendamento, alerta de vencida; cadastro de `branches` e `supplier_addresses`; `branch_users` e atribuição de `returns.responsible_branch_id` (dependente do checkpoint acima); sugestão de roteirização de coleta (toggle `roteirizacao_coleta`); etiqueta de caixa 100×100 com logo
3. **Fase 3 — Comunicação**: `email_recipients` unificada (geral/alerta/fornecedor) + fallback em cascata de e-mail por endereço/fornecedor + e-mail de devolução programada (opcional, por fornecedor), templates, agendamento, webhook WhatsApp/Telegram, teste de envio, idempotência/retry e agrupamento (`batch_mode`) na fila
4. **Fase 4 — Segurança**: cargos customizados, admins, modo RO global, RLS completo, `feature_flags`, alçada de aprovação por valor (opcional), 2FA opcional para admin
5. **Fase 5 — Relatórios e dashboard**: 5 relatórios em PDF, exportação self-service filtrada, dashboard com abas por fornecedor + donut + tendência + bloco de responsabilidade por filial
6. **Fase 6 — Auditoria e analytics**: `activity_log` unificado, trilha antes/depois inline na NF, scorecard, SLA, comparativo de períodos
7. **Fase 7 — Import de XML da NF-e**: portar o parser client-side existente
8. **Fase 8 — Arquivamento automático + retenção configurável**: inclui modo simulação (dry-run) antes de aplicar novo threshold
9. **Fase 9 — Importação de dados históricos** (independente, pode rodar em paralelo)
10. **Fase 10 — Experiência e suporte** (pode rodar em paralelo às demais, não bloqueia nenhuma): central de notificações in-app, calendário de transferências, onboarding guiado, FAQ contextual, changelog in-app, dashboard de saúde do desenvolvedor, sandbox de homologação
11. **Fase 11 — Colaboração e produtividade (seção 15)**: `comments` com @menções/resolvido/anexos (após Fase 1), `follow_ups` (após Fase 1), linha do tempo visual e caixa de trabalho pessoal (após centrais de notificação da Fase 10), dashboard financeiro e agrupamento por problema recorrente/índice de qualidade (após `supplier_stats_mv` da Fase 6), modelos de devolução (após `return_reasons` da Fase 1) — sem dependência entre si, cada item pode entrar assim que sua base estiver pronta

**Transversal a todas as fases**: testes automatizados (seção 12), incluindo teste dedicado de cascata de e-mail, alertas configuráveis e e-mail do desenvolvedor (seção 13) desde o primeiro PR, não como item isolado no fim.

---

## 12. Testes automatizados (melhoria sobre o sistema atual)

O sistema atual já tem uma suíte própria (`Testes.gs`) cobrindo `getSS`, contadores, `_baterTermos`, saúde do sistema, scorecard, SLA — vale formalizar isso como prática desde o dia 1 do projeto novo, cobrindo o sistema completo (não só lógica isolada), não deixar pra depois:

- **Vitest** pra lógica de negócio no frontend/Edge Functions (parser de XML, cálculo de KPIs, montagem de e-mail, resolução de e-mail em cascata)
- **pgTAP ou testes de integração** pras constraints do banco — principalmente a máquina de estados de `returns.status` (seção 3), que é a parte mais arriscada de errar numa migração: um teste que tenta cada transição inválida e confirma que o banco rejeita, não só a UI
- Teste de concorrência pro padrão de `UPDATE ... WHERE status = X` em ações de lote (seção 3)
- **Playwright (E2E)** cobrindo os fluxos críticos ponta a ponta, não só unidades isoladas:
  - Lançamento individual e em lote → item aparece na lista com status correto
  - Programar transferência (filial/fornecedor) → baixa → status vira "Devolvido"
  - Reabertura exige motivo e volta pra "Pendente"
  - Detecção de NF duplicada bloqueia ou pede confirmação, conforme configurado
  - Permissão por cargo: usuário sem módulo liberado não vê a tela nem os dados (a query nem retorna — ver seção 13)
  - Alerta de atraso e alerta de transferência vencida disparam nas condições certas (job manual "Verificar atrasos agora" da seção 10 serve de gatilho determinístico pro teste, em vez de esperar o cron)
  - Confirmação de chegada no depósito (com toggle `confirmacao_chegada_filial` ligado) transfere `responsible_branch_id` corretamente, e alerta `devolucao_parada_filial` dispara só pros `branch_users` da filial certa
- CI rodando a suíte inteira (unit + integração + E2E) em cada PR, bloqueando merge se falhar

### Teste de resolução de cascata de e-mail (nova funcionalidade)
Caso dedicado, não só implícito dentro do teste de envio: dado um `supplier_addresses` sem `contact_emails` próprio, confirma que a resolução cai pro `suppliers.contact_emails` geral; dado um endereço com e-mail próprio, confirma que usa só esse e ignora o geral. É lógica de negócio nova o suficiente (seção 5) pra merecer cobertura explícita, já que um bug aqui manda e-mail pro destinatário errado silenciosamente.

### Sandbox / ambiente de homologação com dados de teste (nova funcionalidade)
Ambiente isolado (banco Supabase separado ou schema separado) com dados sintéticos, pra treinar usuário novo ou testar `feature_flags` (assinatura digital, alçada de aprovação, e-mail programado, 2FA) sem afetar dado real — o Google Sheets atual não permitia isolar isso, qualquer teste mexia na planilha de produção. Toggle simples no ambiente indicando "MODO HOMOLOGAÇÃO" visível em toda tela, pra nunca confundir com produção.

## 13. Alertas configuráveis e observabilidade

### `alert_rules` — generalização dos alertas do sistema atual
O sistema atual já tem alerta de atraso (+30 dias) e alerta de transferência vencida, cada um com sua própria configuração espalhada. Generalizando num padrão único, reaproveitando `feature_flags` (seção 6) como base e estendendo com canal e limiar:

```sql
alert_rules
  id, key ('atraso_nf' | 'transferencia_vencida' | 'devolucao_parada_filial' | 'sinistro_valor_alto' | ...),
  enabled (bool),
  threshold_value (ex: dias de atraso — configurável em vez de fixo em 30; pra 'sinistro_valor_alto', o mesmo campo guarda um valor em R$ em vez de dias),
  channels (jsonb — quais de email/telegram/whatsapp estão ligados pra essa regra),
  batch_mode (bool — agrupa vários itens da mesma regra/destinatário num único envio, em vez de um e-mail por item; ver seção 5)
```

Cada regra liga/desliga independente e escolhe seus próprios canais, sem precisar de tela nova a cada tipo de alerta futuro — só um novo registro em `alert_rules`. A regra `devolucao_parada_filial` (seção 4) é o exemplo de como um novo tipo de alerta de negócio entra nesse padrão sem exigir tabela própria.

**`sinistro_valor_alto` — alerta de valor elevado, configurável em vez de fixo (a pedido).** Em vez de um "e-mail automático pra sinistro acima de R$ 10 mil" com limiar embutido no código, é só mais um registro em `alert_rules`: dispara quando `returns.valor_total` (no lançamento ou na entrada em `transfers`) ultrapassa o `threshold_value` configurado em Configurações — o valor de corte fica editável sem deploy, e como `feature_flags`/`alert_rules` já suportam `scope` por fornecedor/filial (seção 6), dá pra ter um limiar geral e exceções específicas (ex: um fornecedor de alto valor unitário com limiar maior) sem mecanismo extra.

### E-mail do desenvolvedor — alerta de erro de sistema
O sistema atual grava erro em log (`registrarErroSistema`) e mostra num painel de diagnóstico, mas ninguém é avisado ativamente quando algo quebra — é preciso abrir o painel pra descobrir. Sentry (seção 2) já cobre a captura e o agrupamento técnico do erro; falta o gatilho de aviso direto pro responsável:

```sql
system_config
  ...
  developer_email       text,   -- e-mail de quem mantém o sistema
  developer_alert_level text    -- 'critico' (só uncaught/falha de job) | 'todos'
```

Sentry dispara o alerta (integração nativa dele, e-mail ou Slack) pro `developer_email` conforme o `developer_alert_level` configurado. Esse canal é **separado** de `email_recipients` — o desenvolvedor não deve receber relatório semanal de negócio, e erro de sistema não deve vazar pro fornecedor.

### Alerta de e-mail não entregue — bounce (nova funcionalidade)
Resend/SendGrid retornam webhook de bounce/reclamação, e hoje o plano não trata isso. Um endpoint dedicado recebe o webhook, marca o `scheduled_emails`/`activity_log` correspondente como `bounced`, e, se o mesmo endereço falhar persistentemente (N vezes seguidas), marca esse e-mail como suspeito em `email_recipients`/`supplier_addresses` — evita continuar tentando enviar pra um endereço morto sem ninguém perceber, e alimenta o dashboard abaixo.

### Dashboard de saúde do desenvolvedor (nova funcionalidade)
Painel único, acessível só por quem tem flag de desenvolvedor/admin técnico (distinto do admin de negócio da seção 6), consolidando **tudo que hoje ficaria espalhado em logs técnicos**:
- Saúde de cada `alert_rule` — quando disparou pela última vez, quantos itens pegou, se está com `threshold_value` provavelmente mal calibrado (ex: dispara todo dia pro mesmo conjunto de itens que nunca resolve)
- Fila de `scheduled_emails` com falha — itens que esgotaram as tentativas de retry (seção 5) e precisam de intervenção manual
- E-mails com bounce persistente (acima) — lista de endereços suspeitos aguardando correção de cadastro
- Erros capturados pelo Sentry, com o mesmo nível de detalhe hoje só visível no painel de diagnóstico do sistema atual (stack trace, agrupamento), mas centralizado aqui em vez de exigir abrir outra ferramenta
- Estatísticas de jobs agendados (`pg_cron`): última execução, duração, sucesso/falha de cada cron (arquivamento, alertas diários, retenção de anexo, envio de e-mail agendado)

A ideia é um só lugar — **tudo que envolve manutenção técnica do sistema** (não métrica de negócio, que já tem o scorecard/dashboard por fornecedor da seção 7 e a aba financeira da seção 15.8) — em vez de o desenvolvedor precisar cruzar Sentry + logs do Supabase + tabela de e-mail manualmente a cada investigação. É a versão persistida e consolidada do "Painel de saúde do sistema" que a seção 10 já lista como checagem ao vivo sem histórico — aquele responde "está tudo no ar agora?" pra qualquer usuário; este responde "o que precisa de atenção técnica?" só pra quem tem a flag de desenvolvedor, com o histórico que o outro não guarda.

## 14. Segurança

- RLS no Supabase aplicando: `is_owner`/admin → acesso total; `readonly_global` → bloqueia escrita pra não-admins; cargo do usuário → módulos + RO específico
- URLs assinadas com expiração curta para leitura de arquivos no R2
- Credenciais de Supabase e R2 nunca expostas no client — tudo via Edge Function
- OAuth do Google usado só durante a importação, com escopo de leitura

### Autenticação de dois fatores para admin — ativável via config (nova funcionalidade)
Reforço de segurança pra quem tem acesso total (`is_owner`/admins extras), hoje coberto só pelo login padrão do Supabase Auth. Controlado por `feature_flags.key = '2fa_admin'` — **desligado** por padrão (comportamento igual ao sistema atual); **ligado**, exige segundo fator (TOTP via app autenticador, já suportado nativamente pelo Supabase Auth) no login de qualquer usuário com `is_owner` ou admin extra. Não se estende a cargos comuns nessa primeira versão — é especificamente pra quem tem acesso total, onde o risco de conta comprometida é maior.

### Correção — permissão negada antes da query, nunca escondida depois
O sistema atual carrega o HTML/JS do módulo inteiro e só checa permissão *depois*, decidindo se mostra "Acesso negado" — o dado já trafegou até o navegador antes da checagem, então esconder na tela não é controle de acesso de verdade. No sistema novo isso já é resolvido pelo desenho do RLS acima (a policy barra a query no banco, antes de qualquer linha sair), mas fica registrado explicitamente como regra: **negação de acesso nunca é "renderizar e esconder"**, é sempre "a query nem retorna".

### Correção — nenhum painel de diagnóstico exposto por padrão
O sistema atual tem um bloco de debug (`// DEBUG: remover após confirmar funcionamento`) esquecido em produção — mostra e-mail do usuário, se é admin e a lista de módulos permitidos, pra qualquer um que abrir a tela. No sistema novo, qualquer painel de diagnóstico (inclusive o de saúde do sistema da seção 10 e o dashboard de saúde do desenvolvedor da seção 13) só é acessível a admin, e nenhum log de diagnóstico client-side fica ativo fora de ambiente de desenvolvimento — checklist de release deve incluir "nenhum `console.log`/painel de debug com dado sensível chega em produção".

---

## 15. Colaboração e produtividade diária (novas funcionalidades, avaliadas a pedido)

Lista de funcionalidades propostas depois da v4, avaliadas uma a uma. A maioria entra **sem precisar de mecanismo novo** — só reaproveita `activity_log`, `alert_rules`, `feature_flags` e a central de notificações já especificados; só `comments` e `follow_ups` são tabelas genuinamente novas. Duas propostas foram deliberadamente fundidas com outra pra evitar duplicar conceito (observação fixada → dentro de comentários; "o que mudou hoje" → substituído direto pela versão personalizada).

### 15.1 Comentários internos (nova funcionalidade — peça que faltava)
Não existia no v4 e é a lacuna mais sentida no uso diário: hoje só dá pra "conversar" sobre uma NF através do campo `Obs` de texto livre, sem autor, sem histórico, sem thread. Tabela nova:

```sql
comments
  id, entity_type ('return' | 'transfer'), entity_id,
  author_id, body, created_at, edited_at,
  pinned (bool),              -- ver 15.9, observação fixada é isso mesmo, não uma feature separada
  resolved (bool), resolved_by, resolved_at
comment_mentions
  comment_id, user_id          -- parseado de @nome no body ao salvar
```

Os três recursos pedidos junto entram naturalmente:
- **@menções** — parse de `@nome` no body ao salvar, grava em `comment_mentions` e dispara uma notificação pela central já especificada (seção 10) — mesma fonte, sem canal paralelo.
- **Resolvido** — encerra a discussão sem apagar (`resolved = true`); comentários resolvidos colapsam por padrão na UI, mas continuam na timeline (15.4).
- **Anexos no comentário** — reaproveita a tabela `files` já unificada (seção 3) com `entity_type = 'comment'`, em vez de um campo de upload próprio.

Cada comentário (criação, edição, resolução) também vira uma linha em `activity_log` (`event_type = 'comment'`), então entra de graça na linha do tempo (15.4) e no "o que mudou desde sua última visita" (15.9).

### 15.2 Observação fixada — não é uma feature separada
Dá pra fixar qualquer comentário (`pinned = true`) pra ele aparecer sempre no topo da tela de detalhe da NF, acima da timeline — útil pra "atenção: esse fornecedor exige embalagem especial" ou similar. Modelar como um campo booleano em `comments` evita ter dois lugares diferentes pra anotação numa NF (Obs de texto livre de um lado, observação fixada de outro).

### 15.3 Histórico de comunicação por NF
Não é uma tabela nova — é uma view filtrada sobre o que já existe: `scheduled_emails` enviados (seção 5) + disparos de webhook WhatsApp/Telegram (seção 5) + comentários (15.1), tudo filtrado por `entity_id = returns.id`. Uma aba "Comunicação" na tela de detalhe da NF, com o mesmo padrão de aba que a tela de Configurações já usa em vários lugares (seção 6). Substitui, focado por NF, o que a aba "E-mails Enviados" do sistema atual só mostra de forma global.

### 15.4 Linha do tempo visual
Generaliza a "trilha antes/depois" que a seção 10 já previa: um componente único na tela de detalhe da NF que intercala, em ordem cronológica, `field_change` (mudança de status/campo), comentários (15.1, incluindo os fixados destacados no topo) e comunicações enviadas (15.3) — em vez de três blocos separados de "coisas que aconteceram". Consulta simples de `activity_log` (`WHERE entity_id = :id ORDER BY created_at`) mais o join com `comments`; sem tabela nova, é composição de UI sobre dado que já existe.

### 15.5 Centro de tarefas — como "Minha caixa de trabalho", não "minhas devoluções"
Concordo com o ajuste sugerido: uma tela genérica de "minhas devoluções" duplicaria o que a busca/lista principal já resolve com filtro por responsável. O que falta é uma **caixa de entrada pessoal** que cruza várias fontes já especificadas, todas filtradas por "relacionado a mim":

- Aprovações pendentes que eu preciso decidir (`approval_rules`, seção 6)
- Notificações não lidas da central (seção 10), incluindo @menções (15.1)
- NFs sob responsabilidade da minha filial (`branch_users` + `responsible_branch_id`, seção 4)
- Follow-ups vencidos ou vencendo hoje, atribuídos a mim (15.6)
- Comentários não resolvidos onde fui mencionado (15.1)

É uma tela de agregação (view/query), não uma entidade nova — cada item já tem dono e prazo no seu próprio módulo; a caixa de trabalho só junta num lugar só o que já é "seu" espalhado pelo sistema.

### 15.6 Agenda de follow-up (nova funcionalidade — sentida falta, tabela nova)
```sql
follow_ups
  id, return_id, due_date, note,
  created_by, assigned_to,
  done (bool), done_at
```
Criado a partir da tela de detalhe da NF ("lembrar de cobrar o fornecedor em 3 dias"). Follow-up vencido aparece na caixa de trabalho (15.5) e, se o toggle correspondente estiver ligado, gera notificação pela central (seção 10) no dia — reaproveita o mesmo canal, não é um novo tipo de alerta em `alert_rules` porque é individual e pontual (não uma regra recorrente sobre todo o volume).

### 15.7 Modelos de devolução (nova funcionalidade)
```sql
return_templates
  id, supplier_id (nulo = genérico, disponível pra qualquer fornecedor),
  name, default_type, default_reason_id, default_descricao
```
No formulário de lançamento, um seletor opcional de modelo pré-preenche tipo, motivo (`return_reasons`, seção 3) e descrição pra devoluções repetitivas do mesmo padrão (ex: sempre a mesma avaria de transporte com o mesmo fornecedor) — o operador ainda confere e ajusta NF/quantidade/valor, que nunca vêm do modelo.

### 15.8 Dashboard financeiro — aba do dashboard existente, não módulo novo
Concordo com o ajuste: vira mais uma aba dentro do dashboard já especificado (seção 10), ao lado das abas por fornecedor — reaproveita a mesma `supplier_stats_mv` (seção 7) e o mesmo seletor de período. Conteúdo: valor total devolvido por período, frete acumulado (somando `transfers.freight_value`), ticket médio por devolução, comparativo de custo de frete por tipo (Tabela/Valor+ICMS/Valor/Cortesia). Não introduz tabela nova.

### 15.9 "O que mudou desde minha última visita" — substitui o painel "hoje", não some ao lado dele
As duas propostas resolvem o mesmo problema ("o que preciso saber que aconteceu") em granularidades diferentes; a versão personalizada é estritamente melhor (quem só entra 2x por semana não perde nada que ficou pra trás num painel fixo de "hoje"), então implementa **só essa**, evitando manter dois painéis parecidos:

- `users.last_seen_at` — atualizado a cada login/sessão nova (não a cada clique, pra não virar "agora mesmo" o tempo todo)
- Ao abrir o sistema, uma faixa/painel resume `activity_log` com `created_at > last_seen_at` relevante ao usuário (fornecedores/filial que ele acompanha, NFs onde foi mencionado) — mesma fonte de dado da timeline (15.4) e da caixa de trabalho (15.5), só com o filtro de tempo trocado.
- Pra supervisor que realmente quer a visão "hoje, todo mundo", o filtro de período da Exportação self-service (seção 7) já cobre isso sem precisar de um painel dedicado.

### 15.10 Indicador de atividade por filial
Evita duas pessoas mexendo na mesma NF/filial sem saber uma da outra — presença leve (avatares/iniciais de quem está com a tela de detalhe daquela NF ou do dashboard daquela filial aberta agora), via o canal Supabase Realtime que o plano já usa pra alertas (seção 2). Não é persistido — desaparece quando a aba fecha ou a sessão expira, é só "quem está olhando isso agora", não um log.

### 15.11 E-mail automático para valor alto — ver seção 13
Já coberto como exemplo generalizado dentro de `alert_rules` (`sinistro_valor_alto`, seção 13) — limiar configurável em R$, não fixo em R$ 10 mil, e reaproveita o mesmo motor de regras em vez de um caminho de e-mail dedicado.

### 15.12 Agrupamento automático por problema recorrente
Extensão do scorecard (seção 7): agrupa `returns` por `(supplier_id, reason_id)` num período configurável e sinaliza quando a contagem ou o valor acumulado ultrapassa um limiar — "esse fornecedor teve 8 avarias de transporte nos últimos 30 dias" aparece destacado na aba do fornecedor no dashboard, em vez de só existir implicitamente somando linha por linha. É a mesma lógica que o sistema atual já faz de forma simples (`obterMotivosFrequentes`), portada e com limiar de destaque configurável em vez de só listar.

### 15.13 Índice de qualidade do fornecedor
Nota composta (0–100, por exemplo) por fornecedor, combinando o que o scorecard (seção 7) já calcula separado: SLA médio, taxa de recorrência do mesmo motivo (15.12) e proporção valor devolvido/valor total comprado (se o volume de compra for uma informação disponível; senão, fica só com os dois primeiros fatores). Complementa o ranking simples por volume que já existe, dando um número único pra comparar fornecedores de porte diferente. Consulta a mesma `supplier_stats_mv`, sem tabela nova.

### 15.14 Roadmap — onde essas funcionalidades entram
Não abre fase nova: são complementos que se apoiam em `activity_log`/`alert_rules`/`feature_flags` (Fases 1, 3, 4, 6), então entram junto das fases que já criam essa base, exceto `comments` e `follow_ups` (tabelas genuinamente novas), que só podem começar depois que `returns`/`transfers` existirem (Fase 1/2 concluídas). Ver ajuste no roadmap da seção 11.
