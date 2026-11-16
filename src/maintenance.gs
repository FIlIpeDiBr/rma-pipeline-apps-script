/**
 * Rotinas de manutenção: saneamento de nomes de empresa nas bases, vínculo de IDs e limpeza de propriedades.
 */

function construirMapaEmpresasCanonicas_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const procSheet = ss.getSheetByName('Processamento');
  if (!procSheet) return {};
  const lastRow = procSheet.getLastRow();
  const lastCol = procSheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return {};
  const header = procSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idxEmpresa = localizarIndiceCabecalho_(header, ['empresa']);
  if (idxEmpresa < 0) return {};
  const values = procSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const mapa = {};
  values.forEach(function(row) {
    const empresa = coagirNomeEmpresa_(row[idxEmpresa]);
    const key = chaveEmpresa_(empresa);
    if (!key || !empresa) return;
    if (!mapa[key]) mapa[key] = empresa;
  });
  return mapa;
}

function removerDreSinteticaSemId_(sheet) {
  if (!sheet) return 0;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return 0;
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idxId = localizarIndiceCabecalho_(header, ['id', 'file_id']);
  const idxMes = localizarIndiceCabecalho_(header, ['mes', 'mês']);
  const idxAno = localizarIndiceCabecalho_(header, ['ano']);
  const idxEmpresa = localizarIndiceCabecalho_(header, ['empresa']);
  if (idxId < 0 || idxMes < 0 || idxAno < 0 || idxEmpresa < 0) return 0;
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const hasReal = {};
  values.forEach(function(row) {
    const id = String(row[idxId] || '').trim();
    if (!id) return;
    const mes = parseInt(row[idxMes], 10);
    const ano = parseInt(row[idxAno], 10);
    const empKey = chaveEmpresa_(row[idxEmpresa]);
    if (!mes || !ano || !empKey) return;
    hasReal[empKey + '|' + mes + '|' + ano] = true;
  });
  const kept = [];
  let removed = 0;
  values.forEach(function(row) {
    const id = String(row[idxId] || '').trim();
    const mes = parseInt(row[idxMes], 10);
    const ano = parseInt(row[idxAno], 10);
    const empKey = chaveEmpresa_(row[idxEmpresa]);
    const key = empKey + '|' + mes + '|' + ano;
    if (!id && hasReal[key]) {
      removed++;
      return;
    }
    kept.push(row);
  });
  if (removed > 0) {
    if (kept.length > 0) {
      sheet.getRange(2, 1, kept.length, lastCol).setValues(kept);
    }
    if (kept.length < values.length) {
      sheet.getRange(2 + kept.length, 1, values.length - kept.length, lastCol).clearContent();
    }
  }
  return removed;
}

/**
 * Corrige valores de empresa serializados como objeto nas abas de base
 * e remove DRE sintética sem ID quando já existir DRE real no período.
 */
function sanearEmpresasNasBases() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mapaCanon = construirMapaEmpresasCanonicas_();
  const proc = ss.getSheetByName('Processamento');
  const bal = ss.getSheetByName('BalancoBase');
  const dre = ss.getSheetByName('DreBase');
  const ind = ss.getSheetByName('Indicadores');
  const procEmp = atualizarEmpresaEmSheet_(proc, 1, 2, mapaCanon);
  const balEmp = atualizarEmpresaEmSheet_(bal, 1, 2, mapaCanon);
  const dreEmp = atualizarEmpresaEmSheet_(dre, 1, 2, mapaCanon);
  let indEmp = 0;
  if (typeof INDICADORES_HEADER_ROW === 'number' && typeof INDICADORES_DATA_START_ROW === 'number') {
    indEmp = atualizarEmpresaEmSheet_(ind, INDICADORES_HEADER_ROW, INDICADORES_DATA_START_ROW, mapaCanon);
  } else {
    indEmp = atualizarEmpresaEmSheet_(ind, 1, 2, mapaCanon);
  }
  const gruposSaneados = atualizarGrupoEmProcessamento_(proc);
  const removidos = removerDreSinteticaSemId_(dre);
  SpreadsheetApp.getUi().alert(
    'Saneamento concluido. Empresas ajustadas - Processamento: ' + procEmp +
    ', BalancoBase: ' + balEmp +
    ', DreBase: ' + dreEmp +
    ', Indicadores: ' + indEmp +
    '. Grupos ajustados na aba Processamento: ' + gruposSaneados +
    '. Linhas de DRE sintetica removidas: ' + removidos + '.'
  );
}

function sanearEmpresasBalancoEDre() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mapaCanon = construirMapaEmpresasCanonicas_();
  const bal = ss.getSheetByName('BalancoBase');
  const dre = ss.getSheetByName('DreBase');
  const balEmp = atualizarEmpresaEmSheet_(bal, 1, 2, mapaCanon);
  const dreEmp = atualizarEmpresaEmSheet_(dre, 1, 2, mapaCanon);
  SpreadsheetApp.getUi().alert(
    'Saneamento de empresas concluido. BalancoBase: ' + balEmp +
    ' linha(s) ajustada(s). DreBase: ' + dreEmp + ' linha(s) ajustada(s).'
  );
}

function vincularFileIdDreSemId_(empresa, mes, ano, fileId) {
  const idAlvo = String(fileId || '').trim();
  if (!idAlvo) return 0;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('DreBase');
  if (!sheet) return 0;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return 0;
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idxMes = header.indexOf('mes');
  const idxAno = header.indexOf('ano');
  const idxEmpresa = header.indexOf('empresa');
  let idxId = header.indexOf('id');
  if (idxId < 0) idxId = header.indexOf('file_id');
  if (idxMes < 0 || idxAno < 0 || idxEmpresa < 0 || idxId < 0) return 0;
  const mesAlvo = parseInt(mes, 10);
  const anoAlvo = parseInt(ano, 10);
  const empKey = chaveEmpresa_(empresa);
  if (!mesAlvo || !anoAlvo || !empKey) return 0;
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  let alteradas = 0;
  for (let i = 0; i < values.length; i++) {
    const rMes = parseInt(values[i][idxMes], 10);
    const rAno = parseInt(values[i][idxAno], 10);
    const rEmpKey = chaveEmpresa_(values[i][idxEmpresa]);
    if (rMes !== mesAlvo || rAno !== anoAlvo || rEmpKey !== empKey) continue;
    const rId = String(values[i][idxId] || '').trim();
    if (rId) continue;
    values[i][idxId] = idAlvo;
    alteradas++;
  }
  if (alteradas > 0) {
    sheet.getRange(2, 1, values.length, lastCol).setValues(values);
  }
  return alteradas;
}

function corrigirVinculoIdDreSemId() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const proc = ss.getSheetByName('Processamento');
  if (!proc) {
    SpreadsheetApp.getUi().alert('Aba "Processamento" não encontrada.');
    return;
  }
  const lastRow = proc.getLastRow();
  const lastCol = proc.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    SpreadsheetApp.getUi().alert('Aba "Processamento" sem dados para correção.');
    return;
  }
  const header = proc.getRange(1, 1, 1, lastCol).getValues()[0];
  function idx(names) {
    const alvos = names.map(function(n) { return sanitizeName(n); });
    for (let i = 0; i < header.length; i++) {
      const norm = sanitizeName(header[i] || '');
      if (alvos.indexOf(norm) !== -1) return i;
    }
    return -1;
  }
  const idxId = idx(['file_id', 'id']);
  const idxEmp = idx(['empresa']);
  const idxMes = idx(['mes', 'mês']);
  const idxAno = idx(['ano']);
  const idxTipo = idx(['tipo']);
  if (idxId < 0 || idxEmp < 0 || idxMes < 0 || idxAno < 0) {
    SpreadsheetApp.getUi().alert('Cabeçalho da aba "Processamento" não está no formato esperado.');
    return;
  }
  const data = proc.getRange(2, 1, lastRow - 1, lastCol).getValues();
  let ajustadas = 0;
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const fileId = String(row[idxId] || '').trim();
    if (!fileId) continue;
    const tipo = idxTipo >= 0 ? sanitizeName(row[idxTipo] || '') : '';
    if (tipo && tipo !== 'balanco') continue;
    const emp = coagirNomeEmpresa_(row[idxEmp]);
    const mes = parseInt(row[idxMes], 10);
    const ano = parseInt(row[idxAno], 10);
    if (!emp || !mes || !ano) continue;
    ajustadas += vincularFileIdDreSemId_(emp, mes, ano, fileId);
  }
  SpreadsheetApp.getUi().alert('Correção concluída. Linhas de DRE com id vinculado: ' + ajustadas + '.');
}

/**
 * Limpa propriedades do script que nao fazem parte da allowlist.
 * Mantem apenas as chaves essenciais utilizadas pelo sistema.
 *
 * Retorna uma mensagem de resumo e exibe um alerta quando possivel.
 */
function limparPropriedadesScript() {
  const props = PropertiesService.getScriptProperties();
  const allowlist = {
    OPENAI_API_KEY: true,
    FILA_RELATORIOS: true,
    IA_DOC_QUEUE: true,
    IA_GRUPO_QUEUE: true
  };
  const all = props.getProperties() || {};
  const keys = Object.keys(all);
  const remover = keys.filter(function(key) { return !allowlist[key]; });
  remover.forEach(function(key) { props.deleteProperty(key); });

  const detalhes = remover.slice(0, 5).join(', ');
  const msg = remover.length
    ? ('Removidas ' + remover.length + ' propriedades extras.' + (detalhes ? ' Ex: ' + detalhes : ''))
    : 'Nenhuma propriedade extra encontrada.';
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    Logger.log(msg);
  }
  if (remover.length) {
    Logger.log('Propriedades removidas: ' + remover.join(', '));
  }
  return msg;
}
