const test = require("node:test");
const assert = require("node:assert/strict");
const { montarInclusao, preencher, validarInclusao } = require("../../painel/js/gerador.js");

test("monta inclusão com os valores da configuração", () => {
  const s = montarInclusao({ empresa: "BR22", tipo: "HEDGE", data: "2026-11-05", dryRun: true,
    contratos: [{ num_contrato: "1", moeda: "USD", valor: "1,00", fornecedor: "X", arquivo: "a.pdf" }] });
  assert.match(s, /const EMP_ID\s*=\s*"6";/);
  assert.match(s, /const TIPO\s*=\s*"hedge";/);
  assert.match(s, /const DATA_PAGTO\s*=\s*"2026-11-05";/);
  assert.match(s, /const DRY_RUN\s*=\s*true;/);
  assert.doesNotMatch(s, /__[A-Z_]+__/);
  new Function(s);   // sintaxe válida
});
test("preenche valores com caracteres especiais", () => {
  const forn = 'A "B" \\ `C` ${D} </script> É';
  const s = montarInclusao({ empresa: "BR21", tipo: "TERCEIROS", data: "2026-11-05", dryRun: true,
    contratos: [{ num_contrato: "1", moeda: "EUR", valor: "1,00", fornecedor: forn, arquivo: "a.pdf" }] });
  new Function(s);
  const lit = s.match(/const CONTRATOS = (\[[\s\S]*?\n  \]);/)[1];
  assert.equal(JSON.parse(lit)[0].fornecedor, forn);
});
test("preencher recusa marcador sem valor e valor sem uso", () => {
  assert.throws(() => preencher("a __X__", {}), /X/);
  assert.throws(() => preencher("a", { Y: "1" }), /Y/);
});
test("validarInclusao lista o que falta", () => {
  assert.deepEqual(validarInclusao({ empresa: "", tipo: "", data: "", contratos: [] }).length, 4);
  assert.deepEqual(validarInclusao({ empresa: "BR21", tipo: "HEDGE", data: "2026-11-05",
    contratos: [{ num_contrato: "1", moeda: "USD", valor: "1,00", fornecedor: "X" }] }), []);
});
test("extrairCorpo exige os dois marcadores", () => {
  const { extrairCorpo } = require("../../painel/js/gerador.js");
  assert.throws(() => extrairCorpo(function () { /* sem marcadores */ }), /marcador/i);
});
test("montarHedges gera script sem marcadores e com sintaxe válida", () => {
  const { montarHedges } = require("../../painel/js/gerador.js");
  const manter = 'DEMO-0716/26-WEB-1\n602; "X" `Y` ${Z} \\';
  const s = montarHedges({ manter, dryRun: false, timeoutMs: 5000, pausaMs: 100 });
  assert.doesNotMatch(s, /__[A-Z_]+__/);
  assert.match(s, /const DRY_RUN = false;/);
  assert.match(s, /const TIMEOUT_RECARGA_MS = 5000;/);
  assert.match(s, /const PAUSA_MS = 100;/);
  assert.match(s, /const URL_INICIAL = location\.href;/);
  assert.equal(JSON.parse(s.match(/const MANTER = (".*");/)[1]), manter);
  new Function(s);
  const padrao = montarHedges({ manter: "A", dryRun: true });
  assert.match(padrao, /const DRY_RUN = true;/);
  assert.match(padrao, /const TIMEOUT_RECARGA_MS = 30000;/);
  assert.match(padrao, /const PAUSA_MS = 400;/);
  new Function(padrao);
});
test("montarPrevisoes gera script sem marcadores e com sintaxe válida", () => {
  const { montarPrevisoes } = require("../../painel/js/gerador.js");
  for (const dryRun of [true, false]) {
    const s = montarPrevisoes({ dryRun });
    assert.doesNotMatch(s, /__[A-Z_]+__/);
    assert.match(s, new RegExp(`const DRY_RUN = ${dryRun};`));
    new Function(s);
  }
});
test("validarHedges exige ao menos um código em MANTER", () => {
  const { validarHedges } = require("../../painel/js/gerador.js");
  assert.equal(validarHedges({ manter: " \n ; " }).length, 1);
  assert.equal(validarHedges({ manter: "" }).length, 1);
  assert.equal(validarHedges({}).length, 1);
  assert.deepEqual(validarHedges({ manter: " , DEMO-1 ;" }), []);
});
const GRUPOS_TESTE = [
  { data: "2026-12-01", codigos: ["DEMO-1001/26-WEB-1", 'X"Y`Z${W}\\'] },
  { data: "2026-12-08", codigos: ["DEMO-1003/26-WEB-2"] },
];
test("montarDatasHedge gera script sem marcadores, com PASSO e EMP_ID certos", () => {
  const { montarDatasHedge } = require("../../painel/js/gerador.js");
  const casos = [
    { empresa: "BR21", tipo: "NOVOS", passo: "Passo01a", empId: "4" },
    { empresa: "BR22", tipo: "EXPIRADOS", passo: "Passo01b", empId: "6" },
  ];
  for (const c of casos) {
    for (const dryRun of [true, false]) {
      const s = montarDatasHedge({ empresa: c.empresa, tipo: c.tipo, grupos: GRUPOS_TESTE, dryRun });
      assert.doesNotMatch(s, /__[A-Z_]+__/);
      assert.match(s, new RegExp(`const PASSO = "${c.passo}";`));
      assert.match(s, new RegExp(`const EMP_ID = "${c.empId}";`));
      assert.match(s, new RegExp(`const DRY_RUN = ${dryRun};`));
      assert.match(s, /const TIMEOUT_RECARGA_MS = 30000;/);
      assert.match(s, /const PAUSA_MS = 400;/);
      const lit = s.match(/const GRUPOS = (\[[\s\S]*?\n  \]);/)[1];
      assert.deepEqual(JSON.parse(lit), GRUPOS_TESTE);
      new Function(s);
    }
  }
  const curto = montarDatasHedge({ empresa: "BR02", tipo: "EXPIRADOS", grupos: GRUPOS_TESTE, dryRun: false,
    timeoutMs: 5000, pausaMs: 100 });
  assert.match(curto, /const EMP_ID = "3";/);
  assert.match(curto, /const TIMEOUT_RECARGA_MS = 5000;/);
  assert.match(curto, /const PAUSA_MS = 100;/);
  assert.throws(() => montarDatasHedge({ empresa: "BR99", tipo: "NOVOS", grupos: GRUPOS_TESTE, dryRun: true }), /Empresa/);
  assert.throws(() => montarDatasHedge({ empresa: "BR21", tipo: "X", grupos: GRUPOS_TESTE, dryRun: true }), /Tipo/);
  assert.throws(() => montarDatasHedge({ empresa: "BR21", tipo: "NOVOS", grupos: [{ data: "16/11/2026", codigos: ["A"] }],
    dryRun: true }), /data/i);
});
test("validarDatasHedge lista o que falta", () => {
  const { validarDatasHedge } = require("../../painel/js/gerador.js");
  assert.equal(validarDatasHedge({ empresa: "", tipo: "", grupos: [] }).length, 3);
  assert.equal(validarDatasHedge({}).length, 3);
  assert.equal(validarDatasHedge({ empresa: "BR21", tipo: "NOVOS", grupos: [{ data: "2026-12-01", codigos: [] }] }).length, 1);
  assert.deepEqual(validarDatasHedge({ empresa: "BR21", tipo: "NOVOS", grupos: GRUPOS_TESTE }), []);
});
