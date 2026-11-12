# Automações de câmbio (T.IMP)

Ferramentas para preparar scripts que são colados no console do navegador (F12) do T.IMP:

- **Inclusão de contratos**: lê os PDFs de contratação e grava os contratos nos pagamentos (Terceiros e Hedge).
- **Limpeza de hedges**: remove do hedge as IMPs que não devem ficar.
- **Exclusão de previsões**: exclui todos os lançamentos de previsão visíveis na tabela do Caixa.

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
- Os arquivos `remocao_hedges.js` e `removao_previsoes.js` na raiz do repositório são as versões antigas dos scripts; use o painel no lugar deles.

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

Os modelos dos scripts ficam em `painel/modelos/` e são a fonte única usada pelo painel (JavaScript) e pelo `automacao_timp.py`.

```
node --test "tests/node/*.test.js"
python -m unittest tests.test_automacao_timp -v
python tests/rodar_integracao.py
```

`tests/rodar_integracao.py` sobe um portal T.IMP simulado e roda o painel e os scripts gerados num Chrome sem janela; precisa de Chrome instalado.
