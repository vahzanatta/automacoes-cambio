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


# Modelo do script do console. Os trechos __NOME__ são trocados em gerar_javascript().
# O script não recarrega a página (lê a lista e grava com fetch), por isso roda do
# começo ao fim com uma colagem só.
MODELO_JS = r"""// ============================================================================
//  T.IMP - Inclusão de contratos de câmbio (gerado por automacao_timp.py)
//
//  Onde colar: no Chrome, com o T.IMP aberto e logado, aperte F12, abra a aba
//  "Console", cole este arquivo inteiro e aperte Enter.
//
//  1ª vez: rode com DRY_RUN = true. Ele só mostra o que seria gravado.
//  Conferiu a tabela? Troque DRY_RUN para false e rode de novo.
// ============================================================================
(async () => {
  const EMPRESA    = __EMPRESA__;  // só para conferência
  const EMP_ID     = __EMP_ID__;
  const TIPO       = __TIPO__;  // "pagterceiro" (Terceiros) ou "hedge"
  const DATA_PAGTO = __DATA_PAGTO__;  // data do filtro (AAAA-MM-DD)
  const DRY_RUN    = __DRY_RUN__;  // true = só simula | false = grava de verdade

  // Contratos lidos dos PDFs. "data_contrato" é opcional (AAAA-MM-DD): sem ela,
  // fica a data que o portal sugere.
  const CONTRATOS = __CONTRATOS__;

  const BASE     = `/contrato/${TIPO}/`;
  const urlLista = `${BASE}?Emp_ID=${EMP_ID}&wComboDataPagamento=${DATA_PAGTO}&button_filtrar_data=Filtrar`;

  const norm    = t => (t || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const toCents = s => Math.round(parseFloat(String(s).replace(/\./g, "").replace(",", ".")) * 100);
  const sleep   = ms => new Promise(r => setTimeout(r, ms));

  async function getDoc(url) {
    const r = await fetch(url, { credentials: "same-origin" });
    if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
    return new DOMParser().parseFromString(await r.text(), "text/html");
  }

  // ---------- Lista de pagamentos ----------
  const PREFIXO_BOTAO = "button_name_atualizar_contrato";
  let botoesDaLista = [];   // nomes de botão de edição vistos na própria lista
  let resumoPagina = "";    // para a mensagem de erro, se a lista vier vazia

  async function lerLista() {
    const doc = await getDoc(urlLista);
    const trs = [...doc.querySelectorAll("table tbody tr")];
    botoesDaLista = [...new Set(trs.flatMap(tr =>
      [...tr.querySelectorAll(`[name^="${PREFIXO_BOTAO}"]`)].map(b => b.getAttribute("name"))))];
    const celulas = trs.map(tr => [...tr.querySelectorAll(":scope > td")].map(td => td.textContent.trim()));
    resumoPagina = `linhas na página: ${trs.length}, colunas na 1ª linha: ${celulas.length ? celulas[0].length : 0}`;
    return celulas
      .filter(td => td.length >= 10 && /^\d+$/.test(td[0]))
      .map(td => ({
        id: td[0],
        fornecedor: td[2],
        fornNorm: norm(td[2]),
        moeda: td[4].toUpperCase(),
        valorStr: td[5],
        cents: toCents(td[5]),
        contrato: td[8],
      }));
  }

  // Acha a(s) linha(s) do pagamento: valor exato ou a menor combinação que fecha o valor
  function acharLinhas(cands, alvo) {
    const exata = cands.find(c => c.cents === alvo);
    if (exata) return [exata];

    const n = cands.length;
    if (n > 20) {
      const soma = cands.reduce((a, c) => a + c.cents, 0);
      return soma === alvo ? cands : null;
    }
    let melhor = null;
    for (let mask = 1; mask < (1 << n); mask++) {
      let soma = 0, qtd = 0;
      for (let i = 0; i < n; i++) if (mask & (1 << i)) { soma += cands[i].cents; qtd++; }
      if (soma === alvo && (!melhor || qtd < melhor.qtd)) melhor = { mask, qtd };
    }
    if (!melhor) return null;
    return cands.filter((_, i) => melhor.mask & (1 << i));
  }

  // ---------- Formulário de edição ----------
  // Abre com ?<nome do botão>=<id do pagamento>. O nome do botão acompanha a página
  // (..._pagterceiro / ..._hedge): o script testa as opções, só lendo, e fica com a
  // que mostrar o campo do nº do contrato.
  let botaoEdicao = null;
  const campoContrato = doc => doc.querySelector("[name='Ctt_Numero'], #id_Ctt_Numero");

  async function abrirEdicao(id) {
    const opcoes = botaoEdicao ? [botaoEdicao]
      : [...new Set([`${PREFIXO_BOTAO}_${TIPO}`, ...botoesDaLista, `${PREFIXO_BOTAO}_pagterceiro`])];
    let ultimoErro = "";
    for (const botao of opcoes) {
      const url = `${BASE}?${botao}=${id}&Emp_ID=${EMP_ID}`;
      let doc;
      try { doc = await getDoc(url); } catch (e) { ultimoErro = ` Último erro: ${e.message}.`; continue; }
      if (campoContrato(doc)) { botaoEdicao = botao; return { url, doc }; }
    }
    throw new Error(`não abriu o formulário de edição do pagamento ${id} (sessão expirou?). ` +
                    `Botões testados: ${opcoes.join(", ")}.${ultimoErro}`);
  }

  // Abre o formulário de um pagamento e grava (sempre "Somente ESTE pagamento")
  async function gravar(id, c) {
    const { url, doc } = await abrirEdicao(id);
    const form = campoContrato(doc).closest("form") || doc.querySelector("form[method='post']");
    if (!form) throw new Error(`formulário não encontrado para ${id}`);

    const body = new URLSearchParams();
    form.querySelectorAll("input[name], select[name]").forEach(el => {
      if (el.type === "radio" && !el.checked) return;
      body.set(el.name, el.value);
    });
    body.set("Ctt_Numero", c.num_contrato);
    body.set("optradio_atualizacao_tipo", "PAGAMENTO_INDIVIDUAL");
    if (c.data_contrato) body.set("Ctt_Dt", c.data_contrato);

    const r = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-CSRFToken": body.get("csrfmiddlewaretoken") },
      body,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ao gravar ${id}`);
  }

  // ============================ EXECUÇÃO ============================
  console.log(`%cT.IMP | ${EMPRESA} (Emp_ID ${EMP_ID}) | ${TIPO} | data ${DATA_PAGTO} | ` +
              `${CONTRATOS.length} contrato(s) | ${DRY_RUN ? "SIMULAÇÃO" : "GRAVANDO"}`,
              "color:#007bff;font-weight:bold;font-size:14px");

  let linhas;
  try {
    linhas = await lerLista();
  } catch (e) {
    console.error(`Não consegui ler a lista do T.IMP: ${e.message}. ` +
                  "Confira se esta aba é a do portal e se você está logado. Nada foi gravado.");
    return;
  }
  if (!linhas.length) {
    console.error(`Nenhum pagamento encontrado em ${urlLista} (${resumoPagina}). ` +
                  "Confira empresa, tipo de contrato e data, e se a sessão não expirou. Nada foi gravado.");
    return;
  }
  console.log(`Linhas na tabela: ${linhas.length} (sem contrato: ${linhas.filter(l => !l.contrato).length})`);

  const usadas = new Set();
  const plano = [];
  const problemas = [];

  for (const c of CONTRATOS) {
    const fN = norm(c.fornecedor);
    const alvo = toCents(c.valor);
    const cands = linhas.filter(l =>
      !l.contrato && !usadas.has(l.id) &&
      l.moeda === c.moeda.toUpperCase() &&
      fN && l.fornNorm && (l.fornNorm.includes(fN) || fN.includes(l.fornNorm))
    );

    if (!cands.length) {
      problemas.push({ contrato: c.num_contrato, fornecedor: c.fornecedor, motivo: "fornecedor/moeda não encontrado ou já preenchido" });
      continue;
    }
    const match = acharLinhas(cands, alvo);
    if (!match) {
      problemas.push({
        contrato: c.num_contrato, fornecedor: c.fornecedor,
        motivo: `valor ${c.valor} não fecha com nenhuma combinação`,
        linhas_disponiveis: cands.map(l => `${l.id}: ${l.valorStr}`).join(" | "),
      });
      continue;
    }
    match.forEach(l => usadas.add(l.id));
    plano.push({ c, ids: match.map(l => l.id), valores: match.map(l => l.valorStr).join(" + ") });
  }

  console.log(`Casaram ${plano.length} de ${CONTRATOS.length} contrato(s):`);
  console.table(plano.map(p => ({
    contrato: p.c.num_contrato, fornecedor: p.c.fornecedor, moeda: p.c.moeda,
    valor_pdf: p.c.valor, ids_pagamento: p.ids.join(", "), composicao: p.valores,
  })));
  if (problemas.length) { console.warn("Não casaram:"); console.table(problemas); }

  if (!plano.length) {
    console.warn("Nenhum contrato casou com a lista. Nada a gravar.");
    return;
  }

  // Antes de gravar (e também na simulação), confere se o formulário de edição abre.
  // É só leitura: nada é gravado aqui.
  try {
    await abrirEdicao(plano[0].ids[0]);
    console.log(`Formulário de edição: OK (${botaoEdicao})`);
  } catch (e) {
    console.error(`Problema: ${e.message} Nada foi gravado.` +
                  (DRY_RUN ? " Não mude DRY_RUN para false antes de resolver isso." : ""));
    return;
  }

  if (DRY_RUN) {
    console.log("%cSimulação concluída. Confira a tabela acima e mude DRY_RUN para false.", "color:orange;font-weight:bold");
    return;
  }

  for (const p of plano) {
    for (const id of p.ids) {
      try {
        await gravar(id, p.c);
        console.log(`✅ ${id} ← ${p.c.num_contrato} (${p.c.fornecedor})`);
      } catch (e) {
        console.error(`❌ ${id}: ${e.message}`);
      }
      await sleep(300);
    }
  }

  // Conferência: relê a lista e verifica se o número ficou gravado
  const depois = await lerLista();
  const conferencia = plano.flatMap(p => p.ids.map(id => {
    const l = depois.find(x => x.id === id);
    return { id, esperado: p.c.num_contrato, no_portal: l ? l.contrato || "(vazio)" : "(sumiu da lista)",
             ok: l && l.contrato === p.c.num_contrato ? "✅" : "❌" };
  }));
  console.table(conferencia);
  console.log(`%cFim: ${conferencia.filter(x => x.ok === "✅").length}/${conferencia.length} gravados`,
              "color:green;font-weight:bold;font-size:14px");
})();
"""


def gerar_javascript(lista_contratos, empresa, tipo_contrato, data_pagamento, dry_run=True):
    """Monta o script do console a partir do MODELO_JS."""
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
    # Troca em uma passada só, para o conteúdo dos contratos nunca ser reinterpretado.
    return re.sub(r"__([A-Z]+(?:_[A-Z]+)*)__", lambda m: valores[m.group(1)], MODELO_JS)


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

    arquivos = sorted(f for f in os.listdir(PASTA_ENTRADA) if f.lower().endswith(".pdf"))
    print(f"Encontrados {len(arquivos)} arquivo(s) PDF na pasta.\n")

    lista_validos = []
    for arq in arquivos:
        caminho = os.path.join(PASTA_ENTRADA, arq)
        try:
            dados = extrair_dados_pdf(caminho)
            if all(
                [
                    dados["num_contrato"],
                    dados["moeda"],
                    dados["valor"],
                    dados["fornecedor"],
                ]
            ):
                dados["arquivo"] = arq
                lista_validos.append(dados)
                print(
                    f"  ✓ {arq} -> Contrato: {dados['num_contrato']} | {dados['fornecedor']}"
                )
            else:
                print(f"  ⚠️ {arq} -> Dados incompletos: {dados}")
        except Exception as e:
            print(f"  ❌ {arq} -> Erro na leitura: {e}")

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

    with open(ARQUIVO_SAIDA_JS, "w", encoding="utf-8") as f:
        f.write(codigo_js)

    nome_empresa, emp_id = EMPRESAS[EMPRESA]
    print(f"✓ Arquivo '{ARQUIVO_SAIDA_JS}' criado com sucesso!")
    print(f"  Empresa: {EMPRESA} - {nome_empresa} (Emp_ID {emp_id})")
    print(f"  Tipo:    {TIPO_CONTRATO} (contrato/{TIPOS_CONTRATO[TIPO_CONTRATO]})")
    print(f"  Data:    {DATA_PAGAMENTO}")
    print(f"  Modo:    {'SIMULAÇÃO (DRY_RUN = true)' if DRY_RUN else 'GRAVAÇÃO (DRY_RUN = false)'}")
    print("\nPróximo passo: cole o conteúdo do arquivo no console (F12) do T.IMP.")


if __name__ == "__main__":
    main()
