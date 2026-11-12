(function (exportar) {
  function hedges() {
// Documentação do modelo (fica fora do script gerado):
// =====================================================================
//  Remover IMPs dos Hedges, mantendo só as da lista
//  Cole no console (F12) da página "Hedge - Passo 02".
//
//  Como funciona: a página recarrega a cada "Remover", e isso mataria um
//  script de console comum. Por isso o script abre a própria página num
//  iframe em tela cheia e controla o iframe a partir da página de fora,
//  que nunca recarrega. A cada recarga ele procura a próxima IMP que não
//  está na lista e clica no "Remover IMP do Hedge" dela.
//
//  1ª vez: rode em Simulação, que só lista o que seria removido.
//  Conferiu? Gere o script de Execução no painel e rode-o.
//  Para parar no meio: clique em "Parar" ou rode  window.__pararRemocao = true
// =====================================================================
//<<INICIO
(() => {
  const MANTER = __MANTER__;
  const DRY_RUN = __DRY_RUN__;
  const URL_INICIAL = location.href;
  const TIMEOUT_RECARGA_MS = __TIMEOUT_RECARGA_MS__;
  const PAUSA_MS = __PAUSA_MS__;

  const norm = s => (s || '').replace(/\s+/g, ' ').trim().toUpperCase();
  const manter = new Set(MANTER.split(/[\n,;]+/).map(norm).filter(Boolean));
  const log = (...a) => console.log('%c[remover-imps]', 'color:#086A87;font-weight:bold', ...a);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  if (!manter.size) { log('Lista MANTER vazia. Abortado.'); return; }

  function lerLinhas(doc) {
    const botoes = doc.querySelectorAll(
      'button[name="button_name_remover_imp_do_hedge"], button[id^="button_name_remover_imp_do_hedge"], button[title="Remover IMP do Hedge"], button[data-original-title="Remover IMP do Hedge"]');
    return [...botoes].map(btn => {
      const tr = btn.closest('tr');
      const ths = [...tr.closest('table').querySelectorAll('thead th')].map(th => norm(th.textContent));
      const tds = [...tr.children];
      const col = nome => { const i = ths.indexOf(nome); return i >= 0 && tds[i] ? norm(tds[i].textContent) : ''; };
      const codigo = col('CÓDIGO IMP'), impId = col('IMP_ID');
      const hedge = (btn.closest('.collapse') || {}).id || '';
      const casou = [...manter].filter(m => m === impId || codigo.includes(m));
      return { btn, codigo, impId, hedge, casou, manter: casou.length > 0 };
    });
  }

  function resumo(linhas) {
    const remover = linhas.filter(l => !l.manter);
    const achados = new Set(linhas.flatMap(l => l.casou));
    const naoAchados = [...manter].filter(m => !achados.has(m));
    return { remover, naoAchados, mantidas: linhas.length - remover.length };
  }

  if (DRY_RUN) {
    const linhas = lerLinhas(document);
    if (!linhas.length) {
      console.error('[remover-imps] Não achei nenhum botão "Remover IMP do Hedge" nesta página. ' +
        'Confira se está na página certa (Hedge - Passo 02) e, se for a simulação, se é a versão nova do arquivo.');
      return;
    }
    const r = resumo(linhas);
    log(`${linhas.length} IMPs na página | manter: ${r.mantidas} | remover: ${r.remover.length}`);
    log('Vão PERMANECER:'); console.table(linhas.filter(l => l.manter).map(l => ({ Hedge: l.hedge.replace('collapse_', ''), IMP_id: l.impId, 'Código IMP': l.codigo, 'Casou com': l.casou.join(', ') })));
    log('Vão ser REMOVIDAS:');
    console.table(r.remover.map(l => ({ Hedge: l.hedge.replace('collapse_', ''), IMP_id: l.impId, 'Código IMP': l.codigo })));
    if (r.naoAchados.length) console.warn('[remover-imps] Da lista MANTER, não encontrei na página:', r.naoAchados);
    console.log('[remover-imps] REMOVER (' + r.remover.length + '):\n' + r.remover.map(l => `  hedge ${l.hedge.replace('collapse_', '')}  IMP ${l.impId}  ${l.codigo}`).join('\n'));
    log('Se estiver certo, gere o script de Execução no painel e rode-o.');

    document.querySelectorAll('div.collapse[id^="collapse_"]').forEach(p => p.classList.add('show'));
    document.querySelectorAll('.__prev').forEach(e => e.remove());
    linhas.forEach(l => {
      const tr = l.btn.closest('tr');
      tr.style.outline = l.manter ? '3px solid #28a745' : '2px solid #dc3545';
      [...tr.children].forEach(td => td.style.background = l.manter ? '#d4edda' : '#f8d7da');
    });
    const painel = document.createElement('div');
    painel.className = '__prev';
    painel.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483647;background:#fff;border:2px solid #086A87;border-radius:8px;padding:12px 16px;font:14px sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:360px';
    painel.innerHTML = `<b>Teste (nada foi removido)</b><br>
      IMPs na página: <b>${linhas.length}</b><br>
      <span style="color:#28a745">Vão permanecer: <b>${r.mantidas}</b></span><br>
      <span style="color:#dc3545">Vão ser removidas: <b>${r.remover.length}</b></span>
      <span class="__nao_achados"></span>
      <br><button style="margin-top:8px">Fechar</button>`;
    if (r.naoAchados.length) {
      const nao = painel.querySelector('.__nao_achados');
      const span = document.createElement('span');
      span.style.color = '#b8860b';
      span.textContent = 'Não encontrei: ' + r.naoAchados.join(', ');
      nao.append(document.createElement('br'), span);
    }
    painel.querySelector('button').onclick = () => painel.remove();
    document.body.appendChild(painel);
    return;
  }

  window.__pararRemocao = false;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#fff;display:flex;flex-direction:column';
  wrap.innerHTML = `
    <div style="padding:6px 12px;background:#086A87;color:#fff;font:14px sans-serif;display:flex;gap:12px;align-items:center">
      <b>Removendo IMPs</b><span id="__st">iniciando…</span>
      <button id="__stop" style="margin-left:auto">Parar</button>
      <button id="__close">Fechar</button>
    </div>
    <iframe id="__fr" style="flex:1;border:0;width:100%"></iframe>`;
  document.body.appendChild(wrap);
  const fr = wrap.querySelector('#__fr');
  const st = t => { wrap.querySelector('#__st').textContent = t; log(t); };
  wrap.querySelector('#__stop').onclick = () => { window.__pararRemocao = true; st('parando depois do passo atual…'); };
  wrap.querySelector('#__close').onclick = () => { window.__pararRemocao = true; wrap.remove(); };

  const esperarCarga = () => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('a página não recarregou a tempo')), TIMEOUT_RECARGA_MS);
    fr.addEventListener('load', () => { clearTimeout(t); res(); }, { once: true });
  });

  (async () => {
    const carga = esperarCarga(); fr.src = URL_INICIAL; await carga;
    let totalInicial = null, ultimo = null, tentativasMesmo = 0, primeira = true;

    while (!window.__pararRemocao) {
      await sleep(PAUSA_MS);
      const w = fr.contentWindow, doc = fr.contentDocument;
      w.confirm = () => true;
      w.alert = m => log('alert do site:', m);

      const linhas = lerLinhas(doc);
      const r = resumo(linhas);

      if (primeira) {
        primeira = false; totalInicial = r.remover.length;
        if (r.naoAchados.length) console.warn('[remover-imps] Da lista MANTER, não encontrei:', r.naoAchados);
        if (r.mantidas === 0) { st('Nenhuma IMP da lista MANTER está na página. Abortado para não apagar tudo.'); return; }
      }
      const removidas = totalInicial - r.remover.length;
      if (!r.remover.length) { st(`Concluído: ${removidas} removidas, ${r.mantidas} mantidas.`); return; }

      const alvo = r.remover[0];
      const chave = alvo.impId + '|' + alvo.codigo;
      tentativasMesmo = chave === ultimo ? tentativasMesmo + 1 : 0;
      if (tentativasMesmo >= 2) { st(`A IMP ${alvo.codigo} continua na página depois de 3 tentativas. Parei.`); return; }
      ultimo = chave;

      const painel = alvo.btn.closest('.collapse');
      if (painel && !painel.classList.contains('show')) {
        if (w.jQuery && w.jQuery.fn.collapse) w.jQuery(painel).collapse('show'); else painel.classList.add('show');
        await sleep(350);
      }

      st(`removendo ${alvo.codigo} (IMP ${alvo.impId}, hedge ${alvo.hedge.replace('collapse_', '')}) — faltam ${r.remover.length}`);
      const prox = esperarCarga();
      alvo.btn.click();
      try { await prox; } catch (e) { st('Erro: ' + e.message + '. Parei.'); return; }
    }
    st('Parado pelo usuário.');
  })();
})();
//FIM>>
  }
  exportar({ hedges });
})(function (api) {
  if (typeof module !== "undefined" && module.exports) Object.assign(module.exports, api);
  else Object.assign(window.Painel.modelos, api);
});
