"""
Processo 1 - Inclusão de contratos de câmbio no T.IMP.

Lê os PDFs dos contratos de uma pasta e gera o arquivo preencher_timp.js,
pronto para colar no console (F12) do T.IMP.

Como usar:
  1. Ajuste o bloco CONFIGURAÇÃO abaixo (pasta, empresa, tipo de contrato e data).
  2. Rode:  python automacao_timp.py        (requer:  pip install pdfplumber)
  3. No Chrome, com o T.IMP aberto e logado, cole o conteúdo de preencher_timp.js
     no console. Com DRY_RUN = true ele só simula: mostra o que seria gravado.
  4. Conferiu? Troque DRY_RUN para false no script colado e rode de novo.
"""

import json
import os
import re
from datetime import datetime
from pathlib import Path

import pdfplumber

# ============================ CONFIGURAÇÃO ============================
# Pasta com os PDFs dos contratos (qualquer pasta da rede ou do computador).
PASTA_ENTRADA = r"\\brsvp0000009\Groups\dfg\Financeiro\Tesouraria\25 Gestão de Caixa\10. FECHAMENTO DE CÂMBIO\7. CONTRATOS DE CÂMBIO E HEDGES\BR21\Câmbio\BROKER\2026\11.2026\05.11 Terceiros"

EMPRESA = "BR21"               # BR02 = CARREFOUR | BR21 = WMB | BR22 = WMS
TIPO_CONTRATO = "TERCEIROS"    # TERCEIROS (contrato/pagterceiro) | HEDGE (contrato/hedge)
DATA_PAGAMENTO = "2026-11-05"  # data do filtro no T.IMP, no formato AAAA-MM-DD
DRY_RUN = True                 # True = o script sai em simulação | False = já sai gravando

ARQUIVO_SAIDA_JS = "preencher_timp.js"
# ======================================================================

# Empresa -> (nome, Emp_ID no T.IMP)
EMPRESAS = {
    "BR02": ("CARREFOUR", "3"),
    "BR21": ("WMB", "4"),
    "BR22": ("WMS", "6"),
}

# Tipo de contrato -> trecho do endereço no T.IMP (/contrato/<trecho>/)
TIPOS_CONTRATO = {
    "TERCEIROS": "pagterceiro",
    "HEDGE": "hedge",
}


def extrair_dados_pdf(caminho_pdf):
    """Extrai os 4 campos essenciais do PDF do contrato de câmbio."""
    with pdfplumber.open(caminho_pdf) as pdf:
        texto_completo = "\n".join(
            [pagina.extract_text() or "" for pagina in pdf.pages]
        )
    return extrair_dados_texto(texto_completo)


def extrair_dados_texto(texto_completo):
    """Extrai os 4 campos do texto do contrato (mesmas regras de painel/js/extracao.js)."""
    # 1. Número do Contrato (sem '0' inicial)
    match_num = re.search(
        r"Número do Contrato de Câmbio\s*[\r\n]+\s*(\d+)",
        texto_completo,
        re.IGNORECASE,
    )
    if not match_num:
        match_num = re.search(r"\b0*(\d{8,10})\b", texto_completo)
    num_contrato_limpo = match_num.group(1).lstrip("0") if match_num else None

    # 2. Código da Moeda
    match_moeda = re.search(
        r"Código Moeda\s*[\r\n]+\s*([A-Z]{3})", texto_completo, re.IGNORECASE
    )
    if not match_moeda:
        match_moeda = re.search(r"\b(USD|EUR|GBP|JPY|CAD|CHF)\b", texto_completo)
    codigo_moeda = match_moeda.group(1) if match_moeda else None

    # 3. Valor em moeda estrangeira
    match_valor = re.search(
        r"Valor em moeda estrangeira\s*[\r\n]+\s*([\d\.,]+)",
        texto_completo,
        re.IGNORECASE,
    )
    valor = match_valor.group(1) if match_valor else None

    # 4. Fornecedor (Pagador/Recebedor no exterior)
    match_forn = re.search(
        r"Pagador/Recebedor no exterior\s*[\r\n]+\s*([^\r\n]+)",
        texto_completo,
        re.IGNORECASE,
    )
    fornecedor = match_forn.group(1).strip() if match_forn else None

    return {
        "num_contrato": num_contrato_limpo,
        "moeda": codigo_moeda,
        "valor": valor,
        "fornecedor": fornecedor,
    }


# Mesmas validações de painel/js/extracao.js (contratoCompleto): o Python só aceita um
# contrato quando o painel também aceitaria.
def valor_br_valido(s):
    return bool(re.fullmatch(r"\d{1,3}(\.\d{3})*,\d{2}|\d+,\d{2}", s or ""))


def moeda_valida(s):
    return bool(re.fullmatch(r"[A-Z]{3}", s or ""))


def contrato_valido(s):
    return bool(re.fullmatch(r"\d+", s or ""))


def contrato_completo(c):
    return bool(c) and contrato_valido(c.get("num_contrato")) and moeda_valida(c.get("moeda")) \
        and valor_br_valido(c.get("valor")) and bool((c.get("fornecedor") or "").strip())


def problemas_do_contrato(c):
    """Lista, em texto, o que impede o contrato de entrar no script."""
    problemas = []
    if not contrato_valido(c.get("num_contrato")):
        problemas.append(f"nº do contrato inválido ({c.get('num_contrato')!r})")
    if not moeda_valida(c.get("moeda")):
        problemas.append(f"moeda inválida ({c.get('moeda')!r})")
    if not valor_br_valido(c.get("valor")):
        problemas.append(f"valor fora do formato 1.234,56 ({c.get('valor')!r})")
    if not (c.get("fornecedor") or "").strip():
        problemas.append("fornecedor não encontrado")
    return problemas


def caminho_saida(arquivo):
    """Arquivo de saída: caminho relativo fica ao lado deste .py (não da pasta de onde ele foi chamado)."""
    p = Path(arquivo)
    return p if p.is_absolute() else Path(__file__).resolve().parent / p


# Modelo do script do console: fica em painel/modelos/ e é a mesma fonte usada pelo
# painel (JavaScript), para os dois gerarem sempre o mesmo script. Os trechos __NOME__
# são trocados em gerar_javascript(). O script não recarrega a página (lê a lista e
# grava com fetch), por isso roda do começo ao fim com uma colagem só.
PASTA_MODELOS = Path(__file__).parent / "painel" / "modelos"
MARCADOR_INICIO = "//<<INICIO"
MARCADOR_FIM = "//FIM>>"


def carregar_modelo(nome):
    """Devolve o corpo do modelo painel/modelos/<nome>.js (entre os marcadores)."""
    texto = (PASTA_MODELOS / f"{nome}.js").read_text(encoding="utf-8")  # normaliza CRLF
    ini = texto.find(MARCADOR_INICIO + "\n")
    if ini < 0:
        raise ValueError(f"Modelo {nome!r} sem o marcador {MARCADOR_INICIO}.")
    fim = texto.find(MARCADOR_FIM, ini)
    if fim < 0:
        raise ValueError(f"Modelo {nome!r} sem o marcador {MARCADOR_FIM}.")
    return texto[ini + len(MARCADOR_INICIO) + 1 : fim]


def preencher_modelo(corpo, valores):
    """Troca cada __NOME__ por valores[NOME] numa passada só (o conteúdo dos valores
    nunca é reinterpretado). Erro se faltar valor para um marcador ou sobrar valor."""
    usados = set()

    def trocar(m):
        nome = m.group(1)
        if nome not in valores:
            raise ValueError(f"Marcador sem valor: {nome}")
        usados.add(nome)
        return valores[nome]

    saida = re.sub(r"__([A-Z]+(?:_[A-Z]+)*)__", trocar, corpo)
    sobras = [n for n in valores if n not in usados]
    if sobras:
        raise ValueError(f"Valor sem marcador no modelo: {', '.join(sobras)}")
    return saida


def gerar_javascript(lista_contratos, empresa, tipo_contrato, data_pagamento, dry_run=True):
    """Monta o script do console a partir do modelo painel/modelos/inclusao.js."""
    nome_empresa, emp_id = EMPRESAS[empresa]
    contratos_json = json.dumps(lista_contratos, ensure_ascii=False, indent=2)
    valores = {
        "EMPRESA": json.dumps(f"{empresa} - {nome_empresa}", ensure_ascii=False),
        "EMP_ID": json.dumps(emp_id),
        "TIPO": json.dumps(TIPOS_CONTRATO[tipo_contrato]),
        "DATA_PAGTO": json.dumps(data_pagamento),
        "DRY_RUN": "true" if dry_run else "false",
        "CONTRATOS": contratos_json.replace("\n", "\n  "),
    }
    return preencher_modelo(carregar_modelo("inclusao"), valores)


def validar_configuracao():
    """Devolve a lista de problemas na CONFIGURAÇÃO (vazia se estiver tudo certo)."""
    erros = []
    if EMPRESA not in EMPRESAS:
        erros.append(f"EMPRESA inválida: {EMPRESA!r}. Use uma de: {', '.join(EMPRESAS)}.")
    if TIPO_CONTRATO not in TIPOS_CONTRATO:
        erros.append(
            f"TIPO_CONTRATO inválido: {TIPO_CONTRATO!r}. Use um de: {', '.join(TIPOS_CONTRATO)}."
        )
    try:
        datetime.strptime(DATA_PAGAMENTO, "%Y-%m-%d")
    except ValueError:
        erros.append(
            f"DATA_PAGAMENTO inválida: {DATA_PAGAMENTO!r}. Use o formato AAAA-MM-DD (ex.: 2026-11-05)."
        )
    if not os.path.isdir(PASTA_ENTRADA):
        erros.append(f"Pasta não encontrada: {PASTA_ENTRADA}")
    if not (PASTA_MODELOS / "inclusao.js").is_file():
        erros.append(
            f"Modelo do script não encontrado: {PASTA_MODELOS / 'inclusao.js'}. "
            "Mantenha a pasta painel/modelos ao lado deste arquivo (copie o projeto inteiro)."
        )
    return erros


def main():
    erros = validar_configuracao()
    if erros:
        print("[ERRO] Corrija o bloco CONFIGURAÇÃO no início do arquivo:")
        for erro in erros:
            print(f"  - {erro}")
        return

    print("==================================================")
    print("1. LENDO PDFS DA PASTA")
    print("==================================================")

    arquivos = sorted(
        f for f in os.listdir(PASTA_ENTRADA)
        if f.lower().endswith(".pdf") and os.path.isfile(os.path.join(PASTA_ENTRADA, f))
    )
    print(f"Encontrados {len(arquivos)} arquivo(s) PDF na pasta.\n")

    lista_validos = []
    for arq in arquivos:
        caminho = os.path.join(PASTA_ENTRADA, arq)
        try:
            dados = extrair_dados_pdf(caminho)
        except Exception as e:
            print(f"  ❌ {arq} -> Não consegui ler o PDF (arquivo inválido ou corrompido): {e}")
            continue
        if contrato_completo(dados):
            dados["arquivo"] = arq
            lista_validos.append(dados)
            print(f"  ✓ {arq} -> Contrato: {dados['num_contrato']} | {dados['fornecedor']}")
        else:
            print(f"  ⚠️ {arq} -> fica de fora: {'; '.join(problemas_do_contrato(dados))}")
            print("     (no painel dá para corrigir esse contrato à mão)")

    print(f"\nTotal de contratos extraídos com sucesso: {len(lista_validos)} de {len(arquivos)}")

    if not lista_validos:
        print("Nenhum contrato válido capturado para gerar o JS.")
        return

    print("\n==================================================")
    print("2. GERANDO SCRIPT JAVASCRIPT PARA O CONSOLE")
    print("==================================================")

    codigo_js = gerar_javascript(
        lista_validos, EMPRESA, TIPO_CONTRATO, DATA_PAGAMENTO, DRY_RUN
    )

    saida = caminho_saida(ARQUIVO_SAIDA_JS)
    with open(saida, "w", encoding="utf-8", newline="\n") as f:
        f.write(codigo_js)

    nome_empresa, emp_id = EMPRESAS[EMPRESA]
    print(f"✓ Arquivo criado: {saida}")
    print(f"  Empresa: {EMPRESA} - {nome_empresa} (Emp_ID {emp_id})")
    print(f"  Tipo:    {TIPO_CONTRATO} (contrato/{TIPOS_CONTRATO[TIPO_CONTRATO]})")
    print(f"  Data:    {DATA_PAGAMENTO}")
    print(f"  Modo:    {'SIMULAÇÃO (DRY_RUN = true)' if DRY_RUN else 'GRAVAÇÃO (DRY_RUN = false)'}")
    print("\nPróximo passo: cole o conteúdo do arquivo no console (F12) do T.IMP.")


if __name__ == "__main__":
    main()
