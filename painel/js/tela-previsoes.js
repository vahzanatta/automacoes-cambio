// Tela de exclusão de previsões: sem campos, só as instruções e a coluna do script.
(function (P) {
  const ONDE_COLAR = "Tela do caixa do T.IMP, já filtrada — console (F12)";
  const COMO_USAR = [
    "No T.IMP, abra a tela do Caixa e filtre só os lançamentos de previsão que devem ser excluídos.",
    "Com Simulação marcada, copie ou baixe o script ao lado.",
    "Na tela do Caixa, aperte F12, abra a aba Console, cole o script e aperte Enter.",
    "Simulação: as linhas que seriam excluídas ficam em vermelho e a lista aparece no console. Nada é excluído.",
    "Conferiu? Volte aqui, escolha Execução, copie e cole no console da mesma tela.",
    "Execução: o T.IMP pede confirmação, exclui todas as linhas visíveis e recarrega a página.",
  ];

  function criar(tag, attrs, filhos) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === "texto") e.textContent = v; else e.setAttribute(k, v);
    });
    (filhos || []).forEach(f => e.appendChild(typeof f === "string" ? document.createTextNode(f) : f));
    return e;
  }

  function iniciarTelaPrevisoes(el) {
    const direita = criar("aside", { class: "coluna-direita" });
    const esquerda = criar("div", { class: "coluna-esquerda" }, [
      criar("h2", { texto: "Exclusão de lançamentos de previsão" }),
      criar("p", { texto: "Exclui todos os lançamentos de previsão visíveis na tabela." }),
      P.criarComoUsar(COMO_USAR),
    ]);
    el.appendChild(criar("div", { class: "processo" }, [esquerda, direita]));

    // Sem campos, os dados nunca mudam: por isso, ao reabrir a tela, a coluna é refeita
    // (volta a Simulação, com a Execução travada de novo).
    function montarColuna() {
      direita.replaceChildren();
      P.criarColunaScript(direita, {
        gerar: ({ dryRun }) => ({ script: P.montarPrevisoes({ dryRun }) }),
        dados: () => ({ processo: "previsoes" }),
        nomeArquivo: "excluir_previsoes.js",
        ondeColar: ONDE_COLAR,
      });
    }
    montarColuna();
    return { aoMostrar: montarColuna };
  }

  P.iniciarTelaPrevisoes = iniciarTelaPrevisoes;
})(window.Painel);
