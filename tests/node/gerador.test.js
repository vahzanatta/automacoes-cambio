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
