(function (exportar) {
  // Empresa -> Emp_ID no T.IMP
  const EMPRESAS = [
    { codigo: "BR02", nome: "CARREFOUR", empId: "3" },
    { codigo: "BR21", nome: "WMB", empId: "4" },
    { codigo: "BR22", nome: "WMS", empId: "6" },
  ];

  // Tipo de contrato -> trecho do endereço no T.IMP (/contrato/<caminho>/)
  const TIPOS = {
    TERCEIROS: { rotulo: "Terceiros", caminho: "pagterceiro" },
    HEDGE: { rotulo: "Hedge", caminho: "hedge" },
  };

  // Rotina de datas dos hedges -> passo do T.IMP
  const PASSOS_HEDGE = {
    NOVOS: { rotulo: "Hedges Novos", passo: "Passo01a" },
    EXPIRADOS: { rotulo: "Hedges Expirados", passo: "Passo01b" },
  };

  exportar({ EMPRESAS, TIPOS, PASSOS_HEDGE });
})(function (api) {
  if (typeof module !== "undefined" && module.exports) Object.assign(module.exports, api);
  else Object.assign(window.Painel, api);
});
