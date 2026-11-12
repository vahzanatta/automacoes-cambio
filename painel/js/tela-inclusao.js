// Tela de inclusão de contratos: empresa, tipo, data e a pasta dos PDFs de contratação.
// Os PDFs viram uma lista editável; os contratos marcados e completos vão para o script.
// Texto vindo do usuário ou do PDF só entra no DOM por textContent/value.
(function (P) {
  const CAMPOS = [
    { campo: "num_contrato", rotulo: "Contrato", valido: v => P.contratoValido(v), motivo: "Só dígitos." },
    { campo: "moeda", rotulo: "Moeda", valido: v => P.moedaValida(v), motivo: "Três letras (ex.: USD)." },
    { campo: "valor", rotulo: "Valor", valido: v => P.valorBrValido(v),
      motivo: "Use o formato brasileiro: 1.234,56 ou 1234,56." },
    { campo: "fornecedor", rotulo: "Fornecedor", valido: v => (v || "").trim() !== "", motivo: "Informe o fornecedor." },
  ];
  const MSG_ERRO_PDF = "Erro: não consegui ler o PDF (arquivo inválido ou corrompido).";
  const ONDE_COLAR = "Página Contratos (Terceiros ou Hedge) do T.IMP, logado — console (F12)";
  const COMO_USAR = [
    "Abaixo, escolha a empresa, o tipo de contrato, a data de pagamento e a pasta com os PDFs de contratação.",
    "Confira a lista: corrija o que estiver em vermelho e desmarque o que não deve entrar.",
    "Com Simulação marcada, copie ou baixe o script ao lado.",
    "No T.IMP logado, abra a página de Contratos do tipo escolhido, aperte F12, abra a aba Console, cole o script e aperte Enter.",
    "Simulação: o console mostra quais contratos casaram com quais pagamentos e quais não casaram (com o motivo). Nada é gravado.",
    "Se aparecer \"Nenhum contrato casou\", veja o motivo: os pagamentos podem já estar com o número do contrato.",
    "Conferiu? Volte aqui, escolha Execução, copie e cole no console da mesma página.",
    "Execução: o script grava o número em cada pagamento e, no fim, confere o que ficou gravado (✅/❌).",
  ];

  function criar(tag, attrs, filhos) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === "texto") e.textContent = v; else e.setAttribute(k, v);
    });
    (filhos || []).forEach(f => e.appendChild(typeof f === "string" ? document.createTextNode(f) : f));
    return e;
  }

  // Só os arquivos da pasta escolhida (sem subpastas) e com extensão .pdf, em ordem de
  // code point (igual ao sorted() do automacao_timp.py, para a lista sair na mesma ordem)
  function pdfsDaPasta(files) {
    return [...files]
      .filter(f => {
        const caminho = f.webkitRelativePath || "";
        return (caminho === "" || caminho.split("/").length === 2) && /\.pdf$/i.test(f.name);
      })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  function iniciarTelaInclusao(el) {
    // Cada linha: { arquivo, erro (mensagem original do pdf.js, ou null), incluir, valores: {campo: texto} }.
    // Toda linha (inclusive com erro de leitura) é editável e começa com "incluir" marcado;
    // um contrato vai para o script se estiver marcado e completo.
    let linhas = [];
    let leitura = 0;   // cada escolha de pasta ganha um número; leituras antigas são descartadas

    const empresa = criar("select", { name: "empresa" }, [criar("option", { value: "", texto: "Escolha…" })]
      .concat(P.EMPRESAS.map(e => criar("option", { value: e.codigo, texto: `${e.codigo} - ${e.nome}` }))));
    const radiosTipo = Object.keys(P.TIPOS).map(k => criar("input", { type: "radio", name: "tipo", value: k }));
    const data = criar("input", { type: "date", name: "data" });
    const pasta = criar("input", { type: "file", name: "pasta", webkitdirectory: "", multiple: "" });
    const progresso = criar("p", { class: "progresso", "aria-live": "polite" });
    const contador = criar("p", { class: "contador" });
    const corpo = criar("tbody");
    const tabela = criar("table", { class: "lista-pdfs" }, [
      criar("thead", {}, [criar("tr", {}, [criar("th", { texto: "Incluir" }), criar("th", { texto: "Arquivo" })]
        .concat(CAMPOS.map(c => criar("th", { texto: c.rotulo })), [criar("th", { texto: "Status" })]))]),
      corpo,
    ]);
    const lista = criar("div", { class: "lista-rolagem" }, [tabela]);
    contador.hidden = lista.hidden = true;

    const campo = (rotulo, controle) => criar("label", { class: "campo" }, [criar("span", { texto: rotulo }), controle]);
    const esquerda = criar("div", { class: "coluna-esquerda" }, [
      criar("h2", { texto: "Inclusão de contratos" }),
      P.criarComoUsar(COMO_USAR),
      criar("div", { class: "formulario" }, [
        campo("Empresa", empresa),
        criar("fieldset", { class: "campo tipos" }, [criar("legend", { texto: "Tipo de contrato" })]
          .concat(radiosTipo.map(r => criar("label", {}, [r, " " + P.TIPOS[r.value].rotulo])))),
        campo("Data de pagamento", data),
        campo("Pasta dos PDFs", pasta),
      ]),
      progresso, contador, lista,
    ]);
    const direita = criar("aside", { class: "coluna-direita" });
    el.appendChild(criar("div", { class: "processo" }, [esquerda, direita]));

    const tipoEscolhido = () => (radiosTipo.find(r => r.checked) || {}).value || "";
    const completa = l => P.contratoCompleto(l.valores);
    const contratoDe = l => ({
      num_contrato: l.valores.num_contrato,
      moeda: l.valores.moeda,
      valor: l.valores.valor,
      fornecedor: l.valores.fornecedor.trim(),
      arquivo: l.arquivo,
    });
    // Mesma lista para o script e para a assinatura da trava
    const incluidos = () => linhas.filter(l => l.incluir && completa(l)).map(contratoDe);
    const dados = () => ({
      processo: "inclusao", empresa: empresa.value, tipo: tipoEscolhido(), data: data.value, contratos: incluidos(),
    });

    const coluna = P.criarColunaScript(direita, {
      gerar: ({ dryRun }) => {
        const d = dados();
        const faltas = P.validarInclusao(d);
        if (faltas.length) return { faltas };
        return { script: P.montarInclusao({ empresa: d.empresa, tipo: d.tipo, data: d.data, dryRun, contratos: d.contratos }) };
      },
      dados,
      nomeArquivo: "incluir_contratos.js",
      ondeColar: ONDE_COLAR,
    });

    function atualizar() {
      const n = linhas.length, m = incluidos().length;
      contador.textContent = `${n} lidos · ${m} no script · ${n - m} de fora`;
      contador.hidden = lista.hidden = n === 0;
      coluna.atualizar();
    }

    function marcarCelula(input, c) {
      const ok = c.valido(input.value);
      input.classList.toggle("invalida", !ok);
      input.title = ok ? "" : c.motivo;
      input.setAttribute("aria-invalid", ok ? "false" : "true");
    }

    function textoStatus(l) {
      return completa(l) ? "✔ ok" : l.erro ? MSG_ERRO_PDF : "⚠ incompleto";
    }

    function criarLinha(l) {
      const status = criar("td", { class: "status-pdf", texto: textoStatus(l) });
      const desenharStatus = () => {
        const ok = completa(l);
        status.textContent = textoStatus(l);
        status.classList.toggle("ok", ok);
        // Erro de leitura: destaque e detalhe técnico do pdf.js (só no title) até a linha ficar completa
        tr.classList.toggle("com-erro", !!l.erro && !ok);
        status.title = l.erro && !ok ? l.erro : "";
      };
      const caixa = criar("input", { type: "checkbox", class: "incluir", "aria-label": "Incluir " + l.arquivo });
      caixa.checked = l.incluir;
      caixa.addEventListener("change", () => { l.incluir = caixa.checked; atualizar(); });
      const tr = criar("tr", {}, [criar("td", {}, [caixa]), criar("td", { class: "arquivo", texto: l.arquivo })]);
      CAMPOS.forEach(c => {
        const input = criar("input", { type: "text", "data-campo": c.campo, "aria-label": c.rotulo + " de " + l.arquivo });
        if (c.campo === "moeda") input.maxLength = 3;
        if (c.campo === "num_contrato") input.inputMode = "numeric";
        input.value = l.valores[c.campo];
        marcarCelula(input, c);
        input.addEventListener("input", () => {
          if (c.campo === "moeda") input.value = input.value.toUpperCase();
          l.valores[c.campo] = input.value;
          marcarCelula(input, c);
          desenharStatus();
          atualizar();
        });
        tr.appendChild(criar("td", {}, [input]));
      });
      tr.appendChild(status);
      desenharStatus();
      return tr;
    }

    async function lerPasta(files) {
      const minha = ++leitura;
      linhas = [];
      corpo.replaceChildren();
      atualizar();
      const pdfs = pdfsDaPasta(files);
      if (!pdfs.length) {
        progresso.textContent = "Nenhum PDF na pasta (só os arquivos da própria pasta são lidos, sem subpastas).";
        return;
      }
      for (let i = 0; i < pdfs.length; i++) {
        progresso.textContent = `Lendo ${i + 1}/${pdfs.length}…`;
        const f = pdfs[i];
        const l = { arquivo: f.name, erro: null, incluir: true, valores: {} };
        try {
          const extraido = P.extrairDados(await P.extrairTextoPdf(f));
          CAMPOS.forEach(c => { l.valores[c.campo] = extraido[c.campo] == null ? "" : String(extraido[c.campo]); });
        } catch (e) {
          l.erro = String((e && e.message) || e || "erro desconhecido");
          CAMPOS.forEach(c => { l.valores[c.campo] = ""; });
        }
        if (minha !== leitura) return;   // outra pasta foi escolhida no meio: descarta
        linhas.push(l);
        corpo.appendChild(criarLinha(l));
        atualizar();
      }
      progresso.textContent = `Leitura concluída: ${pdfs.length} PDF${pdfs.length === 1 ? "" : "s"}.`;
    }

    empresa.addEventListener("change", atualizar);
    radiosTipo.forEach(r => r.addEventListener("change", atualizar));
    data.addEventListener("input", atualizar);
    data.addEventListener("change", atualizar);
    // Diálogo cancelado (change sem arquivos): mantém a lista atual
    pasta.addEventListener("change", () => {
      if (pasta.files && pasta.files.length) lerPasta(pasta.files);
    });
    atualizar();
  }

  P.iniciarTelaInclusao = iniciarTelaInclusao;
})(window.Painel);
