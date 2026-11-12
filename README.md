# Automações de câmbio (T.IMP)

Ferramentas para preparar scripts que são colados no console do navegador (F12) do T.IMP:

- **Inclusão de contratos**: registra no T.IMP o número dos contratos de câmbio, a partir dos PDFs da pasta (Terceiros e Hedge).
- **Seleções e remoções de hedges**, em dois passos:
  - **Passo 1 – Inclusão de datas de pagamento**: define a data de pagamento do hedge das IMPs (Hedges Novos ou Hedges Expirados), por grupo de data, a partir de uma planilha colada.
  - **Passo 2 – Remoção de IMPs**: mantém no hedge só as IMPs da lista e retira as demais.
- **Exclusão de lançamentos de previsão**: apaga de uma vez os lançamentos de previsão que aparecem na tela do caixa.

## Para a equipe: o painel

1. Copie a pasta `painel/` inteira para a pasta de rede da equipe.
2. Dê dois cliques em `painel.html`. Ele abre no Chrome.
3. Escolha o processo e preencha os campos.
4. Copie (ou baixe) o script em **Simulação** e cole no console (F12) do T.IMP, na página indicada em "Onde colar".
5. Confira o resultado da simulação. Nada é gravado nem excluído nessa etapa.
6. Volte ao painel, copie (ou baixe) o script em **Execução** e rode-o no mesmo lugar. A Execução só é liberada depois que você copia ou baixa a Simulação com exatamente os mesmos dados; se mudar qualquer dado, ela trava de novo.

Observações:

- O painel precisa de acesso à internet: a biblioteca que lê PDFs (pdf.js) é carregada da internet.
- Os PDFs nunca são enviados a lugar nenhum. Eles são lidos dentro do próprio navegador.
- Não há nada para instalar.
- No Passo 1 dos hedges (inclusão de datas de pagamento), cole a planilha com as duas colunas, código da IMP e data, copiadas direto do Excel.

## Alternativa em Python

Opção reserva, caso o painel não esteja disponível. Gera exatamente o mesmo script de inclusão que o painel e aceita os mesmos contratos (um PDF com dado inválido fica de fora e o motivo aparece na tela; no painel ele poderia ser corrigido à mão). Precisa do projeto inteiro: o `automacao_timp.py` lê o modelo do script em `painel/modelos/`.

```
pip install pdfplumber
```

Ajuste o bloco `CONFIGURAÇÃO` no início de `automacao_timp.py` (pasta dos PDFs, empresa, tipo de contrato e data) e rode:

```
python automacao_timp.py
```

O arquivo `preencher_timp.js` é criado ao lado do `automacao_timp.py` e sai em Simulação (`DRY_RUN = True`). Cole no console (F12) da página de Contratos do T.IMP. Depois de conferir, mude `DRY_RUN` para `False`, rode de novo e cole o novo arquivo para gravar.

## Para desenvolver

Os modelos dos scripts ficam em `painel/modelos/` e são a fonte única usada pelo painel (JavaScript) e pelo `automacao_timp.py`. Os testes automáticos e a documentação de desenho não fazem parte deste repositório.
