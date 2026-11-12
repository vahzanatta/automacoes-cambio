(function (exportar) {
  function datasHedge() {
// Documentação do modelo (fica fora do script gerado):
// =====================================================================
//  Data de pagamento dos hedges (Passo 01a "Hedges Novos" / 01b "Hedges Expirados")
//  Cole no console (F12) da tela de Seleção do passo escolhido, na empresa escolhida.
//
//  GRUPOS = [{ data: "AAAA-MM-DD", codigos: ["código IMP", ...] }, ...]
//  Antes de tudo: confere a página (caminho /hedge/<PASSO> e Emp_ID), que todos os
//  códigos estão na tabela, que todas as datas existem em "Data Pagto", que o botão de
//  lote e #wImpsAtualizar existem e que cada caixa do plano tem o IMP_ID (data-id).
//  Se algo faltar, para sem marcar nem gravar nada.
//
//  Simulação: pinta de verde as linhas de cada grupo, escreve a data nelas e mostra
//  um resumo por grupo (console.table e um quadro na página). Se algo faltar, mostra o
//  resumo e a lista do que faltou. Nada é clicado.
//
//  Execução: a página recarrega a cada gravação, então o script abre a página num
//  iframe em tela cheia (botões Parar e Fechar) e, por grupo: espera o botão de lote
//  ficar habilitado, desmarca (clicando) o que estiver marcado fora do grupo, marca
//  (clicando, para a página rodar impSelecionada) as caixas do grupo, escolhe a data,
//  confere que #wImpsAtualizar tem exatamente os IMP_ID do grupo (se não, desmarca e
//  remarca uma caixa do grupo para a página recalcular; se ainda não bater, para sem
//  clicar), clica em "Alterar Data Pag.Hedge (lote)", espera a recarga e confere: a
//  página recarregada é a certa e tem a tabela, e cada IMP do grupo saiu da lista ou
//  mostra a nova data em "Dt.Pgto.Hedge". "Saiu da lista" só vale se alguma IMP de
//  fora do grupo continua listada (sem nenhuma para comparar, avisa no fim).
//  Um código em dois grupos de data é recusado antes de qualquer coisa.
//  Para parar no meio: clique em "Parar" ou rode  window.__pararDatasHedge = true
// =====================================================================
//<<INICIO
(() => {
  const EMP_ID = __EMP_ID__;
  const PASSO = __PASSO__;
  const GRUPOS = __GRUPOS__;
  const DRY_RUN = __DRY_RUN__;
  const TIMEOUT_RECARGA_MS = __TIMEOUT_RECARGA_MS__;
  const PAUSA_MS = __PAUSA_MS__;
  const CAMINHO = '/hedge/' + PASSO;
  const URL_PAGINA = CAMINHO + '?Emp_ID=' + EMP_ID;

  const norm = s => String(s || '').replace(/\s+/g, ' ').trim().toUpperCase();
  const log = (...a) => console.log('%c[datas-hedge]', 'color:#086A87;font-weight:bold', ...a);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const dataBr = iso => iso.split('-').reverse().join('/');
  const plano = GRUPOS.map(g => ({ data: g.data, br: dataBr(g.data), codigos: [...new Set(g.codigos.map(norm).filter(Boolean))] }));
  const totalImps = plano.reduce((n, g) => n + g.codigos.length, 0);

  function quadro(titulo, linhas, cor) {
    document.querySelectorAll('.__datas_hedge').forEach(e => e.remove());
    const caixa = document.createElement('div');
    caixa.className = '__datas_hedge';
    caixa.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483647;background:#fff;border:2px solid ' + cor + ';border-radius:8px;padding:12px 16px;font:14px sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:420px;max-height:80vh;overflow:auto';
    const b = document.createElement('b');
    b.textContent = titulo;
    caixa.appendChild(b);
    linhas.forEach(t => {
      const div = document.createElement('div');
      div.textContent = t;
      caixa.appendChild(div);
    });
    const fechar = document.createElement('button');
    fechar.textContent = 'Fechar';
    fechar.style.marginTop = '8px';
    fechar.onclick = () => caixa.remove();
    caixa.appendChild(fechar);
    document.body.appendChild(caixa);
  }

  function parar(titulo, linhas) {
    console.error('[datas-hedge] ' + titulo + (linhas.length ? '\n' + linhas.join('\n') : ''));
    quadro(titulo, linhas, '#dc3545');
  }

  function empDaPagina(w, doc) {
    const daUrl = new URLSearchParams(w.location.search).get('Emp_ID');
    if (daUrl) return daUrl.trim();
    const sel = doc.querySelector('#Emp_ID');
    return sel ? String(sel.value).trim() : '';
  }

  function paginaCerta(w, doc) {
    const caminho = w.location.pathname.replace(/\/+$/, '').toLowerCase();
    return caminho.endsWith(CAMINHO.toLowerCase()) && empDaPagina(w, doc) === EMP_ID;
  }

  const idDe = cx => {
    try { return String(JSON.parse(cx.getAttribute('data-id') || '{}').wImpID || '').trim(); } catch (e) { return ''; }
  };

  function lerTabela(doc) {
    const linhas = [];
    const cabecalhoOk = [...doc.querySelectorAll('table')].some(t => {
      const ths = [...t.querySelectorAll('thead th')].map(th => norm(th.textContent));
      return ths.includes('CÓDIGO IMP') && ths.includes('DT.PGTO.HEDGE');
    });
    doc.querySelectorAll('input[name="wCheckbox"]').forEach(cx => {
      const tr = cx.closest('tr');
      const tabela = tr && tr.closest('table');
      if (!tabela) return;
      const ths = [...tabela.querySelectorAll('thead th')].map(th => norm(th.textContent));
      const tds = [...tr.children];
      const celula = nome => { const i = ths.indexOf(nome); return i >= 0 && tds[i] ? tds[i] : null; };
      const texto = nome => { const td = celula(nome); return td ? norm(td.textContent) : ''; };
      if (!celula('CÓDIGO IMP') || !celula('DT.PGTO.HEDGE')) return;
      linhas.push({
        cx, tr, id: idDe(cx), td: celula('CÓDIGO IMP'), codigo: texto('CÓDIGO IMP'), dtHedge: texto('DT.PGTO.HEDGE'),
        valor: texto('VALOR PROFORMA'), moeda: texto('MOEDA'),
      });
    });
    return { linhas, cabecalhoOk };
  }

  function datasDaPagina(doc) {
    const sel = doc.querySelector('#wCombowDatasPagamentoFuturas');
    return new Set(sel ? [...sel.querySelectorAll('option[value]')].map(o => o.value.trim()).filter(Boolean) : []);
  }

  function conferirPlano(doc) {
    const { linhas } = lerTabela(doc);
    const contagem = new Map();
    linhas.forEach(l => contagem.set(l.codigo, (contagem.get(l.codigo) || 0) + 1));
    const datas = datasDaPagina(doc);
    const problemas = [];
    const faltamCodigos = plano.flatMap(g => g.codigos.filter(c => !contagem.has(c)));
    const repetidos = plano.flatMap(g => g.codigos.filter(c => contagem.get(c) > 1));
    const faltamDatas = plano.filter(g => !datas.has(g.data)).map(g => g.br);
    const vezes = new Map();
    plano.forEach(g => g.codigos.forEach(c => vezes.set(c, (vezes.get(c) || 0) + 1)));
    const emDoisGrupos = [...vezes].filter(([, n]) => n > 1).map(([c]) => c);
    if (emDoisGrupos.length) problemas.push('Códigos em mais de um grupo de data: ' + emDoisGrupos.join(', '));
    if (faltamCodigos.length) problemas.push('Códigos que não estão na página: ' + faltamCodigos.join(', '));
    if (repetidos.length) problemas.push('Códigos em mais de uma linha da página: ' + repetidos.join(', '));
    if (faltamDatas.length) problemas.push('Datas que não estão na lista "Data Pagto": ' + faltamDatas.join(', '));
    if (!doc.querySelector('#data_prev_pag_lote_botao')) problemas.push('O botão "Alterar Data Pag.Hedge (lote)" (#data_prev_pag_lote_botao) não está na página');
    if (!doc.querySelector('#wImpsAtualizar')) problemas.push('A lista interna da página (#wImpsAtualizar) não está na página');
    const doPlano = new Set(plano.flatMap(g => g.codigos));
    const semId = linhas.filter(l => doPlano.has(l.codigo) && !l.id).map(l => l.codigo);
    if (semId.length) problemas.push('Caixas sem o IMP_ID (data-id com wImpID): ' + semId.join(', '));
    return { linhas, problemas };
  }

  const centavos = v => {
    const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  };
  const dinheiro = c => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function totais(linhas) {
    const porMoeda = new Map();
    linhas.forEach(l => porMoeda.set(l.moeda || '?', (porMoeda.get(l.moeda || '?') || 0) + centavos(l.valor)));
    return [...porMoeda].map(([m, c]) => m + ' ' + dinheiro(c)).join('; ');
  }

  if (!plano.length || !totalImps) { parar('A lista de IMPs está vazia. Nada foi feito.', []); return; }

  if (!paginaCerta(window, document)) {
    parar(`Cole este script na página ${URL_PAGINA}. Nada foi feito.`,
      [`Esta página: ${location.pathname}${location.search}`]);
    return;
  }
  if (!lerTabela(document).cabecalhoOk) {
    parar('Não achei a tabela de IMPs (caixas de seleção e as colunas "Código IMP" e "Dt.Pgto.Hedge"). Nada foi feito.', []);
    return;
  }
  const previa = conferirPlano(document);
  if (previa.problemas.length && !DRY_RUN) {
    parar('A conferência antes de gravar encontrou problemas. Nada foi gravado.', previa.problemas);
    return;
  }

  if (DRY_RUN) {
    document.querySelectorAll('.__datas_marca').forEach(e => e.remove());
    const resumo = plano.map(g => {
      const doGrupo = previa.linhas.filter(l => g.codigos.includes(l.codigo));
      const faltam = g.codigos.filter(c => !doGrupo.some(l => l.codigo === c)).length;
      doGrupo.forEach(l => {
        l.tr.style.outline = '3px solid #28a745';
        [...l.tr.children].forEach(td => { td.style.background = '#d4edda'; });
        const marca = document.createElement('div');
        marca.className = '__datas_marca';
        marca.style.cssText = 'font-weight:bold;color:#155724';
        marca.textContent = '→ ' + g.br;
        l.td.appendChild(marca);
      });
      log(`Grupo ${g.br}: ${doGrupo.length} IMPs`);
      console.table(doGrupo.map(l => ({ 'Código IMP': l.codigo, 'Valor Proforma': l.valor, Moeda: l.moeda, 'Nova data': g.br })));
      return `${g.br}: ${doGrupo.length} IMP(s)` + (doGrupo.length ? ` — ${totais(doGrupo)}` : '') +
        (faltam ? ` (${faltam} não encontrada(s))` : '');
    });
    if (previa.problemas.length) {
      const titulo = `Simulação: a conferência encontrou problemas. Nada foi marcado nem gravado. ${plano.length} grupo(s), ${totalImps} IMP(s)`;
      console.error('[datas-hedge] ' + titulo + '\n' + resumo.join('\n') + '\nNão encontrado ou com problema:\n' + previa.problemas.join('\n'));
      quadro(titulo, [...resumo, 'Não encontrado ou com problema:', ...previa.problemas], '#dc3545');
      return;
    }
    quadro(`Simulação (nada foi marcado nem gravado): ${plano.length} grupo(s), ${totalImps} IMP(s)`, resumo, '#086A87');
    log('Se estiver certo, gere o script de Execução no painel e rode-o.');
    return;
  }

  window.__pararDatasHedge = false;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#fff;display:flex;flex-direction:column';
  wrap.innerHTML = `
    <div style="padding:6px 12px;background:#086A87;color:#fff;font:14px sans-serif;display:flex;gap:12px;align-items:center">
      <b>Datas de pagamento dos hedges</b><span id="__st">iniciando…</span>
      <button id="__stop" style="margin-left:auto">Parar</button>
      <button id="__close">Fechar</button>
    </div>
    <iframe id="__fr" style="flex:1;border:0;width:100%"></iframe>`;
  document.body.appendChild(wrap);
  const fr = wrap.querySelector('#__fr');
  const st = t => { wrap.querySelector('#__st').textContent = t; log(t); };
  wrap.querySelector('#__stop').onclick = () => { window.__pararDatasHedge = true; st('parando depois do grupo atual…'); };
  wrap.querySelector('#__close').onclick = () => { window.__pararDatasHedge = true; wrap.remove(); };

  const INTERROMPIDO = 'interrompido pelo usuário';
  const fechado = () => !fr.isConnected;
  const esperarCarga = () => new Promise((res, rej) => {
    const fim = () => { clearTimeout(t); clearInterval(vigia); };
    const t = setTimeout(() => { fim(); rej(new Error('a página não recarregou a tempo')); }, TIMEOUT_RECARGA_MS);
    const vigia = setInterval(() => { if (fechado()) { fim(); rej(new Error(INTERROMPIDO)); } }, 200);
    fr.addEventListener('load', () => { fim(); res(); }, { once: true });
  });
  const botaoPronto = async () => {
    const fim = Date.now() + TIMEOUT_RECARGA_MS;
    while (Date.now() < fim) {
      if (fechado()) throw new Error(INTERROMPIDO);
      const doc = fr.contentDocument;
      const b = doc && doc.querySelector('#data_prev_pag_lote_botao');
      if (b && !b.disabled) {
        const w = fr.contentWindow;
        w.confirm = () => true;
        w.alert = m => log('alert do site:', m);
        await sleep(PAUSA_MS);
        if (!b.disabled && b.isConnected) return b;
      }
      await sleep(100);
    }
    throw new Error('o botão "Alterar Data Pag.Hedge (lote)" não ficou disponível a tempo');
  };

  const gravados = [];
  const avisos = [];
  const feitos = () => gravados.length
    ? 'Já gravados: ' + gravados.map(g => `${g.br} (${g.n} IMPs)`).join(', ') + '.'
    : 'Nenhum grupo foi gravado.';

  (async () => {
    let atual = null, enviado = false;
    try {
      const carga = esperarCarga(); fr.src = URL_PAGINA; await carga;
      await botaoPronto();
      const inicio = conferirPlano(fr.contentDocument);
      if (!paginaCerta(fr.contentWindow, fr.contentDocument) || !lerTabela(fr.contentDocument).cabecalhoOk) {
        st(`Erro: a página aberta não é ${URL_PAGINA} com a tabela de IMPs. Nada foi gravado.`); return;
      }
      if (inicio.problemas.length) { st('Erro: ' + inicio.problemas.join('. ') + '. Nada foi gravado.'); return; }

      for (const [i, g] of plano.entries()) {
        if (window.__pararDatasHedge) { st('Parado pelo usuário. ' + feitos()); return; }
        atual = g;
        const botao = await botaoPronto();
        const w = fr.contentWindow, doc = fr.contentDocument;
        const { linhas } = lerTabela(doc);
        const doGrupo = new Set(g.codigos);
        const alvo = linhas.filter(l => doGrupo.has(l.codigo));
        const faltam = g.codigos.filter(c => !alvo.some(l => l.codigo === c));
        if (faltam.length || alvo.length !== g.codigos.length) {
          st(`Erro: no grupo ${g.br} não achei (ou achei repetido) ${faltam.join(', ') || 'algum código'}. Este grupo não foi gravado. ` + feitos());
          return;
        }
        linhas.filter(l => l.cx.checked && !doGrupo.has(l.codigo)).forEach(l => l.cx.click());
        alvo.filter(l => !l.cx.checked).forEach(l => l.cx.click());
        const marcadas = linhas.filter(l => l.cx.checked).map(l => l.codigo).sort();
        if (marcadas.join('|') !== [...g.codigos].sort().join('|')) {
          st(`Erro: no grupo ${g.br} as caixas marcadas não batem com o grupo (${marcadas.join(', ')}). Este grupo não foi gravado. ` + feitos());
          return;
        }
        const idsEsperados = alvo.map(l => l.id).sort().join(',');
        if (alvo.some(l => !l.id)) {
          st(`Erro: no grupo ${g.br} alguma caixa não tem o IMP_ID (data-id). O botão não foi clicado. ` + feitos());
          return;
        }
        const listaDaPagina = () => {
          const campo = doc.querySelector('#wImpsAtualizar');
          return campo ? String(campo.value).split(',').map(s => s.trim()).filter(Boolean).sort().join(',') : null;
        };
        if (listaDaPagina() !== idsEsperados) {
          alvo[0].cx.click();
          alvo[0].cx.click();
        }
        const lista = listaDaPagina();
        if (lista !== idsEsperados || !alvo.every(l => l.cx.checked)) {
          st(`Erro: no grupo ${g.br} a lista interna da página (#wImpsAtualizar = "${lista === null ? 'não existe' : lista}") ` +
            `não bate com as IMPs do grupo (${idsEsperados}). O botão não foi clicado. ` + feitos());
          return;
        }
        const sel = doc.querySelector('#wCombowDatasPagamentoFuturas');
        sel.value = g.data;
        if (sel.value !== g.data) {
          st(`Erro: a data ${g.br} não está em "Data Pagto". Este grupo não foi gravado. ` + feitos()); return;
        }
        sel.dispatchEvent(new w.Event('change', { bubbles: true }));
        const testemunhas = linhas.filter(l => !doGrupo.has(l.codigo)).map(l => l.codigo);
        st(`gravando grupo ${i + 1} de ${plano.length}: ${g.br}, ${alvo.length} IMP(s)`);
        const prox = esperarCarga();
        enviado = true;
        botao.click();
        await prox;
        const paginaRecarregadaOk = () => !fechado() && paginaCerta(fr.contentWindow, fr.contentDocument) &&
          lerTabela(fr.contentDocument).cabecalhoOk;
        const semConfirmar = () => {
          st(`Erro: depois de clicar no botão do grupo ${g.br}, a página recarregada não é ${URL_PAGINA} com a tabela de IMPs. ` +
            'Nada foi confirmado para este grupo; confira na página. Parei. ' + feitos());
        };
        if (!fechado() && !paginaRecarregadaOk()) { semConfirmar(); return; }
        await botaoPronto();
        if (!paginaRecarregadaOk()) { semConfirmar(); return; }
        const depois = lerTabela(fr.contentDocument).linhas;
        const erradas = g.codigos.filter(c => depois.some(l => l.codigo === c && l.dtHedge !== g.br));
        if (erradas.length) {
          st(`Erro: depois de gravar o grupo ${g.br}, estas IMPs não mostram a nova data: ${erradas.join(', ')}. Parei. ` + feitos());
          return;
        }
        const sumidas = g.codigos.filter(c => !depois.some(l => l.codigo === c));
        if (sumidas.length) {
          if (!testemunhas.length) {
            avisos.push(`no grupo ${g.br} não havia outras IMPs na página para conferir a lista recarregada`);
          } else if (!testemunhas.some(c => depois.some(l => l.codigo === c))) {
            st(`Erro: depois de clicar no botão do grupo ${g.br}, as IMPs do grupo e também todas as outras IMPs sumiram da lista. ` +
              'Não dá para saber se a página recarregou a lista certa. Nada foi confirmado para este grupo; confira na página. Parei. ' + feitos());
            return;
          }
        }
        gravados.push({ br: g.br, n: g.codigos.length });
        atual = null;
        enviado = false;
      }
      const n = gravados.reduce((s, g) => s + g.n, 0);
      st(`Concluído: ${gravados.length} grupos, ${n} IMPs. ` + gravados.map(g => `${g.br}: ${g.n}`).join('; ') + '.' +
        (avisos.length ? ' Aviso: ' + avisos.join('; ') + '.' : ''));
    } catch (e) {
      const grupo = !atual ? '' : enviado
        ? ` (grupo ${atual.br}: o botão de lote foi clicado; confira na página se ele foi gravado)`
        : ` (grupo ${atual.br}, não gravado)`;
      if (e.message === INTERROMPIDO) {
        st(`Interrompido pelo usuário${grupo}. ` + feitos());
      } else {
        st(`Erro: ${e.message}${grupo}. Parei. ` + feitos());
      }
    }
  })();
})();
//FIM>>
  }
  exportar({ datasHedge });
})(function (api) {
  if (typeof module !== "undefined" && module.exports) Object.assign(module.exports, api);
  else Object.assign(window.Painel.modelos, api);
});
