"""Testes de integração: gera os scripts, sobe o portal simulado e roda os cenários no Chrome headless.

Uso: .venv/Scripts/python tests/rodar_integracao.py
Imprime PASS/FAIL por cenário e sai com código 1 se algum falhar (ou se o tempo acabar).
"""
import os
import shutil
import subprocess
import sys
import tempfile
import threading
from http.server import ThreadingHTTPServer

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, AQUI)
import mock_timp  # noqa: E402

CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe"
TEMPO_MAXIMO_S = 120

# Todos os cenários de tests/integracao/cenarios.js, na ordem em que rodam. Se o runner
# devolver outra lista (cenário sumido, renomeado ou a mais), a integração falha.
CENARIOS_ESPERADOS = [
    "inclusao_terceiros_sim", "inclusao_terceiros_gravar", "inclusao_regravar",
    "inclusao_hedge_gravar", "inclusao_sessao_expirada", "inclusao_data_errada",
    "hedges_sim", "hedges_exec", "hedges_exec_nenhuma", "previsoes_sim", "previsoes_exec",
    "datas_sim", "datas_exec", "datas_exec_sem_prova", "datas_exec_nao_gravou", "datas_exec_fechar",
    "datas_exec_parar", "datas_faltando",
    "datas_pagina_errada",
    "painel_carrega", "extracao_pdfs", "coluna_trava", "inclusao_ui", "pasta_mista",
    "hedges_ui", "datas_ui", "trava_ui",
]


def conferir_nomes(resultados):
    """Mensagem de erro se os nomes devolvidos não forem exatamente CENARIOS_ESPERADOS, ou None."""
    nomes = [r.get("nome") for r in resultados]
    if nomes == CENARIOS_ESPERADOS:
        return None
    faltam = [n for n in CENARIOS_ESPERADOS if n not in nomes]
    sobram = [n for n in nomes if n not in CENARIOS_ESPERADOS]
    return (f"cenários diferentes do esperado (faltam: {faltam or '-'}; a mais: {sobram or '-'}; "
            f"recebidos: {nomes})")


def encerrar(proc):
    if proc.poll() is not None:
        return
    if os.name == "nt":   # o Chrome abre processos filhos: derruba a árvore toda
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
    else:
        proc.kill()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        pass


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    subprocess.run(["node", os.path.join("tests", "gerar_scripts_teste.js")], cwd=RAIZ, check=True)

    srv = ThreadingHTTPServer(("127.0.0.1", 0), mock_timp.H)
    porta = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    perfil = tempfile.mkdtemp(prefix="chrome-integracao-")
    url = f"http://127.0.0.1:{porta}/tests/integracao/runner.html"
    chrome = subprocess.Popen(
        [CHROME, "--headless=new", "--disable-gpu", "--no-first-run", f"--user-data-dir={perfil}", url],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        chegou = mock_timp.RESULTADO["evento"].wait(TEMPO_MAXIMO_S)
    finally:
        encerrar(chrome)
        srv.shutdown()
        shutil.rmtree(perfil, ignore_errors=True)

    if not chegou:
        print(f"FAIL runner: nenhum resultado em {TEMPO_MAXIMO_S} s")
        return 1
    resultados = mock_timp.RESULTADO["dados"] or []
    if not resultados:
        print("FAIL runner: lista de resultados vazia")
        return 1
    for r in resultados:
        print(f"{'PASS' if r['ok'] else 'FAIL'} {r['nome']}: {r['detalhe']}")
    falhas = sum(1 for r in resultados if not r["ok"])
    print(f"\n{len(resultados) - falhas}/{len(resultados)} cenários passaram.")
    problema = conferir_nomes(resultados)
    if problema:
        print(f"FAIL runner: {problema}")
        return 1
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
