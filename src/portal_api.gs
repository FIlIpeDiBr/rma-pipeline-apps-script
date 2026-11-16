/**
 * Consultas usadas pelos seletores do portal: empresas, grupos e períodos disponíveis.
 */

/**
 * Retorna a lista de empresas disponíveis na aba Processamento. O
 * cabeçalho é usado para identificar a coluna "Empresa". Resulta
 * em um array de strings sem duplicados.
 * @return {string[]} Lista de empresas
 */
function getEmpresasDisponiveis() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Processamento');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return [];
  const header = data[0];
  let idxEmpresa = header.findIndex(function(h) {
    const v = String(h).toLowerCase().trim();
    return v === 'empresa' || v.indexOf('empresa') !== -1;
  });
  if (idxEmpresa < 0) idxEmpresa = 0;
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const nome = coagirNomeEmpresa_(data[i][idxEmpresa]);
    const key = chaveEmpresa_(data[i][idxEmpresa]);
    if (!nome || !key) continue;
    if (!map[key]) map[key] = nome;
  }
  return Object.keys(map).map(function(k) { return map[k]; }).sort();
}

/**
 * Retorna a lista de grupos disponíveis na aba Processamento.
 * A coluna "Grupo" é detectada no cabeçalho. Retorna um array
 * sem duplicados.
 * @return {string[]} Lista de grupos
 */
function getGruposDisponiveis() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Processamento');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return [];
  const header = data[0];
  let idxGrupo = header.findIndex(function(h) {
    const v = String(h).toLowerCase().trim();
    return v === 'grupo' || v.indexOf('grupo') !== -1;
  });
  if (idxGrupo < 0) return [];
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const nome = coagirNomeGrupo_(data[i][idxGrupo]);
    if (!nome) continue;
    const key = sanitizeName(nome);
    if (!key) continue;
    if (!map[key]) map[key] = nome;
  }
  return Object.keys(map).map(function(k) { return map[k]; }).sort();
}

/**
 * Retorna a lista de períodos disponíveis (mes/ano) para uma
 * determinada empresa. A aba Processamento é percorrida para
 * encontrar todas as combinações únicas de mês e ano para a
 * empresa informada.
 * @param {string} empresa Nome da empresa
 * @return {string[]} Lista de períodos no formato "MM/AAAA"
 */
function getPeriodosDisponiveisParaEmpresa(empresa) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Processamento');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return [];
  const header = data[0];
  let idxEmpresa = header.findIndex(function(h) {
    const v = String(h).toLowerCase().trim();
    return v === 'empresa' || v.indexOf('empresa') !== -1;
  });
  let idxMes = header.findIndex(function(h) {
    const v = String(h).toLowerCase().trim();
    return v === 'mês' || v === 'mes';
  });
  let idxAno = header.findIndex(function(h) {
    const v = String(h).toLowerCase().trim();
    return v === 'ano';
  });
  if (idxEmpresa < 0 || idxMes < 0 || idxAno < 0) return [];
  const empresaKey = chaveEmpresa_(empresa);
  if (!empresaKey) return [];
  const set = new Set();
  for (let i = 1; i < data.length; i++) {
    if (chaveEmpresa_(data[i][idxEmpresa]) === empresaKey) {
      const mes = data[i][idxMes];
      const ano = data[i][idxAno];
      if (mes && ano) {
        const m = String(mes).padStart(2, '0');
        set.add(m + '/' + ano);
      }
    }
  }
  return Array.from(set).sort(function(a,b){
    // ordenar por ano e mes
    const [ma, aa] = a.split('/').map(Number);
    const [mb, ab] = b.split('/').map(Number);
    if (aa === ab) return ma - mb;
    return aa - ab;
  });
}

/**
 * Retorna a lista de períodos disponíveis (mes/ano) para um
 * determinado grupo. Percorre a aba Processamento para encontrar
 * combinações únicas de mês e ano onde o campo "Grupo" coincide
 * com o valor informado.
 * @param {string} grupo Nome do grupo
 * @return {string[]} Lista de períodos no formato "MM/AAAA"
 */
function getPeriodosDisponiveisParaGrupo(grupo) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Processamento');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return [];
  const header = data[0];
  let idxGrupo = header.findIndex(function(h) {
    const v = String(h).toLowerCase().trim();
    return v === 'grupo' || v.indexOf('grupo') !== -1;
  });
  let idxMes = header.findIndex(function(h) {
    const v = String(h).toLowerCase().trim();
    return v === 'mês' || v === 'mes';
  });
  let idxAno = header.findIndex(function(h) {
    const v = String(h).toLowerCase().trim();
    return v === 'ano';
  });
  if (idxGrupo < 0 || idxMes < 0 || idxAno < 0) return [];
  const grupoAlvo = coagirNomeGrupo_(grupo);
  if (!grupoAlvo) return [];
  const set = new Set();
  for (let i = 1; i < data.length; i++) {
    if (coagirNomeGrupo_(data[i][idxGrupo]) === grupoAlvo) {
      const mes = data[i][idxMes];
      const ano = data[i][idxAno];
      if (mes && ano) {
        const m = String(mes).padStart(2, '0');
        set.add(m + '/' + ano);
      }
    }
  }
  return Array.from(set).sort(function(a,b){
    const [ma, aa] = a.split('/').map(Number);
    const [mb, ab] = b.split('/').map(Number);
    if (aa === ab) return ma - mb;
    return aa - ab;
  });
}
