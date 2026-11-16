/**
 * Pontos de entrada do web app (portal) e da barra lateral de indicadores.
 */

/**
 * Serve o portal quando o script é implantado como web app.
 *
 * @return {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index').setTitle('RMA Pipeline');
}

/**
 * Retorna a URL de execução do web app. Se o script estiver
 * implantado como web app, ScriptApp.getService().getUrl() retorna a
 * URL pública; caso contrário, pode ser necessário substituir por
 * uma constante. Esta função é disponibilizada ao HTML.
 *
 * @return {string} URL do web app
 */
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}

/**
 * Abre a barra lateral com o painel de indicadores. O HTML é
 * carregado do arquivo IndicadoresSidebar (não incluído neste
 * refactoring), que deve existir no projeto. A barra lateral
 * permite visualizar gráficos e tabelas a partir da aba
 * "Indicadores".
 */
function abrirPainelIndicadores() {
  const html = HtmlService.createTemplateFromFile('IndicadoresSidebar')
    .evaluate()
    .setTitle('Painel de Indicadores');
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Retorna os dados presentes na aba "Indicadores" para consumo
 * pela interface HTML. O retorno contém um array de nomes de
 * indicadores (colunas) e um array de objetos, cada um com as
 * propriedades mes, ano, empresa e um objeto values com as demais
 * métricas.
 *
 * @return {{indicators: string[], rows: Array<Object>}}
 */
function getIndicadoresData() {
  const sheet = getIndicadoresSheet();
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  function detectarHeader() {
    const maxCheck = Math.min(lastRow, 5);
    for (let r = 1; r <= maxCheck; r++) {
      const rowVals = sheet.getRange(r, 1, 1, lastCol).getValues()[0];
      const c0 = sanitizeName(rowVals[0] || '');
      const c1 = sanitizeName(rowVals[1] || '');
      const c2 = sanitizeName(rowVals[2] || '');
      const c3 = sanitizeName(rowVals[3] || '');
      if (c0 === 'id' && c1 === 'mes' && c2 === 'ano' && c3 === 'empresa') return r;
      if (c0 === 'mes' && c1 === 'ano' && c2 === 'empresa') return r;
      if (c0 === 'mes' && c1 === 'ano') return r;
    }
    return (typeof INDICADORES_HEADER_ROW === 'number') ? INDICADORES_HEADER_ROW : 1;
  }
  const headerRow = detectarHeader();
  const dataStart = (typeof INDICADORES_DATA_START_ROW === 'number') ? INDICADORES_DATA_START_ROW : (headerRow + 1);
  if (lastRow < dataStart) return { indicators: [], rows: [] };
  const header = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  const headerNorm = header.map(function(h) { return sanitizeName(h || ''); });
  const idxMes = headerNorm.indexOf('mes');
  const idxAno = headerNorm.indexOf('ano');
  const idxEmpresa = headerNorm.indexOf('empresa');
  const maxIdx = Math.max(idxMes, idxAno, idxEmpresa);
  const startIndicators = maxIdx >= 0 ? (maxIdx + 1) : 3;
  const indicators = header.slice(startIndicators);
  const rows = [];
  const dataValues = sheet.getRange(dataStart, 1, lastRow - dataStart + 1, lastCol).getValues();
  for (let i = 0; i < dataValues.length; i++) {
    const row = dataValues[i];
    if (idxMes >= 0 && idxAno >= 0 && idxEmpresa >= 0) {
      if (!row[idxMes] && !row[idxAno] && !row[idxEmpresa]) continue;
    } else {
      if (!row[0] && !row[1] && !row[2]) continue;
    }
    const r = {
      mes: idxMes >= 0 ? row[idxMes] : row[0],
      ano: idxAno >= 0 ? row[idxAno] : row[1],
      empresa: idxEmpresa >= 0 ? row[idxEmpresa] : row[2],
      values: {},
      formatted: {}
    };
    for (let c = startIndicators; c < header.length; c++) {
      const colName = header[c];
      r.values[colName] = row[c]; // mantem o valor bruto para graficos
      r.formatted[colName] = formatarIndicadorValor(colName, row[c]);
    }
    rows.push(r);
  }
  return { indicators: indicators, rows: rows };
}

function formatarIndicadorValor(colName, val) {
  if (val == null || val === '') return '';
  if (typeof val === 'string' && val.trim() === '') return '';
  if (typeof val === 'number' && !isFinite(val)) return String(val);
  const isMoney = /\(R\$\)/i.test(String(colName || ''));
  const num = Number(val);
  if (!isFinite(num)) return val;
  const casas = isMoney ? 2 : 3;
  return num.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
