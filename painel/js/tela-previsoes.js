// Tela de exclusão de previsões: sem campos, só as instruções e a coluna do script.
(function (P) {
  const ONDE_COLAR = "Tela do caixa do T.IMP, já filtrada — console (F12)";

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
      criar("h2", { texto: "Exclusão de previsões" }),
      criar("p", { texto: "Exclui todos os lançamentos de previsão visíveis na tabela." }),
      criar("ol", { class: "passos" }, [
        criar("li", { texto: "No T.IMP, abra a página do Caixa e filtre os lançamentos que quer excluir." }),
        criar("li", { texto: "Copie ou baixe o script em Simulação e cole no console (F12). As linhas que seriam excluídas ficam em vermelho; nada é excluído." }),
        criar("li", { texto: "Confira. Depois escolha Execução, copie de novo e cole no console para excluir." }),
      ]),
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
