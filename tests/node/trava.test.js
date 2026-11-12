const test = require("node:test");
const assert = require("node:assert/strict");
const { assinatura, criarTrava } = require("../../painel/js/trava.js");

test("assinatura ignora ordem das chaves", () =>
  assert.equal(assinatura({ a: 1, b: [1, { d: 2, c: 3 }] }), assinatura({ b: [1, { c: 3, d: 2 }], a: 1 })));
test("trava", () => {
  const t = criarTrava();
  assert.equal(t.liberada("X"), false);
  t.registrarSimulacao("X");
  assert.equal(t.liberada("X"), true);
  assert.equal(t.liberada("Y"), false);     // mudou algo: bloqueia
  t.registrarSimulacao("Y");
  assert.equal(t.liberada("X"), false);     // só a última simulação vale
});
test("assinatura mantém a ordem dos arrays", () =>
  assert.notEqual(assinatura([1, 2]), assinatura([2, 1])));
test("valor não-string nunca libera a execução", () => {
  const t = criarTrava();
  t.registrarSimulacao(undefined);
  assert.equal(t.liberada(undefined), false);
  t.registrarSimulacao(null);
  assert.equal(t.liberada(null), false);
});
