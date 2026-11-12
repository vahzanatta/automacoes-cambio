// Navegação entre as telas do painel e início de cada tela.
(function (P) {
  const TELAS = ["inicial", "inclusao", "hedges-menu", "datas-hedge", "hedges", "previsoes"];
  const aoMostrar = {};   // tela -> função chamada cada vez que a tela é aberta

  function mostrarTela(id) {
    if (!TELAS.includes(id)) id = "inicial";
    TELAS.forEach(t => {
      const el = document.getElementById("tela-" + t);
      if (el) el.hidden = t !== id;
    });
    if (aoMostrar[id]) aoMostrar[id]();
    window.scrollTo(0, 0);
  }

  function iniciar() {
    document.querySelectorAll("[data-tela]").forEach(b => {
      b.addEventListener("click", () => mostrarTela(b.getAttribute("data-tela")));
    });
    const inclusao = document.getElementById("tela-inclusao");
    if (inclusao) P.iniciarTelaInclusao(inclusao);
    const hedges = document.getElementById("tela-hedges");
    if (hedges) P.iniciarTelaHedges(hedges);
    const previsoes = document.getElementById("tela-previsoes");
    if (previsoes) aoMostrar.previsoes = P.iniciarTelaPrevisoes(previsoes).aoMostrar;
    const datas = document.getElementById("tela-datas-hedge");
    if (datas) P.iniciarTelaDatasHedge(datas);
    mostrarTela("inicial");
  }

  P.mostrarTela = mostrarTela;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})(window.Painel);
