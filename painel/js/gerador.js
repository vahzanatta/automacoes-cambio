(function (exportar) {
  const noNode = typeof module !== "undefined" && module.exports;
  const config = noNode ? require("./config.js") : window.Painel;
  const modelos = noNode
    ? Object.assign({}, require("../modelos/inclusao.js"), require("../modelos/hedges.js"),
                    require("../modelos/previsoes.js"))
    : window.Painel.modelos;

  const MARCADOR_INICIO = "//<<INICIO";
  const MARCADOR_FIM = "//FIM>>";

  // Texto do modelo entre os marcadores (da linha seguinte a //<<INICIO até //FIM>>).
  function extrairCorpo(fn) {
    const texto = String(fn).replace(/\r\n/g, "\n");
    const ini = texto.indexOf(MARCADOR_INICIO + "\n");
    if (ini < 0) throw new Error(`Modelo sem o marcador ${MARCADOR_INICIO}.`);
    const fim = texto.indexOf(MARCADOR_FIM, ini);
    if (fim < 0) throw new Error(`Modelo sem o marcador ${MARCADOR_FIM}.`);
    return texto.slice(ini + MARCADOR_INICIO.length + 1, fim);
  }

  // Troca os __NOME__ numa passada só, para o conteúdo dos valores nunca ser reinterpretado.
  function preencher(corpo, valores) {
    const usados = new Set();
    const saida = corpo.replace(/__([A-Z]+(?:_[A-Z]+)*)__/g, (_, nome) => {
      if (!Object.prototype.hasOwnProperty.call(valores, nome)) {
        throw new Error(`Marcador sem valor: ${nome}`);
      }
      usados.add(nome);
      return valores[nome];
    });
    const sobras = Object.keys(valores).filter(n => !usados.has(n));
    if (sobras.length) throw new Error(`Valor sem marcador no modelo: ${sobras.join(", ")}`);
    return saida;
  }

  function validarInclusao({ empresa, tipo, data, contratos }) {
    const faltas = [];
    if (!config.EMPRESAS.some(e => e.codigo === empresa)) faltas.push("Escolha a empresa.");
    if (!Object.prototype.hasOwnProperty.call(config.TIPOS, tipo)) faltas.push("Escolha o tipo de contrato.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data || "")) faltas.push("Informe a data de pagamento.");
    if (!contratos || !contratos.length) faltas.push("Marque ao menos um contrato para incluir.");
    return faltas;
  }

  function montarInclusao({ empresa, tipo, data, dryRun, contratos }) {
    const emp = config.EMPRESAS.find(e => e.codigo === empresa);
    if (!emp) throw new Error(`Empresa desconhecida: ${empresa}`);
    const t = config.TIPOS[tipo];
    if (!t) throw new Error(`Tipo de contrato desconhecido: ${tipo}`);
    return preencher(extrairCorpo(modelos.inclusao), {
      EMPRESA: JSON.stringify(`${emp.codigo} - ${emp.nome}`),
      EMP_ID: JSON.stringify(emp.empId),
      TIPO: JSON.stringify(t.caminho),
      DATA_PAGTO: JSON.stringify(data),
      DRY_RUN: dryRun ? "true" : "false",
      CONTRATOS: JSON.stringify(contratos, null, 2).replace(/\n/g, "\n  "),
    });
  }

  const codigosManter = manter => String(manter || "").split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);

  function validarHedges({ manter } = {}) {
    return codigosManter(manter).length ? [] : ["Informe ao menos uma IMP para manter."];
  }

  function montarHedges({ manter, dryRun, timeoutMs = 30000, pausaMs = 400 }) {
    for (const [nome, v] of [["timeoutMs", timeoutMs], ["pausaMs", pausaMs]]) {
      if (!Number.isFinite(Number(v)) || Number(v) < 0) throw new Error(`${nome} inválido: ${v}`);
    }
    return preencher(extrairCorpo(modelos.hedges), {
      MANTER: JSON.stringify(String(manter || "")),
      DRY_RUN: dryRun ? "true" : "false",
      TIMEOUT_RECARGA_MS: String(Number(timeoutMs)),
      PAUSA_MS: String(Number(pausaMs)),
    });
  }

  function montarPrevisoes({ dryRun }) {
    return preencher(extrairCorpo(modelos.previsoes), { DRY_RUN: dryRun ? "true" : "false" });
  }

  exportar({ extrairCorpo, preencher, validarInclusao, montarInclusao,
             validarHedges, montarHedges, montarPrevisoes });
})(function (api) {
  if (typeof module !== "undefined" && module.exports) Object.assign(module.exports, api);
  else Object.assign(window.Painel, api);
});
