# Leitura de código de barras/QR da DANFE — Design

> Complementa `docs/superpowers/plans/2026-07-01-fase1-nucleo.md`. Adiciona um segundo caminho de entrada de NF no formulário de lançamento (Task 13), companheiro do upload de XML (Task 9), para o caso em que o operador só tem o DANFE físico (papel) em mãos, não o arquivo XML.

## Contexto e limite técnico

A chave de acesso (44 dígitos), presente tanto no código de barras Code128 quanto no QR Code do DANFE, contém apenas dados de identificação — **não contém quantidade nem valor**:

| Posição | Campo |
|---|---|
| 1-2 | cUF |
| 3-6 | AAMM (ano/mês de emissão) |
| 7-20 | CNPJ do emitente |
| 21-22 | modelo (55 ou 65) |
| 23-25 | série |
| 26-34 | número da NF (nNF) |
| 35 | tipo de emissão |
| 36-43 | código numérico aleatório |
| 44 | dígito verificador |

Quantidade e valor só existem no XML da NF-e (já coberto pelo parser do Task 9) ou na tabela impressa do DANFE (texto, não codificado — leitura exigiria OCR, fora de escopo deste design; registrado como candidato futuro separado, não implementado aqui).

**Portanto:** o scan preenche **NF** e (por CNPJ) **fornecedor** automaticamente. Quantidade e valor continuam manuais quando só há o papel — quando há XML, o upload do Task 9 já resolve tudo, scan e XML são complementares, não concorrentes.

## Arquitetura

Um parser puro compartilhado por dois componentes de captura (desktop com leitor USB físico, mobile com câmera):

```
lib/danfe-scanner.ts
  parseDanfeCode(raw: string): { chaveAcesso: string; cnpjEmitente: string; nNF: string } | null

components/returns/danfe-scan-input.tsx       (desktop — leitor USB)
components/returns/danfe-scan-camera-dialog.tsx (mobile — câmera, via @zxing/browser)
```

Ambos os componentes emitem o mesmo callback `onScan({ cnpjEmitente, nNF })` consumido por `ReturnForm` (Task 13).

- **`parseDanfeCode`** aceita string crua de 44 dígitos (o que o leitor USB "digita" no campo) ou uma URL de QR (extrai os 44 dígitos do parâmetro de consulta). Retorna `null` para qualquer formato não reconhecido — nunca lança exceção; scan malformado não deve travar o operador.
- **`danfe-scan-input.tsx`** (desktop): campo de texto dedicado, autofocado na tela de lançamento, hint "Aponte o leitor de código de barras aqui". Leitor USB é HID (emula teclado) — basta capturar o buffer de teclas até Enter, parsear, limpar o campo e refocar. Nenhuma lib de visão computacional no caminho desktop.
- **`danfe-scan-camera-dialog.tsx`** (mobile, e fallback opcional no desktop): botão "Escanear com câmera" abre um modal com `@zxing/browser` (`BrowserMultiFormatReader`), que lê tanto Code128 quanto QR via `getUserMedia`. Ao decodificar com sucesso, fecha o modal e dispara o mesmo `onScan`.

## Fluxo de dados

1. Scan (leitor USB ou câmera) produz uma string crua → `parseDanfeCode` → `{ cnpjEmitente, nNF }`.
2. `ReturnForm` chama `GET /api/suppliers?cnpj=<cnpjEmitente>` — novo query param na rota já existente (Task 10), sem mudança de schema.
3. **CNPJ encontrado:** seleciona o fornecedor automaticamente no formulário + preenche NF (`nNF` sem zeros à esquerda).
4. **CNPJ não encontrado:** preenche só o NF; mostra aviso não-bloqueante "CNPJ não cadastrado — selecione o fornecedor manualmente"; operador segue o fluxo normal de seleção manual de fornecedor.
5. Dali em diante, fluxo idêntico ao já existente: duplicate-check no submit (Task 11), sem nenhuma tabela ou coluna nova (`chaveAcesso` completa não é persistida nesta fase — reduz a chave a NF+fornecedor, que é o que o duplicate-check já usa).

## Tratamento de erro

- Código ilegível ou formato desconhecido → toast "Código não reconhecido. Tente novamente ou preencha manualmente." Formulário nunca trava.
- Permissão de câmera negada/indisponível → modal mostra "Sem acesso à câmera — preencha manualmente" e fecha.
- CNPJ não cadastrado → aviso não-bloqueante descrito acima (não é erro, é caminho esperado para fornecedores ainda não cadastrados).

## Testes

- **Unit** (`tests/unit/danfe-scanner.test.ts`): `parseDanfeCode` contra fixtures — chave de 44 dígitos válida, URL de QR válida, string vazia, lixo/formato desconhecido, chave com dígito verificador mas comprimento errado.
- **Playwright**: dispara o `onScan` diretamente via `page.evaluate` (sem precisar de câmera real ou leitor físico em CI) cobrindo: (a) CNPJ encontrado → fornecedor + NF preenchidos, (b) CNPJ não encontrado → aviso exibido, NF preenchido, fornecedor continua manual.

## Escopo e não-escopo

**Dentro do escopo:**
- Parser de chave de acesso (barcode cru + QR URL).
- Captura via leitor USB (desktop) e câmera (mobile, com fallback opcional no desktop).
- Auto-preenchimento de NF + fornecedor (por CNPJ) no formulário de lançamento (Task 13).
- Novo query param `cnpj` na rota `GET /api/suppliers` (Task 10).

**Fora do escopo (explicitamente):**
- OCR da tabela de itens impressa do DANFE (candidato futuro separado, não coberto aqui).
- Persistência da chave de acesso completa como coluna própria (`returns` continua usando só `nf`+`supplier_id` para duplicate-check, como já documentado nas Global Constraints do plano de Fase 1).
- Busca por scan na tela de lista (Task 14) — este design cobre só o fluxo de lançamento.

## Localização no roadmap

Fase 1, como **Task 20** no plano já existente (`docs/superpowers/plans/2026-07-01-fase1-nucleo.md`), adicionado ao final do arquivo para não renumerar as tasks já escritas (mesmo padrão usado para o Task 19 de backup). Conceitualmente é uma extensão do Task 13 (lançamento) e toca a rota do Task 10 — a numeração ao final é só posicional no documento, não uma dependência de ordem de execução real.
