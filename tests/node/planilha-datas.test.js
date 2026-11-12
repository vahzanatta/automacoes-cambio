const test = require("node:test");
const assert = require("node:assert/strict");
const { lerPlanilhaDatas, formatarDataBr } = require("../../painel/js/planilha-datas.js");

test("cola do Excel com cabeçalho", () => {
  const r = lerPlanilhaDatas("Código IMP\tData\nDEMO-0001/26-WEB-1\t16/11/2026\ndemo-0002/26-web-1\t25/11/2026\n\nDEMO-0003/26-WEB-1\t16/11/2026\n");
  assert.deepEqual(r.problemas, []);
  assert.deepEqual(r.grupos, [
    { data: "2026-11-16", codigos: ["DEMO-0001/26-WEB-1", "DEMO-0003/26-WEB-1"] },
    { data: "2026-11-25", codigos: ["DEMO-0002/26-WEB-1"] },
  ]);
});
test("separadores ; e espaços, data ISO", () => {
  const r = lerPlanilhaDatas("A-1;2026-11-16\nB-2   16/11/2026");
  assert.deepEqual(r.itens, [{ codigo: "A-1", data: "2026-11-16" }, { codigo: "B-2", data: "2026-11-16" }]);
});
test("problemas", () => {
  const r = lerPlanilhaDatas("A-1\t31/02/2026\nB-2\nC-3\t16/11/2026\nC-3\t25/11/2026\nD-4\t16/11/2026\nD-4\t16/11/2026");
  assert.deepEqual(r.problemas.map(p => [p.linha, p.motivo]), [
    [1, "data inválida"], [2, "falta a data"],
    [3, "código repetido com datas diferentes"], [4, "código repetido com datas diferentes"],
  ]);
  assert.deepEqual(r.itens, [{ codigo: "D-4", data: "2026-11-16" }]);
});
test("calendário real: 29/02/2028 vale, 29/02/2026 não", () => {
  const r = lerPlanilhaDatas("A-1\t29/02/2028\nB-2\t29/02/2026");
  assert.deepEqual(r.itens, [{ codigo: "A-1", data: "2028-02-29" }]);
  assert.deepEqual(r.problemas.map(p => [p.linha, p.motivo]), [[2, "data inválida"]]);
});
test("data com horário: data inválida com a dica", () => {
  const r = lerPlanilhaDatas("A-1\t16/11/2026 00:00\nB-2\t2026-11-16 08:30:00\nC-3\t16/11/2026\nD-4\tamanhã");
  assert.deepEqual(r.problemas.map(p => [p.linha, p.motivo]), [
    [1, "data inválida (tem horário; use só a data)"],
    [2, "data inválida (tem horário; use só a data)"],
    [4, "data inválida"],
  ]);
  assert.deepEqual(r.itens, [{ codigo: "C-3", data: "2026-11-16" }]);
});
test("formatarDataBr", () => assert.equal(formatarDataBr("2026-11-16"), "16/11/2026"));
test("PASSOS_HEDGE", () => {
  const { PASSOS_HEDGE } = require("../../painel/js/config.js");
  assert.deepEqual(PASSOS_HEDGE, {
    NOVOS: { rotulo: "Hedges Novos", passo: "Passo01a" },
    EXPIRADOS: { rotulo: "Hedges Expirados", passo: "Passo01b" },
  });
});
