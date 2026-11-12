# Painel de automações do fechamento de câmbio — desenho

Data: 2026-11-12 · Status: aprovado pela usuária em 2026-11-12

## 1. Intenção

No fechamento de câmbio, a equipe de tesouraria executa três rotinas no sistema interno
T.IMP usando scripts de console do navegador (F12). Hoje cada pessoa precisa abrir o
código e editar variáveis à mão (empresa, data, listas, modo de simulação). Na inclusão
de contratos, ainda é preciso rodar um Python e copiar o array de contratos para outro
script. Isso dá trabalho, gera erros (a data fixa errada no código antigo já fez o
processo falhar) e exclui quem não tem Python instalado.

O painel resolve isso: a pessoa escolhe o processo, preenche um formulário e recebe o
script pronto para colar no console. Ninguém mais edita código.

## 2. Objetivos, não objetivos e antiobjetivos

**Objetivos**
- Gerar, sem editar código, o script de cada um dos três processos:
  1. Inclusão de contratos (Terceiros e Hedge);
  2. Remoção de hedges;
  3. Remoção de previsões.
- Ler os PDFs dos contratos direto no navegador, a partir de uma pasta escolhida pelo usuário.
- Funcionar para toda a equipe, inclusive quem não tem Python.
- Sair sempre em **simulação** por padrão, nos três processos.

**Não objetivos**
- O painel não executa nada no T.IMP. Ele só gera o script; a pessoa continua colando no
  console da aba do T.IMP. (O painel e o T.IMP são origens diferentes no navegador, e o
  script depende da sessão logada do T.IMP.)
- Não substitui o `automacao_timp.py` agora. O Python continua existindo como alternativa.
- Não lê e-mail nem automatiza a montagem da lista de IMPs a manter (ela é feita à mão).

**Antiobjetivos** (seria um fracasso mesmo que "funcionasse")
- Um script que grava ou exclui no T.IMP sem antes ter havido a chance de simular.
- Pré-selecionar o tipo de contrato (Terceiros/Hedge). A usuária pediu explicitamente
  que o usuário escolha sempre.
- Enviar PDFs ou dados de contratos para qualquer servidor ou serviço externo.
- Depender de instalação ou permissões de TI para funcionar. (Internet pode ser usada:
  decisão da usuária em 2026-11-12.)

## 3. Restrições

- **Navegador:** Chrome (o único usado no trabalho).
- **Formato:** um arquivo HTML guardado na pasta da rede e aberto com dois cliques
  (`file://`, inclusive a partir de caminho UNC `\\servidor\...`). O pdf.js é
  carregado do cdnjs, com versão fixa. O painel não precisa funcionar sem internet
  (decisão da usuária em 2026-11-12); o teste de leitura já carregou o pdf.js do cdnjs
  no computador do trabalho.
- **Leitura de PDF:** pdf.js, com a mesma lógica do teste já validado
  (`spike/teste_leitura_pdf.html`). Esse teste leu corretamente todos os contratos de
  uma pasta real. O teste usou o pdf.js 3.11.174 (build UMD, que roda via `<script>`
  clássico em `file://`; o build 4.x é ESM e não carrega em `file://`).
- **Privacidade:** os PDFs são lidos localmente. Nada sai do computador.
- **Repositório público:** o repositório no GitHub é público. Não versionar PDFs,
  scripts gerados nem dados de contratos (o `.gitignore` já exclui
  `inclusao_contrato.txt` e `preencher_timp.js`).

## 4. Decisões já tomadas

### 4.1 Estrutura de telas
- **Tela inicial:** três cartões, um por processo, cada um com uma linha explicando o que faz.
  Clicar abre a tela do processo.
- **Tela do processo:** botão "← Voltar" e duas colunas:
  - **esquerda:** formulário e, na inclusão, a lista dos PDFs lidos;
  - **direita:** o script gerado, **sempre visível**, com a escolha
    Simulação/Execução (padrão: Simulação), o botão **Copiar** e o botão **Baixar .js**.
  - **Execução só depois de simular (decisão da usuária):** a opção "Execução" fica
    bloqueada até que o script de Simulação, com exatamente os mesmos dados, tenha sido
    copiado ou baixado. Qualquer mudança no formulário (ou na lista de PDFs, ou nas
    caixas "incluir") bloqueia de novo e volta para Simulação. A tela explica por que
    está bloqueada.
  - O script se atualiza conforme o formulário muda. Enquanto faltar um campo
    obrigatório, a coluna da direita mostra o que falta em vez do script.
- Cada tela diz onde colar o script (qual página do T.IMP, console F12).

### 4.2 Empresas (tabela fixa de configuração)

| Pasta | Empresa | Emp_ID |
|---|---|---|
| BR02 | CARREFOUR | 3 |
| BR21 | WMB | 4 |
| BR22 | WMS | 6 |

### 4.3 Processo 1 — Inclusão de contratos

Campos:
- **Empresa:** lista da tabela acima (define o Emp_ID).
- **Tipo de contrato:** Terceiros ou Hedge. **Começa sem seleção, sempre.**
  - Terceiros → `/contrato/pagterceiro/`
  - Hedge → `/contrato/hedge/`
  - Segundo a usuária, as duas páginas têm a mesma estrutura; só o endereço muda.
- **Data de pagamento:** campo de data. No script vai como `AAAA-MM-DD`.
- **Pasta dos PDFs:** botão "Selecionar pasta" (`<input type="file" webkitdirectory>`).
  Não existe caminho fixo: a pasta varia por empresa, banco/corretora e tipo, e o usuário
  navega até ela. Lê só os PDFs da pasta escolhida (ignora subpastas), aceitando
  `.pdf` e `.PDF`.

Lista dos PDFs lidos:
- Uma linha por PDF: arquivo, nº do contrato, moeda, valor, fornecedor e status.
- PDFs com dados incompletos ou erro de leitura ficam destacados e **podem ser corrigidos
  à mão** na própria lista (editar os campos que faltaram). Um PDF corrigido entra no
  script; um que continue incompleto fica de fora, e a tela diz quantos ficaram de fora.
- Regras de extração: as mesmas do `automacao_timp.py` (`extrair_dados_pdf`), já portadas
  para JavaScript no teste validado.

Script gerado:
- É o mesmo modelo de script do `automacao_timp.py` atual (`MODELO_JS`), que foi testado
  num portal simulado: lê a lista e grava com `fetch` (não recarrega a página), casa
  contratos por fornecedor, moeda e valor (valor exato ou menor combinação de linhas),
  grava sempre como "Somente ESTE pagamento", confere o resultado no fim, e em simulação
  só lê.
- Variáveis injetadas: `EMPRESA`, `EMP_ID`, `TIPO`, `DATA_PAGTO`, `DRY_RUN` e `CONTRATOS`.
  Os valores devem ser injetados de forma segura (`JSON.stringify`), nunca por
  concatenação de texto cru.

### 4.4 Processo 2 — Remoção de hedges

- **IMPs que devem permanecer:** caixa de texto, um código por linha (aceita também vírgula
  ou ponto e vírgula), com a contagem de códigos informados. A lista é digitada ou colada
  à mão.
- **Avançado** (recolhido): tempo de espera da recarga (padrão 30 s) e pausa após cada
  carga (padrão 0,4 s).
- Script: o `remocao_hedges.js` atual, com as variáveis `MANTER`, `DRY_RUN`,
  `TIMEOUT_RECARGA_MS` e `PAUSA_MS` vindas do formulário. Ele já tem simulação
  (destaca na página o que fica e o que sai) e aborta se nenhuma IMP da lista for
  encontrada.
- Onde colar: página "Hedge – Passo 02".

### 4.5 Processo 3 — Remoção de previsões

- Não tem campos de negócio, só a escolha Simulação/Execução.
- **Novo: simulação.** O `removao_previsoes.js` atual não tem simulação. Em modo
  simulação, o script deve:
  - listar no console os lançamentos que seriam excluídos (a quantidade e, por linha,
    o texto da linha da tabela e o link de exclusão);
  - destacar na própria página as linhas que seriam excluídas. Como a estrutura da tela
    do caixa não é conhecida, a linha é encontrada a partir do próprio link de exclusão
    (`link.closest('tr')`), sem depender de colunas;
  - **não fazer nenhuma requisição de exclusão.**
- Em execução, mantém o comportamento atual: pede confirmação, exclui cada item por POST
  com o token CSRF da página e recarrega no fim.
- Onde colar: a tela do caixa, já filtrada.

## 5. Critérios de sucesso

- Uma pessoa da equipe, sem Python, gera e roda cada um dos três scripts sem abrir nenhum
  código.
- Na inclusão, o script gerado pelo painel para uma pasta real dá o mesmo resultado
  (mesma lista de contratos) que o `automacao_timp.py` para a mesma pasta.
- Em simulação, nenhum dos três scripts altera nada no T.IMP.

## 5.1 Como testar

- **Portal simulado:** `tests/mock_timp.py` simula a lista e o formulário de edição de
  `/contrato/pagterceiro/` e `/contrato/hedge/`, registrando cada gravação.
  `tests/gerar.py` cria PDFs sintéticos e gera scripts de teste com o `automacao_timp.py`.
  Foi com eles que o modelo de script da inclusão foi testado.
- **Não existem** cópias das páginas "Hedge – Passo 02" e da tela do caixa, nem PDFs reais
  no repositório (o repositório é público). Para essas telas, o teste automatizado usa
  páginas simuladas montadas a partir do que os scripts atuais esperam.
- **Aceite final:** a usuária roda cada script, primeiro em simulação, no Chrome do
  trabalho, com o painel aberto da pasta da rede e com uma pasta real de PDFs. Isso
  também confirma que o painel funciona aberto de um caminho `\\servidor\...`.

## 6. Deixado para quem for construir

- Visual (cores, fontes, ícones), desde que siga a estrutura da seção 4.1.
- Como o worker do pdf.js (cdnjs) é carregado numa página aberta em `file://`.
- Como manter os modelos de script num só lugar (por exemplo, o painel sendo a fonte e o
  Python lendo o mesmo modelo), ou aceitar a duplicação e documentá-la.
- Organização do código do painel e testes.
- Textos de ajuda e mensagens.

## 7. Escolhas minhas (não confirmadas pela usuária)

- A data de pagamento começa vazia, e não com a data de hoje, para evitar gerar o script
  com a data errada sem perceber.
- O campo opcional `data_contrato` (data do contrato no T.IMP) não aparece na tela na
  primeira versão; fica a data que o portal sugere, como hoje.
- Na lista de PDFs, **qualquer** linha pode ser editada e cada linha tem uma caixa
  "incluir", marcada por padrão. Motivo: as regras de reserva da extração podem ler um
  valor errado que parece completo, e a pasta pode ter um PDF que não deve entrar.
  O critério de "mesmo resultado que o Python" vale para a lista antes de edições manuais.
- Valores digitados à mão seguem o formato brasileiro (`1.234,56`); o painel valida e
  recusa outros formatos, porque o script remove todos os pontos ao converter. A moeda é
  um campo de três letras, sem lista fixa.
