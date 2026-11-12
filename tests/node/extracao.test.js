const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ex = require("../../painel/js/extracao.js");

const casos = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "fixtures", "textos_pdf.json"), "utf8")
);

for (const c of casos) {
  test(`extrairDados: ${c.nome}`, () => {
    assert.deepStrictEqual(ex.extrairDados(c.texto), c.esperado);
  });
}

test("valorBrValido", () => {
  assert.strictEqual(ex.valorBrValido("1.234,56"), true);
  assert.strictEqual(ex.valorBrValido("1234,56"), true);
  assert.strictEqual(ex.valorBrValido("1234.56"), false);
  assert.strictEqual(ex.valorBrValido("1,2"), false);
  assert.strictEqual(ex.valorBrValido(""), false);
});

test("moedaValida e contratoValido", () => {
  assert.strictEqual(ex.moedaValida("USD"), true);
  assert.strictEqual(ex.moedaValida("usd"), false);
  assert.strictEqual(ex.contratoValido("123"), true);
  assert.strictEqual(ex.contratoValido("12a"), false);
  assert.strictEqual(ex.contratoValido(null), false);
});

test("contratoCompleto", () => {
  const ok = { num_contrato: "1", moeda: "USD", valor: "1,00", fornecedor: "X" };
  assert.strictEqual(ex.contratoCompleto(ok), true);
  assert.strictEqual(ex.contratoCompleto({ ...ok, fornecedor: "  " }), false);
  assert.strictEqual(ex.contratoCompleto({ ...ok, fornecedor: null }), false);
  assert.strictEqual(ex.contratoCompleto({ ...ok, valor: "1.00" }), false);
});

test("montarLinhas agrupa por altura", () => {
  const it = (str, x, y) => ({ str, width: 5, transform: [10, 0, 0, 10, x, y] });
  assert.strictEqual(
    ex.montarLinhas([it("C", 10, 700), it("B", 30, 800), it("A", 10, 800.5), it(" ", 50, 800)]),
    "A B\nC"
  );
});
