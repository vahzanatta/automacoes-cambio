// Tela de datas de pagamento dos hedges (Passo 01): empresa, tipo e a planilha colada (código da IMP e data).
// Texto do usuário só entra no DOM por textContent/value.
(function (P) {
  const ONDE_COLAR = "Hedge › Seleção (Passo 01a para Hedges Novos, 01b para Hedges Expirados) do T.IMP, na empresa escolhida — console (F12)";
  const FALTA_PROBLEMAS = "Corrija as linhas com problema na lista.";
  const COMO_USAR = [
    "Abaixo, cole as colunas da planilha (código da IMP e data) e escolha a empresa e o tipo de hedge.",
    "Confira a prévia: as IMPs são agrupadas por data e as linhas com problema aparecem em vermelho; corrija a planilha e cole de novo.",
    "Com Simulação marcada, copie ou baixe o script ao lado.",
    "No T.IMP, abra a página certa (Hedge › Seleção, Passo 01a para Hedges Novos ou 01b para Hedges Expirados, na empresa escolhida), aperte F12, abra a aba Console, cole o script e aperte Enter.",
    "Simulação: o console mostra o que seria alterado em cada grupo de data. Nada é gravado.",
    "Conferiu? Volte aqui, escolha Execução, copie e cole no console da mesma página.",
    "Execução: a página abre em tela cheia e define a data de cada grupo. Não feche a aba; para interromper, clique em Parar.",
    "Se alguma IMP ou data não for encontrada, o script para antes de começar e nada é gravado.",
  ];

  function criar(tag, attrs, filhos) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === "texto") e.textContent = v; else e.setAttribute(k, v);
    });
    (filhos || []).forEach(f => e.appendChild(typeof f === "string" ? document.createTextNode(f) : f));
    return e;
  }

  function iniciarTelaDatasHedge(el) {
    const empresa = criar("select", { name: "empresa" }, [criar("option", { value: "", texto: "Escolha…" })]
      .concat(P.EMPRESAS.map(e => criar("option", { value: e.codigo, texto: `${e.codigo} - ${e.nome}` }))));
    const radiosTipo = Object.keys(P.PASSOS_HEDGE).map(k => criar("input", { type: "radio", name: "tipo", value: k }));
    const area = criar("textarea", { name: "planilha", rows: "10", spellcheck: "false" });
    const contador = criar("p", { class: "contador" });
    const corpo = criar("tbody");
    const lista = criar("div", { class: "lista-rolagem" }, [criar("table", { class: "lista-pdfs" }, [
      criar("thead", {}, [criar("tr", {}, ["Data", "Qtd. IMPs", "Códigos"].map(t => criar("th", { texto: t })))]),
      corpo,
    ])]);
    const problemasEl = criar("ul", { class: "problemas-planilha" });
    lista.hidden = problemasEl.hidden = true;

    const campo = (rotulo, controle) => criar("label", { class: "campo" }, [criar("span", { texto: rotulo }), controle]);
    const esquerda = criar("div", { class: "coluna-esquerda" }, [
      criar("h2", { texto: "Passo 1 – Inclusão de datas de pagamento" }),
      P.criarComoUsar(COMO_USAR),
      criar("div", { class: "formulario" }, [
        campo("Empresa", empresa),
        criar("fieldset", { class: "campo tipos" }, [criar("legend", { texto: "Tipo" })]
          .concat(radiosTipo.map(r => criar("label", {}, [r, " " + P.PASSOS_HEDGE[r.value].rotulo])))),
        campo("Cole aqui as colunas da planilha: código da IMP e data", area),
        contador,
      ]),
      problemasEl, lista,
    ]);
    const direita = criar("aside", { class: "coluna-direita" });
    el.appendChild(criar("div", { class: "processo" }, [esquerda, direita]));

    const tipoEscolhido = () => (radiosTipo.find(r => r.checked) || {}).value || "";
    const dados = () => ({
      processo: "datas-hedge", empresa: empresa.value, tipo: tipoEscolhido(), grupos: P.lerPlanilhaDatas(area.value).grupos,
    });

    const coluna = P.criarColunaScript(direita, {
      gerar: ({ dryRun }) => {
        const d = dados();
        const faltas = P.validarDatasHedge({ empresa: d.empresa, tipo: d.tipo, grupos: d.grupos });
        if (P.lerPlanilhaDatas(area.value).problemas.length) faltas.push(FALTA_PROBLEMAS);
        if (faltas.length) return { faltas };
        return { script: P.montarDatasHedge({ empresa: d.empresa, tipo: d.tipo, grupos: d.grupos, dryRun }) };
      },
      dados,
      nomeArquivo: "datas_hedge.js",
      ondeColar: ONDE_COLAR,
    });

    function atualizar() {
      const r = P.lerPlanilhaDatas(area.value);
      const n = r.itens.length;
      contador.textContent = `${n} ${n === 1 ? "IMP lida" : "IMPs lidas"} · ${r.grupos.length} ${r.grupos.length === 1 ? "grupo de data" : "grupos de data"}` +
        (r.problemas.length ? ` · ${r.problemas.length} ${r.problemas.length === 1 ? "linha com problema" : "linhas com problema"}` : "");
      corpo.replaceChildren(...r.grupos.map(g => criar("tr", {}, [
        criar("td", { texto: P.formatarDataBr(g.data) }),
        criar("td", { texto: String(g.codigos.length) }),
        criar("td", { class: "arquivo", texto: g.codigos.join(", ") }),
      ])));
      problemasEl.replaceChildren(...r.problemas.map(p => criar("li", { texto: `Linha ${p.linha}: ${p.texto} — ${p.motivo}` })));
      lista.hidden = r.grupos.length === 0;
      problemasEl.hidden = r.problemas.length === 0;
      coluna.atualizar();
    }

    area.addEventListener("input", atualizar);
    area.addEventListener("change", atualizar);
    empresa.addEventListener("change", atualizar);
    radiosTipo.forEach(r => r.addEventListener("change", atualizar));
    atualizar();
  }

  P.iniciarTelaDatasHedge = iniciarTelaDatasHedge;
})(window.Painel);
