(async function deleteAllItemsByArray() {
  const delay = (ms) => new Promise(res => setTimeout(res, ms));

  console.log("=== INICIANDO EXCLUSÃO EM LOTE POR ARRAY ===");

  const deleteList = Array.from(
    document.querySelectorAll('tbody a[href*="/caixa/delete/"], tbody a.fa-trash-alt')
  ).map(a => a.getAttribute('href'));

  const total = deleteList.length;

  if (total === 0) {
    console.log("Nenhum registro localizado para exclusão.");
    alert("AVISO: Nenhum item para excluir foi encontrado na tabela atual.");
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