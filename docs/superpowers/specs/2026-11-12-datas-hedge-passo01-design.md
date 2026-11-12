# Nova rotina: data de pagamento dos hedges (Passo 01) — desenho

Data: 2026-11-12 · Status: aprovado pela usuária em 2026-11-12
Complementa: `2026-11-12-painel-cambio-design.md` (as regras gerais de lá valem aqui:
Simulação por padrão, trava da Execução, orientações só na interface, script sem comentários).

## 1. Intenção

No T.IMP há dois casos, com telas iguais (segundo a usuária):

| Caso | Menu do T.IMP | Endereço |
|---|---|---|
| Hedges Novos | Hedge › IMPs que nunca tiveram Hedge › Seleção | `/hedge/Passo01a?Emp_ID=…` |
| Hedges Expirados | Hedge › IMPs que já tiveram Hedge › Seleção | `/hedge/Passo01b?Emp_ID=…` |

Um único script serve aos dois casos e às três empresas (BR02 = Emp_ID 3, BR21 = 4, BR22 = 6):
só o endereço muda. A tela lista IMPs com uma caixa de seleção por linha. Hoje a pessoa marca as IMPs uma a uma, escolhe a
data em **Data Pagto** e clica em **"Alterar Data Pag.Hedge (lote)"**; a página grava e recarrega.
Num mesmo fechamento há **grupos de IMPs com datas diferentes**, então isso se repete por data.
A lista de IMPs e datas vem de uma **planilha, com o código e a data lado a lado**.

A nova rotina faz isso a partir da lista colada no painel.

## 2. Tela no painel

Quarto cartão na tela inicial: **"Data de pagamento dos hedges"** — "Define a data de pagamento
do hedge das IMPs do Passo 01, por grupo de data."

- **Empresa:** BR02, BR21 ou BR22 (define o Emp_ID).
- **Tipo:** Hedges Novos ou Hedges Expirados — **sempre sem seleção no início**, como o tipo de contrato
  da inclusão.
- **Lista:** caixa de texto onde se cola a planilha (duas colunas: código da IMP e data).
  Aceita tabulação (cópia do Excel), `;` ou espaços entre as colunas; data em `dd/mm/aaaa` ou
  `aaaa-mm-dd`; uma linha de cabeçalho é ignorada.
- **Prévia:** tabela agrupada por data (data → quantidade de IMPs e os códigos), e a lista de
  linhas com problema (linha sem data, data inválida, código repetido com datas diferentes).
  Linhas com problema impedem gerar o script ("Falta: …").
- Coluna da direita igual às outras telas (Simulação/Execução, trava, Copiar, Baixar).
- "Onde colar": a tela de Seleção do tipo escolhido (Passo 01a ou 01b), na empresa escolhida.
- "Como usar" no topo da coluna da esquerda.

## 3. O script

Variáveis: `EMP_ID`, `PASSO` (`Passo01a` ou `Passo01b`), `DRY_RUN` e a lista (código → data).

- **Página certa:** antes de qualquer coisa, confere que está colado em `/hedge/<PASSO>` e que a
  empresa da página (o `Emp_ID` do endereço ou o selecionado em `#Emp_ID`) é a escolhida. Se não,
  para sem marcar nem gravar nada e diz em qual página colar.

Lê a tabela pela coluna **"Código IMP"** (pelo cabeçalho,
não pela posição) e a caixa `input[name="wCheckbox"]` de cada linha; as datas válidas vêm das
opções de `#wCombowDatasPagamentoFuturas`.

- **Comparação dos códigos:** exata, sem diferenciar maiúsculas e ignorando espaços nas pontas
  (não por "contém", para não pegar a IMP errada).
- **Antes de qualquer coisa (Simulação e Execução):** confere que todos os códigos estão na
  página e que todas as datas existem na lista "Data Pagto". Se algo faltar, lista o problema e
  **não grava nada**.
- **Simulação:** pinta de verde as linhas que seriam marcadas, com a data de cada uma; mostra no
  console e num quadro na página o resumo por grupo (data, quantidade, total pela coluna
  "Valor Proforma" — somando por moeda) e o que não foi encontrado. Nada é marcado nem gravado.
- **Execução:** como a página recarrega a cada gravação, o script trabalha como a remoção de
  hedges: abre a página em tela cheia num quadro controlado (botões **Parar** e **Fechar**) e,
  para cada grupo de data:
  1. desmarca o que estiver marcado; marca, clicando, as caixas das IMPs do grupo (a página
     atualiza o Total e a lista interna dela, como no uso manual);
  2. escolhe a data em "Data Pagto" e clica no próprio botão "Alterar Data Pag.Hedge (lote)";
  3. espera a recarga e confere o grupo: cada IMP do grupo saiu da lista ou aparece com a nova
     data em "Dt.Pgto.Hedge". Se não, para e informa o grupo.
  No fim mostra o que foi gravado por grupo. Se parar no meio, diz quais grupos já foram gravados.

## 4. Testes

- Páginas simuladas do Passo 01a e 01b no `tests/mock_timp.py`, por empresa (tabela, caixas, `impSelecionada`,
  select de datas e o botão de lote que grava e recarrega).
- Cenários: simulação não grava; execução com 2 grupos grava cada IMP na data certa;
  código inexistente ou data fora da lista → nada gravado; colado na página ou empresa errada →
  nada gravado; leitura da planilha colada
  (tabulação, `;`, cabeçalho, data inválida, código repetido) em teste unitário.

## 5. Fora do escopo

- O botão de calendário por linha ("alterar data prevista" somando dias).

## 6. Pontos a confirmar no uso real

- O Passo 01a não foi visto (só o HTML do 01b); o desenho parte da informação de que as telas
  são iguais. Se o 01a diferir, o script para na verificação da tabela sem gravar nada.

- O que a página faz com a IMP depois da gravação (sai da lista ou continua com a nova data):
  o script aceita os dois.
- O comportamento exato de `submitForm` da página: o script usa o próprio botão, então segue o
  que o T.IMP faz no clique manual.
