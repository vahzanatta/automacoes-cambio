import json
import re
import subprocess
import unittest
from pathlib import Path

import automacao_timp

RAIZ = Path(__file__).resolve().parent.parent

SCRIPT_NODE = """
const { montarInclusao } = require('./painel/js/gerador.js');
const dados = JSON.parse(require('fs').readFileSync(0, 'utf8'));
process.stdout.write(montarInclusao(dados), 'utf8');
"""


class GeradorIgualAoPainel(unittest.TestCase):
    def test_gerado_igual_ao_painel(self):
        contratos = [
            {"num_contrato": "123", "moeda": "USD", "valor": "1.000,50",
             "fornecedor": 'ACME "Ltda" \\ ${X} É', "arquivo": "a.pdf"},
            {"num_contrato": "456", "moeda": "EUR", "valor": "2,00",
             "fornecedor": "Outra", "arquivo": "b.pdf"},
        ]
        python = automacao_timp.gerar_javascript(
            contratos, "BR21", "TERCEIROS", "2026-11-05", True
        )
        entrada = json.dumps(
            {"empresa": "BR21", "tipo": "TERCEIROS", "data": "2026-11-05",
             "dryRun": True, "contratos": contratos}
        )
        r = subprocess.run(
            ["node", "-e", SCRIPT_NODE], input=entrada.encode("utf-8"),
            capture_output=True, cwd=RAIZ, check=True,
        )
        self.assertEqual(python, r.stdout.decode("utf-8"))


SCRIPT_NODE_TABELAS = """
const { EMPRESAS, TIPOS } = require('./painel/js/config.js');
process.stdout.write(JSON.stringify({ EMPRESAS, TIPOS }), 'utf8');
"""


class TabelasIguaisAoPainel(unittest.TestCase):
    """EMPRESAS / TIPOS_CONTRATO do Python e as tabelas de painel/js/config.js concordam."""

    def test_empresas_e_tipos(self):
        r = subprocess.run(
            ["node", "-e", SCRIPT_NODE_TABELAS], capture_output=True, cwd=RAIZ,
        )
        self.assertEqual(r.returncode, 0, r.stderr.decode("utf-8", "replace"))
        js = json.loads(r.stdout.decode("utf-8"))
        empresas_js = {e["codigo"]: (e["nome"], e["empId"]) for e in js["EMPRESAS"]}
        self.assertEqual(len(empresas_js), len(js["EMPRESAS"]), "código de empresa repetido no config.js")
        self.assertEqual(empresas_js, automacao_timp.EMPRESAS)
        tipos_js = {k: v["caminho"] for k, v in js["TIPOS"].items()}
        self.assertEqual(tipos_js, automacao_timp.TIPOS_CONTRATO)


class ListaDeCenarios(unittest.TestCase):
    """O runner de integração confere a lista exata de cenários de tests/integracao/cenarios.js."""

    def setUp(self):
        import sys
        sys.path.insert(0, str(RAIZ / "tests"))
        import rodar_integracao
        self.ri = rodar_integracao

    def test_esperados_sao_os_do_cenarios_js(self):
        texto = (RAIZ / "tests" / "integracao" / "cenarios.js").read_text(encoding="utf-8")
        nomes = re.findall(r'^\s*nome: "([a-z_]+)",', texto, re.M)
        self.assertEqual(nomes, self.ri.CENARIOS_ESPERADOS)

    def test_conferir_nomes(self):
        certos = [{"nome": n, "ok": True} for n in self.ri.CENARIOS_ESPERADOS]
        self.assertIsNone(self.ri.conferir_nomes(certos))
        self.assertIsNotNone(self.ri.conferir_nomes(certos[:-1]))            # um sumiu
        self.assertIsNotNone(self.ri.conferir_nomes(certos + [{"nome": "x"}]))  # um a mais
        self.assertIsNotNone(self.ri.conferir_nomes(certos[::-1]))          # outra ordem


class ExtracaoDeTexto(unittest.TestCase):
    def test_casos_da_fixture(self):
        caminho = RAIZ / "tests" / "fixtures" / "textos_pdf.json"
        casos = json.loads(caminho.read_text(encoding="utf-8"))
        self.assertGreaterEqual(len(casos), 6)
        for caso in casos:
            with self.subTest(caso["nome"]):
                self.assertEqual(
                    automacao_timp.extrair_dados_texto(caso["texto"]), caso["esperado"]
                )


SCRIPT_NODE_VALIDACAO = """
const { contratoCompleto } = require('./painel/js/extracao.js');
const casos = JSON.parse(require('fs').readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(casos.map(c => contratoCompleto(c))), 'utf8');
"""

CASOS_VALIDACAO = [
    {"num_contrato": "123", "moeda": "USD", "valor": "1.234,56", "fornecedor": "A"},
    {"num_contrato": "123", "moeda": "USD", "valor": "1234,56", "fornecedor": "A"},
    {"num_contrato": "123", "moeda": "USD", "valor": "1234.56", "fornecedor": "A"},
    {"num_contrato": "123", "moeda": "USD", "valor": "1.234.56", "fornecedor": "A"},
    {"num_contrato": "123", "moeda": "USD", "valor": "1,2", "fornecedor": "A"},
    {"num_contrato": "123", "moeda": "usd", "valor": "1,00", "fornecedor": "A"},
    {"num_contrato": "123", "moeda": "US", "valor": "1,00", "fornecedor": "A"},
    {"num_contrato": "12a", "moeda": "USD", "valor": "1,00", "fornecedor": "A"},
    {"num_contrato": "123", "moeda": "USD", "valor": "1,00", "fornecedor": "   "},
    {"num_contrato": None, "moeda": "USD", "valor": "1,00", "fornecedor": "A"},
]


class ValidacaoIgualAoPainel(unittest.TestCase):
    """O Python só aceita um contrato quando o painel também aceitaria (contratoCompleto)."""

    def test_contrato_completo(self):
        r = subprocess.run(
            ["node", "-e", SCRIPT_NODE_VALIDACAO],
            input=json.dumps(CASOS_VALIDACAO).encode("utf-8"),
            capture_output=True, cwd=RAIZ,
        )
        self.assertEqual(r.returncode, 0, r.stderr.decode("utf-8", "replace"))
        esperado = json.loads(r.stdout.decode("utf-8"))
        self.assertEqual(esperado[:2], [True, True])          # sanidade dos casos
        self.assertEqual([automacao_timp.contrato_completo(c) for c in CASOS_VALIDACAO], esperado)


class PontaAPonta(unittest.TestCase):
    """main() lê a pasta de PDFs sintéticos e grava o mesmo script que o painel geraria."""

    def setUp(self):
        import tempfile
        subprocess.run(["node", "tests/gerar_scripts_teste.js"], cwd=RAIZ, check=True,
                       capture_output=True)
        self.pdfs = RAIZ / "tests" / "saida" / "pdfs"
        self.tmp = Path(tempfile.mkdtemp())
        self.antigos = {k: getattr(automacao_timp, k) for k in
                        ("PASTA_ENTRADA", "EMPRESA", "TIPO_CONTRATO", "DATA_PAGAMENTO",
                         "DRY_RUN", "ARQUIVO_SAIDA_JS")}
        automacao_timp.PASTA_ENTRADA = str(self.pdfs)
        automacao_timp.EMPRESA = "BR22"
        automacao_timp.TIPO_CONTRATO = "HEDGE"
        automacao_timp.DATA_PAGAMENTO = "2026-11-05"
        automacao_timp.DRY_RUN = True
        automacao_timp.ARQUIVO_SAIDA_JS = str(self.tmp / "saida.js")

    def tearDown(self):
        import shutil
        for k, v in self.antigos.items():
            setattr(automacao_timp, k, v)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_main_gera_o_script_do_painel(self):
        import contextlib
        import io
        with contextlib.redirect_stdout(io.StringIO()):
            automacao_timp.main()
        gerado = (self.tmp / "saida.js").read_text(encoding="utf-8")

        esperado_json = json.loads((self.pdfs / "esperado.json").read_text(encoding="utf-8"))
        contratos = [dict(d, arquivo=nome) for nome, d in sorted(esperado_json.items())
                     if automacao_timp.contrato_completo(d)]
        self.assertGreaterEqual(len(contratos), 5)
        self.assertNotIn("_777777777 - incompleto.pdf", [c["arquivo"] for c in contratos])

        entrada = json.dumps({"empresa": "BR22", "tipo": "HEDGE", "data": "2026-11-05",
                              "dryRun": True, "contratos": contratos})
        r = subprocess.run(["node", "-e", SCRIPT_NODE], input=entrada.encode("utf-8"),
                           capture_output=True, cwd=RAIZ)
        self.assertEqual(r.returncode, 0, r.stderr.decode("utf-8", "replace"))
        self.assertEqual(gerado, r.stdout.decode("utf-8"))

    def test_saida_relativa_fica_ao_lado_do_py(self):
        self.assertEqual(automacao_timp.caminho_saida("x.js"),
                         Path(automacao_timp.__file__).resolve().parent / "x.js")
        absoluto = self.tmp / "y.js"
        self.assertEqual(automacao_timp.caminho_saida(str(absoluto)), absoluto)

    def test_sem_modelo_da_erro_claro(self):
        antigo = automacao_timp.PASTA_MODELOS
        automacao_timp.PASTA_MODELOS = self.tmp / "nao_existe"
        try:
            erros = automacao_timp.validar_configuracao()
        finally:
            automacao_timp.PASTA_MODELOS = antigo
        self.assertTrue(any("painel" in e and "modelos" in e for e in erros), erros)


if __name__ == "__main__":
    unittest.main()
