(function (exportar) {
  function previsoes() {
//<<INICIO
// =====================================================================
//  Excluir todas as previsões (lançamentos) da tabela do Caixa
//  Cole no console (F12) da página do Caixa, já filtrada.
//
//  Em simulação (DRY_RUN = true) só pinta de vermelho as linhas que
//  seriam excluídas e lista tudo no console. Nada é excluído.
// =====================================================================
(async function deleteAllItemsByArray() {
  const DRY_RUN = __DRY_RUN__;   // true = só mostra; false = exclui de verdade
  const delay = (ms) => new Promise(res => setTimeout(res, ms));

  console.log("=== INICIANDO EXCLUSÃO EM LOTE POR ARRAY ===" + (DRY_RUN ? " (SIMULAÇÃO)" : ""));

  const links = Array.from(
    document.querySelectorAll('tbody a[href*="/caixa/delete/"], tbody a.fa-trash-alt')
  );
  const deleteList = links.map(a => a.getAttribute('href'));

  const total = deleteList.length;

  if (total === 0) {
    console.log("Nenhum registro localizado para exclusão.");
    alert("AVISO: Nenhum item para excluir foi encontrado na tabela atual.");
    return;
  }

  if (DRY_RUN) {
    console.table(links.map((link, i) => {
      const tr = link.closest("tr");
      return { n: i + 1, linha: tr ? tr.innerText.replace(/\s+/g, " ").trim() : "", link: link.getAttribute("href") };
    }));
    links.forEach(link => {
      const tr = link.closest("tr");
      if (tr) tr.style.background = "#f8d7da";
    });
    document.querySelectorAll(".__prev_previsoes").forEach(e => e.remove());
    const aviso = document.createElement("div");
    aviso.className = "__prev_previsoes";
    aviso.style.cssText = "position:fixed;top:10px;right:10px;z-index:2147483647;background:#fff;border:2px solid #dc3545;border-radius:8px;padding:12px 16px;font:14px sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:360px";
    aviso.textContent = `Simulação — ${total} lançamentos seriam excluídos. Nada foi excluído.`;
    document.body.appendChild(aviso);
    console.log(`%cSimulação — ${total} lançamentos seriam excluídos. Nada foi excluído.`, "color:orange;font-weight:bold");
    return;
  }

  console.log(`Array criado com ${total} itens a serem excluídos:`, deleteList);

  const csrfToken = document.querySelector('input[name="csrfmiddlewaretoken"]')?.value;

  if (!csrfToken) {
    console.error("Token não localizado na página.");
    alert("ERRO: Não foi possível obter o token de segurança (CSRF).");
    return;
  }

  const confirmacao = confirm(`Deseja realmente excluir todos os ${total} itens listados na tela?`);
  if (!confirmacao) {
    console.log("Operação cancelada pelo usuário.");
    return;
  }

  let processados = 0;

  for (const link of deleteList) {
    processados++;
    console.log(`[${processados}/${total}] Excluindo: ${link}...`);

    try {
      const response = await fetch(link, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRFToken': csrfToken
        },
        body: new URLSearchParams({
          'csrfmiddlewaretoken': csrfToken
        })
      });

      if (response.ok || response.redirected) {
        console.log(`[${processados}/${total}] Sucesso: ${link}`);
      } else {
        console.warn(`[${processados}/${total}] Resposta inesperada (${response.status}) para: ${link}`);
      }
    } catch (err) {
      console.error(`Erro ao excluir ${link}:`, err);
    }

  }

  console.log("Processamento do array concluído!");
  alert(`SUCESSO!\n\nForam excluídos todos os ${processados} itens da lista.\nA página será recarregada.`);

  window.location.reload();
})();
//FIM>>
  }
  exportar({ previsoes });
})(function (api) {
  if (typeof module !== "undefined" && module.exports) Object.assign(module.exports, api);
  else Object.assign(window.Painel.modelos, api);
});
