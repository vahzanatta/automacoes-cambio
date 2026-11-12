// Gera os scripts de teste em tests/saida/ e os PDFs sintéticos em tests/saida/pdfs/
// (com tests/saida/pdfs/esperado.json). Só dados sintéticos. Rode: node tests/gerar_scripts_teste.js
const fs = require("fs");
const path = require("path");
const { montarInclusao, montarHedges, montarPrevisoes } = require("../painel/js/gerador.js");

const SAIDA = path.join(__dirname, "saida");
const PDFS = path.join(SAIDA, "pdfs");

// num_contrato (como no PDF, com zero à esquerda), moeda, valor, fornecedor
const CONTRATOS = [
  ["0111111111", "EUR", "21.500,00", "ALFA BISCUITS"],
  ["0222222222", "USD", "150.000,00", "BETA TRADING CO., LTD."],
  ["0333333333", "USD", "10.000,00", "GAMA INC - XXXXUS00XXX"],
  ["0444444444", "USD", "5.000,00", "DELTA LLC"],
  ["0555555555", "EUR", "9.999,99", "EPSILON SPA"],
  ["0666666666", "USD", "7.000,00", "ZETA LTD"],
];

// IMPs que ficam no "Hedge - Passo 02" do portal simulado: uma pelo código, outra pelo IMP_ID
const MANTER = "DEMO-0716/26-WEB-1\n602";
// Na simulação, mais um código que não está na página e parece HTML: o aviso na página
// tem de mostrá-lo como texto
const MANTER_SIM = MANTER + "\n<b>nao-existe</b>";
// Nenhum código está na página: a Execução tem de abortar sem remover nada
const MANTER_NENHUMA = "NAO-EXISTE-1\nNAO-EXISTE-2";

const escaparPdf = t => t.replace(/[\\()]/g, c => "\\" + c);

// Porte do fazer_pdf do antigo tests/gerar.py: uma página, Helvetica, texto em latin1.
function fazerPdf(caminho, linhas) {
  let y = 700;
  const partes = [Buffer.from("BT /F1 10 Tf\n", "latin1")];
  for (const texto of linhas) {
    partes.push(Buffer.from(`1 0 0 1 72 ${y} Tm (${escaparPdf(texto)}) Tj\n`, "latin1"));
    y -= 14;
  }
  partes.push(Buffer.from("ET", "latin1"));
  const conteudo = Buffer.concat(partes);
  const objs = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R " +
                "/Resources << /Font << /F1 5 0 R >> >> >>"),
    Buffer.concat([Buffer.from(`<< /Length ${conteudo.length} >>\nstream\n`), conteudo, Buffer.from("\nendstream")]),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
  ];
  let out = Buffer.from("%PDF-1.4\n");
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out = Buffer.concat([out, Buffer.from(`${i + 1} 0 obj\n`), o, Buffer.from("\nendobj\n")]);
  });
  const xref = out.length;
  const tabela = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offs.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("") +
    `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  fs.writeFileSync(caminho, Buffer.concat([out, Buffer.from(tabela)]));
}

function prepararPdfs() {
  fs.rmSync(PDFS, { recursive: true, force: true });
  fs.mkdirSync(PDFS, { recursive: true });
  const esperado = {};
  const contratos = [];
  CONTRATOS.forEach(([num, moeda, valor, forn], i) => {
    const nome = `${num.replace(/^0+/, "")} - Contratação.` + (i === 1 ? "PDF" : "pdf");  // um com extensão maiúscula
    fazerPdf(path.join(PDFS, nome), [
      "Número do Contrato de Câmbio", num,
      "Código Moeda", moeda,
      "Valor em moeda estrangeira", valor,
      "Pagador/Recebedor no exterior", forn,
    ]);
    const dados = { num_contrato: num.replace(/^0+/, ""), moeda, valor, fornecedor: forn };
    esperado[nome] = dados;
    contratos.push({ ...dados, arquivo: nome });
  });
  // PDF incompleto (sem fornecedor) e arquivo que não é PDF: o painel deve ignorá-los com aviso.
  // O "_" no início faz a ordem por code point (sorted() do Python) diferir da ordem do
  // localeCompare: em code point ele fica depois dos dígitos; no localeCompare, antes.
  const incompleto = "_777777777 - incompleto.pdf";
  fazerPdf(path.join(PDFS, incompleto), [
    "Número do Contrato de Câmbio", "0777777777", "Código Moeda", "USD",
    "Valor em moeda estrangeira", "1,00",
  ]);
  esperado[incompleto] = { num_contrato: "777777777", moeda: "USD", valor: "1,00", fornecedor: null };
  fs.writeFileSync(path.join(PDFS, "leia-me.txt"), "nao sou pdf");
  fs.writeFileSync(path.join(PDFS, "esperado.json"), JSON.stringify(esperado, null, 2), "utf8");
  return contratos;
}

function main() {
  fs.mkdirSync(SAIDA, { recursive: true });
  for (const f of fs.readdirSync(SAIDA)) if (f.endsWith(".js")) fs.rmSync(path.join(SAIDA, f));
  const contratos = prepararPdfs();
  const scripts = {
    "terceiros_sim.js": montarInclusao({ empresa: "BR21", tipo: "TERCEIROS", data: "2026-11-05", dryRun: true, contratos }),
    "terceiros_gravar.js": montarInclusao({ empresa: "BR21", tipo: "TERCEIROS", data: "2026-11-05", dryRun: false, contratos }),
    "hedge_gravar.js": montarInclusao({ empresa: "BR21", tipo: "HEDGE", data: "2026-11-05", dryRun: false, contratos }),
    "terceiros_data_errada.js": montarInclusao({ empresa: "BR21", tipo: "TERCEIROS", data: "2026-10-15", dryRun: false, contratos }),
    "hedges_sim.js": montarHedges({ manter: MANTER_SIM, dryRun: true }),
    "hedges_exec.js": montarHedges({ manter: MANTER, dryRun: false, timeoutMs: 10000, pausaMs: 100 }),
    "hedges_exec_nenhuma.js": montarHedges({ manter: MANTER_NENHUMA, dryRun: false, timeoutMs: 10000, pausaMs: 100 }),
    "previsoes_sim.js": montarPrevisoes({ dryRun: true }),
    "previsoes_exec.js": montarPrevisoes({ dryRun: false }),
  };
  for (const [nome, texto] of Object.entries(scripts)) fs.writeFileSync(path.join(SAIDA, nome), texto, "utf8");
  console.log("Gerados em tests/saida:", Object.keys(scripts).join(", "));
  console.log("PDFs em tests/saida/pdfs:", fs.readdirSync(PDFS).join(", "));
}

if (require.main === module) main();
module.exports = { fazerPdf };
