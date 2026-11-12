// Cenários de integração: cada um roda um script gerado (tests/saida/) numa página do
// portal simulado (tests/mock_timp.py) e confere o estado do mock. Só dados sintéticos.
// Cada cenário: { nome, async rodar(ctx) -> { ok, detalhe } }. O ctx vem do runner.html.
(function () {
  const contratos = linhas => Object.fromEntries(linhas.map(l => [l[0], l[4]]));
  const erros = pag => pag.logs.filter(l => l.tipo === "error").map(l => l.args.join(" "));
  const posts = (est, prefixo) => est.posts.filter(p => p.caminho.startsWith(prefixo));
  const imps = est => Object.values(est.hedges).flat().map(i => i[0]).sort();

  // Confere uma lista de [descrição, condição]; devolve a primeira que falhou
  function conferir(checks, okMsg) {
    const falha = checks.find(([, cond]) => !cond);
    return falha ? { ok: false, detalhe: falha[0] } : { ok: true, detalhe: okMsg };
  }

  const ESPERADO_GRAVADO = {
    "1001": "111111111", "1002": "222222222", "1003": "222222222", "1004": "",
    "1005": "333333333", "1006": "", "1007": "999999999",
  };
  const INICIAL = { "1001": "", "1002": "", "1003": "", "1004": "", "1005": "", "1006": "", "1007": "999999999" };
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // Passo 01 simulado: caixas da tabela ({ id, cx, tr }) e [id, Dt.Pgto.Hedge] de uma página do mock
  const caixasDatas = doc => [...doc.querySelectorAll('input[name="wCheckbox"]')].map(cx => {
    let id = "";
    try { id = JSON.parse(cx.getAttribute("data-id")).wImpID; } catch (e) { id = ""; }
    return { id, cx, tr: cx.closest("tr") };
  });
  const datasMock = (est, chave) => ((est.datas_hedge || {})[chave] || []).map(i => [i.id, i.dt_hedge]);

  async function semGravarComErro(ctx, reset, script) {
    await ctx.reset(reset);
    const pag = await ctx.rodar(script);
    const est = await ctx.estado();
    const e = erros(pag);
    return conferir([
      [`esperava 0 POST, houve ${est.posts.length}`, est.posts.length === 0],
      [`nenhum console.error com "Nada foi gravado" (erros: ${JSON.stringify(e)})`,
        e.some(m => m.includes("Nada foi gravado"))],
    ], `0 POST; erro: ${(e[0] || "").slice(0, 80)}…`);
  }

  // ---------- Tela de inclusão ----------
  const PDF_BONS = ["111111111 - Contratação.pdf", "222222222 - Contratação.PDF"];

  // Abre o painel na tela de inclusão; Baixar é interceptado (nada é baixado no headless)
  async function abrirInclusao(ctx) {
    const pag = await ctx.abrir("/painel/painel.html");
    const w = pag.win, d = pag.doc;
    const baixados = [];
    w.HTMLAnchorElement.prototype.click = function () {
      if (this.download) baixados.push({ nome: this.download, href: this.href });
    };
    const cartao = d.querySelector('.cartao[data-tela="inclusao"]');
    if (cartao) cartao.click();
    const tela = d.getElementById("tela-inclusao");
    const q = s => tela.querySelector(s);
    const qa = s => [...tela.querySelectorAll(s)];
    const ev = (el, tipo) => el.dispatchEvent(new w.Event(tipo, { bubbles: true }));
    const t = {
      pag, w, d, tela, q, qa, baixados,
      empresa: q('select[name="empresa"]'),
      tipos: qa('input[type="radio"][name="tipo"]'),
      data: q('input[type="date"][name="data"]'),
      pasta: q('input[type="file"][name="pasta"]'),
      progresso: q(".progresso"),
      contador: q(".contador"),
      linhas: () => qa(".lista-pdfs tbody tr"),
      celula: (tr, campo) => tr.querySelector(`input[data-campo="${campo}"]`),
      incluir: tr => tr.querySelector("input.incluir"),
      statusDe: tr => (tr.querySelector(".status-pdf") || {}).textContent || "",
      pre: () => q(".coluna-direita pre"),
      faltas: () => q(".coluna-direita .faltas"),
      exe: () => q('.coluna-direita input[value="execucao"]'),
      sim: () => q('.coluna-direita input[value="simulacao"]'),
      baixar: () => qa(".coluna-direita .acoes button").find(b => b.textContent === "Baixar .js"),
      digitar(el, valor) { el.value = valor; ev(el, "input"); ev(el, "change"); },
      escolher(sel, valor) { sel.value = valor; ev(sel, "change"); },
    };
    t.ok = !!(t.empresa && t.data && t.pasta && t.progresso && t.contador && t.tipos.length === 2);
    return t;
  }

  async function arquivoPdf(t, nome) {
    const r = await t.w.fetch("/__mock/pdf/" + encodeURIComponent(nome), { cache: "no-store" });
    if (!r.ok) throw new Error(`PDF ${nome}: HTTP ${r.status}`);
    return { nome, caminho: "pasta/" + nome, conteudo: await r.blob() };
  }

  // Põe os arquivos no input da pasta (via DataTransfer), com webkitRelativePath, e dispara change
  function escolherPasta(t, arquivos) {
    const dt = new t.w.DataTransfer();
    arquivos.forEach(a => dt.items.add(new t.w.File([a.conteudo], a.nome, { type: a.tipo || "application/pdf" })));
    t.pasta.files = dt.files;
    [...t.pasta.files].forEach((f, i) =>
      Object.defineProperty(f, "webkitRelativePath", { value: arquivos[i].caminho, configurable: true }));
    t.pasta.dispatchEvent(new t.w.Event("change", { bubbles: true }));
  }

  const leituraConcluida = (ctx, t) =>
    ctx.esperar(() => /^Leitura concluída/.test(t.progresso.textContent), 30000, 100);

  const nContratos = s => (s.match(/"num_contrato"/g) || []).length;

  async function preencherTudo(t, ctx, nomes) {
    escolherPasta(t, await Promise.all(nomes.map(n => arquivoPdf(t, n))));
    const fim = await leituraConcluida(ctx, t);
    t.escolher(t.empresa, "BR21");
    t.digitar(t.data, "2026-11-12");
    t.tipos.find(r => r.value === "TERCEIROS").click();
    return !!fim;
  }

  window.CENARIOS = [
    {
      nome: "inclusao_terceiros_sim",
      async rodar(ctx) {
        await ctx.reset();
        const pag = await ctx.rodar("terceiros_sim.js");
        const est = await ctx.estado();
        const plano = pag.logs.find(l => l.tipo === "table" && Array.isArray(l.args[0]) &&
                                         l.args[0].length && "ids_pagamento" in l.args[0][0]);
        const ids = plano ? plano.args[0].map(p => p.ids_pagamento) : [];
        return conferir([
          [`esperava 0 POST, houve ${est.posts.length}`, est.posts.length === 0],
          ["não achei a tabela do plano no console", !!plano],
          [`plano esperado 1001 | 1002, 1003 | 1005, veio ${ids.join(" | ")}`,
            igual(ids, ["1001", "1002, 1003", "1005"])],
          ["a lista mudou na simulação", igual(contratos(est.linhas.pagterceiro), INICIAL)],
        ], `0 POST; plano com ${ids.length} contratos (${ids.join(" | ")})`);
      },
    },
    {
      nome: "inclusao_terceiros_gravar",
      async rodar(ctx) {
        await ctx.reset();
        await ctx.rodar("terceiros_gravar.js");
        const est = await ctx.estado();
        const obtido = contratos(est.linhas.pagterceiro);
        return conferir([
          [`contratos na lista: ${JSON.stringify(obtido)}`, igual(obtido, ESPERADO_GRAVADO)],
          [`esperava 4 POST, houve ${est.posts.length}`, est.posts.length === 4],
          ["algum POST sem PAGAMENTO_INDIVIDUAL",
            est.posts.every(p => p.campos.optradio_atualizacao_tipo === "PAGAMENTO_INDIVIDUAL")],
          ["houve POST com PAGAMENTO_FORNECEDOR",
            !est.posts.some(p => p.campos.optradio_atualizacao_tipo === "PAGAMENTO_FORNECEDOR")],
          ["algum POST fora de /contrato/pagterceiro/", posts(est, "/contrato/pagterceiro/").length === 4],
        ], "1001, 1002, 1003, 1005 gravados; 1004/1006 vazios; 1007 intacto; 4 POST individuais");
      },
    },
    {
      nome: "inclusao_regravar",
      async rodar(ctx) {
        await ctx.reset();
        await ctx.rodar("terceiros_gravar.js");
        const antes = (await ctx.estado()).posts.length;
        await ctx.rodar("terceiros_gravar.js");   // sem reset
        const est = await ctx.estado();
        return conferir([
          [`a 1ª execução deveria gravar 4, gravou ${antes}`, antes === 4],
          [`a 2ª execução fez ${est.posts.length - antes} POST`, est.posts.length === antes],
          ["a lista mudou na 2ª execução", igual(contratos(est.linhas.pagterceiro), ESPERADO_GRAVADO)],
        ], "2ª execução: 0 POST novo");
      },
    },
    {
      nome: "inclusao_hedge_gravar",
      async rodar(ctx) {
        await ctx.reset();
        await ctx.rodar("hedge_gravar.js");
        const est = await ctx.estado();
        return conferir([
          [`contratos no hedge: ${JSON.stringify(contratos(est.linhas.hedge))}`,
            igual(contratos(est.linhas.hedge), ESPERADO_GRAVADO)],
          ["pagterceiro mudou", igual(contratos(est.linhas.pagterceiro), INICIAL)],
          [`esperava 4 POST em /contrato/hedge/, houve ${posts(est, "/contrato/hedge/").length} de ${est.posts.length}`,
            est.posts.length === 4 && posts(est, "/contrato/hedge/").length === 4],
        ], "4 POST em /contrato/hedge/; pagterceiro intocado");
      },
    },
    {
      nome: "inclusao_sessao_expirada",
      rodar: ctx => semGravarComErro(ctx, "expirado=1", "terceiros_gravar.js"),
    },
    {
      nome: "inclusao_data_errada",
      rodar: ctx => semGravarComErro(ctx, "", "terceiros_data_errada.js"),
    },
    {
      nome: "hedges_sim",
      async rodar(ctx) {
        await ctx.reset();
        const pag = await ctx.rodar("hedges_sim.js", "/hedge/passo02/");
        const est = await ctx.estado();
        const trs = [...pag.doc.querySelectorAll('button[name="button_name_remover_imp_do_hedge"]')]
          .map(b => ({ id: b.value, tr: b.closest("tr") }));
        const verde = trs.filter(t => t.tr.style.outlineColor === "rgb(40, 167, 69)").map(t => t.id).sort();
        const caixa = pag.doc.querySelector(".__prev");
        // O MANTER da simulação tem "<b>nao-existe</b>": tem de aparecer como texto, sem virar <b>
        const virouHtml = !!caixa && [...caixa.querySelectorAll("b")].some(b => b.textContent === "NAO-EXISTE");
        return conferir([
          [`esperava 0 POST, houve ${est.posts.length}`, est.posts.length === 0],
          [`IMPs no mock: ${imps(est).join(", ")}`, imps(est).length === 5],
          [`com outline verde: ${verde.join(", ")} (esperava 501, 602)`, igual(verde, ["501", "602"])],
          ["sem o aviso de teste na página", !!caixa],
          [`o aviso deveria citar o código não encontrado como texto: ${caixa && caixa.textContent}`,
            !!caixa && caixa.textContent.includes("Não encontrei: <B>NAO-EXISTE</B>")],
          ["o código digitado virou HTML no aviso", !virouHtml],
        ], "nada removido; 501 e 602 com outline verde; código não encontrado mostrado como texto");
      },
    },
    {
      nome: "hedges_exec",
      async rodar(ctx) {
        await ctx.reset();
        const pag = await ctx.rodar("hedges_exec.js", "/hedge/passo02/");
        const status = () => {
          const st = pag.doc.querySelector("#__st");
          return st ? st.textContent : "";
        };
        const fim = await ctx.esperar(() => /^(Concluído|Erro|Nenhuma|A IMP|Parado)/.test(status()), 30000);
        const est = await ctx.estado();
        return conferir([
          [`o script não terminou (status: ${status()})`, !!fim],
          [`status final: ${status()}`, status().startsWith("Concluído")],
          [`sobraram ${imps(est).join(", ")} (esperava 501, 602)`, igual(imps(est), ["501", "602"])],
          [`esperava 3 POST de remoção, houve ${posts(est, "/hedge/passo02/").length}`,
            posts(est, "/hedge/passo02/").length === 3],
        ], `sobraram só 501 e 602; ${status()}`);
      },
    },
    {
      // MANTER sem nenhuma IMP da página: a Execução aborta em vez de apagar tudo
      nome: "hedges_exec_nenhuma",
      async rodar(ctx) {
        await ctx.reset();
        const pag = await ctx.rodar("hedges_exec_nenhuma.js", "/hedge/passo02/");
        const status = () => {
          const st = pag.doc.querySelector("#__st");
          return st ? st.textContent : "";
        };
        const fim = await ctx.esperar(() => /^(Concluído|Erro|Nenhuma|A IMP|Parado)/.test(status()), 30000);
        await ctx.sleep(500);   // dá tempo de um POST tardio (se houvesse) chegar ao mock
        const est = await ctx.estado();
        return conferir([
          [`o script não terminou (status: ${status()})`, !!fim],
          [`esperava 0 POST de remoção, houve ${posts(est, "/hedge/passo02/").length} (${est.posts.length} no total)`,
            est.posts.length === 0],
          [`IMPs no mock: ${imps(est).join(", ")}`, igual(imps(est), ["501", "502", "601", "602", "603"])],
          [`status sem "Abortado": ${status()}`, status().includes("Abortado")],
        ], `0 POST; 5 IMPs intactas; ${status()}`);
      },
    },
    {
      nome: "previsoes_sim",
      async rodar(ctx) {
        await ctx.reset();
        const pag = await ctx.rodar("previsoes_sim.js", "/caixa/");
        const est = await ctx.estado();
        const trs = [...pag.doc.querySelectorAll('tbody a[href^="/caixa/delete/"]')].map(a => a.closest("tr"));
        const pintadas = trs.filter(tr => tr.style.backgroundColor === "rgb(248, 215, 218)").length;
        const aviso = pag.doc.querySelector(".__prev_previsoes");
        const textoAviso = "Simulação — 3 lançamentos seriam excluídos. Nada foi excluído.";
        const tabela = pag.logs.find(l => l.tipo === "table" && Array.isArray(l.args[0]));
        const itens = tabela ? tabela.args[0] : [];
        return conferir([
          ["não achei o console.table dos lançamentos", !!tabela],
          [`console.table com ${itens.length} itens (esperava 3): ${JSON.stringify(itens).slice(0, 200)}`,
            itens.length === 3],
          [`console.table: cada item precisa de linha e de link com /caixa/delete/: ${JSON.stringify(itens).slice(0, 200)}`,
            itens.every(i => i && typeof i.linha === "string" && i.linha.trim() !== "" &&
              typeof i.link === "string" && i.link.includes("/caixa/delete/"))],
          [`esperava 0 POST em /caixa/delete/, houve ${posts(est, "/caixa/delete/").length}`,
            posts(est, "/caixa/delete/").length === 0 && est.posts.length === 0],
          [`pintadas ${pintadas} de ${trs.length}`, trs.length === 3 && pintadas === 3],
          [`aviso: ${aviso ? aviso.textContent : "(nenhum)"}`, !!aviso && aviso.textContent === textoAviso],
          [`houve confirm: ${pag.confirms.join(" | ")}`, pag.confirms.length === 0],
          ["linhas do caixa mudaram", est.caixa.length === 3],
        ], "0 POST; 3 linhas pintadas; aviso na página; console.table com 3 linhas e links");
      },
    },
    {
      nome: "previsoes_exec",
      async rodar(ctx) {
        await ctx.reset();
        const texto = await ctx.script("previsoes_exec.js");
        const pag = await ctx.abrir("/caixa/");
        const recarga = ctx.esperarCarga(20000);   // o script chama location.reload() no fim
        await pag.win.eval(texto);
        let recarregou = true;
        try { await recarga; } catch (e) { recarregou = false; }
        const est = await ctx.estado();
        const linhas = ctx.iframe.contentDocument.querySelectorAll('tbody a[href^="/caixa/delete/"]').length;
        const exc = posts(est, "/caixa/delete/");
        return conferir([
          ["a página não recarregou", recarregou],
          [`sobraram ${est.caixa.length} linhas no mock`, est.caixa.length === 0],
          [`sobraram ${linhas} linhas na página recarregada`, linhas === 0],
          [`esperava 3 POST excluídos, houve ${JSON.stringify(exc.map(p => p.resultado))}`,
            exc.length === 3 && exc.every(p => p.resultado === "excluído")],
          [`confirm chamado ${pag.confirms.length} vez(es)`, pag.confirms.length === 1],
        ], "3 linhas excluídas; página recarregada vazia");
      },
    },
    {
      // Datas dos hedges, Simulação no Passo 01a da BR21: pinta e resume, sem clicar nem gravar
      nome: "datas_sim",
      async rodar(ctx) {
        await ctx.reset();
        const pag = await ctx.rodar("datas_sim.js", "/hedge/Passo01a?Emp_ID=4");
        await ctx.sleep(300);
        const est = await ctx.estado();
        const linhas = caixasDatas(pag.doc);
        const pintadas = linhas.filter(l => l.tr.cells[0].style.backgroundColor === "rgb(212, 237, 218)").map(l => l.id).sort();
        const texto = id => (linhas.find(l => l.id === id) || { tr: { textContent: "" } }).tr.textContent;
        const caixa = pag.doc.querySelector(".__datas_hedge");
        const tc = caixa ? caixa.textContent : "";
        const tabelas = pag.logs.filter(l => l.tipo === "table");
        return conferir([
          [`o mock não tem a lista de lotes (estado: ${Object.keys(est).join(", ")})`, Array.isArray(est.lotes)],
          [`esperava 0 lotes gravados, houve ${(est.lotes || []).length}`, (est.lotes || []).length === 0],
          [`linhas pintadas: ${pintadas.join(", ")} (esperava 9101 a 9104)`, igual(pintadas, ["9101", "9102", "9103", "9104"])],
          ["a data do grupo não foi escrita nas linhas", texto("9101").includes("01/12/2026") &&
            texto("9104").includes("08/12/2026") && !texto("9107").includes("01/12/2026")],
          ["alguma caixa ficou marcada na simulação", linhas.every(l => !l.cx.checked) &&
            (pag.doc.getElementById("wImpsAtualizar") || {}).value === ""],
          [`quadro: ${tc}`, tc.includes("01/12/2026: 2 IMP(s) — USD 10.000,00; EUR 2.500,50") &&
            tc.includes("08/12/2026: 2 IMP(s) — USD 8.234,56")],
          [`esperava 2 console.table, houve ${tabelas.length}`, tabelas.length === 2],
          ["alguma data mudou no mock", datasMock(est, "Passo01a|4").every(([, d]) => d === "01/10/2026")],
          [`erros no console: ${JSON.stringify(erros(pag))}`, erros(pag).length === 0],
        ], "0 lotes; 9101–9104 pintadas com a data; quadro com os 2 grupos e totais por moeda");
      },
    },
    {
      // Execução no Passo 01b da BR22, com a caixa da 9106 já marcada (fora do plano), nos
      // dois comportamentos da página: a IMP gravada continua na lista (some=0) ou sai (some=1).
      // Também com caixas do grupo já marcadas ao carregar: a página não as põe na lista interna
      // (#wImpsAtualizar) até um clique, e o lote tem de levar exatamente o grupo.
      nome: "datas_exec",
      async rodar(ctx) {
        const checks = [];
        const resumo = [];
        for (const modo of ["some=0&premarcada=9106", "some=1&premarcada=9106", "some=0&premarcada=9101",
                            "some=0&premarcada=9101,9102"]) {
          await ctx.reset(modo);
          const pag = await ctx.rodar("datas_exec.js", "/hedge/Passo01b?Emp_ID=6");
          const status = () => { const st = pag.doc.querySelector("#__st"); return st ? st.textContent : ""; };
          const fim = await ctx.esperar(() => /^(Concluído|Erro|Parado)/.test(status()), 40000);
          await ctx.sleep(300);
          const est = await ctx.estado();
          const lotes = (est.lotes || []).map(l => `${l.passo}|${l.emp}|${l.data}|${[...l.imps].sort().join(",")}`);
          const datas = Object.fromEntries(datasMock(est, "Passo01b|6"));
          checks.push(
            [`${modo}: o script não terminou (status: ${status()})`, !!fim],
            [`${modo}: status final: ${status()}`, status().startsWith("Concluído: 2 grupos, 4 IMPs.")],
            [`${modo}: lotes: ${lotes.join(" / ")}`, igual(lotes, [
              "Passo01b|6|2026-12-01|9101,9102", "Passo01b|6|2026-12-08|9103,9104"])],
            [`${modo}: datas no mock: ${JSON.stringify(datas)}`, igual(datas, {
              "9101": "01/12/2026", "9102": "01/12/2026", "9103": "08/12/2026", "9104": "08/12/2026",
              "9105": "01/10/2026", "9106": "01/10/2026", "9107": "01/10/2026" })],
            [`${modo}: outra página/empresa mudou`, ["Passo01a|6", "Passo01b|3", "Passo01b|4"]
              .every(k => datasMock(est, k).every(([, d]) => d === "01/10/2026"))],
          );
          resumo.push(`${modo}: ${status()}`);
        }
        return conferir(checks, "2 lotes com exatamente cada grupo; 9106 pré-marcada e 9107 parecida não gravadas; " +
          "grupo pré-marcado sem a lista interna corrigido; " + resumo.join(" | "));
      },
    },
    {
      // Depois do clique, a página recarregada não prova a gravação: lista vazia (todas as IMPs,
      // inclusive as de fora do grupo, sumiram) ou outra página. Para no 1º grupo sem dar como gravado.
      nome: "datas_exec_sem_prova",
      async rodar(ctx) {
        const checks = [];
        const resumo = [];
        for (const modo of ["apos_lote=vazia", "apos_lote=outra"]) {
          await ctx.reset(modo);
          const pag = await ctx.rodar("datas_exec.js", "/hedge/Passo01b?Emp_ID=6");
          const status = () => { const st = pag.doc.querySelector("#__st"); return st ? st.textContent : ""; };
          const fim = await ctx.esperar(() => /^(Concluído|Erro|Parado|Interrompido)/.test(status()), 30000);
          const est = await ctx.estado();
          checks.push(
            [`${modo}: o script não terminou (status: ${status()})`, !!fim],
            [`${modo}: status deveria dizer que nada foi confirmado: ${status()}`,
              status().startsWith("Erro") && status().includes("01/12/2026") &&
              status().includes("Nada foi confirmado para este grupo") && status().includes("Nenhum grupo foi gravado.")],
            [`${modo}: esperava 1 lote (só o 1º grupo), houve ${(est.lotes || []).length}`, (est.lotes || []).length === 1],
          );
          resumo.push(`${modo}: ${status().slice(0, 90)}…`);
        }
        return conferir(checks, resumo.join(" | "));
      },
    },
    {
      // A página recarrega depois do clique mas não gravou (as IMPs continuam com a data antiga):
      // para no 1º grupo, diz que as IMPs não mostram a nova data e que nenhum grupo foi gravado
      nome: "datas_exec_nao_gravou",
      async rodar(ctx) {
        await ctx.reset("apos_lote=ignora");
        const pag = await ctx.rodar("datas_exec.js", "/hedge/Passo01b?Emp_ID=6");
        const status = () => { const st = pag.doc.querySelector("#__st"); return st ? st.textContent : ""; };
        const fim = await ctx.esperar(() => /^(Concluído|Erro|Parado|Interrompido)/.test(status()), 30000);
        const est = await ctx.estado();
        const lotes = est.lotes || [];
        return conferir([
          [`o script não terminou (status: ${status()})`, !!fim],
          [`esperava 1 lote ignorado (só o 1º grupo), houve: ${JSON.stringify(lotes)}`,
            lotes.length === 1 && lotes[0].resultado === "ignorado" && lotes[0].data === "2026-12-01"],
          [`status deveria parar no grupo 01/12/2026: ${status()}`, status().startsWith("Erro") && status().includes("01/12/2026") &&
            !status().includes("08/12/2026")],
          [`status sem "não mostram a nova data": ${status()}`,
            status().includes("não mostram a nova data: DEMO-1001/26-WEB-1, DEMO-1002/26-WEB-1")],
          [`status sem "Nenhum grupo foi gravado.": ${status()}`, status().includes("Nenhum grupo foi gravado.")],
          ["alguma data mudou no mock", datasMock(est, "Passo01b|6").every(([, d]) => d === "01/10/2026")],
        ], status().slice(0, 140));
      },
    },
    {
      // Fechar no meio de um grupo: o status diz que foi interrompido pelo usuário, não tempo esgotado
      nome: "datas_exec_fechar",
      async rodar(ctx) {
        await ctx.reset();
        const pag = await ctx.rodar("datas_exec.js", "/hedge/Passo01b?Emp_ID=6");
        const status = () => { const st = pag.doc.querySelector("#__st"); return st ? st.textContent : ""; };
        const gravando = await ctx.esperar(() => status().startsWith("gravando grupo 1"), 15000, 20);
        const fechar = pag.doc.querySelector("#__close");
        if (fechar) fechar.click();
        const textos = () => pag.logs.map(l => l.args.join(" "));
        const fim = await ctx.esperar(() => textos().some(t => t.includes("Interrompido pelo usuário")), 15000);
        await ctx.sleep(300);
        const est = await ctx.estado();
        return conferir([
          [`não vi o status "gravando grupo 1" (status: ${status()})`, !!gravando],
          ["o quadro não foi fechado", !pag.doc.querySelector("#__fr")],
          [`o log não diz "Interrompido pelo usuário": ${JSON.stringify(textos().slice(-3))}`, !!fim],
          ["o log fala em tempo esgotado", !textos().some(t => /a tempo/.test(t))],
          [`esperava no máximo 1 lote, houve ${(est.lotes || []).length}`, (est.lotes || []).length <= 1],
        ], `fechado no grupo 1: ${(textos().find(t => t.includes("Interrompido")) || "").replace(/^\S+\s+\S+\s+/, "").slice(0, 100)}`);
      },
    },
    {
      // Parar durante o grupo 1: termina o grupo e para antes do 2º ("Parado pelo usuário", só o 1º gravado).
      // Parar e depois um erro de verdade (a página demora mais que o tempo limite): o status mostra o erro
      // real, com o aviso de conferir na página, e não "Interrompido pelo usuário".
      nome: "datas_exec_parar",
      async rodar(ctx) {
        const checks = [];
        const resumo = [];
        for (const [modo, script] of [["", "datas_exec.js"], ["apos_lote=demora", "datas_exec_curto.js"]]) {
          await ctx.reset(modo);
          const pag = await ctx.rodar(script, "/hedge/Passo01b?Emp_ID=6");
          const status = () => { const st = pag.doc.querySelector("#__st"); return st ? st.textContent : ""; };
          const gravando = await ctx.esperar(() => status().startsWith("gravando grupo 1"), 15000, 20);
          const parar = pag.doc.querySelector("#__stop");
          if (parar) parar.click();
          const fim = await ctx.esperar(() => /^(Concluído|Erro|Parado|Interrompido)/.test(status()), 30000);
          if (modo) await ctx.sleep(3500);
          const est = await ctx.estado();
          const lotes = (est.lotes || []).map(l => `${l.data}|${[...l.imps].sort().join(",")}`);
          const datas = Object.fromEntries(datasMock(est, "Passo01b|6"));
          const rotulo = modo || "normal";
          checks.push(
            [`${rotulo}: não vi o status "gravando grupo 1" (status: ${status()})`, !!gravando],
            [`${rotulo}: o script não terminou (status: ${status()})`, !!fim],
            [`${rotulo}: lotes: ${lotes.join(" / ")} (esperava só o 1º grupo)`, igual(lotes, ["2026-12-01|9101,9102"])],
            [`${rotulo}: datas no mock: ${JSON.stringify(datas)}`, datas["9101"] === "01/12/2026" &&
              datas["9102"] === "01/12/2026" && datas["9103"] === "01/10/2026" && datas["9104"] === "01/10/2026"],
          );
          if (!modo) {
            checks.push([`normal: status deveria ser "Parado pelo usuário" com só o 1º grupo: ${status()}`,
              status().startsWith("Parado pelo usuário") && status().includes("Já gravados: 01/12/2026 (2 IMPs).") &&
              !status().includes("08/12/2026")]);
          } else {
            checks.push([`${modo}: status deveria mostrar o erro real e "confira na página": ${status()}`,
              status().startsWith("Erro: a página não recarregou a tempo") && status().includes("confira na página") &&
              !status().includes("Interrompido")]);
          }
          resumo.push(`${rotulo}: ${status().slice(0, 110)}`);
        }
        return conferir(checks, resumo.join(" | "));
      },
    },
    {
      // Código fora da página, data fora de "Data Pagto" ou código em dois grupos: nada é marcado nem gravado
      nome: "datas_faltando",
      async rodar(ctx) {
        const checks = [];
        for (const [script, falta] of [["datas_falta_codigo.js", "NAO-EXISTE-77"], ["datas_falta_data.js", "31/12/2026"],
                                       ["datas_dois_grupos.js", "mais de um grupo de data: DEMO-1001/26-WEB-1"]]) {
          await ctx.reset();
          const pag = await ctx.rodar(script, "/hedge/Passo01b?Emp_ID=6");
          await ctx.sleep(500);
          const est = await ctx.estado();
          const e = erros(pag);
          checks.push(
            [`${script}: o mock não tem a lista de lotes`, Array.isArray(est.lotes)],
            [`${script}: esperava 0 lotes, houve ${(est.lotes || []).length}`, (est.lotes || []).length === 0],
            [`${script}: console.error sem "Nada foi gravado" e ${falta}: ${JSON.stringify(e)}`,
              e.some(m => m.includes("Nada foi gravado") && m.includes(falta))],
            [`${script}: abriu o quadro de execução`, !pag.doc.querySelector("#__fr")],
            [`${script}: marcou alguma caixa`, caixasDatas(pag.doc).length > 0 && caixasDatas(pag.doc).every(l => !l.cx.checked)],
          );
        }
        // Simulação com algo faltando (no plano ou na estrutura da página): mostra o resumo por grupo
        // E a lista do que faltou, no quadro e no console; nada é clicado nem gravado.
        for (const [script, reset, falta, grupo1] of [
          ["datas_sim_falta_codigo.js", "", "Códigos que não estão na página: NAO-EXISTE-77", "08/12/2026: 1 IMP(s) — USD 7.000,00 (1 não encontrada(s))"],
          ["datas_sim_falta_data.js", "", "31/12/2026", "31/12/2026: 1 IMP(s) — USD 7.000,00"],
          ["datas_sim_dois_grupos.js", "", "mais de um grupo de data: DEMO-1001/26-WEB-1", "08/12/2026: 2 IMP(s) — USD 17.000,00"],
          ["datas_sim_br22.js", "falta=botao_lote", "#data_prev_pag_lote_botao", "08/12/2026: 2 IMP(s) — USD 8.234,56"],
          ["datas_sim_br22.js", "falta=imps_atualizar", "#wImpsAtualizar", "08/12/2026: 2 IMP(s) — USD 8.234,56"],
          ["datas_sim_br22.js", "falta=data_id:9103", "Caixas sem o IMP_ID (data-id com wImpID): DEMO-1003/26-WEB-2",
            "08/12/2026: 2 IMP(s) — USD 8.234,56"],
        ]) {
          const rotulo = `${script}${reset ? " (" + reset + ")" : ""}`;
          await ctx.reset(reset);
          const pag = await ctx.rodar(script, "/hedge/Passo01b?Emp_ID=6");
          await ctx.sleep(500);
          const est = await ctx.estado();
          const e = erros(pag);
          const caixa = pag.doc.querySelector(".__datas_hedge");
          const tc = caixa ? caixa.textContent : "";
          const lista = pag.doc.getElementById("wImpsAtualizar");
          checks.push(
            [`${rotulo}: esperava 0 lotes, houve ${(est.lotes || []).length}`, (est.lotes || []).length === 0],
            [`${rotulo}: quadro sem o resumo "01/12/2026: 2 IMP(s)" e "${grupo1}" e sem "${falta}": ${tc}`,
              tc.includes("01/12/2026: 2 IMP(s) — USD 10.000,00; EUR 2.500,50") && tc.includes(grupo1) && tc.includes(falta) &&
              tc.includes("Nada foi marcado nem gravado")],
            [`${rotulo}: console.error sem o resumo e "${falta}": ${JSON.stringify(e)}`,
              e.some(m => m.includes("01/12/2026: 2 IMP(s)") && m.includes(grupo1) && m.includes(falta))],
            [`${rotulo}: esperava 2 console.table`, pag.logs.filter(l => l.tipo === "table").length === 2],
            [`${rotulo}: abriu o quadro de execução`, !pag.doc.querySelector("#__fr")],
            [`${rotulo}: marcou alguma caixa`, caixasDatas(pag.doc).length > 0 && caixasDatas(pag.doc).every(l => !l.cx.checked) &&
              (!lista || lista.value === "")],
          );
        }
        return conferir(checks, "Execução: código inexistente, data fora da lista e código em dois grupos: 0 lotes, mensagem com o que falta; " +
          "Simulação (essas três e botão de lote, #wImpsAtualizar e data-id ausentes): resumo por grupo + o que falta, 0 cliques");
      },
    },
    {
      // Script de NOVOS colado no Passo 01b; script da BR21 na página da BR02
      nome: "datas_pagina_errada",
      async rodar(ctx) {
        const checks = [];
        for (const [script, url, certa] of [
          ["datas_novos_br22.js", "/hedge/Passo01b?Emp_ID=6", "/hedge/Passo01a?Emp_ID=6"],
          ["datas_expirados_br21.js", "/hedge/Passo01b?Emp_ID=3", "/hedge/Passo01b?Emp_ID=4"],
        ]) {
          await ctx.reset();
          const pag = await ctx.rodar(script, url);
          await ctx.sleep(500);
          const est = await ctx.estado();
          const e = erros(pag);
          checks.push(
            [`${script}: o mock não tem a lista de lotes`, Array.isArray(est.lotes)],
            [`${script}: esperava 0 lotes, houve ${(est.lotes || []).length}`, (est.lotes || []).length === 0],
            [`${script}: a página do mock não tem a tabela`, caixasDatas(pag.doc).length > 0],
            [`${script}: console.error sem ${certa} e "Nada foi feito": ${JSON.stringify(e)}`,
              e.some(m => m.includes(certa) && m.includes("Nada foi feito"))],
            [`${script}: abriu o quadro de execução`, !pag.doc.querySelector("#__fr")],
          );
        }
        return conferir(checks, "passo errado e empresa errada: 0 lotes, mensagem com a página certa");
      },
    },
    {
      nome: "painel_carrega",
      async rodar(ctx) {
        const pag = await ctx.abrir("/painel/painel.html");
        const w = pag.win, d = pag.doc;
        const cartoes = ["inclusao", "hedges", "previsoes", "datas-hedge"]
          .map(id => d.querySelector(`.cartao[data-tela="${id}"]`));
        const pdfOk = typeof w.pdfjsLib === "object" && typeof w.pdfjsLib.getDocument === "function";
        if (cartoes[2]) cartoes[2].click();
        const tela = d.getElementById("tela-previsoes");
        const visivel = !!tela && !tela.hidden && tela.offsetParent !== null;
        const pre = tela && tela.querySelector("pre");
        const sim = tela && tela.querySelector('input[type="radio"][value="simulacao"]');
        const exe = tela && tela.querySelector('input[type="radio"][value="execucao"]');
        const voltar = tela && [...tela.querySelectorAll("button")].some(b => b.textContent.includes("← Voltar"));
        const preInicial = !!pre && pre.textContent.includes("const DRY_RUN = true;");
        const simInicial = !!sim && sim.checked, exeInicial = !!exe && exe.disabled;
        // Libera a Execução (Baixar a Simulação), passa para Execução, sai e reabre a tela
        w.HTMLAnchorElement.prototype.click = function () {};
        const qPrev = s => tela && tela.querySelector(s);
        const bBaixar = tela && [...tela.querySelectorAll(".acoes button")].find(b => b.textContent === "Baixar .js");
        if (bBaixar) bBaixar.click();
        const exeAntes = qPrev('input[type="radio"][value="execucao"]');
        const liberou = !!exeAntes && !exeAntes.disabled;
        if (exeAntes) exeAntes.click();
        const foiExe = !!qPrev("pre") && qPrev("pre").textContent.includes("const DRY_RUN = false;");
        w.Painel.mostrarTela("inicial");
        w.Painel.mostrarTela("previsoes");
        const simDepois = qPrev('input[type="radio"][value="simulacao"]');
        const exeDepois = qPrev('input[type="radio"][value="execucao"]');
        const preDepois = qPrev("pre");
        // Orientações de uso na interface: cada tela tem "Como usar" e o script não tem comentários
        const comoUsar = ["inclusao", "hedges", "previsoes", "datas-hedge"].map(id => {
          const t = d.getElementById(`tela-${id}`);
          const itens = t ? t.querySelectorAll(".como-usar li").length : 0;
          return `${id}=${itens}`;
        });
        const comoOk = comoUsar.every(s => Number(s.split("=")[1]) >= 4);
        // "Como usar" fica na coluna da esquerda (não na coluna do script, que acompanha a rolagem)
        // e a coluna do script nunca passa da altura da tela: o que não couber rola dentro dela.
        const comoNaEsquerda = ["inclusao", "hedges", "previsoes", "datas-hedge"].every(id => {
          const t = d.getElementById(`tela-${id}`);
          return !!t && !!t.querySelector(".coluna-esquerda .como-usar") && !t.querySelector(".coluna-direita .como-usar");
        });
        const dir = tela && tela.querySelector(".coluna-direita");
        const estiloDir = dir && w.getComputedStyle(dir);
        const largo = w.innerWidth > 900;
        const colunaCabe = !largo || (!!estiloDir && estiloDir.overflowY === "auto" && estiloDir.maxHeight !== "none");
        const scriptLimpo = !!preDepois && !/\/\/|\/\*/.test(preDepois.textContent);
        return conferir([
          [`"Como usar" com pelo menos 4 passos em cada tela (${comoUsar.join(", ")})`, comoOk],
          ['"Como usar" deveria ficar na coluna da esquerda', comoNaEsquerda],
          [`a coluna do script deveria ter altura máxima e rolagem própria (largura ${w.innerWidth})`, colunaCabe],
          ["o script mostrado no painel não deveria ter comentários", scriptLimpo],
          ["pdfjsLib.getDocument não é função", pdfOk],
          [`cartões: ${cartoes.map(c => !!c).join(", ")}`, cartoes.every(Boolean)],
          ["a tela de previsões não apareceu", visivel],
          ["o script não está em Simulação (DRY_RUN = true)", preInicial],
          ["Simulação não está marcada", simInicial],
          ["Execução não está desabilitada", exeInicial],
          ["sem botão ← Voltar", voltar],
          ["Baixar a Simulação deveria liberar a Execução", liberou],
          ["o script deveria ir para Execução", foiExe],
          ["ao reabrir previsões o modo deveria voltar a Simulação", !!simDepois && simDepois.checked &&
            !!preDepois && preDepois.textContent.includes("const DRY_RUN = true;")],
          ["ao reabrir previsões a Execução deveria estar travada", !!exeDepois && exeDepois.disabled && !exeDepois.checked],
          [`erros no console: ${JSON.stringify(erros(pag))}`, erros(pag).length === 0],
        ], "pdf.js carregado; 4 cartões; \"Como usar\" em cada tela; script sem comentários; previsões em Simulação com Execução bloqueada; reabrir volta a Simulação e trava");
      },
    },
    {
      nome: "extracao_pdfs",
      async rodar(ctx) {
        const pag = await ctx.abrir("/painel/painel.html");
        const w = pag.win;
        const re = await fetch("/tests/saida/pdfs/esperado.json", { cache: "no-store" });
        if (!re.ok) {
          return { ok: false, detalhe: `esperado.json não encontrado (HTTP ${re.status}): rode node tests/gerar_scripts_teste.js` };
        }
        const esperado = await re.json();
        const nomes = Object.keys(esperado);
        const difs = [];
        for (const nome of nomes) {
          const r = await w.fetch("/__mock/pdf/" + encodeURIComponent(nome), { cache: "no-store" });
          if (!r.ok) { difs.push(`${nome}: HTTP ${r.status}`); continue; }
          const blob = await r.blob();
          const texto = await w.Painel.extrairTextoPdf(blob);
          const obtido = w.Painel.extrairDados(texto);
          for (const campo of Object.keys(esperado[nome])) {
            if (obtido[campo] !== esperado[nome][campo]) {
              difs.push(`${nome} ${campo}: ${JSON.stringify(obtido[campo])} ≠ ${JSON.stringify(esperado[nome][campo])}`);
            }
          }
        }
        return conferir([
          ["esperado.json vazio", nomes.length > 0],
          [difs.join("; "), difs.length === 0],
        ], `${nomes.length} PDFs extraídos no navegador iguais ao esperado`);
      },
    },
    {
      // Trava da Execução numa coluna montada no próprio painel, com dados que mudam.
      // Baixar é interceptado (sem download de verdade no headless): guarda nome e conteúdo.
      nome: "coluna_trava",
      async rodar(ctx) {
        const pag = await ctx.abrir("/painel/painel.html");
        const w = pag.win, d = pag.doc, P = w.Painel;
        const baixados = [];
        w.HTMLAnchorElement.prototype.click = function () {
          if (this.download) baixados.push({ nome: this.download, href: this.href });
        };
        let dados = { v: 1 };
        const el = d.createElement("div");
        d.body.appendChild(el);
        const col = P.criarColunaScript(el, {
          gerar: ({ dryRun }) => ({ script: P.montarPrevisoes({ dryRun }) }),
          dados: () => dados,
          nomeArquivo: "teste.js",
          ondeColar: "teste",
        });
        const q = s => el.querySelector(s);
        const exe = q('input[value="execucao"]'), sim = q('input[value="simulacao"]');
        const bBaixar = [...el.querySelectorAll(".acoes button")].find(b => b.textContent === "Baixar .js");
        const aviso = q(".aviso");
        const conteudo = async i => (await (await w.fetch(baixados[i].href)).text());
        const MSG = "Algo mudou desde a simulação: simule de novo antes de executar.";
        const passos = [];

        passos.push(["Execução deveria começar desabilitada", exe.disabled]);
        // Os dados mudam sem atualizar(): baixar registra a simulação do script mostrado (v:1)
        dados = { v: 2 };
        bBaixar.click();
        col.atualizar();
        passos.push(["baixar com dados velhos na tela não pode liberar os dados novos", exe.disabled]);
        // Simulação com os dados atuais
        bBaixar.click();
        const sim1 = await conteudo(1);
        passos.push([`Execução deveria ficar habilitada após Baixar (baixados: ${baixados.map(b => b.nome)})`, !exe.disabled]);
        passos.push([`nome do arquivo de simulação: ${baixados[1] && baixados[1].nome}`,
          !!baixados[1] && baixados[1].nome === "teste_simulacao.js"]);
        passos.push(["o arquivo baixado em Simulação não tem DRY_RUN = true", sim1.includes("const DRY_RUN = true;")]);
        exe.click();
        passos.push(["o script em Execução não tem DRY_RUN = false",
          exe.checked && q("pre").textContent.includes("const DRY_RUN = false;")]);
        // Em Execução, Baixar não registra nada: mudar os dados depois disso tem de travar
        dados = { v: 3 };
        bBaixar.click();
        const exe1 = await conteudo(2);
        passos.push([`nome do arquivo de execução: ${baixados[2] && baixados[2].nome}`,
          !!baixados[2] && baixados[2].nome === "teste_execucao.js" && exe1.includes("const DRY_RUN = false;")]);
        col.atualizar();
        passos.push(["Execução deveria estar desabilitada depois da mudança", exe.disabled]);
        passos.push(["o modo deveria voltar para Simulação", sim.checked && !exe.checked &&
          q("pre").textContent.includes("const DRY_RUN = true;")]);
        passos.push([`aviso: ${aviso.hidden ? "(oculto)" : aviso.textContent}`,
          !aviso.hidden && aviso.textContent === MSG]);
        el.remove();
        return conferir(passos, "Baixar libera; Execução gera DRY_RUN = false; mudança trava e volta à Simulação");
      },
    },
    {
      // Tela de inclusão de ponta a ponta com os 7 PDFs sintéticos (6 completos, 1 incompleto)
      nome: "inclusao_ui",
      async rodar(ctx) {
        const t = await abrirInclusao(ctx);
        if (!t.ok) return { ok: false, detalhe: "a tela de inclusão não tem os campos (empresa, tipo, data, pasta, progresso, contador)" };
        const esperado = await (await fetch("/tests/saida/pdfs/esperado.json", { cache: "no-store" })).json();
        const nomes = Object.keys(esperado);
        const completos = nomes.filter(n => n.indexOf("incompleto") < 0);
        const p = [];
        p.push(["algum tipo de contrato começou marcado", t.tipos.every(r => !r.checked)]);
        p.push([`a data começou preenchida: ${t.data.value}`, t.data.value === ""]);
        p.push([`empresa começou com ${t.empresa.value}`, t.empresa.value === "" &&
          [...t.empresa.options].map(o => o.value).join(",") === ",BR02,BR21,BR22"]);

        escolherPasta(t, await Promise.all(nomes.map(n => arquivoPdf(t, n))));
        const fim = await leituraConcluida(ctx, t);
        p.push([`a leitura não terminou (progresso: ${t.progresso.textContent})`, !!fim]);
        const linhas = t.linhas();
        p.push([`esperava ${nomes.length} linhas, veio ${linhas.length}`, linhas.length === nomes.length]);
        // Ordem por code point, igual ao sorted() do Python ("_777…" fica depois dos dígitos;
        // no localeCompare ficaria antes)
        const ordem = linhas.map(tr => tr.querySelector(".arquivo").textContent);
        const ordemCodePoint = [...nomes].sort();
        const ordemLocale = [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR"));
        p.push(["a fixture deveria ter nomes em que as duas ordens diferem", !igual(ordemCodePoint, ordemLocale)]);
        p.push([`ordem das linhas: ${ordem.join(" | ")}`, igual(ordem, ordemCodePoint)]);
        const linhaDe = num => linhas.find(tr => t.celula(tr, "num_contrato") && t.celula(tr, "num_contrato").value === num);
        const inc = linhaDe("777777777");
        p.push(["a linha incompleta deveria estar marcada, com ⚠ incompleto",
          !!inc && t.incluir(inc).checked && !t.incluir(inc).disabled && t.statusDe(inc).includes("⚠ incompleto")]);
        p.push(["as linhas completas não estão marcadas com ✔ ok", linhas.filter(tr => tr !== inc)
          .every(tr => t.incluir(tr).checked && t.statusDe(tr).includes("✔ ok"))]);
        p.push([`contador: ${t.contador.textContent}`, t.contador.textContent === "7 lidos · 6 no script · 1 de fora"]);

        t.escolher(t.empresa, "BR21");
        t.digitar(t.data, "2026-11-12");
        const faltas = t.faltas();
        p.push([`sem o tipo, as faltas deveriam citar "tipo de contrato": ${faltas && faltas.textContent}`,
          !!faltas && !faltas.hidden && /tipo de contrato/i.test(faltas.textContent) && t.pre().hidden]);
        t.tipos.find(r => r.value === "HEDGE").click();
        let s = t.pre().textContent;
        p.push(["o script não tem EMP_ID 4", !t.pre().hidden && /const EMP_ID\s*= "4";/.test(s)]);
        p.push(["o script não tem TIPO hedge / data", s.includes('"hedge"') && s.includes('"2026-11-12"')]);
        p.push([`o script deveria ter os 6 completos (tem ${nContratos(s)})`,
          nContratos(s) === 6 && completos.every(n => s.includes(`"${esperado[n].num_contrato}"`)) &&
          !s.includes('"777777777"')]);
        p.push(["o script não leva o nome do arquivo", s.includes(JSON.stringify(completos[0]))]);

        // Valor fora do formato brasileiro: célula vermelha, motivo no title, contrato fora
        const l1 = linhaDe("111111111");
        const v1 = t.celula(l1, "valor");
        t.digitar(v1, "1234.56");
        s = t.pre().textContent;
        p.push(["1234.56 deveria deixar a célula inválida com motivo no title",
          v1.classList.contains("invalida") && v1.title.trim() !== ""]);
        p.push(["com 1234.56 o contrato 111111111 deveria sair do script", !s.includes('"111111111"') && nContratos(s) === 5]);
        p.push([`contador após 1234.56: ${t.contador.textContent}`, t.contador.textContent === "7 lidos · 5 no script · 2 de fora"]);
        t.digitar(v1, "1234,56");
        s = t.pre().textContent;
        p.push(["1234,56 deveria valer e entrar no script",
          !v1.classList.contains("invalida") && s.includes('"valor": "1234,56"') && nContratos(s) === 6]);
        const m1 = t.celula(l1, "moeda");
        t.digitar(m1, "usd");
        p.push([`moeda digitada em minúsculas: ${m1.value}`, m1.value === "USD" && t.pre().textContent.includes('"moeda": "USD"')]);
        const n1 = t.celula(l1, "num_contrato");
        t.digitar(n1, "1111a");
        p.push(["contrato com letra deveria ficar inválido e sair", n1.classList.contains("invalida") &&
          nContratos(t.pre().textContent) === 5]);
        t.digitar(n1, "111111111");

        // Completar a incompleta: já marcada, entra no script sem outro clique
        t.digitar(t.celula(inc, "fornecedor"), "ETA <b>SA</b>");
        s = t.pre().textContent;
        p.push([`após completar: ${nContratos(s)} contratos, contador ${t.contador.textContent}`,
          t.incluir(inc).checked && t.statusDe(inc).includes("✔ ok") && nContratos(s) === 7 &&
          s.includes('"777777777"') && t.contador.textContent === "7 lidos · 7 no script · 0 de fora"]);
        p.push(["o texto do fornecedor virou HTML", !t.tela.querySelector(".lista-pdfs b") &&
          s.includes('"ETA <b>SA</b>"')]);
        // Desmarcar uma linha completa: fica de fora
        t.incluir(inc).click();
        s = t.pre().textContent;
        p.push([`completa desmarcada: ${nContratos(s)} contratos, contador ${t.contador.textContent}`,
          nContratos(s) === 6 && !s.includes('"777777777"') && t.contador.textContent === "7 lidos · 6 no script · 1 de fora"]);
        t.incluir(inc).click();
        s = t.pre().textContent;
        p.push(["marcar de novo deveria devolver a linha ao script", nContratos(s) === 7 && s.includes('"777777777"')]);

        // 375 px: a página não pode rolar na horizontal (a tabela rola no próprio contêiner)
        const larguraAntes = ctx.iframe.style.width;
        ctx.iframe.style.width = "375px";
        await ctx.sleep(150);
        const sw = t.d.documentElement.scrollWidth, cw = t.d.documentElement.clientWidth;
        ctx.iframe.style.width = larguraAntes;
        p.push([`a 375 px a página rola na horizontal (scrollWidth ${sw} > ${cw})`, sw <= cw]);
        p.push([`erros no console: ${JSON.stringify(erros(t.pag))}`, erros(t.pag).length === 0]);
        return conferir(p, "tipo começa vazio; 7 linhas em ordem de code point; script com EMP_ID 4 e os completos; 1234.56 rejeitado; completar inclui sem clique; desmarcada fica de fora; 375 px sem rolagem");
      },
    },
    {
      // Pasta com PDF bom, .PDF, .txt, PDF em subpasta e PDF corrompido; e troca de pasta no meio da leitura
      nome: "pasta_mista",
      async rodar(ctx) {
        const t = await abrirInclusao(ctx);
        if (!t.ok) return { ok: false, detalhe: "a tela de inclusão não tem os campos" };
        const esperado = await (await fetch("/tests/saida/pdfs/esperado.json", { cache: "no-store" })).json();
        const todos = await Promise.all(Object.keys(esperado).map(n => arquivoPdf(t, n)));
        const bytes = new Uint8Array(4096);
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
        const mista = [
          await arquivoPdf(t, PDF_BONS[0]),
          await arquivoPdf(t, PDF_BONS[1]),
          { nome: "notas.txt", caminho: "pasta/notas.txt", conteudo: new t.w.Blob(["não é PDF"]), tipo: "text/plain" },
          Object.assign(await arquivoPdf(t, "333333333 - Contratação.pdf"),
            { caminho: "pasta/sub/333333333 - Contratação.pdf" }),
          { nome: "corrompido.pdf", caminho: "pasta/corrompido.pdf", conteudo: new t.w.Blob([bytes]) },
        ];
        // Primeiro a pasta com os 7; sem esperar, a mista: o resultado da 1ª leitura tem de ser descartado
        escolherPasta(t, todos);
        await ctx.sleep(0);
        escolherPasta(t, mista);
        const fim = await leituraConcluida(ctx, t);
        await ctx.sleep(500);   // dá tempo de a leitura antiga (se não fosse descartada) aparecer
        t.escolher(t.empresa, "BR02");
        t.digitar(t.data, "2026-11-12");
        t.tipos.find(r => r.value === "TERCEIROS").click();
        const linhas = t.linhas();
        const st = linhas.map(t.statusDe);
        const s = t.pre().textContent;
        const trErro = linhas.find(tr => t.statusDe(tr).startsWith("Erro"));
        const tdErro = trErro && trErro.querySelector(".status-pdf");
        const statusErro = tdErro ? tdErro.textContent : "", titleErro = tdErro ? tdErro.title : "";
        const contadorAntes = t.contador.textContent;
        const camposErro = trErro ? ["num_contrato", "moeda", "valor", "fornecedor"].map(c => t.celula(trErro, c)) : [];
        const caixaErro = trErro && t.incluir(trErro);
        const caixaOk = !!caixaErro && caixaErro.checked && !caixaErro.disabled;
        // Preencher à mão a linha do PDF corrompido: incompleta mantém o erro; completa entra no script
        let parcial = "", tituloParcial = "";
        if (camposErro.every(Boolean) && camposErro.length === 4) {
          t.digitar(camposErro[0], "888888888");
          parcial = t.statusDe(trErro); tituloParcial = tdErro.title;
          t.digitar(camposErro[1], "USD");
          t.digitar(camposErro[2], "1.234,56");
          t.digitar(camposErro[3], "OMEGA CORRIGIDO LTDA");
        }
        const s2 = t.pre().textContent;
        const contadorCorrigido = t.contador.textContent;
        const statusCorrigido = trErro ? t.statusDe(trErro) : "";
        // Diálogo cancelado: change com a lista de arquivos vazia não mexe na lista
        t.pasta.files = new t.w.DataTransfer().files;
        t.pasta.dispatchEvent(new t.w.Event("change", { bubbles: true }));
        await ctx.sleep(200);
        const depoisCancelar = t.linhas().length;
        return conferir([
          [`a leitura não terminou (progresso: ${t.progresso.textContent})`, !!fim],
          [`esperava 3 linhas, veio ${linhas.length} (${st.join(" | ")})`, linhas.length === 3],
          [`status: ${st.join(" | ")}`, st.filter(x => x.includes("✔ ok")).length === 2 &&
            st.filter(x => x.startsWith("Erro")).length === 1],
          [`status do PDF corrompido: ${statusErro}`,
            statusErro === "Erro: não consegui ler o PDF (arquivo inválido ou corrompido)."],
          [`o detalhe do pdf.js deveria ficar no title: ${titleErro}`,
            titleErro.trim() !== "" && titleErro !== statusErro],
          ["a linha com erro deveria ter os 4 campos editáveis", camposErro.length === 4 && camposErro.every(Boolean)],
          ["a linha com erro deveria ter \"incluir\" marcado e habilitado", caixaOk],
          [`o script deveria ter 2 contratos, tem ${nContratos(s)}`, !t.pre().hidden && nContratos(s) === 2 &&
            s.includes('"111111111"') && s.includes('"222222222"') && !s.includes('"333333333"')],
          [`contador: ${contadorAntes}`, contadorAntes === "3 lidos · 2 no script · 1 de fora"],
          [`preenchida em parte, a linha deveria manter o erro e o title: ${parcial} / ${tituloParcial}`,
            parcial === "Erro: não consegui ler o PDF (arquivo inválido ou corrompido)." && tituloParcial === titleErro],
          [`preenchida à mão, a linha do PDF corrompido deveria entrar no script: ${nContratos(s2)} contratos, ${contadorCorrigido}`,
            nContratos(s2) === 3 && s2.includes('"888888888"') && s2.includes('"OMEGA CORRIGIDO LTDA"') &&
            s2.includes('"corrompido.pdf"') && contadorCorrigido === "3 lidos · 3 no script · 0 de fora"],
          [`completa, a linha deveria ficar ✔ ok, sem o title do erro: ${statusCorrigido} / ${tdErro && tdErro.title}`,
            statusCorrigido.includes("✔ ok") && !!tdErro && tdErro.title === "" && !trErro.classList.contains("com-erro")],
          [`cancelar o diálogo deixou ${depoisCancelar} linhas (progresso: ${t.progresso.textContent})`,
            depoisCancelar === 3 && /^Leitura concluída/.test(t.progresso.textContent)],
        ], "3 linhas (2 ok, 1 erro com mensagem fixa); .txt e subpasta ignorados; leitura antiga descartada; 2 contratos; PDF corrompido preenchido à mão entra; cancelar mantém a lista");
      },
    },
    {
      // Tela de remoção de hedges: contador, faltas, segundos inválidos e a trava
      nome: "hedges_ui",
      async rodar(ctx) {
        const pag = await ctx.abrir("/painel/painel.html");
        const w = pag.win, d = pag.doc;
        w.HTMLAnchorElement.prototype.click = function () {};
        const cartao = d.querySelector('.cartao[data-tela="hedges"]');
        if (cartao) cartao.click();
        const tela = d.getElementById("tela-hedges");
        const q = s => tela.querySelector(s);
        const ev = (el, tipo) => el.dispatchEvent(new w.Event(tipo, { bubbles: true }));
        const digitar = (el, v) => { el.value = v; ev(el, "input"); ev(el, "change"); };
        const area = q("textarea");
        const nums = [...tela.querySelectorAll('details input[type="number"]')];
        const contador = q(".contador");
        const pre = () => q(".coluna-direita pre");
        const faltas = () => q(".coluna-direita .faltas");
        const exe = () => q('.coluna-direita input[value="execucao"]');
        const sim = () => q('.coluna-direita input[value="simulacao"]');
        const bBaixar = () => [...tela.querySelectorAll(".coluna-direita .acoes button")].find(b => b.textContent === "Baixar .js");
        const lista = () => [...tela.querySelectorAll(".faltas li:not(.titulo)")].map(li => li.textContent);
        if (!area || nums.length !== 2 || !contador) return { ok: false, detalhe: "a tela de hedges não tem textarea, contador e os 2 campos de Avançado" };
        const p = [];
        p.push([`padrões: ${nums.map(n => n.value)}`, nums[0].value === "30" && nums[1].value === "0.4"]);
        p.push([`contador vazio: ${contador.textContent}`, contador.textContent === "0 códigos informados"]);
        p.push(["vazio: deveria mostrar a falta e esconder o script", pre().hidden && !faltas().hidden &&
          /ao menos uma IMP/i.test(faltas().textContent)]);
        digitar(area, "IMP-0001\n IMP-0002 ;\n\n");
        p.push([`contador com 2: ${contador.textContent}`, contador.textContent === "2 códigos informados"]);
        let s = pre().textContent;
        p.push(["o script deveria ter os dois códigos e DRY_RUN = true", !pre().hidden &&
          s.includes("IMP-0001") && s.includes("IMP-0002") && /const DRY_RUN\s*= true;/.test(s)]);
        p.push([`o script deveria usar 30000 e 400: ${(s.match(/(TIMEOUT_RECARGA_MS|PAUSA_MS) = [^;]*;/g) || []).join(" ")}`, /30000/.test(s) && /\b400\b/.test(s)]);
        // Baixar a Simulação libera a Execução; mudar a pausa trava
        bBaixar().click();
        p.push(["Execução deveria liberar após Baixar", !exe().disabled]);
        exe().click();
        p.push(["o script deveria ir para Execução", /const DRY_RUN\s*= false;/.test(pre().textContent)]);
        digitar(nums[1], "0.5");
        p.push(["mudar a pausa deveria desabilitar Execução", exe().disabled]);
        p.push(["o modo deveria voltar a Simulação", sim().checked && /const DRY_RUN\s*= true;/.test(pre().textContent)]);
        p.push(["a pausa 0.5 deveria virar 500", /\b500\b/.test(pre().textContent)]);
        // Segundos inválidos viram falta, sem script
        digitar(nums[1], "");
        p.push([`pausa vazia: ${lista()}`, pre().hidden && lista().includes("Informe uma pausa válida (em segundos).")]);
        digitar(nums[1], "0.4");
        digitar(nums[0], "0");
        p.push([`espera 0: ${lista()}`, pre().hidden && lista().includes("Informe um tempo de espera válido (em segundos).")]);
        digitar(nums[0], "abc");
        p.push(["espera inválida deveria esconder o script", pre().hidden]);
        digitar(nums[0], "45");
        p.push(["espera 45 deveria voltar o script com 45000", !pre().hidden && /45000/.test(pre().textContent)]);
        digitar(area, "A1, B2; B3\nC4");
        p.push([`contador com 4: ${contador.textContent}`, contador.textContent === "4 códigos informados"]);
        p.push([`erros no console: ${JSON.stringify(erros(pag))}`, erros(pag).length === 0]);
        return conferir(p, "contador normalizado; faltas; segundos inválidos viram falta; mudar a pausa trava a Execução");
      },
    },
    {
      // Tela de datas de pagamento dos hedges: prévia por grupo, problemas, script e a trava
      nome: "datas_ui",
      async rodar(ctx) {
        const pag = await ctx.abrir("/painel/painel.html");
        const w = pag.win, d = pag.doc;
        w.HTMLAnchorElement.prototype.click = function () {};
        const cartao = d.querySelector('.cartao[data-tela="datas-hedge"]');
        if (cartao) cartao.click();
        const tela = d.getElementById("tela-datas-hedge");
        if (!tela) return { ok: false, detalhe: "não há a tela de datas dos hedges" };
        const q = s => tela.querySelector(s);
        const ev = (el, tipo) => el.dispatchEvent(new w.Event(tipo, { bubbles: true }));
        const digitar = (el, v) => { el.value = v; ev(el, "input"); ev(el, "change"); };
        const area = q("textarea"), empresa = q("select");
        const radios = [...tela.querySelectorAll('input[type="radio"][name="tipo"]')];
        const pre = () => q(".coluna-direita pre");
        const faltas = () => q(".coluna-direita .faltas");
        const exe = () => q('.coluna-direita input[value="execucao"]');
        const sim = () => q('.coluna-direita input[value="simulacao"]');
        const bBaixar = () => [...tela.querySelectorAll(".coluna-direita .acoes button")].find(b => b.textContent === "Baixar .js");
        const linhas = () => [...tela.querySelectorAll(".lista-pdfs tbody tr")].map(tr => [...tr.children].map(td => td.textContent));
        const problemas = () => [...tela.querySelectorAll(".problemas-planilha li")].map(li => li.textContent);
        if (!area || !empresa || radios.length !== 2) return { ok: false, detalhe: "a tela não tem empresa, tipo e a caixa de texto" };
        const p = [];
        p.push(["o tipo deveria começar sem seleção", radios.every(r => !r.checked)]);
        p.push([`rótulos dos tipos: ${radios.map(r => r.parentNode.textContent.trim())}`,
          radios.map(r => r.parentNode.textContent.trim()).join("|") === "Hedges Novos|Hedges Expirados"]);
        p.push(["vazio: deveria mostrar faltas e esconder o script", pre().hidden && !faltas().hidden]);
        digitar(area, "Código IMP\tData\nDEMO-1001/26-WEB-1\t01/10/2026\nDEMO-1002/26-WEB-1\t01/10/2026\nDEMO-1003/26-WEB-1\t15/10/2026\n");
        p.push([`prévia: ${JSON.stringify(linhas())}`, linhas().length === 2 &&
          linhas()[0][0] === "01/10/2026" && linhas()[0][1] === "2" && linhas()[1][0] === "15/10/2026" && linhas()[1][1] === "1"]);
        p.push(["sem empresa e tipo, o script não deveria aparecer", pre().hidden]);
        digitar(empresa, "BR22");
        radios[0].click();
        let s = pre().textContent;
        p.push(["script deveria aparecer com Passo01a, Emp_ID 6 e DRY_RUN = true", !pre().hidden &&
          /Passo01a/.test(s) && /EMP_ID\s*=\s*"?6"?;/.test(s) && /const DRY_RUN\s*= true;/.test(s) && s.includes("DEMO-1003/26-WEB-1")]);
        radios[1].click();
        p.push(["Hedges Expirados deveria usar Passo01b", /Passo01b/.test(pre().textContent)]);
        // Linha com problema impede o script
        digitar(area, area.value + "DEMO-1004/26-WEB-1\t31/02/2026\n");
        p.push([`problemas: ${JSON.stringify(problemas())}`, problemas().length === 1 &&
          problemas()[0].startsWith("Linha 5: DEMO-1004/26-WEB-1") && problemas()[0].includes("data inválida")]);
        p.push(["com problema o script deveria sumir com a falta", pre().hidden &&
          faltas().textContent.includes("Corrija as linhas com problema na lista.")]);
        digitar(area, "DEMO-1001/26-WEB-1\t01/10/2026\nDEMO-1002/26-WEB-1\t15/10/2026\n");
        p.push(["corrigido, o script deveria voltar", !pre().hidden && problemas().length === 0]);
        // Trava
        bBaixar().click();
        p.push(["Execução deveria liberar após Baixar", !exe().disabled]);
        exe().click();
        p.push(["o script deveria ir para Execução", /const DRY_RUN\s*= false;/.test(pre().textContent)]);
        digitar(area, "DEMO-1001/26-WEB-1\t02/10/2026\nDEMO-1002/26-WEB-1\t15/10/2026\n");
        p.push(["mudar a planilha deveria desabilitar Execução", exe().disabled]);
        p.push(["o modo deveria voltar a Simulação", sim().checked && /const DRY_RUN\s*= true;/.test(pre().textContent)]);
        // Trocar a empresa ou o tipo também trava a Execução
        const liberarExecucao = () => { bBaixar().click(); exe().click(); };
        liberarExecucao();
        p.push(["antes de trocar a empresa: Execução deveria estar ativa", /const DRY_RUN\s*= false;/.test(pre().textContent)]);
        digitar(empresa, "BR21");
        p.push(["trocar a empresa deveria desabilitar Execução", exe().disabled]);
        p.push(["trocar a empresa deveria voltar a Simulação", sim().checked && /const DRY_RUN\s*= true;/.test(pre().textContent)]);
        liberarExecucao();
        p.push(["antes de trocar o tipo: Execução deveria estar ativa", /const DRY_RUN\s*= false;/.test(pre().textContent)]);
        radios[0].click();
        p.push(["trocar o tipo deveria desabilitar Execução", exe().disabled]);
        p.push(["trocar o tipo deveria voltar a Simulação", sim().checked && /const DRY_RUN\s*= true;/.test(pre().textContent)]);
        // Texto do usuário não vira HTML
        digitar(area, "<b>X</b>\t01/10/2026\n");
        p.push(["o código digitado virou HTML", !tela.querySelector(".lista-pdfs b") && linhas()[0][2] === "<B>X</B>"]);
        // 375 px sem rolagem horizontal, com um grupo de muitos códigos longos
        const longos = Array.from({ length: 12 }, (_, i) => `DEMO-${String(2001 + i)}/26-WEB-LONGO-${i + 1}`);
        digitar(area, longos.map(c => c + "\t05/11/2026").join("\n") + "\n");
        p.push([`prévia longa: ${JSON.stringify(linhas().map(l => l.slice(0, 2)))}`, linhas().length === 1 && linhas()[0][1] === "12"]);
        const larguraAntes = ctx.iframe.style.width;
        ctx.iframe.style.width = "375px";
        await ctx.sleep(150);
        const sw = d.documentElement.scrollWidth, cw = d.documentElement.clientWidth;
        ctx.iframe.style.width = larguraAntes;
        p.push([`a 375 px a página rola na horizontal (scrollWidth ${sw} > ${cw})`, sw <= cw]);
        p.push([`erros no console: ${JSON.stringify(erros(pag))}`, erros(pag).length === 0]);
        return conferir(p, "tipo vazio; prévia por grupo; problema impede o script; Passo e Emp_ID certos; mudar planilha, empresa ou tipo trava a Execução; 375 px sem rolagem com 12 códigos longos");
      },
    },
    {
      // A trava na tela: editar valor, desmarcar "incluir" ou trocar a data voltam à Simulação
      nome: "trava_ui",
      async rodar(ctx) {
        const t = await abrirInclusao(ctx);
        if (!t.ok) return { ok: false, detalhe: "a tela de inclusão não tem os campos" };
        const fim = await preencherTudo(t, ctx, PDF_BONS);
        const p = [[`a leitura não terminou (progresso: ${t.progresso.textContent})`, fim]];
        const l1 = t.linhas()[0];
        const mudancas = [
          ["editar o valor", () => t.digitar(t.celula(l1, "valor"), "21.500,01")],
          ["desmarcar incluir", () => t.incluir(l1).click()],
          ["trocar a data", () => t.digitar(t.data, "2026-11-13")],
        ];
        p.push(["Execução deveria começar desabilitada", t.exe().disabled]);
        for (const [nome, mudar] of mudancas) {
          t.baixar().click();
          p.push([`antes de ${nome}: Execução não habilitou após Baixar em Simulação`, !t.exe().disabled]);
          t.exe().click();
          p.push([`antes de ${nome}: o script não foi para Execução`,
            t.exe().checked && /const DRY_RUN\s*= false;/.test(t.pre().textContent)]);
          mudar();
          p.push([`${nome}: Execução deveria ficar desabilitada`, t.exe().disabled]);
          p.push([`${nome}: o modo deveria voltar a Simulação`, t.sim().checked &&
            /const DRY_RUN\s*= true;/.test(t.pre().textContent)]);
        }
        // Nenhum "incluir" marcado: sem script, a falta pedida e Copiar/Baixar desabilitados
        t.linhas().forEach(tr => { if (t.incluir(tr).checked) t.incluir(tr).click(); });
        const faltas = t.faltas();
        const bCopiar = t.qa(".coluna-direita .acoes button").find(b => b.textContent === "Copiar");
        p.push(["sem nenhum incluído o script deveria sumir", t.pre().hidden]);
        p.push([`faltas sem nenhum incluído: ${faltas && faltas.textContent}`, !!faltas && !faltas.hidden &&
          [...faltas.querySelectorAll("li")].some(li => li.textContent === "Marque ao menos um contrato para incluir.")]);
        p.push(["Copiar/Baixar deveriam ficar desabilitados", !!bCopiar && bCopiar.disabled && t.baixar().disabled]);
        return conferir(p, "Baixar libera; editar valor, desmarcar e trocar a data travam e voltam à Simulação; nada incluído = sem script");
      },
    },
  ];
})();
