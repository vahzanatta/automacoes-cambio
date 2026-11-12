"""Portal T.IMP simulado, só para testar os scripts gerados.

Telas: lista e formulário de edição de contratos (/contrato/pagterceiro/ e /contrato/hedge/),
"Hedge - Passo 01a/01b" (/hedge/Passo01a e /hedge/Passo01b, data de pagamento do hedge em lote),
"Hedge - Passo 02" (/hedge/passo02/) e Caixa (/caixa/). Também serve os arquivos do painel e
dos testes (/painel/..., /tests/...), os PDFs sintéticos (/__mock/pdf/<nome>) e recebe os
resultados do runner de integração (POST /__mock/resultado). Só dados sintéticos.
"""
import html
import json
import mimetypes
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
SAIDA = os.path.join(AQUI, "saida")
PDFS = os.path.join(SAIDA, "pdfs")
TOKEN = "csrf-token-de-teste"
PREFIXO = "button_name_atualizar_contrato"

LINHAS_INICIAIS = [
    # id, fornecedor, moeda, valor, contrato
    ("1001", "ALFA BISCUITS", "EUR", "21.500,00", ""),
    ("1002", "BETA TRADING CO LTD", "USD", "100.000,00", ""),
    ("1003", "BETA TRADING CO LTD", "USD", "50.000,00", ""),
    ("1004", "BETA TRADING CO LTD", "USD", "30.000,00", ""),
    ("1005", "GAMA INC", "USD", "10.000,00", ""),
    ("1006", "EPSILON SPA", "EUR", "8.000,00", ""),
    ("1007", "ZETA LTD", "USD", "7.000,00", "999999999"),
]

# Hedge - Passo 02: hedge -> [(IMP_ID, código IMP)]
HEDGES_INICIAIS = {
    "1": [("501", "DEMO-0716/26-WEB-1"), ("502", "DEMO-0717/26-WEB-1")],
    "2": [("601", "DEMO-0800/26-WEB-2"), ("602", "DEMO-0801/26-WEB-2"), ("603", "DEMO-0802/26-WEB-2")],
}

# Caixa: id, descrição, valor
CAIXA_INICIAL = [
    ("71", "PREVISAO DEMO A", "1.000,00"),
    ("72", "PREVISAO DEMO B", "2.500,00"),
    ("73", "PREVISAO DEMO C", "300,00"),
]

# Hedge - Passo 01a/01b (seleção de IMPs para a data de pagamento do hedge).
# A mesma lista em cada passo e empresa; cada (passo, Emp_ID) guarda as próprias datas.
PASSOS_DATAS = ("Passo01a", "Passo01b")
EMPRESAS_DATAS = {"3": "EMPRESA DEMO TRES LTDA", "4": "EMPRESA DEMO QUATRO LTDA", "6": "EMPRESA DEMO SEIS LTDA"}
DATAS_FUTURAS = [("2026-12-01", "01/12/2026"), ("2026-12-08", "08/12/2026"), ("2026-12-15", "15/12/2026")]
DT_HEDGE_INICIAL = "01/10/2026"
IMPS_DATAS = [
    # IMP_ID, código IMP, valor proforma, moeda, status
    ("9101", "DEMO-1001/26-WEB-1", "10.000,00", "USD", "Não pago"),
    ("9102", "DEMO-1002/26-WEB-1", "2.500,50", "EUR", "Não pago"),
    ("9103", "DEMO-1003/26-WEB-2", "7.000,00", "USD", "Bloqueado"),
    ("9104", "DEMO-1004/26-WEB-2", "1.234,56", "USD", "Não pago"),
    ("9105", "DEMO-1005/26-WEB-3", "300,00", "EUR", "Não pago"),
    ("9106", "DEMO-1006/26-WEB-3", "50.000,00", "USD", "Não pago"),
    ("9107", "DEMO-1001/26-WEB-11", "900,00", "USD", "Não pago"),   # parecido com o 9101
]

ESTADO = {}
DEMORA_S = 3
# Resultado que o runner de integração manda (POST /__mock/resultado)
RESULTADO = {"dados": None, "evento": threading.Event()}


def reset(**cfg):
    ESTADO.clear()
    ESTADO.update({
        "linhas": {t: [list(l) for l in LINHAS_INICIAIS] for t in ("pagterceiro", "hedge")},
        "posts": [],
        "gets_edicao": [],
        # nome do botão de edição em cada página
        "botao": {"pagterceiro": f"{PREFIXO}_pagterceiro", "hedge": cfg.get("hedge_botao") or f"{PREFIXO}_hedge"},
        "botao_na_lista": cfg.get("botao_na_lista", "1") == "1",   # a lista mostra o <button name=...>?
        "expirado": cfg.get("expirado", "0") == "1",
        "hedges": {h: [list(i) for i in imps] for h, imps in HEDGES_INICIAIS.items()},
        "caixa": [list(l) for l in CAIXA_INICIAL],
        # Passo 01: "<passo>|<Emp_ID>" -> IMPs; lotes = cada clique no botão de lote que chegou
        "datas_hedge": {
            f"{p}|{e}": [{"id": i, "codigo": c, "valor": v, "moeda": m, "status": s,
                          "dt_hedge": DT_HEDGE_INICIAL, "visivel": True} for i, c, v, m, s in IMPS_DATAS]
            for p in PASSOS_DATAS for e in EMPRESAS_DATAS},
        "lotes": [],
        "some": cfg.get("some", "0") == "1",           # a IMP gravada sai da lista?
        # IMP_IDs (separados por vírgula) com a caixa já marcada ao carregar
        "premarcada": [x for x in cfg.get("premarcada", "").split(",") if x],
        # Resposta ao lote: "" (a página de novo), "vazia" (lista sem nenhuma IMP), "outra" (vai para outra
        # página), "ignora" (a página de novo, sem gravar) ou "demora" (grava e só responde depois de DEMORA_S)
        "apos_lote": cfg.get("apos_lote", ""),
        # Peça que a página não tem: "botao_lote", "imps_atualizar" ou "data_id:<IMP_ID>" (caixa sem data-id)
        "falta": cfg.get("falta", ""),
    })


reset()


def pagina(corpo):
    # Um form POST de "sair" antes de tudo, como em muitos portais: o script não pode usar este.
    return (f"<!doctype html><html><head><meta charset='utf-8'><title>mock T.IMP</title></head><body>"
            f"<nav><form method='post' action='/logout/'><input type='hidden' name='csrfmiddlewaretoken' "
            f"value='{TOKEN}'><button>Sair</button></form></nav>{corpo}</body></html>")


def pagina_lista(tipo, linhas):
    botao = ESTADO["botao"][tipo]
    trs = []
    for id_, forn, moeda, valor, contrato in linhas:
        btn = (f"<button type='submit' name='{botao}' value='{id_}'>Editar</button>"
               if ESTADO["botao_na_lista"] else "<a href='#'>Editar</a>")
        trs.append(f"<tr><td>{id_}</td><td>IMP-{id_}</td><td>{forn}</td><td>INV-{id_}</td><td>{moeda}</td>"
                   f"<td>{valor}</td><td>05/11/2026</td><td>x</td><td>{contrato}</td><td>x</td><td>{btn}</td></tr>")
    trs.append("<tr><td colspan='11'>Total</td></tr>")
    return pagina("<form method='get'><input name='Emp_ID'><input name='wComboDataPagamento'></form>"
                  "<table><thead><tr>" + "<th>c</th>" * 11 + "</tr></thead><tbody>" + "".join(trs) + "</tbody></table>")


def pagina_edicao(id_):
    return pagina(
        "<form method='post'>"
        f"<input type='hidden' name='csrfmiddlewaretoken' value='{TOKEN}'>"
        f"<input type='hidden' name='Pag_ID' value='{id_}'>"
        "<input type='text' name='Ctt_Numero' id='id_Ctt_Numero' value=''>"
        "<input type='date' name='Ctt_Dt' id='id_Ctt_Dt' value='2026-11-05'>"
        "<input type='radio' name='optradio_atualizacao_tipo' id='optradio_R' value='PAGAMENTO_INDIVIDUAL'>"
        "<input type='radio' name='optradio_atualizacao_tipo' id='optradio_P' value='PAGAMENTO_FORNECEDOR' checked>"
        "<select name='Emp_ID'><option value='3'>C</option><option value='4' selected>WMB</option></select>"
        "<button type='submit'>Gravar</button></form>")


def pagina_hedges():
    blocos = []
    for hedge, imps in ESTADO["hedges"].items():
        trs = "".join(
            f"<tr><td>{imp_id}</td><td>{codigo}</td><td>1,00</td><td>"
            f"<form method='post' action='/hedge/passo02/'>"
            f"<input type='hidden' name='csrfmiddlewaretoken' value='{TOKEN}'>"
            f"<button type='submit' name='button_name_remover_imp_do_hedge' value='{imp_id}' "
            f"title='Remover IMP do Hedge'>Remover</button></form></td></tr>"
            for imp_id, codigo in imps)
        blocos.append(
            f"<div class='card'><a href='#collapse_{hedge}'>Hedge {hedge}</a>"
            f"<div class='collapse' id='collapse_{hedge}'><table><thead><tr><th>IMP_ID</th>"
            f"<th>Código IMP</th><th>Valor</th><th>Ação</th></tr></thead><tbody>{trs}</tbody></table></div></div>")
    return pagina("<style>.collapse:not(.show){display:none}</style><h1>Hedge - Passo 02</h1>" + "".join(blocos))


def pagina_caixa():
    trs = "".join(
        f"<tr><td>{id_}</td><td>{desc}</td><td>{valor}</td>"
        f"<td><a href='/caixa/delete/{id_}/' class='fa fa-trash-alt'>Excluir</a></td></tr>"
        for id_, desc, valor in ESTADO["caixa"])
    return pagina(f"<h1>Caixa</h1><form><input type='hidden' name='csrfmiddlewaretoken' value='{TOKEN}'></form>"
                  "<table><thead><tr><th>ID</th><th>Descrição</th><th>Valor</th><th></th></tr></thead>"
                  f"<tbody>{trs}</tbody></table>")


# Scripts da página do Passo 01, como na tela real: impSelecionada recalcula a lista interna
# (#wImpsAtualizar) e o Total só no clique de uma caixa (não no onload: uma caixa já marcada ao
# carregar fica fora da lista interna); no onload a página desabilita os botões, logo os habilita
# e mostra o modal "Atenção" (#modalMensagemUsuario).
# O submitForm de verdade não é conhecido: este monta um GET com nome=valor dos ids passados.
JS_PASSO01 = r"""
function removerMascaraMoeda(wVal){ return parseFloat(wVal.toString().replace(/[.]+/g,'').replace(/[,]+/g,'.')); }
function formatarTotal(n){ var p = n.toFixed(2).split('.'); return p[0].replace(/\B(?=(\d{3})+$)/g, '.') + ',' + p[1]; }
function impSelecionada(wParametro){
  var ids = [], total = 0;
  document.querySelectorAll("input[name='wCheckbox']").forEach(function (c) {
    if (c.checked) {
      var d = JSON.parse(c.getAttribute('data-id'));
      ids.push(d.wImpID);
      total += removerMascaraMoeda(d.wImpValorProforma);
    }
  });
  document.getElementById('wImpsAtualizar').value = ids.join(',');
  document.getElementById('data_prev_pag_lote_total').value = formatarTotal(total);
}
function submitForm(){
  var p = new URLSearchParams();
  for (var i = 0; i < arguments.length; i++) {
    var el = document.getElementById(arguments[i]);
    if (el) p.set(el.name || el.id, el.value);
  }
  location.href = location.pathname + '?' + p.toString();
}
function submitFormAction(acao, id){ var el = document.getElementById(id); location.href = acao + '?Emp_ID=' + encodeURIComponent(el.value); }
function verificarSeTemPlanBloombergDefinitiva(){
  var ids = ['botao_filtro_imp', 'botao_passo2', 'data_prev_pag_lote_botao'];
  ids = ids.filter(function (i) { return document.getElementById(i); });
  ids.forEach(function (i) { document.getElementById(i).disabled = true; });
  document.getElementById('modalMensagemUsuario').style.display = 'block';
  setTimeout(function () { ids.forEach(function (i) { document.getElementById(i).disabled = false; }); }, 300);
}
"""


def pagina_passo01(passo, emp, filtro=""):
    e = html.escape
    imps = [i for i in ESTADO["datas_hedge"].get(f"{passo}|{emp}", []) if i["visivel"]]
    if filtro:
        imps = [i for i in imps if i["id"] == filtro]
    opcoes_emp = "".join(
        f"<option value='{k}'{' selected' if k == emp else ''}>{e(nome)}</option>" for k, nome in EMPRESAS_DATAS.items())
    opcoes_datas = "".join(f"<option value='{v}'>{t}</option>" for v, t in DATAS_FUTURAS)
    trs = []
    falta = ESTADO["falta"]
    for i in imps:
        dados = json.dumps({"wImpID": i["id"], "wImpValorProforma": i["valor"].replace(".", "")})
        atributo_id = "" if falta == f"data_id:{i['id']}" else f" data-id='{e(dados)}'"
        marcada = " checked" if i["id"] in ESTADO["premarcada"] else ""
        trs.append(
            "<tr><td style='width:15px'><div class='custom-control custom-checkbox'><form method='GET'>"
            f"<input type='checkbox' name='wCheckbox' onclick='impSelecionada({e(i['id'])});'{atributo_id}{marcada} "
            "title='Marque para alterar a &quot;Data Prevista de Pagamento&quot; em lote'></form></div></td>"
            "<td><div class='col-1'><form method='GET'><button id='btnShowModal' type='button' "
            "class='btn btn-info openMyModal'>cal</button></form></div></td>"
            f"<td> </td><td style='text-align: center'>20/11/2026 </td><td style='text-align: center'>20/11/2026 </td>"
            f"<td style='text-align: center'>{e(i['dt_hedge'])} </td><td style='width:150px'>{e(i['codigo'])}</td>"
            f"<td align='right' class='money2'>{e(i['valor'])}</td><td>{e(i['moeda'])}</td>"
            f"<td>{e(i['status'])}</td><td>REMESSA</td></tr>")
    cabecalho = ("<th scope='col'> </th><th scope='col'> </th><th scope='col'>Cód. DI</th>"
                 "<th style='text-align: center' scope='col'>Dt.Prev.Pgto.</th>"
                 "<th style='text-align: center' scope='col'>Dt.Vencto.</th>"
                 "<th style='text-align: center' scope='col'>Dt.Pgto.Hedge</th><th scope='col'>Código IMP</th>"
                 "<th scope='col'>Valor Proforma</th><th scope='col'>Moeda</th><th scope='col'>Status</th>"
                 "<th scope='col'>Forma Pgto.</th>")
    corpo = (
        f"<h1>Hedge - {passo}</h1>"
        "<select id='Emp_ID' name='Emp_ID' onchange='submitForm(this.id)'>"
        f"<option value=''>--- SELECIONE ---</option>{opcoes_emp}</select>"
        "<div class='row'><div class='col-3 filter-div'>Nro.IMP: "
        "<input type='number' name='filtro_imp' id='filtro_imp' style='width: 6em;'>"
        "<button type='submit' onclick=\"submitForm('filtro_imp','Emp_ID')\" id='botao_filtro_imp'>Filtrar</button></div>"
        "<div class='col-7 filter-div'>Total "
        "<input disabled type='text' id='data_prev_pag_lote_total' name='data_prev_pag_lote_total'>"
        " Data Pagto: <select id='wCombowDatasPagamentoFuturas' name='wCombowDatasPagamentoFuturas'>"
        f"<option value=''>--- SELECIONE ---</option>{opcoes_datas}</select>"
        + ("" if falta == "botao_lote" else
           "<button type='submit' onclick=\"submitForm(this.id,'data_prev_pag_lote_total','Emp_ID',"
           "'wCombowDatasPagamentoFuturas','wImpsAtualizar')\" id='data_prev_pag_lote_botao' "
           "value='data_prev_pag_lote_botao' name='data_prev_pag_lote_botao'>Alterar Data Pag.Hedge (lote)</button>")
        + ("" if falta == "imps_atualizar" else
           "<input type='text' style='display:none' id='wImpsAtualizar' name='wImpsAtualizar'>")
        + "</div>"
        "<div class='col-lg-2 col-sm-4'><button onclick=\"submitFormAction('/hedge/Passo02b','Emp_ID')\" "
        "id='botao_passo2'>Passo 2</button></div></div>"
        f"<table class='table table-striped'><thead class='bg-info'><tr>{cabecalho}</tr></thead>"
        f"<tbody>{''.join(trs)}</tbody></table>"
        "<div id='modalMensagemUsuario' style='display:none;position:fixed;inset:0;background:rgba(0,0,0,.4)'>"
        "<div style='background:#fff;margin:80px auto;padding:16px;max-width:400px'><b>Atenção</b>"
        "<p>Mensagem de teste do portal simulado.</p><button type='button' "
        "onclick=\"document.getElementById('modalMensagemUsuario').style.display='none'\">OK</button></div></div>"
        f"<script>{JS_PASSO01}</script>")
    return (f"<!doctype html><html><head><meta charset='utf-8'><title>mock T.IMP</title></head>"
            f"<body onload='verificarSeTemPlanBloombergDefinitiva();'>{corpo}</body></html>")


def gravar_lote(passo, emp, q):
    """Clique no botão de lote: grava a data nas IMPs de wImpsAtualizar (registra em ESTADO["lotes"])."""
    ids = [x for x in q.get("wImpsAtualizar", "").split(",") if x]
    data = q.get("wCombowDatasPagamentoFuturas", "")
    registro = {"passo": passo, "emp": emp, "data": data, "imps": ids, "total": q.get("data_prev_pag_lote_total")}
    ESTADO["lotes"].append(registro)
    datas = dict(DATAS_FUTURAS)
    imps = {i["id"]: i for i in ESTADO["datas_hedge"].get(f"{passo}|{emp}", []) if i["visivel"]}
    if data not in datas or not ids or any(i not in imps for i in ids):
        registro["resultado"] = "recusado"
        return
    for i in ids:
        imps[i]["dt_hedge"] = datas[data]
        if ESTADO["some"]:
            imps[i]["visivel"] = False
    registro["resultado"] = "gravado"


def arquivo_seguro(base, relativo):
    """Caminho de um arquivo dentro de `base`, ou None se sair dela ou não existir."""
    base = os.path.realpath(base)
    alvo = os.path.realpath(os.path.join(base, relativo))
    if not alvo.startswith(base + os.sep) or not os.path.isfile(alvo):
        return None
    return alvo


LOGIN = pagina("<h1>Login</h1><form method='post'><input name='username'><input type='password' name='password'></form>")


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, corpo, status=200, tipo="text/html; charset=utf-8", extra=None):
        dados = corpo if isinstance(corpo, bytes) else corpo.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(dados)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(dados)

    def _rota(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query, keep_blank_values=True).items()}
        partes = [p for p in u.path.split("/") if p]
        return u, q, partes

    def do_GET(self):
        u, q, partes = self._rota()
        if u.path == "/":
            return self._send(pagina("<h1>mock T.IMP</h1>"))
        if u.path == "/__mock/reset":
            reset(**q)
            return self._send(json.dumps({"ok": True, "botao": ESTADO["botao"]}), tipo="application/json")
        if u.path == "/__mock/estado":
            return self._send(json.dumps(ESTADO, ensure_ascii=False), tipo="application/json")
        if u.path == "/__mock/script":
            with open(os.path.join(SAIDA, os.path.basename(q["arquivo"])), encoding="utf-8") as f:
                return self._send(f.read(), tipo="text/plain; charset=utf-8")
        if u.path.startswith("/__mock/pdf/"):
            alvo = arquivo_seguro(PDFS, os.path.basename(unquote(u.path[len("/__mock/pdf/"):])))
            if not alvo:
                return self._send("nao encontrado", status=404)
            with open(alvo, "rb") as f:
                return self._send(f.read(), tipo="application/pdf")
        if partes and partes[0] in ("painel", "tests"):
            alvo = arquivo_seguro(RAIZ, unquote(u.path).lstrip("/"))
            if not alvo:
                return self._send("nao encontrado", status=404)
            tipo = mimetypes.guess_type(alvo)[0] or "application/octet-stream"
            if alvo.endswith(".js"):
                tipo = "text/javascript"
            if tipo.startswith("text/") or tipo == "application/json":
                tipo += "; charset=utf-8"
            with open(alvo, "rb") as f:
                return self._send(f.read(), tipo=tipo)
        if u.path == "/hedge/passo02/":
            return self._send(pagina_hedges())
        if u.path == "/caixa/":
            return self._send(pagina_caixa())
        if len(partes) == 2 and partes[0] == "hedge" and partes[1] in PASSOS_DATAS:
            emp = q.get("Emp_ID", "")
            if "data_prev_pag_lote_botao" in q:
                if ESTADO["apos_lote"] == "ignora":
                    ESTADO["lotes"].append({"passo": partes[1], "emp": emp, "data": q.get("wCombowDatasPagamentoFuturas", ""),
                                            "imps": [x for x in q.get("wImpsAtualizar", "").split(",") if x],
                                            "resultado": "ignorado"})
                    return self._send(pagina_passo01(partes[1], emp))
                gravar_lote(partes[1], emp, q)
                if ESTADO["apos_lote"] == "demora":
                    time.sleep(DEMORA_S)
                if ESTADO["apos_lote"] == "outra":
                    return self._send("", status=302, extra={"Location": f"/hedge/Passo02b?Emp_ID={emp}"})
                if ESTADO["apos_lote"] == "vazia":
                    return self._send(pagina_passo01(partes[1], emp, "nenhuma"))
            return self._send(pagina_passo01(partes[1], emp, q.get("filtro_imp", "")))
        if u.path == "/__mock/shutdown":
            self._send("tchau")
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        if len(partes) == 2 and partes[0] == "contrato" and partes[1] in ESTADO["linhas"]:
            tipo = partes[1]
            if ESTADO["expirado"]:
                return self._send(LOGIN)
            botao = ESTADO["botao"][tipo]
            linhas = ESTADO["linhas"][tipo]
            if botao in q:
                ESTADO["gets_edicao"].append({"tipo": tipo, "id": q[botao]})
                if any(l[0] == q[botao] for l in linhas):
                    return self._send(pagina_edicao(q[botao]))
                return self._send("erro", status=500)
            if q.get("Emp_ID") == "4" and q.get("wComboDataPagamento") == "2026-11-05":
                return self._send(pagina_lista(tipo, linhas))
            return self._send(pagina_lista(tipo, []))   # outra empresa/data/parâmetro desconhecido: lista vazia
        self._send("nao encontrado", status=404)

    def do_POST(self):
        u, q, partes = self._rota()
        corpo = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode("utf-8")
        if u.path == "/__mock/resultado":
            RESULTADO["dados"] = json.loads(corpo)
            RESULTADO["evento"].set()
            return self._send(json.dumps({"ok": True}), tipo="application/json")
        campos = {k: v[0] for k, v in parse_qs(corpo, keep_blank_values=True).items()}
        registro = {"caminho": self.path, "campos": campos, "csrf_header": self.headers.get("X-CSRFToken")}
        ESTADO["posts"].append(registro)
        if u.path == "/hedge/passo02/":
            # Formulário comum (sem cabeçalho): confere só o token do corpo
            if campos.get("csrfmiddlewaretoken") != TOKEN:
                registro["resultado"] = "recusado: csrf"
                return self._send("csrf", status=403)
            imp_id = campos.get("button_name_remover_imp_do_hedge")
            achou = False
            for imps in ESTADO["hedges"].values():
                for i in [i for i in imps if i[0] == imp_id]:
                    imps.remove(i)
                    achou = True
            registro["resultado"] = "removida" if achou else "IMP inexistente"
            return self._send("", status=302, extra={"Location": "/hedge/passo02/"})
        if len(partes) == 3 and partes[0] == "caixa" and partes[1] == "delete":
            if self.headers.get("X-CSRFToken") != TOKEN or campos.get("csrfmiddlewaretoken") != TOKEN:
                registro["resultado"] = "recusado: csrf"
                return self._send("csrf", status=403)
            antes = len(ESTADO["caixa"])
            ESTADO["caixa"] = [l for l in ESTADO["caixa"] if l[0] != partes[2]]
            registro["resultado"] = "excluído" if len(ESTADO["caixa"]) < antes else "id inexistente"
            return self._send("", status=302, extra={"Location": "/caixa/"})
        if len(partes) != 2 or partes[0] != "contrato" or partes[1] not in ESTADO["linhas"] or ESTADO["expirado"]:
            registro["resultado"] = "recusado: rota"
            return self._send("recusado", status=403)
        tipo = partes[1]
        botao = ESTADO["botao"][tipo]
        if self.headers.get("X-CSRFToken") != TOKEN or campos.get("csrfmiddlewaretoken") != TOKEN:
            registro["resultado"] = "recusado: csrf"
            return self._send("csrf", status=403)
        if botao not in q or "Ctt_Numero" not in campos:
            registro["resultado"] = "ignorado: sem botão/numero"
            return self._send(pagina_lista(tipo, ESTADO["linhas"][tipo]))
        alvo = next((l for l in ESTADO["linhas"][tipo] if l[0] == q[botao]), None)
        if not alvo:
            registro["resultado"] = "id inexistente"
            return self._send("erro", status=500)
        if campos.get("optradio_atualizacao_tipo") == "PAGAMENTO_INDIVIDUAL":
            alvo[4] = campos["Ctt_Numero"]
            registro["resultado"] = "gravado individual"
        else:   # "todos do fornecedor": marcaria linhas a mais
            for l in ESTADO["linhas"][tipo]:
                if l[1] == alvo[1]:
                    l[4] = campos["Ctt_Numero"]
            registro["resultado"] = "gravado POR FORNECEDOR"
        # Como no Django: redireciona para a lista depois de gravar
        self._send("", status=302, extra={"Location": f"/contrato/{tipo}/?Emp_ID=4&wComboDataPagamento=2026-11-05&button_filtrar_data=Filtrar"})


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
    with open(os.path.join(AQUI, "porta.txt"), "w") as f:
        f.write(str(srv.server_address[1]))
    print("mock em http://127.0.0.1:%d/" % srv.server_address[1], flush=True)
    t = threading.Timer(1800, srv.shutdown)   # desliga sozinho em 30 min
    t.daemon = True
    t.start()
    srv.serve_forever()
    sys.exit(0)
