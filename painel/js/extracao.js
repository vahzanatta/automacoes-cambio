(function (exportar) {
  // Mesmas regras de extrair_dados_texto em automacao_timp.py.
  function extrairDados(texto) {
    let m = texto.match(/Número do Contrato de Câmbio\s*[\r\n]+\s*(\d+)/i);
    if (!m) m = texto.match(/\b0*(\d{8,10})\b/);
    const num = m ? m[1].replace(/^0+/, "") : null;

    let mm = texto.match(/Código Moeda\s*[\r\n]+\s*([A-Z]{3})/i);
    if (!mm) mm = texto.match(/\b(USD|EUR|GBP|JPY|CAD|CHF)\b/);
    const moeda = mm ? mm[1] : null;

    const mv = texto.match(/Valor em moeda estrangeira\s*[\r\n]+\s*([\d.,]+)/i);
    const valor = mv ? mv[1] : null;

    const mf = texto.match(/Pagador\/Recebedor no exterior\s*[\r\n]+\s*([^\r\n]+)/i);
    const fornecedor = mf ? mf[1].trim() : null;

    return { num_contrato: num, moeda, valor, fornecedor };
  }

  // Monta o texto de uma página linha a linha (agrupando por altura), parecido com o
  // pdfplumber.extract_text(). Recebe os `items` do getTextContent() do pdf.js.
  function montarLinhas(itens) {
    const pedacos = itens
      .filter(i => i.str && i.str.trim() !== "")
      .map(i => ({ x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || 8, s: i.str }));
    pedacos.sort((a, b) => b.y - a.y || a.x - b.x);
    const linhas = [];
    for (const pc of pedacos) {
      const tol = Math.max(2, pc.h * 0.4);
      const linha = linhas.find(l => Math.abs(l.y - pc.y) <= tol);
      if (linha) linha.itens.push(pc); else linhas.push({ y: pc.y, itens: [pc] });
    }
    linhas.sort((a, b) => b.y - a.y);
    return linhas.map(l => {
      l.itens.sort((a, b) => a.x - b.x);
      let txt = "", fim = null;
      for (const it of l.itens) {
        if (fim !== null && it.x - fim > it.h * 0.15 && !txt.endsWith(" ")) txt += " ";
        txt += it.s; fim = it.x + it.w;
      }
      return txt.trim();
    }).join("\n");
  }

  // Só no navegador: usa o pdfjsLib global (carregado pela página).
  async function extrairTextoPdf(arquivo) {
    // isEvalSupported: false — o pdf.js não compila código (new Function) a partir do PDF
    const pdf = await pdfjsLib.getDocument({ data: await arquivo.arrayBuffer(), isEvalSupported: false }).promise;
    const paginas = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const pagina = await pdf.getPage(p);
      const { items } = await pagina.getTextContent();
      paginas.push(montarLinhas(items));
    }
    return paginas.join("\n");
  }

  const valorBrValido = s => /^\d{1,3}(\.\d{3})*,\d{2}$/.test(s || "") || /^\d+,\d{2}$/.test(s || "");
  const moedaValida = s => /^[A-Z]{3}$/.test(s || "");
  const contratoValido = s => /^\d+$/.test(s || "");
  const contratoCompleto = c =>
    !!c && contratoValido(c.num_contrato) && moedaValida(c.moeda) && valorBrValido(c.valor) &&
    typeof c.fornecedor === "string" && c.fornecedor.trim() !== "";

  exportar({ extrairDados, montarLinhas, extrairTextoPdf, valorBrValido, moedaValida, contratoValido, contratoCompleto });
})(function (api) {
  if (typeof module !== "undefined" && module.exports) Object.assign(module.exports, api);
  else Object.assign(window.Painel, api);
});
