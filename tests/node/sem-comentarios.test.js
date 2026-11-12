const test = require("node:test");
const assert = require("node:assert/strict");
const { montarInclusao, montarHedges, montarPrevisoes, montarDatasHedge } = require("../../painel/js/gerador.js");

// As orientações de uso ficam na interface do painel; o script gerado é só código.
// Os dados de teste não têm "//" nem "/*", então qualquer ocorrência é comentário.
function semComentarios(nome, script) {
  const linhas = script.split("\n")
    .map((l, i) => `${i + 1}: ${l}`)
    .filter(l => /\/\/|\/\*/.test(l.slice(l.indexOf(":") + 1)));
  assert.deepEqual(linhas, [], `${nome} ainda tem comentários`);
  new Function(script);
}

for (const dryRun of [true, false]) {
  const modo = dryRun ? "simulação" : "execução";
  test(`inclusão sem comentários (${modo})`, () => {
    semComentarios("inclusão", montarInclusao({ empresa: "BR21", tipo: "TERCEIROS", data: "2026-11-05",
      dryRun, contratos: [{ num_contrato: "1", moeda: "USD", valor: "1,00", fornecedor: "X", arquivo: "a.pdf" }] }));
  });
  test(`hedges sem comentários (${modo})`, () => {
    semComentarios("hedges", montarHedges({ manter: "A-1\nB-2", dryRun }));
  });
  test(`previsões sem comentários (${modo})`, () => {
    semComentarios("previsões", montarPrevisoes({ dryRun }));
  });
  test(`datas dos hedges sem comentários (${modo})`, () => {
    semComentarios("datas dos hedges", montarDatasHedge({ empresa: "BR21", tipo: "NOVOS", dryRun,
      grupos: [{ data: "2026-12-01", codigos: ["A-1", "B-2"] }, { data: "2026-12-08", codigos: ["C-3"] }] }));
  });
}
