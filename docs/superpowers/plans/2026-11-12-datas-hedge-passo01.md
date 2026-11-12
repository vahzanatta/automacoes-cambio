# Data de pagamento dos hedges (Passo 01) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quarta rotina do painel. A partir de uma planilha colada (código da IMP + data), gera o script que, na tela Seleção do Passo 01 (Hedges Novos = Passo01a, Hedges Expirados = Passo01b), define a data de pagamento do hedge das IMPs, um grupo de data por vez.

**Architecture:** Segue o painel existente: lógica pura em `painel/js/*.js` (navegador e Node, padrão IIFE `exportar`), modelo de script em `painel/modelos/*.js` (corpo entre `//<<INICIO` e `//FIM>>`, marcadores `__NOME__`, sem comentários no corpo), tela em `painel/js/tela-*.js` com `criarColunaScript` e `criarComoUsar`. A execução usa um iframe em tela cheia, como `painel/modelos/hedges.js`, porque a página recarrega a cada gravação.

**Tech Stack:** HTML/CSS/JS puro; Node 24 (`node --test "tests/node/*.test.js"`); Python 3 (`tests/mock_timp.py`, `.venv/Scripts/python tests/rodar_integracao.py`, Chrome headless).

**Spec:** `docs/superpowers/specs/2026-11-12-datas-hedge-passo01-design.md` (e as regras gerais de `docs/superpowers/specs/2026-11-12-painel-cambio-design.md`).

## Global Constraints

- Tipos: `NOVOS` → rótulo "Hedges Novos", página `Passo01a`; `EXPIRADOS` → rótulo "Hedges Expirados", página `Passo01b`. O Tipo **nunca** vem pré-selecionado.
- Empresas: BR02 = CARREFOUR (Emp_ID 3), BR21 = WMB (4), BR22 = WMS (6), de `painel/js/config.js`.
- Simulação por padrão; Execução só depois de copiar/baixar a Simulação com exatamente os mesmos dados (já garantido por `criarColunaScript` + `dados()`).
- Script gerado **sem nenhum comentário** (`//` ou `/*`); orientações só no "Como usar" da interface.
- Valores entram no script só via `JSON.stringify`.
- Texto de usuário no DOM só via `textContent`/`value`.
- Comparação de códigos de IMP: exata, sem diferenciar maiúsculas, ignorando espaços nas pontas.
- Repositório público: só dados sintéticos nos testes. Commits locais; push só quando a usuária pedir. Mensagens de commit terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Textos em pt-BR.

## Review Focus

1. Planilha colada com cabeçalho, linhas vazias, tabulação/`;`/espaços, data `dd/mm/aaaa` e `aaaa-mm-dd` → lida certo; data inválida (31/02/2026) ou código repetido com datas diferentes → problema listado e nenhum script. Teste: Task 1.
2. Script colado na página errada (Passo01b quando o tipo é Novos) ou na empresa errada → nada marcado nem gravado, mensagem dizendo onde colar. Teste: Task 2, `datas_pagina_errada`.
3. Um código da lista não está na página, ou uma data não existe em "Data Pagto" → nada gravado em nenhum grupo. Teste: Task 2, `datas_faltando`.
4. Após gravar um grupo, a IMP pode sair da lista ou continuar com a nova data → as duas formas contam como gravado. Teste: Task 2, `datas_exec` nos dois modos do mock.
5. Caixas já marcadas na página antes do script (por um clique manual) → desmarcadas antes de marcar o grupo, para não gravar IMP fora do grupo. Teste: Task 2, `datas_exec` com uma caixa pré-marcada.

---

### Task 1: Leitura da planilha colada + tipos

**Files:**
- Create: `painel/js/planilha-datas.js`, `tests/node/planilha-datas.test.js`
- Modify: `painel/js/config.js` (adicionar `PASSOS_HEDGE`)

**Interfaces:**
- Produces:
  - `config.js`: `PASSOS_HEDGE = { NOVOS: { rotulo: "Hedges Novos", passo: "Passo01a" }, EXPIRADOS: { rotulo: "Hedges Expirados", passo: "Passo01b" } }`.
  - `lerPlanilhaDatas(texto: string) -> { itens: Array<{codigo, data}>, grupos: Array<{data, codigos: string[]}>, problemas: Array<{linha: number, texto: string, motivo: string}> }`
    - `data` sempre `AAAA-MM-DD`; `codigo` sem espaços nas pontas, em maiúsculas.
    - Separador entre colunas: tabulação, `;`, ou um ou mais espaços (o código não tem espaço; a data é o último campo da linha).
    - Linha vazia → ignorada. Primeira linha não vazia sem data válida em nenhum formato e sem dígito na posição do código (ex.: "Código IMP\tData") → cabeçalho, ignorada.
    - Data inválida (formato errado ou dia inexistente, como 31/02/2026) → problema `"data inválida"`. Linha com uma coluna só → `"falta a data"`.
    - Mesmo código duas vezes com a mesma data → um item só; com datas diferentes → problema `"código repetido com datas diferentes"` em cada linha envolvida, e o código fica fora de `itens`.
    - `grupos` ordenados por data crescente; códigos na ordem em que apareceram.
  - `formatarDataBr("2026-11-16") -> "16/11/2026"`.

- [ ] **Step 1: Testes que falham** em `tests/node/planilha-datas.test.js`:

```js
const { lerPlanilhaDatas, formatarDataBr } = require("../../painel/js/planilha-datas.js");
test("cola do Excel com cabeçalho", () => {
  const r = lerPlanilhaDatas("Código IMP\tData\nDEMO-0001/26-WEB-1\t16/11/2026\ndemo-0002/26-web-1\t25/11/2026\n\nDEMO-0003/26-WEB-1\t16/11/2026\n");
  assert.deepEqual(r.problemas, []);
  assert.deepEqual(r.grupos, [
    { data: "2026-11-16", codigos: ["DEMO-0001/26-WEB-1", "DEMO-0003/26-WEB-1"] },
    { data: "2026-11-25", codigos: ["DEMO-0002/26-WEB-1"] },
  ]);
});
test("separadores ; e espaços, data ISO", () => {
  const r = lerPlanilhaDatas("A-1;2026-11-16\nB-2   16/11/2026");
  assert.deepEqual(r.itens, [{ codigo: "A-1", data: "2026-11-16" }, { codigo: "B-2", data: "2026-11-16" }]);
});
test("problemas", () => {
  const r = lerPlanilhaDatas("A-1\t31/02/2026\nB-2\nC-3\t16/11/2026\nC-3\t25/11/2026\nD-4\t16/11/2026\nD-4\t16/11/2026");
  assert.deepEqual(r.problemas.map(p => [p.linha, p.motivo]), [
    [1, "data inválida"], [2, "falta a data"],
    [3, "código repetido com datas diferentes"], [4, "código repetido com datas diferentes"],
  ]);
  assert.deepEqual(r.itens, [{ codigo: "D-4", data: "2026-11-16" }]);
});
test("formatarDataBr", () => assert.equal(formatarDataBr("2026-11-16"), "16/11/2026"));
```
(+ um teste de que `require("../../painel/js/config.js").PASSOS_HEDGE` tem os dois tipos acima.)

- [ ] **Step 2:** `node --test "tests/node/*.test.js"` → FAIL (módulo não existe)
- [ ] **Step 3:** Implementar `planilha-datas.js` e `PASSOS_HEDGE`.
- [ ] **Step 4:** `node --test "tests/node/*.test.js"` → PASS
- [ ] **Step 5:** Commit — `Leitura da planilha de datas dos hedges`

---

### Task 2: Modelo do script + gerador + T.IMP simulado + integração

**Files:**
- Create: `painel/modelos/datas-hedge.js`
- Modify: `painel/js/gerador.js`, `tests/node/gerador.test.js`, `tests/node/sem-comentarios.test.js`, `tests/mock_timp.py`, `tests/gerar_scripts_teste.js`, `tests/integracao/cenarios.js`, `tests/rodar_integracao.py` (`CENARIOS_ESPERADOS`), `painel/painel.html` (carregar o modelo junto dos outros)

**Interfaces:**
- Consumes: `extrairCorpo`, `preencher` (gerador.js); `EMPRESAS`, `PASSOS_HEDGE` (config.js).
- Produces (`gerador.js`):
  - `validarDatasHedge({ empresa, tipo, grupos }) -> string[]` (faltas: empresa, tipo, ao menos uma IMP).
  - `montarDatasHedge({ empresa, tipo, grupos, dryRun }) -> string`. Marcadores do modelo: `__EMP_ID__`, `__PASSO__`, `__GRUPOS__` (JSON de `[{data, codigos}]`), `__DRY_RUN__`, `__TIMEOUT_RECARGA_MS__` (30000), `__PAUSA_MS__` (400).
- Comportamento do script (spec §3), contra a página real cujo HTML está no spec/conversa:
  - Página certa: `location.pathname` termina em `/hedge/<PASSO>` e o Emp_ID da página (`new URLSearchParams(location.search).get("Emp_ID")` ou `#Emp_ID` selecionado) = `EMP_ID`; senão para e diz `Cole este script na página /hedge/<PASSO>?Emp_ID=<EMP_ID>. Nada foi feito.`
  - Tabela: colunas achadas pelo texto do `thead th` normalizado ("CÓDIGO IMP", "DT.PGTO.HEDGE", "VALOR PROFORMA", "MOEDA"); caixa = `input[name="wCheckbox"]` da linha.
  - Conferência prévia: códigos ausentes na página e datas ausentes em `#wCombowDatasPagamentoFuturas option[value]` → lista e para sem gravar.
  - Simulação: linhas do plano com fundo verde e a data (dd/mm/aaaa) escrita na linha; `console.table` por grupo; quadro na página com o resumo por grupo (data, quantidade, total por moeda) — tudo por `textContent`. Zero cliques em caixas, zero requisições.
  - Execução: iframe em tela cheia com `URL = /hedge/<PASSO>?Emp_ID=<EMP_ID>`, botões Parar/Fechar, `confirm` → true e `alert` → log no iframe. Por grupo: esperar o botão `#data_prev_pag_lote_botao` habilitado; clicar (`.click()`) nas caixas marcadas que não são do grupo para desmarcar; clicar nas do grupo; definir o select e disparar `change`; clicar no botão; esperar o `load`; conferir o grupo (cada IMP fora da lista ou com "Dt.Pgto.Hedge" = data do grupo); se falhar, parar dizendo o grupo e os já gravados. No fim, `Concluído: N grupos, M IMPs.`
- `mock_timp.py`: `GET /hedge/Passo01a` e `/hedge/Passo01b` com `Emp_ID`, reproduzindo a estrutura do HTML real (cabeçalhos, caixas com `onclick="impSelecionada(<id>)"`, `#wImpsAtualizar`, `#data_prev_pag_lote_total`, `#Emp_ID`, `#wCombowDatasPagamentoFuturas` com 3 datas, botão de lote com `submitForm(...)`); `impSelecionada` e `submitForm` simulados no próprio HTML (submitForm monta a URL GET com `nome=valor` dos ids passados e navega). O GET com `data_prev_pag_lote_botao` grava a data nas IMPs de `wImpsAtualizar` e devolve a página (registrando em `ESTADO["posts"]` ou numa lista própria). `reset` aceita `some=1` (IMP gravada sai da lista) e `premarcada=<id>` (caixa já marcada ao carregar).

- [ ] **Step 1:** Testes Node que falham: `montarDatasHedge` sem marcadores sobrando, sintaxe válida (`new Function`), `PASSO` e `EMP_ID` certos para NOVOS/BR21 e EXPIRADOS/BR22; `validarDatasHedge` com tudo vazio → 3 faltas; e entradas em `sem-comentarios.test.js` para o novo modelo (simulação e execução).
- [ ] **Step 2:** `node --test "tests/node/*.test.js"` → FAIL
- [ ] **Step 3:** Implementar o modelo e o gerador.
- [ ] **Step 4:** `node --test "tests/node/*.test.js"` → PASS
- [ ] **Step 5:** Cenários de integração (scripts gerados em `gerar_scripts_teste.js`), que falham antes do mock:
  - `datas_sim`: 2 grupos; zero gravação; linhas pintadas; quadro com os 2 grupos.
  - `datas_exec`: 2 grupos gravados nas datas certas, com uma caixa pré-marcada fora do plano que **não** é gravada; roda nos dois modos do mock (`some=0` e `some=1`); status termina em "Concluído".
  - `datas_faltando`: um código inexistente e, noutra rodada, uma data fora da lista → zero gravação, mensagem com o que falta.
  - `datas_pagina_errada`: script de NOVOS colado no Passo01b, e script de BR21 na página de Emp_ID 3 → zero gravação, mensagem com a página certa.
- [ ] **Step 6:** `.venv/Scripts/python tests/rodar_integracao.py` → todos PASS (incluindo os 18 anteriores)
- [ ] **Step 7:** Commit — `Script de datas de pagamento dos hedges e T.IMP simulado do Passo 01`

---

### Task 3: Tela no painel

**Files:**
- Create: `painel/js/tela-datas-hedge.js`
- Modify: `painel/painel.html` (quarto cartão + seção da tela + script), `painel/js/app.js`, `painel/estilo.css` (se preciso), `tests/integracao/cenarios.js`, `tests/rodar_integracao.py`

**Interfaces:**
- Consumes: `EMPRESAS`, `PASSOS_HEDGE`, `lerPlanilhaDatas`, `formatarDataBr`, `validarDatasHedge`, `montarDatasHedge`, `criarColunaScript`, `criarComoUsar`.
- Produces: `iniciarTelaDatasHedge(el): void`; cartão `data-tela="datas-hedge"`, seção `#tela-datas-hedge`.
- Cartão: título "Data de pagamento dos hedges", linha "Define a data de pagamento do hedge das IMPs do Passo 01, por grupo de data."
- Campos: Empresa (`<select>` vazio + 3), Tipo (2 rádios "Hedges Novos"/"Hedges Expirados", nenhum marcado), caixa de texto "Cole aqui as colunas da planilha: código da IMP e data".
- Prévia: tabela por grupo (Data dd/mm/aaaa · Qtd. IMPs · Códigos) e lista de problemas ("Linha N: <texto> — <motivo>"). Havendo problema → `gerar` devolve `{faltas: ["Corrija as linhas com problema na lista."]}`.
- `dados()` = `{ processo: "datas-hedge", empresa, tipo, grupos }`.
- `nomeArquivo`: `datas_hedge.js`. "Onde colar": `Hedge › Seleção (Passo 01a para Hedges Novos, 01b para Hedges Expirados) do T.IMP, na empresa escolhida — console (F12)`.
- "Como usar" (≥ 4 passos), no topo da coluna da esquerda, cobrindo: colar a planilha; escolher empresa e tipo; Simulação na página certa; Execução abre em tela cheia, não fechar a aba, Parar interrompe; se algo não for encontrado nada é gravado.

- [ ] **Step 1:** Cenário `datas_ui` que falha: tipo começa sem seleção; colar a planilha mostra 2 grupos na prévia; linha com problema impede o script; tudo certo → script com `PASSO` e `EMP_ID` escolhidos; baixar a Simulação libera a Execução e mudar a planilha trava de novo; sem rolagem horizontal em 375 px. Atualizar `painel_carrega` para 4 cartões e "Como usar" na nova tela.
- [ ] **Step 2:** `.venv/Scripts/python tests/rodar_integracao.py` → FAIL
- [ ] **Step 3:** Implementar a tela e ligar no `app.js`/`painel.html`.
- [ ] **Step 4:** Rodar Node + Python + integração → todos PASS
- [ ] **Step 5:** Commit — `Tela de datas de pagamento dos hedges`
