// Coluna do script: escolha Simulação/Execução, o script gerado (ou o que falta),
// Copiar, Baixar .js e "Onde colar". A Execução só libera depois de copiar ou baixar
// a Simulação com os mesmos dados (trava.js).
(function (P) {
  const AVISO_MUDOU = "Algo mudou desde a simulação: simule de novo antes de executar.";
  const MOTIVO_TRAVA = "Copie ou baixe o script de Simulação para liberar a Execução.";
  let contador = 0;

  function criar(tag, attrs, filhos) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === "texto") e.textContent = v; else e.setAttribute(k, v);
    });
    (filhos || []).forEach(f => e.appendChild(f));
    return e;
  }

  async function copiarTexto(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch (e) {
      // Reserva: navegadores/páginas sem a API de área de transferência (ex.: file://)
      const ta = criar("textarea", { readonly: "" });
      ta.value = texto;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  function baixarTexto(texto, nome) {
    const url = URL.createObjectURL(new Blob([texto], { type: "text/javascript;charset=utf-8" }));
    const a = criar("a", { href: url, download: nome });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Bloco "Como usar" (orientações de uso; o script gerado não tem comentários).
  // Fica no topo da coluna da esquerda de cada tela.
  function criarComoUsar(passos) {
    return criar("details", { class: "como-usar", open: "" }, [
      criar("summary", { texto: "Como usar" }),
      criar("ol", {}, passos.map(t => criar("li", { texto: t }))),
    ]);
  }

  function criarColunaScript(el, { gerar, dados, nomeArquivo, ondeColar }) {
    const trava = P.criarTrava();
    const grupo = "modo-" + (++contador);
    let modo = "simulacao";
    // { script } | { faltas }, mais a assinatura e o modo com que foi gerado
    let atual = null;

    const radio = valor => criar("input", { type: "radio", name: grupo, value: valor });
    const rSim = radio("simulacao");
    const rExe = radio("execucao");
    rSim.checked = true;
    const motivo = criar("p", { class: "motivo", texto: MOTIVO_TRAVA });
    const aviso = criar("p", { class: "aviso", role: "alert" });
    aviso.hidden = true;
    const modos = criar("fieldset", { class: "modos" }, [
      criar("legend", { texto: "Modo" }),
      criar("label", {}, [rSim, document.createTextNode(" Simulação")]),
      criar("label", {}, [rExe, document.createTextNode(" Execução")]),
    ]);
    const pre = criar("pre", { class: "script" });
    const faltas = criar("ul", { class: "faltas" });
    const bCopiar = criar("button", { type: "button", class: "botao primario", texto: "Copiar" });
    const bBaixar = criar("button", { type: "button", class: "botao", texto: "Baixar .js" });
    const status = criar("span", { class: "status", "aria-live": "polite" });
    const onde = criar("p", { class: "onde", texto: "Onde colar: " + ondeColar });
    el.classList.add("coluna-script");
    [criar("h2", { texto: "Script" }), modos, motivo, aviso, pre, faltas,
     criar("div", { class: "acoes" }, [bCopiar, bBaixar, status]), onde]
      .forEach(f => el.appendChild(f));

    function assinaturaAtual() {
      return P.assinatura(dados());
    }

    function desenhar() {
      const liberada = trava.liberada(assinaturaAtual());
      rExe.disabled = !liberada;
      motivo.hidden = liberada;
      rSim.checked = modo === "simulacao";
      rExe.checked = modo === "execucao";
      el.classList.toggle("em-execucao", modo === "execucao");

      const dryRun = modo === "simulacao";
      const gerado = gerar({ dryRun }) || { faltas: ["Não foi possível gerar o script."] };
      atual = Object.assign({}, gerado, { ass: assinaturaAtual(), dryRun });
      const temScript = typeof atual.script === "string";
      pre.hidden = !temScript;
      pre.textContent = temScript ? atual.script : "";
      faltas.hidden = temScript;
      faltas.replaceChildren(...(temScript ? [] : [criar("li", { class: "titulo", texto: "Falta:" })]
        .concat((atual.faltas || []).map(f => criar("li", { texto: f })))));
      bCopiar.disabled = bBaixar.disabled = !temScript;
    }

    function atualizar() {
      if (modo === "execucao" && !trava.liberada(assinaturaAtual())) {
        modo = "simulacao";
        aviso.textContent = AVISO_MUDOU;
        aviso.hidden = false;
      }
      status.textContent = "";
      desenhar();
    }

    // Copiar/baixar a Simulação libera a Execução para os dados com que aquele script foi gerado
    function registrar(capturado) {
      if (capturado.dryRun) trava.registrarSimulacao(capturado.ass);
      aviso.hidden = true;
      desenhar();
    }

    rSim.addEventListener("change", () => { modo = "simulacao"; aviso.hidden = true; atualizar(); });
    rExe.addEventListener("change", () => { modo = "execucao"; aviso.hidden = true; atualizar(); });
    bCopiar.addEventListener("click", async () => {
      const capturado = atual;   // antes de qualquer await
      if (!capturado || typeof capturado.script !== "string") return;
      const ok = await copiarTexto(capturado.script);
      if (ok) registrar(capturado);
      status.textContent = ok ? "Copiado." : "Não consegui copiar: use Baixar .js.";
    });
    bBaixar.addEventListener("click", () => {
      const capturado = atual;
      if (!capturado || typeof capturado.script !== "string") return;
      const sufixo = capturado.dryRun ? "_simulacao" : "_execucao";
      baixarTexto(capturado.script, nomeArquivo.replace(/\.js$/i, "") + sufixo + ".js");
      registrar(capturado);
      status.textContent = "Baixado.";
    });

    desenhar();
    return { atualizar };
  }

  P.criarColunaScript = criarColunaScript;
  P.criarComoUsar = criarComoUsar;
})(window.Painel);
