(function (exportar) {
  function inclusao() {
// Documentação do modelo (fica fora do script gerado):
// ============================================================================
//  T.IMP - Inclusão de contratos de câmbio (gerado pelo painel ou pelo automacao_timp.py)
//
//  Onde colar: no Chrome, com o T.IMP aberto e logado, aperte F12, abra a aba
//  "Console", cole este arquivo inteiro e aperte Enter.
//
//  1ª vez: rode em Simulação. Ele só mostra o que seria gravado.
//  Conferiu a tabela? Gere o script de Execução no painel e rode-o
//  (no Python, troque DRY_RUN para false).
// ============================================================================
//<<INICIO
(async () => {
  const EMPRESA    = __EMPRESA__;
  const EMP_ID     = __EMP_ID__;
  const TIPO       = __TIPO__;
  const DATA_PAGTO = __DATA_PAGTO__;
  const DRY_RUN    = __DRY_RUN__;

  const CONTRATOS = __CONTRATOS__;

  const BASE     = `/contrato/${TIPO}/`;
  const urlLista = `${BASE}?Emp_ID=${EMP_ID}&wComboDataPagamento=${DATA_PAGTO}&button_filtrar_data=Filtrar`;

  const norm    = t => (t || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const toCents = s => Math.round(parseFloat(String(s).replace(/\./g, "").replace(",", ".")) * 100);
  const sleep   = ms => new Promise(r => setTimeout(r, ms));

  async function getDoc(url) {
    const r = await fetch(url, { credentials: "same-origin" });
    if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
    return new DOMParser().parseFromString(await r.text(), "text/html");
  }

  const PREFIXO_BOTAO = "button_name_atualizar_contrato";
  let botoesDaLista = [];
  let resumoPagina = "";

  async function lerLista() {
    const doc = await getDoc(urlLista);
    const trs = [...doc.querySelectorAll("table tbody tr")];
    botoesDaLista = [...new Set(trs.flatMap(tr =>
      [...tr.querySelectorAll(`[name^="${PREFIXO_BOTAO}"]`)].map(b => b.getAttribute("name"))))];
    const celulas = trs.map(tr => [...tr.querySelectorAll(":scope > td")].map(td => td.textContent.trim()));
    resumoPagina = `linhas na página: ${trs.length}, colunas na 1ª linha: ${celulas.length ? celulas[0].length : 0}`;
    return celulas
      .filter(td => td.length >= 10 && /^\d+$/.test(td[0]))
      .map(td => ({
        id: td[0],
        fornecedor: td[2],
        fornNorm: norm(td[2]),
        moeda: td[4].toUpperCase(),
        valorStr: td[5],
        cents: toCents(td[5]),
        contrato: td[8],
      }));
  }

  function acharLinhas(cands, alvo) {
    const exata = cands.find(c => c.cents === alvo);
    if (exata) return [exata];

    const n = cands.length;
    if (n > 20) {
      const soma = cands.reduce((a, c) => a + c.cents, 0);
      return soma === alvo ? cands : null;
    }
    let melhor = null;
    for (let mask = 1; mask < (1 << n); mask++) {
      let soma = 0, qtd = 0;
      for (let i = 0; i < n; i++) if (mask & (1 << i)) { soma += cands[i].cents; qtd++; }
      if (soma === alvo && (!melhor || qtd < melhor.qtd)) melhor = { mask, qtd };
    }
    if (!melhor) return null;
    return cands.filter((_, i) => melhor.mask & (1 << i));
  }

  let botaoEdicao = null;
  const campoContrato = doc => doc.querySelector("[name='Ctt_Numero'], #id_Ctt_Numero");

  async function abrirEdicao(id) {
    const opcoes = botaoEdicao ? [botaoEdicao]
      : [...new Set([`${PREFIXO_BOTAO}_${TIPO}`, ...botoesDaLista, `${PREFIXO_BOTAO}_pagterceiro`])];
    let ultimoErro = "";
    for (const botao of opcoes) {
      const url = `${BASE}?${botao}=${id}&Emp_ID=${EMP_ID}`;
      let doc;
      try { doc = await getDoc(url); } catch (e) { ultimoErro = ` Último erro: ${e.message}.`; continue; }
      if (campoContrato(doc)) { botaoEdicao = botao; return { url, doc }; }
    }
    throw new Error(`não abriu o formulário de edição do pagamento ${id} (sessão expirou?). ` +
                    `Botões testados: ${opcoes.join(", ")}.${ultimoErro}`);
  }

  async function gravar(id, c) {
    const { url, doc } = await abrirEdicao(id);
    const form = campoContrato(doc).closest("form") || doc.querySelector("form[method='post']");
    if (!form) throw new Error(`formulário não encontrado para ${id}`);

    const body = new URLSearchParams();
    form.querySelectorAll("input[name], select[name]").forEach(el => {
      if (el.type === "radio" && !el.checked) return;
      body.set(el.name, el.value);
    });
    body.set("Ctt_Numero", c.num_contrato);
    body.set("optradio_atualizacao_tipo", "PAGAMENTO_INDIVIDUAL");
    if (c.data_contrato) body.set("Ctt_Dt", c.data_contrato);

    const r = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-CSRFToken": body.get("csrfmiddlewaretoken") },
      body,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ao gravar ${id}`);
  }

  console.log(`%cT.IMP | ${EMPRESA} (Emp_ID ${EMP_ID}) | ${TIPO} | data ${DATA_PAGTO} | ` +
              `${CONTRATOS.length} contrato(s) | ${DRY_RUN ? "SIMULAÇÃO" : "GRAVANDO"}`,
              "color:#007bff;font-weight:bold;font-size:14px");

  let linhas;
  try {
    linhas = await lerLista();
  } catch (e) {
    console.error(`Não consegui ler a lista do T.IMP: ${e.message}. ` +
                  "Confira se esta aba é a do portal e se você está logado. Nada foi gravado.");
    return;
  }
  if (!linhas.length) {
    console.error(`Nenhum pagamento encontrado em ${urlLista} (${resumoPagina}). ` +
                  "Confira empresa, tipo de contrato e data, e se a sessão não expirou. Nada foi gravado.");
    return;
  }
  console.log(`Linhas na tabela: ${linhas.length} (sem contrato: ${linhas.filter(l => !l.contrato).length})`);

  const usadas = new Set();
  const plano = [];
  const problemas = [];

  for (const c of CONTRATOS) {
    const fN = norm(c.fornecedor);
    const alvo = toCents(c.valor);
    const cands = linhas.filter(l =>
      !l.contrato && !usadas.has(l.id) &&
      l.moeda === c.moeda.toUpperCase() &&
      fN && l.fornNorm && (l.fornNorm.includes(fN) || fN.includes(l.fornNorm))
    );

    if (!cands.length) {
      problemas.push({ contrato: c.num_contrato, fornecedor: c.fornecedor, motivo: "fornecedor/moeda não encontrado ou já preenchido" });
      continue;
    }
    const match = acharLinhas(cands, alvo);
    if (!match) {
      problemas.push({
        contrato: c.num_contrato, fornecedor: c.fornecedor,
        motivo: `valor ${c.valor} não fecha com nenhuma combinação`,
        linhas_disponiveis: cands.map(l => `${l.id}: ${l.valorStr}`).join(" | "),
      });
      continue;
    }
    match.forEach(l => usadas.add(l.id));
    plano.push({ c, ids: match.map(l => l.id), valores: match.map(l => l.valorStr).join(" + ") });
  }

  console.log(`Casaram ${plano.length} de ${CONTRATOS.length} contrato(s):`);
  console.table(plano.map(p => ({
    contrato: p.c.num_contrato, fornecedor: p.c.fornecedor, moeda: p.c.moeda,
    valor_pdf: p.c.valor, ids_pagamento: p.ids.join(", "), composicao: p.valores,
  })));
  if (problemas.length) { console.warn("Não casaram:"); console.table(problemas); }

  if (!plano.length) {
    console.warn("Nenhum contrato casou com a lista. Nada a gravar.");
    return;
  }

  try {
    await abrirEdicao(plano[0].ids[0]);
    console.log(`Formulário de edição: OK (${botaoEdicao})`);
  } catch (e) {
    console.error(`Problema: ${e.message} Nada foi gravado.` +
                  (DRY_RUN ? " Não gere o script de Execução antes de resolver isso." : ""));
    return;
  }

  if (DRY_RUN) {
    console.log("%cSimulação concluída. Confira a tabela acima e gere o script de Execução no painel (ou, no Python, troque DRY_RUN para false).", "color:orange;font-weight:bold");
    return;
  }

  for (const p of plano) {
    for (const id of p.ids) {
      try {
        await gravar(id, p.c);
        console.log(`✅ ${id} ← ${p.c.num_contrato} (${p.c.fornecedor})`);
      } catch (e) {
        console.error(`❌ ${id}: ${e.message}`);
      }
      await sleep(300);
    }
  }

  const depois = await lerLista();
  const conferencia = plano.flatMap(p => p.ids.map(id => {
    const l = depois.find(x => x.id === id);
    return { id, esperado: p.c.num_contrato, no_portal: l ? l.contrato || "(vazio)" : "(sumiu da lista)",
             ok: l && l.contrato === p.c.num_contrato ? "✅" : "❌" };
  }));
  console.table(conferencia);
  console.log(`%cFim: ${conferencia.filter(x => x.ok === "✅").length}/${conferencia.length} gravados`,
              "color:green;font-weight:bold;font-size:14px");
})();
//FIM>>
  }
  exportar({ inclusao });
})(function (api) {
  if (typeof module !== "undefined" && module.exports) Object.assign(module.exports, api);
  else Object.assign(window.Painel.modelos, api);
});
