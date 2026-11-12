# Painel de Automações do Câmbio — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um painel em HTML (aberto em `file://` no Chrome) que gera, a partir de um formulário, os scripts de console dos três processos do fechamento de câmbio no T.IMP.

**Architecture:** Páginas e scripts clássicos (`<script src>`, sem módulos ES, sem build), porque módulos não carregam em `file://`. A lógica pura (extração, geração, trava) fica em arquivos que rodam no navegador e no Node (testes com `node:test`). Os modelos de script são arquivos `.js` válidos com marcadores `__NOME__` e são a fonte única: o painel e o `automacao_timp.py` leem o mesmo modelo. Os scripts gerados são testados num portal simulado (`tests/mock_timp.py`) dirigido por Chrome headless.

**Tech Stack:** HTML/CSS/JS puro; pdf.js 3.11.174 (build UMD, do cdnjs); Node 24 (`node:test`) para testes unitários; Python 3 + pdfplumber (gerador existente e portal simulado); Chrome headless para integração.

**Spec:** `docs/superpowers/specs/2026-11-12-painel-cambio-design.md`

## Global Constraints

- Navegador: Chrome. O painel abre com dois cliques via `file://`, inclusive de caminho UNC `\\servidor\...`.
- Nada de instalação. Internet é permitida (decisão da usuária). pdf.js **3.11.174 UMD** carregado do cdnjs: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js` e `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`. Nenhum outro recurso externo.
- Os PDFs são lidos localmente; nenhum dado sai do computador.
- Todos os scripts saem em **Simulação** por padrão. "Execução" só é liberada depois que o script de Simulação, com exatamente os mesmos dados, foi copiado ou baixado. Qualquer mudança bloqueia de novo e volta para Simulação.
- O tipo de contrato (Terceiros/Hedge) **nunca** vem pré-selecionado.
- Empresas: BR02 = CARREFOUR (Emp_ID 3), BR21 = WMB (Emp_ID 4), BR22 = WMS (Emp_ID 6).
- Terceiros → `/contrato/pagterceiro/`; Hedge → `/contrato/hedge/`.
- Valores digitados à mão no formato brasileiro (`1.234,56` ou `1234,56`); outros formatos são recusados. Moeda: três letras, sem lista fixa.
- Valores entram nos scripts só via `JSON.stringify` / `json.dumps`, nunca por concatenação de texto cru.
- Textos da interface em português do Brasil.
- **Repositório público:** nunca versionar PDFs reais, scripts gerados com dados reais nem dados de contratos. Commits ficam locais; `git push` só quando a usuária pedir.

## Review Focus

1. Fornecedor ou valor com aspas, barra invertida, crase, `${` ou `</script>` (inclusive digitados à mão) → o script gerado continua válido e o texto chega intacto. Teste: Task 1, `preenche valores com caracteres especiais`.
2. Pasta com subpastas, arquivos que não são PDF, extensão `.PDF` e um PDF corrompido → só os PDFs da pasta raiz entram; o corrompido aparece com erro e os outros continuam. Teste: Task 6, cenário de UI `pasta_mista`.
3. Mudar qualquer coisa depois de simular (editar uma célula, desmarcar "incluir", trocar a data) → "Execução" volta a ficar bloqueada e o modo volta a Simulação. Testes: Task 3 (`trava`) e Task 6 (`trava_ui`).
4. Nenhum contrato incluído (pasta vazia ou todos desmarcados) ou lista MANTER vazia → nenhum script é gerado; a coluna mostra o que falta. Testes: Task 1 (`validarInclusao`, `validarHedges`).
5. Simulação da remoção de previsões → zero requisições de exclusão. Teste: Task 4, cenário `previsoes_sim`.

---

## Estrutura de arquivos

```
painel/
  painel.html            # telas (inicial + 3 processos), carrega os scripts na ordem
  estilo.css
  js/raiz.js             # cria o namespace Painel (navegador) — carregado primeiro
  js/config.js           # EMPRESAS, TIPOS
  js/extracao.js         # texto do PDF -> dados; validações de campo
  js/gerador.js          # modelo + valores -> script; validações por processo
  js/trava.js            # assinatura dos dados e trava da Execução
  js/coluna-script.js    # coluna da direita (modo, trava, copiar, baixar) — reutilizada
  js/tela-inclusao.js, js/tela-hedges.js, js/tela-previsoes.js
  js/app.js              # navegação entre telas
  modelos/inclusao.js, modelos/hedges.js, modelos/previsoes.js   # modelos de script
automacao_timp.py        # passa a ler painel/modelos/inclusao.js
tests/
  node/*.test.js         # node --test tests/node
  fixtures/textos_pdf.json   # textos de PDF + dados esperados (Python e JS usam os mesmos)
  test_automacao_timp.py # python -m unittest
  mock_timp.py           # portal simulado (já existe; ganha telas de hedge e caixa)
  integracao/runner.html, integracao/cenarios.js
  gerar_scripts_teste.js # gera os scripts de teste com o gerador do painel
  rodar_integracao.py    # sobe o mock, roda o Chrome headless, imprime PASS/FAIL
README.md
```

**Padrão de módulo (todos os `painel/js/*.js` e `painel/modelos/*.js`):**

```js
(function (exportar) {
  // ... código ...
  exportar({ nomeA, nomeB });
})(function (api) {
  if (typeof module !== "undefined" && module.exports) Object.assign(module.exports, api);
  else Object.assign(window.Painel, api);
});
```
Os modelos exportam no Node `{ inclusao: fn }` e no navegador gravam em `window.Painel.modelos`.

**Formato de um modelo:**

```js
// painel/modelos/inclusao.js
...exportar({ inclusao: function () {
//<<INICIO
(async () => { const EMP_ID = __EMP_ID__; /* ... */ })();
//FIM>>
} });
```
O corpo do script é o texto entre a linha `//<<INICIO` e a linha `//FIM>>`. Como os marcadores `__NOME__` são identificadores válidos, o arquivo do modelo passa no `node --check`. A função nunca é chamada; o gerador lê o texto dela com `fn.toString()`, e o Python lê o arquivo.

---

### Task 1: Modelos como fonte única + gerador

**Files:**
- Create: `painel/js/raiz.js`, `painel/js/config.js`, `painel/js/gerador.js`, `painel/modelos/inclusao.js`
- Modify: `automacao_timp.py` (remover `MODELO_JS`; ler o modelo do arquivo)
- Test: `tests/node/gerador.test.js`, `tests/test_automacao_timp.py`
- Modify: `.gitignore` (adicionar `.venv/` e `tests/saida/`)

**Interfaces:**
- Produces:
  - `config.js`: `EMPRESAS: Array<{codigo, nome, empId}>` (BR02/CARREFOUR/"3", BR21/WMB/"4", BR22/WMS/"6"); `TIPOS: { TERCEIROS: {rotulo: "Terceiros", caminho: "pagterceiro"}, HEDGE: {rotulo: "Hedge", caminho: "hedge"} }`.
  - `gerador.js`:
    - `extrairCorpo(fn: Function) -> string`: o texto entre os marcadores. Lança erro se faltar um marcador.
    - `preencher(corpo: string, valores: Object<string,string>) -> string`: troca cada `__NOME__` (regex `__([A-Z]+(?:_[A-Z]+)*)__`) por `valores[NOME]` numa passada só. Lança erro se algum marcador não tiver valor ou se sobrar valor sem uso.
    - `validarInclusao({empresa, tipo, data, contratos}) -> string[]`: lista do que falta, em texto para a tela. `data` é `AAAA-MM-DD`; `contratos` é a lista já filtrada pelos marcados como "incluir".
    - `montarInclusao({empresa, tipo, data, dryRun, contratos}) -> string`. Os contratos vão no formato `{num_contrato, moeda, valor, fornecedor, arquivo}`.
- O Python ganha `carregar_modelo(nome: str) -> str` e `preencher_modelo(corpo: str, valores: dict) -> str` com a mesma semântica. `gerar_javascript(...)` mantém a assinatura atual.

- [ ] **Step 1: Criar `painel/modelos/inclusao.js`** com o corpo exatamente igual ao `MODELO_JS` atual do `automacao_timp.py`, envolvido no padrão de modelo. Marcadores: `__EMPRESA__`, `__EMP_ID__`, `__TIPO__`, `__DATA_PAGTO__`, `__DRY_RUN__`, `__CONTRATOS__`.

- [ ] **Step 2: Escrever os testes que falham** em `tests/node/gerador.test.js`:

```js
test("monta inclusão com os valores da configuração", () => {
  const s = montarInclusao({ empresa: "BR22", tipo: "HEDGE", data: "2026-11-05", dryRun: true,
    contratos: [{ num_contrato: "1", moeda: "USD", valor: "1,00", fornecedor: "X", arquivo: "a.pdf" }] });
  assert.match(s, /const EMP_ID\s*=\s*"6";/);
  assert.match(s, /const TIPO\s*=\s*"hedge";/);
  assert.match(s, /const DATA_PAGTO\s*=\s*"2026-11-05";/);
  assert.match(s, /const DRY_RUN\s*=\s*true;/);
  assert.doesNotMatch(s, /__[A-Z_]+__/);
  new Function(s);   // sintaxe válida
});
test("preenche valores com caracteres especiais", () => {
  const forn = 'A "B" \\ `C` ${D} </script> É';
  const s = montarInclusao({ empresa: "BR21", tipo: "TERCEIROS", data: "2026-11-05", dryRun: true,
    contratos: [{ num_contrato: "1", moeda: "EUR", valor: "1,00", fornecedor: forn, arquivo: "a.pdf" }] });
  new Function(s);
  const lit = s.match(/const CONTRATOS = (\[[\s\S]*?\n  \]);/)[1];
  assert.equal(JSON.parse(lit)[0].fornecedor, forn);
});
test("preencher recusa marcador sem valor e valor sem uso", () => {
  assert.throws(() => preencher("a __X__", {}), /X/);
  assert.throws(() => preencher("a", { Y: "1" }), /Y/);
});
test("validarInclusao lista o que falta", () => {
  assert.deepEqual(validarInclusao({ empresa: "", tipo: "", data: "", contratos: [] }).length, 4);
  assert.deepEqual(validarInclusao({ empresa: "BR21", tipo: "HEDGE", data: "2026-11-05",
    contratos: [{ num_contrato: "1", moeda: "USD", valor: "1,00", fornecedor: "X" }] }), []);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test tests/node`
Expected: FAIL (`montarInclusao` não existe)

- [ ] **Step 4: Implementar `raiz.js`, `config.js` e `gerador.js`** com as assinaturas acima. `montarInclusao` usa `JSON.stringify(contratos, null, 2)` com as linhas seguintes indentadas em 2 espaços (o mesmo formato do Python). Para o regex do teste encontrar o fim da lista, o array termina em `\n  ]`.

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test tests/node`
Expected: PASS

- [ ] **Step 6: Escrever o teste Python que falha** em `tests/test_automacao_timp.py`: `test_gerado_igual_ao_painel` chama `gerar_javascript(contratos, "BR21", "TERCEIROS", "2026-11-05", True)` e compara, caractere a caractere, com a saída de `node -e` rodando `montarInclusao` com os mesmos dados (passados por `subprocess`, em JSON).

Run: `.venv/Scripts/python -m unittest tests.test_automacao_timp -v`
Expected: FAIL. Antes, criar o ambiente: `python -m venv .venv && .venv/Scripts/pip install pdfplumber`.

- [ ] **Step 7: Trocar no `automacao_timp.py` o `MODELO_JS` por `carregar_modelo("inclusao")`.** O caminho é relativo ao próprio arquivo: `Path(__file__).parent / "painel" / "modelos" / "inclusao.js"`. Remover `MODELO_JS`.

- [ ] **Step 8: Rodar os dois testes e ver passar**

Run: `node --test tests/node && .venv/Scripts/python -m unittest tests.test_automacao_timp -v`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add painel/js painel/modelos tests/node tests/test_automacao_timp.py automacao_timp.py .gitignore
git commit -m "Modelo de inclusão como fonte única do painel e do Python"
```

---

### Task 2: Extração de dados do PDF (comum a Python e JS)

**Files:**
- Create: `painel/js/extracao.js`, `tests/fixtures/textos_pdf.json`
- Modify: `automacao_timp.py` (separar `extrair_dados_texto(texto) -> dict` de `extrair_dados_pdf(caminho)`)
- Test: `tests/node/extracao.test.js`, `tests/test_automacao_timp.py`

**Interfaces:**
- Produces (`extracao.js`):
  - `extrairDados(texto: string) -> {num_contrato, moeda, valor, fornecedor}` (cada campo `string|null`). São as mesmas regras do Python e do `spike/teste_leitura_pdf.html`.
  - `montarLinhas(itens: Array<{str, transform, width}>) -> string`: agrupa os itens do pdf.js em linhas, como o `extrairTexto` do spike faz por página (copiar o algoritmo do spike).
  - `extrairTextoPdf(arquivo: File) -> Promise<string>`: só no navegador; usa `pdfjsLib` e `montarLinhas`.
  - `valorBrValido(s) -> boolean`: `^\d{1,3}(\.\d{3})*,\d{2}$` ou `^\d+,\d{2}$`.
  - `moedaValida(s) -> boolean` (`^[A-Z]{3}$`); `contratoValido(s) -> boolean` (`^\d+$`).
  - `contratoCompleto(c) -> boolean`: os quatro campos passam nas validações (fornecedor não vazio).
- Fixture: `[{ "nome", "texto", "esperado": {num_contrato, moeda, valor, fornecedor} }]`. Mínimo de 6 casos:
  - o caso normal;
  - zero à esquerda no contrato;
  - fallback do número (sem o rótulo);
  - fallback da moeda;
  - fornecedor ausente (esperado `null`);
  - fornecedor com `&`, `/` e acentos.

- [ ] **Step 1: Criar a fixture e escrever os testes que falham:**
  - JS: `extrairDados` bate com `esperado` em cada caso;
  - JS: `valorBrValido("1.234,56")`, `("1234,56")` → true e `("1234.56")`, `("1,2")`, `("")` → false;
  - JS: `montarLinhas` com itens falsos em duas alturas → `"A B\nC"`;
  - Python: `extrair_dados_texto` bate com `esperado` em cada caso.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/node && .venv/Scripts/python -m unittest tests.test_automacao_timp -v`
Expected: FAIL

- [ ] **Step 3: Implementar `extracao.js`** a partir do spike e **refatorar** o Python (`extrair_dados_pdf` passa a chamar `extrair_dados_texto`).

- [ ] **Step 4: Rodar e ver passar** (mesmo comando). Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add painel/js/extracao.js tests/fixtures tests/node tests/test_automacao_timp.py automacao_timp.py
git commit -m "Extração de dados do PDF com regras e testes comuns a Python e JS"
```

---

### Task 3: Trava da Execução

**Files:**
- Create: `painel/js/trava.js`
- Test: `tests/node/trava.test.js`

**Interfaces:**
- Produces:
  - `assinatura(dados: any) -> string`: JSON com as chaves ordenadas em todos os níveis. A ordem dos arrays é mantida.
  - `criarTrava() -> { registrarSimulacao(ass: string): void, liberada(ass: string): boolean }`. Guarda só a última assinatura simulada.

- [ ] **Step 1: Escrever os testes que falham:**

```js
test("assinatura ignora ordem das chaves", () =>
  assert.equal(assinatura({ a: 1, b: [1, { d: 2, c: 3 }] }), assinatura({ b: [1, { c: 3, d: 2 }], a: 1 })));
test("trava", () => {
  const t = criarTrava();
  assert.equal(t.liberada("X"), false);
  t.registrarSimulacao("X");
  assert.equal(t.liberada("X"), true);
  assert.equal(t.liberada("Y"), false);     // mudou algo: bloqueia
  t.registrarSimulacao("Y");
  assert.equal(t.liberada("X"), false);     // só a última simulação vale
});
```

- [ ] **Step 2: Rodar e ver falhar** — `node --test tests/node` → FAIL
- [ ] **Step 3: Implementar `trava.js`**
- [ ] **Step 4: Rodar e ver passar** — `node --test tests/node` → PASS
- [ ] **Step 5: Commit** — `git add painel/js/trava.js tests/node && git commit -m "Trava da Execução"`

---

### Task 4: Modelos de hedges e previsões + portal simulado + integração

**Files:**
- Create: `painel/modelos/hedges.js`, `painel/modelos/previsoes.js`, `tests/integracao/runner.html`, `tests/integracao/cenarios.js`, `tests/gerar_scripts_teste.js`, `tests/rodar_integracao.py`
- Modify: `painel/js/gerador.js`, `tests/mock_timp.py`
- Delete: `tests/gerar.py` (substituído por `gerar_scripts_teste.js`)
- Test: `tests/node/gerador.test.js`, integração

**Interfaces:**
- Consumes: `extrairCorpo`, `preencher` (Task 1).
- Produces (`gerador.js`):
  - `validarHedges({manter}) -> string[]`: falta se `manter` não tiver nenhum código depois de separar por `/[\n,;]+/` e tirar espaços.
  - `montarHedges({manter: string, dryRun, timeoutMs = 30000, pausaMs = 400}) -> string`. Marcadores: `__MANTER__` (string JSON), `__DRY_RUN__`, `__TIMEOUT_RECARGA_MS__`, `__PAUSA_MS__`.
  - `montarPrevisoes({dryRun}) -> string`. Marcador: `__DRY_RUN__`.
- `mock_timp.py` ganha três coisas:
  - **`GET /hedge/passo02/`:** dois hedges (`div.collapse#collapse_<n>`) com tabelas de colunas `CÓDIGO IMP` e `IMP_ID`, e botões `button[name="button_name_remover_imp_do_hedge"]`. Cada botão é um form POST que remove a IMP e recarrega a página.
  - **`GET /caixa/`:** tabela com links `a[href="/caixa/delete/<id>/"]` e `input[name=csrfmiddlewaretoken]`. `POST /caixa/delete/<id>/` remove a linha e registra em `ESTADO["posts"]`.
  - **Estáticos e resultados:**
    - `GET /painel/*` e `GET /tests/*` servem arquivos do repositório;
    - `GET /__mock/pdf/<nome>` serve os PDFs sintéticos de `tests/saida/pdfs/`;
    - `POST /__mock/resultado` grava o JSON de resultados.
- `rodar_integracao.py`:
  1. roda `node tests/gerar_scripts_teste.js`, que grava os scripts em `tests/saida/` e cria os PDFs sintéticos em `tests/saida/pdfs/`, junto com `tests/saida/pdfs/esperado.json`. Os PDFs saem de uma função `fazerPdf(caminho, linhas)` portada do `fazer_pdf` de `tests/gerar.py`, com o texto gravado em latin1;
  2. sobe o mock numa porta livre;
  3. abre `"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --user-data-dir=<temp> http://127.0.0.1:<porta>/tests/integracao/runner.html`;
  4. espera até 120 s pelo POST de resultados;
  5. imprime `PASS`/`FAIL` por cenário e sai com código 1 se algum falhar.
- `runner.html` abre cada página do mock num `<iframe>` (mesma origem), troca `confirm`/`alert` por stubs, roda o script com `iframe.contentWindow.eval(script)` e confere `/__mock/estado`.

- [ ] **Step 1: Criar os modelos.**
  - `hedges.js`: o `remocao_hedges.js` atual, trocando as quatro constantes pelos marcadores.
  - `previsoes.js`: o `removao_previsoes.js` atual com `const DRY_RUN = __DRY_RUN__;`. Em simulação, o script deve:
    - mostrar `console.table` com `{ n, linha: tr.innerText com espaços colapsados, link }`, usando `tr = link.closest("tr")`;
    - pintar cada `tr` com fundo `#f8d7da`;
    - mostrar um aviso fixo na página com a contagem ("Simulação — N lançamentos seriam excluídos. Nada foi excluído.");
    - sair sem nenhum `fetch` e sem `confirm`.
  - Em execução, o comportamento é o atual.

- [ ] **Step 2: Escrever os testes Node que falham:** `montarHedges` e `montarPrevisoes` geram scripts sem marcadores e com sintaxe válida (`new Function`); `validarHedges({manter: " \n ; "})` tem 1 item.

- [ ] **Step 3: Rodar e ver falhar** — `node --test tests/node` → FAIL
- [ ] **Step 4: Implementar `montarHedges`, `montarPrevisoes` e `validarHedges`.**
- [ ] **Step 5: Rodar e ver passar** — `node --test tests/node` → PASS

- [ ] **Step 6: Escrever os cenários de integração** em `cenarios.js`. Cada um tem `nome` e `async rodar(ctx) -> {ok, detalhe}`:
  - **`inclusao_terceiros_sim`:** zero POST de gravação; a tabela de plano tem 3 contratos.
  - **`inclusao_terceiros_gravar`:** as linhas 1001, 1002, 1003 e 1005 recebem o contrato; 1004 e 1006 ficam vazias; 1007 continua `999999999`; nenhum POST com `PAGAMENTO_FORNECEDOR`.
  - **`inclusao_regravar`:** uma segunda execução sem reset faz zero POST.
  - **`inclusao_hedge_gravar`:** grava em `/contrato/hedge/`, e `pagterceiro` fica intocado.
  - **`inclusao_sessao_expirada` e `inclusao_data_errada`:** zero POST e um `console.error` com "Nada foi gravado".
  - **`hedges_sim`:** nenhuma IMP removida; as linhas mantidas ficam com outline verde.
  - **`hedges_exec`:** sobram só as IMPs da lista MANTER.
  - **`previsoes_sim`:** zero POST em `/caixa/delete/`; todas as linhas pintadas.
  - **`previsoes_exec`:** todas as linhas removidas.
  - **`extracao_pdfs`:** para cada PDF sintético, `extrairTextoPdf` + `extrairDados` dá o mesmo que o esperado gravado pelo gerador.

  Os dados dos cenários de inclusão são os do mock e dos PDFs sintéticos que já existem (`tests/mock_timp.py`, `LINHAS_INICIAIS`).

- [ ] **Step 7: Rodar e ver passar**

Run: `.venv/Scripts/python tests/rodar_integracao.py`
Expected: todos os cenários `PASS` e código de saída 0. (Antes do Step 6 estar completo, os cenários novos falham.)

- [ ] **Step 8: Commit**

```bash
git add painel/modelos painel/js/gerador.js tests
git rm tests/gerar.py
git commit -m "Modelos de hedges e previsões (com simulação) e testes de integração no portal simulado"
```

---

### Task 5: Esqueleto do painel (com pdf.js do cdnjs) e coluna do script

**Files:**
- Create: `painel/painel.html`, `painel/estilo.css`, `painel/js/coluna-script.js`, `painel/js/app.js`
- Test: cenário `painel_carrega` em `tests/integracao/cenarios.js`

**Interfaces:**
- Consumes: `criarTrava`, `assinatura` (Task 3).
- Produces:
  - `criarColunaScript(el: HTMLElement, { gerar: ({dryRun: boolean}) => ({script} | {faltas: string[]}), dados: () => any, nomeArquivo: string, ondeColar: string }) -> { atualizar(): void }`.
  - A coluna desenha:
    - a escolha Simulação/Execução, com Execução desabilitada enquanto `!trava.liberada(assinatura(dados()))`;
    - o script num `<pre>`, ou a lista do que falta;
    - os botões **Copiar** e **Baixar .js**;
    - a frase "Onde colar".
  - `gerar()` recebe o modo atual como `dryRun`. Copiar ou baixar em Simulação chama `registrarSimulacao`. Se `atualizar()` encontrar o modo em Execução e a trava fechada, o modo volta a Simulação e aparece o aviso "Algo mudou desde a simulação: simule de novo antes de executar."
  - Copiar usa `navigator.clipboard.writeText`, com `document.execCommand("copy")` como reserva. Baixar usa `Blob` + `<a download>`.
  - `app.js`: `mostrarTela(id: "inicial" | "inclusao" | "hedges" | "previsoes")`. A tela inicial tem três cartões (título + uma linha); cada tela tem "← Voltar".

- [ ] **Step 1: Escrever o cenário `painel_carrega`, que falha.** Ele abre `/painel/painel.html` no iframe e confere:
  - `typeof pdfjsLib.getDocument === "function"`;
  - os três cartões existem;
  - clicar no cartão de previsões mostra a tela dela, com o script em Simulação e "Execução" desabilitada.
- [ ] **Step 2: Rodar e ver falhar** — `.venv/Scripts/python tests/rodar_integracao.py` → `painel_carrega` FAIL
- [ ] **Step 3: Implementar `painel.html`, `estilo.css`, `coluna-script.js` e `app.js`**, com a tela de previsões já ligada: `gerar = ({dryRun}) => ({ script: montarPrevisoes({ dryRun }) })`; `dados = () => ({ processo: "previsoes" })`.
  - O worker do pdf.js é carregado como `<script src="…/pdf.worker.min.js">` (cdnjs) **antes** de `pdf.min.js`. Assim o pdf.js usa o worker no mesmo processo e não tenta `new Worker` com endereço de outra origem.
  - Ordem dos scripts: pdf.js (worker, depois pdf.min.js), `raiz`, `config`, `extracao`, `gerador`, `trava`, modelos, `coluna-script`, telas, `app`.
  - Layout de duas colunas, que vira uma coluna abaixo de 900px.
- [ ] **Step 4: Rodar e ver passar** — o mesmo comando → todos PASS.
- [ ] **Step 5: Verificar em `file://`:** abrir `painel/painel.html` com o Chrome no Browser pane; nenhum erro no console; os três cartões aparecem.
- [ ] **Step 6: Commit** — `git add painel tests && git commit -m "Esqueleto do painel e coluna do script"`

---

### Task 6: Tela de inclusão de contratos

**Files:**
- Create: `painel/js/tela-inclusao.js`
- Modify: `painel/painel.html`, `painel/estilo.css`
- Test: cenários `inclusao_ui`, `pasta_mista`, `trava_ui` em `tests/integracao/cenarios.js`

**Interfaces:**
- Consumes: `EMPRESAS`, `TIPOS`, `extrairTextoPdf`, `extrairDados`, `contratoCompleto`, `valorBrValido`, `moedaValida`, `contratoValido`, `validarInclusao`, `montarInclusao`, `criarColunaScript`.
- Produces: `iniciarTelaInclusao(el: HTMLElement): void`.
- Campos:
  - **Empresa:** `<select>` vazio + as três empresas.
  - **Tipo:** dois rádios, nenhum marcado.
  - **Data:** `<input type="date">`, vazio.
  - **Pasta:** `<input type="file" webkitdirectory>`. Lê só os arquivos cujo `webkitRelativePath` tem exatamente uma barra (ou está vazio) e cujo nome termina em `.pdf`, sem diferenciar maiúsculas.
- Lista de PDFs, uma linha por PDF:
  - caixa "incluir", marcada se `contratoCompleto`;
  - arquivo;
  - quatro células editáveis (`<input>`);
  - status: "✔ ok", "⚠ incompleto" ou "Erro: …".
  - Uma célula inválida fica vermelha, com o motivo no `title`. Um contrato só vai para o script se estiver marcado **e** completo.
  - Acima da lista: "N lidos · M no script · K de fora".
- `dados()` = `{ processo: "inclusao", empresa, tipo, data, contratos: <incluídos, já editados> }`.

- [ ] **Step 1: Escrever os cenários que falham.** Os arquivos entram no input via `DataTransfer`, com PDFs buscados de `/__mock/pdf/`.
  - **`inclusao_ui`:** antes de escolher o tipo, a coluna lista "tipo de contrato" entre as faltas. Depois de preencher tudo, o script contém `const EMP_ID = "4";` e os contratos completos.
  - **`pasta_mista`:** a pasta tem um PDF bom, um `.PDF`, um arquivo `.txt`, um PDF em subpasta (`webkitRelativePath = "pasta/sub/x.pdf"`) e um PDF corrompido (bytes aleatórios). Resultado esperado: 3 linhas (dois ok e um com status "Erro"), e o script com 2 contratos.
  - **`trava_ui`:** baixar em Simulação habilita Execução. Editar o valor de uma linha desabilita Execução e o modo volta a Simulação. O mesmo vale para desmarcar "incluir" e para trocar a data.
  - Valor `1234.56` digitado → célula inválida e contrato fora do script.
- [ ] **Step 2: Rodar e ver falhar** — `.venv/Scripts/python tests/rodar_integracao.py` → os três FAIL
- [ ] **Step 3: Implementar `tela-inclusao.js`** e ligar no `app.js`. `gerar` chama `validarInclusao`; se houver faltas, devolve `{faltas}`; se não, `{script: montarInclusao(...)}`. "Onde colar": "Página Contratos (Terceiros ou Hedge) do T.IMP, logado — console (F12)".
- [ ] **Step 4: Rodar e ver passar** — o mesmo comando → todos PASS
- [ ] **Step 5: Commit** — `git add painel tests && git commit -m "Tela de inclusão de contratos"`

---

### Task 7: Tela de remoção de hedges

**Files:**
- Create: `painel/js/tela-hedges.js`
- Modify: `painel/painel.html`
- Test: cenário `hedges_ui`

**Interfaces:**
- Consumes: `validarHedges`, `montarHedges`, `criarColunaScript`.
- Produces: `iniciarTelaHedges(el): void`.
- Campos:
  - `<textarea>` "IMPs que devem PERMANECER (uma por linha)", com o contador "N códigos informados";
  - `<details>` "Avançado" com dois `<input type="number">`: espera da recarga em segundos (padrão 30, gera `timeoutMs`) e pausa em segundos (padrão 0,4, gera `pausaMs`).
- `dados()` = `{ processo: "hedges", manter: <códigos normalizados, em lista>, timeoutMs, pausaMs }`.
- "Onde colar": "Página Hedge – Passo 02 do T.IMP — console (F12)".

- [ ] **Step 1: Escrever o cenário `hedges_ui`, que falha:**
  - com o textarea vazio, a coluna mostra a falta;
  - com dois códigos, o contador mostra 2 e o script contém os dois;
  - mudar a pausa depois de simular bloqueia Execução.
- [ ] **Step 2: Rodar e ver falhar** — `.venv/Scripts/python tests/rodar_integracao.py` → FAIL
- [ ] **Step 3: Implementar `tela-hedges.js`** e ligar no `app.js`.
- [ ] **Step 4: Rodar e ver passar** — o mesmo comando → todos PASS
- [ ] **Step 5: Commit** — `git add painel tests && git commit -m "Tela de remoção de hedges"`

---

### Task 8: Tela de previsões, README e limpeza

**Files:**
- Create: `painel/js/tela-previsoes.js` (move a ligação provisória da Task 5 para cá), `README.md`
- Delete: `spike/teste_leitura_pdf.html` (substituído pelo painel)
- Test: suíte completa

**Interfaces:**
- Produces: `iniciarTelaPrevisoes(el): void`.
- "Onde colar": "Tela do caixa do T.IMP, já filtrada — console (F12)". Também mostra o texto "Exclui todos os lançamentos de previsão visíveis na tabela".

- [ ] **Step 1: Mover a tela de previsões** para o próprio arquivo, sem mudar o comportamento.
- [ ] **Step 2: Escrever o `README.md`** em pt-BR, com três partes:
  - **Para a equipe:**
    - copiar a pasta `painel/` inteira para a rede;
    - abrir `painel.html` no Chrome;
    - o fluxo Simulação → Execução.
  - **Alternativa em Python:** `pip install pdfplumber`, o bloco CONFIGURAÇÃO e `python automacao_timp.py`.
  - **Para desenvolver:** `node --test tests/node`, `python -m unittest tests.test_automacao_timp` e `python tests/rodar_integracao.py`.
  - Sem caminhos internos nem dados de contratos.
- [ ] **Step 3: Remover o spike**: `git rm spike/teste_leitura_pdf.html`
- [ ] **Step 4: Rodar tudo**

Run: `node --test tests/node && .venv/Scripts/python -m unittest tests.test_automacao_timp -v && .venv/Scripts/python tests/rodar_integracao.py`
Expected: tudo PASS e código de saída 0.

- [ ] **Step 5: Verificar no Browser pane via `file://`:**
  - cada tela abre;
  - nenhum erro no console;
  - em 375px de largura, as colunas empilham.
- [ ] **Step 6: Commit** — `git add -A painel README.md && git commit -m "Tela de previsões, README e remoção do spike"`

---

## Aceite (com a usuária, fora deste repositório)

Os passos abaixo só podem ser feitos no computador do trabalho, pela usuária. Não fazem parte das tasks.

1. Copiar `painel/` para a pasta da rede e abrir `painel.html` no Chrome a partir do caminho `\\servidor\...`.
2. Inclusão: selecionar uma pasta real e comparar a lista com a do `automacao_timp.py` para a mesma pasta. Rodar em Simulação no T.IMP (Terceiros e Hedge).
3. Hedges e previsões: rodar em Simulação nas páginas reais e conferir os destaques.
