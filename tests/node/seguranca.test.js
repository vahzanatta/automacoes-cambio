// pdf.js: SRI nas tags do cdnjs e getDocument sem eval.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "..", "painel", "painel.html"), "utf8");

test("as tags do pdf.js no cdnjs têm integrity sha384 e crossorigin anonymous", () => {
  const tags = html.match(/<script\b[^>]*\bsrc="https:\/\/cdnjs\.cloudflare\.com\/[^"]*"[^>]*>/g) || [];
  const srcs = tags.map(t => t.match(/src="([^"]*)"/)[1]);
  assert.deepStrictEqual(srcs, [
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  ]);
  for (const t of tags) {
    assert.match(t, /\bintegrity="sha384-[A-Za-z0-9+/]{64}"/, t);
    assert.match(t, /\bcrossorigin="anonymous"/, t);
  }
  // Nenhum outro script externo sem integrity
  const externos = html.match(/<script\b[^>]*\bsrc="https?:[^"]*"[^>]*>/g) || [];
  assert.strictEqual(externos.length, tags.length);
});

test("extrairTextoPdf chama getDocument com isEvalSupported: false", async () => {
  const chamadas = [];
  global.pdfjsLib = {
    getDocument(opcoes) {
      chamadas.push(opcoes);
      return { promise: Promise.resolve({ numPages: 0 }) };
    },
  };
  try {
    const { extrairTextoPdf } = require("../../painel/js/extracao.js");
    const arquivo = { arrayBuffer: async () => new ArrayBuffer(4) };
    assert.strictEqual(await extrairTextoPdf(arquivo), "");
    assert.strictEqual(chamadas.length, 1);
    assert.strictEqual(chamadas[0].isEvalSupported, false);
    assert.ok(chamadas[0].data instanceof ArrayBuffer);
  } finally {
    delete global.pdfjsLib;
  }
});
