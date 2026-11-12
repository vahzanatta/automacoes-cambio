(function (exportar) {
  // Converte DD/MM/AAAA ou AAAA-MM-DD em AAAA-MM-DD (calendário real); null se inválida.
  function normalizarData(campo) {
    let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(campo);
    let d, mes, a;
    if (m) { d = +m[1]; mes = +m[2]; a = +m[3]; }
    else {
      m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(campo);
      if (!m) return null;
      a = +m[1]; mes = +m[2]; d = +m[3];
    }
    if (mes < 1 || mes > 12 || d < 1) return null;
    const diasNoMes = [31, (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0 ? 29 : 28,
      31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];
    if (d > diasNoMes) return null;
    const p = n => String(n).padStart(2, "0");
    return `${String(a).padStart(4, "0")}-${p(mes)}-${p(d)}`;
  }

  function formatarDataBr(iso) {
    const [a, m, d] = iso.split("-");
    return `${d}/${m}/${a}`;
  }

  function lerPlanilhaDatas(texto) {
    const problemas = [];
    const validas = []; // { linha, codigo, data }
    const linhas = String(texto || "").split(/\r\n|\r|\n/);
    let primeira = true;
    linhas.forEach((bruta, i) => {
      if (!bruta.trim()) return;
      const campos = bruta.split(/[\t;\s]+/).filter(c => c !== "");
      const ehPrimeira = primeira;
      primeira = false;
      const data = campos.length > 1 ? normalizarData(campos[campos.length - 1]) : null;
      if (ehPrimeira && !data && !/\d/.test(campos[0])) return; // cabeçalho
      if (campos.length < 2) {
        problemas.push({ linha: i + 1, texto: bruta, motivo: "falta a data" });
      } else if (!data) {
        const temHorario = campos.length > 2 && /^\d{1,2}:\d{2}(:\d{2})?$/.test(campos[campos.length - 1]);
        problemas.push({ linha: i + 1, texto: bruta,
          motivo: temHorario ? "data inválida (tem horário; use só a data)" : "data inválida" });
      } else {
        validas.push({ linha: i + 1, texto: bruta, codigo: campos[0].toUpperCase(), data });
      }
    });

    const datasPorCodigo = new Map();
    for (const v of validas) {
      if (!datasPorCodigo.has(v.codigo)) datasPorCodigo.set(v.codigo, new Set());
      datasPorCodigo.get(v.codigo).add(v.data);
    }
    const itens = [];
    const vistos = new Set();
    for (const v of validas) {
      if (datasPorCodigo.get(v.codigo).size > 1) {
        problemas.push({ linha: v.linha, texto: v.texto, motivo: "código repetido com datas diferentes" });
      } else if (!vistos.has(v.codigo)) {
        vistos.add(v.codigo);
        itens.push({ codigo: v.codigo, data: v.data });
      }
    }
    problemas.sort((x, y) => x.linha - y.linha);

    const porData = new Map();
    for (const it of itens) {
      if (!porData.has(it.data)) porData.set(it.data, []);
      porData.get(it.data).push(it.codigo);
    }
    const grupos = [...porData.keys()].sort().map(data => ({ data, codigos: porData.get(data) }));
    return { itens, grupos, problemas };
  }

  exportar({ lerPlanilhaDatas, formatarDataBr });
})(function (api) {
  if (typeof module !== "undefined" && module.exports) Object.assign(module.exports, api);
  else Object.assign(window.Painel, api);
});
