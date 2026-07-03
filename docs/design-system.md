# Design System — Sistema de Devoluções

Fonte única de verdade visual do produto. Toda UI nova (Tasks 13-16, 20, e futuras)
deve conseguir ficar consistente lendo **só este arquivo** — sem precisar olhar telas
existentes ou adivinhar. Se uma tela precisar fugir de uma regra aqui, atualize este
arquivo também.

## Contexto do produto

Ferramenta interna de gestão de devoluções para uma transportadora. Usada por
operadores todos os dias, em desktop, muitas vezes por 8h seguidas. Não é um produto
consumer — não precisa "vender", precisa deixar o operador encontrar a informação
certa rápido e sem fadiga visual. Prioridades, em ordem: clareza, densidade
tolerável (tabelas com várias linhas visíveis por tela), varredura rápida (scan),
rótulos em pt-BR.

Gerado com o skill `ui-ux-pro-max` (`--design-system`, produto "internal admin
dashboard logistics returns management enterprise b2b dense") e refinado à mão para
evitar o visual genérico zinc/slate padrão do shadcn, mantendo baixo croma para uso
prolongado.

## Direção escolhida: "Quiet Authority"

Um console operacional: superfícies neutras e frias (quase brancas, quase pretas),
tipografia extremamente legível, e **um único acento de identidade** (terracota,
referência à cor de frota/logística) reservado para marca e para os poucos pontos
que realmente precisam chamar atenção. Tudo o resto — botões primários, links, foco —
usa um azul-marinho sóbrio, não o acento. Isso evita a "poluição colorida" comum em
dashboards mal calibrados e mantém o acento com força quando ele aparece.

Estilo base de referência: *Data-Dense Dashboard* (grids compactos, padding mínimo,
tabelas como elemento central) — mas com tipografia humanista no lugar de
monoespaçada, porque esta ferramenta é majoritariamente formulários e listas, não
código.

**Evitar (anti-padrões):** glassmorphism, sombras pesadas, gradientes decorativos,
ícones emoji, mais de um acento de cor competindo por atenção, texto cinza-sobre-cinza.

## Paleta de cores

Os tokens abaixo substituem os valores padrão do shadcn em `app/globals.css`
(`:root` e `.dark`). Valores em `oklch()` para consistência com o arquivo existente.

| Papel (var CSS)              | Uso                                              | Light                        | Dark                          |
|-------------------------------|---------------------------------------------------|-------------------------------|---------------------------------|
| `--background`                | fundo da página                                   | `oklch(0.985 0.003 240)`      | `oklch(0.17 0.018 255)`         |
| `--foreground`                | texto principal                                   | `oklch(0.18 0.02 255)`        | `oklch(0.96 0.005 250)`         |
| `--card` / `--popover`        | superfícies elevadas (cards, dropdowns, dialogs)  | `oklch(1 0 0)`                | `oklch(0.22 0.02 255)`          |
| `--card-foreground` / `--popover-foreground` | texto sobre superfícies elevadas   | `oklch(0.18 0.02 255)`        | `oklch(0.96 0.005 250)`         |
| `--primary`                   | ações primárias, links, foco                      | `oklch(0.32 0.09 255)`        | `oklch(0.7 0.11 255)`           |
| `--primary-foreground`        | texto sobre `--primary`                           | `oklch(0.985 0 0)`            | `oklch(0.15 0.02 255)`          |
| `--secondary`                 | botões/superfícies secundárias                    | `oklch(0.95 0.006 250)`       | `oklch(0.29 0.02 255)`          |
| `--secondary-foreground`      | texto sobre `--secondary`                         | `oklch(0.25 0.02 250)`        | `oklch(0.96 0.005 250)`         |
| `--muted`                     | fundos discretos (linhas zebradas, badges neutros)| `oklch(0.955 0.005 250)`      | `oklch(0.27 0.018 255)`         |
| `--muted-foreground`          | texto secundário / legendas                       | `oklch(0.48 0.02 255)`        | `oklch(0.72 0.02 250)`          |
| `--accent`                    | hover states neutros (não é o acento de marca!)   | `oklch(0.93 0.02 250)`        | `oklch(0.32 0.025 255)`         |
| `--accent-foreground`         | texto sobre `--accent`                            | `oklch(0.25 0.02 250)`        | `oklch(0.96 0.005 250)`         |
| `--destructive`                | erros, exclusão, estados de bloqueio              | `oklch(0.577 0.215 25)`       | `oklch(0.65 0.2 22)`            |
| `--border` / `--input`        | bordas, divisores, contorno de inputs             | `oklch(0.9 0.008 250)`        | `oklch(1 0 0 / 12%)`            |
| `--ring`                      | anel de foco (acessibilidade de teclado)          | `oklch(0.5 0.12 255)`         | `oklch(0.7 0.11 255)`           |
| `--brand` *(novo token)*      | identidade visual: logo, indicador de item ativo, badges de destaque pontuais | `oklch(0.62 0.15 45)` | `oklch(0.68 0.15 45)` |
| `--brand-foreground` *(novo)* | texto sobre `--brand`                             | `oklch(0.99 0.01 80)`         | `oklch(0.16 0.02 40)`           |

Regra de uso do `--brand`: só aparece no logotipo/wordmark, no indicador de
navegação ativa e em, no máximo, um badge de destaque por tela (ex.: "Vencendo
hoje"). Nunca em botão de ação primária — isso é papel do `--primary`.

`--chart-1..5` continuam disponíveis para Task 20+ (gráficos) — devem ser
recalibrados para hue ~255 (azul) e ~45 (terracota) quando esses componentes forem
implementados, para casar com a paleta acima em vez dos cinzas neutros atuais.

## Tipografia

Par escolhido via `ui-ux-pro-max --domain typography`: **Corporate Trust**
(Lexend + Source Sans 3) — combinação desenhada para leitura prolongada e
acessibilidade, comum em contextos enterprise/governo, evita o clichê "Inter em
tudo".

- **Heading (`--font-heading`):** [Lexend](https://fonts.google.com/specimen/Lexend), pesos 500/600/700.
- **Body (`--font-sans`, aplicado ao `<body>`):** [Source Sans 3](https://fonts.google.com/specimen/Source+Sans+3), pesos 400/500/600.
- Carregadas via `next/font/google` em `app/layout.tsx` (self-hosted, `font-display: swap` automático, sem FOIT).
- Escala tipográfica: `text-xs` (12px, legendas/metadados) · `text-sm` (14px, padrão em tabelas e formulários densos) · `text-base` (16px, corpo de leitura) · `text-lg`/`text-xl` (títulos de seção) · `text-2xl` (título de página).
- Números tabulares (`tabular-nums`) em qualquer coluna numérica de tabela (valores, quantidades, datas) para evitar "dança" de dígitos.
- Peso: 700 em títulos de página, 600 em títulos de card/seção e labels de botão, 400 no corpo, 500 em labels de campo.

## Espaçamento, raio e sombra

- **Grade de espaçamento:** múltiplos de 4px (`gap-1`=4px … `gap-4`=16px como unidade "confortável" padrão entre campos; `gap-6`/`gap-8` entre seções).
- **Raio (`--radius`):** `0.5rem` (reduzido do padrão shadcn `0.625rem`) — levemente mais reto, reforça o tom "ferramenta de trabalho" em vez de "app consumer arredondado". `--radius-sm/md/lg/xl` seguem a mesma proporção já definida em `@theme inline`.
- **Sombra:** minimalista por design. `shadow-sm` em cards de conteúdo, `shadow-lg` só em overlays (dialog/popover/dropdown) para indicar que estão acima do plano da página. Nunca sombras coloridas, nunca blur decorativo (glass) — vai contra o anti-padrão "ornate" do estilo escolhido.
- **Densidade:** controles de formulário com altura padrão `h-9`/`h-10`; linhas de tabela compactas (`py-2`) são aceitáveis — este produto tolera densidade maior que um app consumer, desde que o contraste de texto não seja sacrificado.

## Estados de interação

- **Hover:** transição de 150ms (`transition-colors duration-150`), usa `--accent`/`--accent-foreground` (neutro) para hover de itens de lista/menu, e `bg-primary/80`-like (variantes já definidas em `button.tsx`) para botões primários.
- **Foco (teclado):** anel visível obrigatório em todo elemento interativo — `focus-visible:ring-3 focus-visible:ring-ring/50` (já é o padrão do `button.tsx`/`input.tsx` gerados pelo shadcn; não remover).
- **Disabled:** opacidade ~50% + `pointer-events-none`/`cursor-not-allowed`, nunca só a cor.
- **Loading:** botões de ação mostram texto de estado ("Entrando...", "Salvando...") e ficam `disabled` durante a chamada — nunca deixar o usuário clicar duas vezes.
- **Erro de formulário:** mensagem de erro **abaixo do campo** relacionado (não só no topo do formulário), texto em `--destructive`, contraste verificado ≥4.5:1.
- **Dark mode:** ambos os temas foram calibrados juntos (ver tabela de cores); qualquer novo componente deve ser conferido nos dois antes de considerado pronto.

## Diretrizes de UX aplicadas (via `ui-ux-pro-max --domain ux`)

- Contraste mínimo 4.5:1 para texto normal (checado nos pares fundo/texto acima).
- Nunca usar cor sozinha para transmitir estado — erro/sucesso sempre com ícone ou texto também.
- Sem emojis como ícone estrutural — usar `lucide-react` (já é a lib configurada em `components.json`).
- `cursor-pointer` em todo elemento clicável que não seja um `<button>` nativo.
- Tab order = ordem visual; todo formulário navegável 100% por teclado.
- Animações restritas a 150–300ms, propriedades `transform`/`opacity`/`colors` apenas — nunca animar `width`/`height` (evita layout shift).
- Rótulos de campo sempre visíveis (`<Label>`), nunca só placeholder.

## Aplicação na tela de login (Task 8)

- Cartão centralizado (`max-w-sm`), fundo `--background`, cartão em `--card` com
  `shadow-sm` e borda `--border`.
- Título "Entrar" em Lexend 600, `text-lg`.
- Botão "Entrar com Google" — variante `outline` (ação secundária/alternativa de
  login), ícone de marca à esquerda.
- Divisor "ou com senha" em `--muted-foreground`, `text-xs`.
- Campos de e-mail/senha com `<Label>` visível, `autocomplete` correto
  (`email`, `current-password`) para autofill do navegador/gerenciador de senhas.
- Botão "Entrar" (submit) — variante `default`, usa `--primary`; mostra
  "Entrando..." + fica `disabled` durante a chamada.
- Erro de autenticação exibido abaixo do formulário, em `--destructive`, com
  `role="alert"` para leitores de tela.
