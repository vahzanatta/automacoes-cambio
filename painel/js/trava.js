(function (exportar) {
  // Assinatura estável: chaves ordenadas em todos os níveis; ordem dos arrays mantida.
  function normalizar(v) {
    if (Array.isArray(v)) return v.map(normalizar);
    if (v && typeof v === "object") {
      const saida = {};
      Object.keys(v).sort().forEach(k => { saida[k] = normalizar(v[k]); });
      return saida;
    }
    return v;
  }

  function assinatura(dados) {
    return JSON.stringify(normalizar(dados));
  }

  // Guarda só a última assinatura simulada: a execução é liberada apenas para os mesmos dados.
  function criarTrava() {
    let ultima = null;
    return {
      // Só assinaturas em string contam: undefined/null/objetos nunca liberam a execução.
      registrarSimulacao(ass) { if (typeof ass === "string") ultima = ass; },
      liberada(ass) { return typeof ass === "string" && ultima !== null && ultima === ass; },
    };
  }

  exportar({ assinatura, criarTrava });
})(function (api) {
  if (typeof module !== "undefined" && module.exports) Object.assign(module.exports, api);
  else Object.assign(window.Painel, api);
});
