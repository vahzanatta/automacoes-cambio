// Tela de remoção de hedges: as IMPs que devem PERMANECER e, em "Avançado", os tempos do script.
// Texto do usuário só entra no DOM por textContent/value.
(function (P) {
  const ONDE_COLAR = "Página Hedge – Passo 02 do T.IMP — console (F12)";
  const COMO_USAR = [
    "Abaixo, informe as IMPs que devem permanecer no hedge, uma por linha (vírgula e ponto e vírgula também separam).",
    "Com Simulação marcada, copie ou baixe o script ao lado.",
    "No T.IMP, abra a página Hedge – Passo 02, aperte F12, abra a aba Console, cole o script e aperte Enter.",
    "Simulação: as IMPs que ficam aparecem em verde e as que saem em vermelho, com um resumo no canto da página. Nada é removido.",
    "Conferiu? Volte aqui, escolha Execução, copie e cole no console da mesma página.",
    "Execução: a página abre em tela cheia e remove uma IMP por vez, recarregando a cada remoção. Não feche a aba; para interromper, clique em Parar.",
    "Se nenhuma IMP da lista estiver na página, o script para sem remover nada.",
  ];
  const FALTA_ESPERA = "Informe um tempo de espera válido (em segundos).";
  const FALTA_PAUSA = "Informe uma pausa válida (em segundos).";

  function criar(tag, attrs, filhos) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === "texto") e.textContent = v; else e.setAttribute(k, v);
    });
    (filhos || []).forEach(f => e.appendChild(typeof f === "string" ? document.createTextNode(f) : f));
    return e;
  }

  // Mesma normalização de validarHedges
  const normalizar = texto => String(texto || "").split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);

  // Segundos digitados (aceita vírgula decimal) -> ms; null se vazio ou não for > 0
  function segundosParaMs(texto) {
    const t = String(texto || "").trim().replace(",", ".");
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : null;
  }

  function iniciarTelaHedges(el) {
    const area = criar("textarea", { name: "manter", rows: "10", spellcheck: "false" });
    const contador = criar("p", { class: "contador" });
    const espera = criar("input", { type: "number", name: "espera", min: "0", step: "any", value: "30" });
    const pausa = criar("input", { type: "number", name: "pausa", min: "0", step: "any", value: "0.4" });   // value só aceita ponto; o navegador mostra 0,4 em pt-BR
    const campo = (rotulo, controle) => criar("label", { class: "campo" }, [criar("span", { texto: rotulo }), controle]);

    const esquerda = criar("div", { class: "coluna-esquerda" }, [
      criar("h2", { texto: "Passo 2 – Remoção de IMPs" }),
      P.criarComoUsar(COMO_USAR),
      criar("div", { class: "formulario" }, [
        campo("IMPs que devem PERMANECER (uma por linha)", area),
        contador,
        criar("details", { class: "avancado" }, [
          criar("summary", { texto: "Avançado" }),
          campo("Espera da recarga (segundos)", espera),
          campo("Pausa após cada recarga (segundos)", pausa),
        ]),
      ]),
    ]);
    const direita = criar("aside", { class: "coluna-direita" });
    el.appendChild(criar("div", { class: "processo" }, [esquerda, direita]));

    const dados = () => ({
      processo: "hedges",
      manter: normalizar(area.value),
      timeoutMs: segundosParaMs(espera.value),
      pausaMs: segundosParaMs(pausa.value),
    });

    const coluna = P.criarColunaScript(direita, {
      gerar: ({ dryRun }) => {
        const d = dados();
        const faltas = P.validarHedges({ manter: d.manter.join("\n") });
        if (d.timeoutMs === null) faltas.push(FALTA_ESPERA);
        if (d.pausaMs === null) faltas.push(FALTA_PAUSA);
        if (faltas.length) return { faltas };
        return { script: P.montarHedges({
          manter: d.manter.join("\n"), dryRun, timeoutMs: d.timeoutMs, pausaMs: d.pausaMs,
        }) };
      },
      dados,
      nomeArquivo: "remover_hedges.js",
      ondeColar: ONDE_COLAR,
    });

    function atualizar() {
      const n = normalizar(area.value).length;
      contador.textContent = `${n} ${n === 1 ? "código informado" : "códigos informados"}`;
      coluna.atualizar();
    }

    [area, espera, pausa].forEach(c => {
      c.addEventListener("input", atualizar);
      c.addEventListener("change", atualizar);
    });
    atualizar();
  }

  P.iniciarTelaHedges = iniciarTelaHedges;
})(window.Painel);
