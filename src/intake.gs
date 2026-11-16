/**
 * Entrada de documentos: varre a pasta do Drive, registra os arquivos na aba "Processamento" e remove versões substituídas.
 */

/**
 * Escaneia a pasta configurada em ENTRADA_FOLDER_ID e registra novos
 * arquivos na aba "Processamento". Cada arquivo recebe metadados
 * básicos extraídos do nome (empresa, mês, ano, tipo) e status
 * "PENDENTE_EXTRAÇÃO".
 */
function scanEntrada() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const procSheet = ss.getSheetByName('Processamento');
  if (!procSheet) {
    SpreadsheetApp.getUi().alert('Crie uma aba chamada "Processamento" antes de escanear.');
    return;
  }
  const entradaId = getConfigValue('ENTRADA_FOLDER_ID');
  if (!entradaId) {
    SpreadsheetApp.getUi().alert('Defina ENTRADA_FOLDER_ID na aba Config.');
    return;
  }
  const folder = DriveApp.getFolderById(entradaId);
  const files = listarArquivosEntrada_(folder);
  const colCount = Math.max(procSheet.getLastColumn(), 9);
  const createdAt = new Date();
  const header = procSheet.getLastRow() >= 1
    ? procSheet.getRange(1, 1, 1, colCount).getValues()[0]
    : new Array(colCount).fill('');
  const idxFileId = encontrarIndiceCabecalho_(header, ['file_id', 'id']);
  const idxEmpresa = encontrarIndiceCabecalho_(header, ['empresa']);
  const idxMes = encontrarIndiceCabecalho_(header, ['mes', 'mês']);
  const idxAno = encontrarIndiceCabecalho_(header, ['ano']);
  const idxTipo = encontrarIndiceCabecalho_(header, ['tipo']);
  const data = procSheet.getLastRow() >= 2
    ? procSheet.getRange(2, 1, procSheet.getLastRow() - 1, colCount).getValues()
    : [];

  const existingByKey = {};
  const existingIds = new Set();
  data.forEach(function(row) {
    const fileId = String(row[idxFileId >= 0 ? idxFileId : 0] || '').trim();
    if (fileId) existingIds.add(fileId);
    const key = normalizarChaveDocumento_(
      row[idxEmpresa >= 0 ? idxEmpresa : 2],
      row[idxMes >= 0 ? idxMes : 3],
      row[idxAno >= 0 ? idxAno : 4],
      row[idxTipo >= 0 ? idxTipo : 5]
    );
    if (!key) return;
    if (!existingByKey[key]) existingByKey[key] = [];
    if (fileId) existingByKey[key].push(fileId);
  });

  const selecionados = selecionarArquivosEntradaPorChave_(files);
  const idsParaRemover = new Set();
  Object.keys(selecionados.porChave).forEach(function(key) {
    if (!key || key.indexOf('id:') === 0) return;
    const escolhido = selecionados.porChave[key];
    const fileIdEscolhido = escolhido && escolhido.fileId ? escolhido.fileId : '';
    (existingByKey[key] || []).forEach(function(id) {
      if (id && id !== fileIdEscolhido) idsParaRemover.add(id);
    });
  });

  if (idsParaRemover.size > 0) {
    deletarRegistrosPorFileId_(procSheet, idsParaRemover, 1, ['file_id', 'id']);
    deletarRegistrosPorFileId_(ss.getSheetByName('BalancoBase'), idsParaRemover, 1, ['id', 'file_id']);
    deletarRegistrosPorFileId_(ss.getSheetByName('DreBase'), idsParaRemover, 1, ['id', 'file_id']);
    const indicadoresSheet = ss.getSheetByName('Indicadores');
    const headerRowIndicadores = (typeof INDICADORES_HEADER_ROW === 'number') ? INDICADORES_HEADER_ROW : 1;
    deletarRegistrosPorFileId_(indicadoresSheet, idsParaRemover, headerRowIndicadores, ['id', 'file_id']);
  }

  const existingAfter = new Set(Array.from(existingIds).filter(function(id) { return !idsParaRemover.has(id); }));
  const novos = [];
  selecionados.lista.forEach(function(item) {
    if (!item || !item.file) return;
    const file = item.file;
    const fileId = file.getId();
    if (existingAfter.has(fileId)) return;
    const meta = item.meta || parseFileName(file.getName());
    novos.push(montarLinhaProcessamento_(fileId, file.getName(), meta, colCount, createdAt));
  });
  if (novos.length > 0) {
    procSheet.getRange(procSheet.getLastRow() + 1, 1, novos.length, colCount).setValues(novos);
  }
}

/**
 * Sincroniza a aba Processamento com a pasta de entrada.
 * Registra novos arquivos e remove cadastros cujos arquivos
 * não existem mais na pasta, incluindo bases e indicadores.
 */
function sincronizarCadastrosEArquivos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const procSheet = ss.getSheetByName('Processamento');
  if (!procSheet) {
    SpreadsheetApp.getUi().alert('Crie uma aba chamada "Processamento" antes de sincronizar.');
    return;
  }
  const entradaId = getConfigValue('ENTRADA_FOLDER_ID');
  if (!entradaId) {
    SpreadsheetApp.getUi().alert('Defina ENTRADA_FOLDER_ID na aba Config.');
    return;
  }
  const folder = DriveApp.getFolderById(entradaId);
  const files = listarArquivosEntrada_(folder);
  const selecionados = selecionarArquivosEntradaPorChave_(files);
  const idsNaPasta = new Set(selecionados.lista.map(function(item) { return item.fileId; }));
  const idsRemover = new Set();
  const lastRow = procSheet.getLastRow();
  const lastCol = Math.max(procSheet.getLastColumn(), 9);
  const header = lastRow >= 1 ? procSheet.getRange(1, 1, 1, lastCol).getValues()[0] : new Array(lastCol).fill('');
  const idxFileId = encontrarIndiceCabecalho_(header, ['file_id', 'id']) >= 0 ? encontrarIndiceCabecalho_(header, ['file_id', 'id']) : 0;
  const data = lastRow >= 2 ? procSheet.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
  const rowsMantidas = [];
  const existing = new Set();
  data.forEach(function(row) {
    const fileId = String(row[idxFileId] || '').trim();
    if (!fileId) {
      rowsMantidas.push(row);
      return;
    }
    existing.add(fileId);
    if (idsNaPasta.has(fileId)) {
      rowsMantidas.push(row);
    } else {
      idsRemover.add(fileId);
    }
  });
  if (idsRemover.size > 0) {
    deletarRegistrosPorFileId_(ss.getSheetByName('BalancoBase'), idsRemover, 1, ['id', 'file_id']);
    deletarRegistrosPorFileId_(ss.getSheetByName('DreBase'), idsRemover, 1, ['id', 'file_id']);
    const indicadoresSheet = ss.getSheetByName('Indicadores');
    const headerRowIndicadores = (typeof INDICADORES_HEADER_ROW === 'number') ? INDICADORES_HEADER_ROW : 1;
    deletarRegistrosPorFileId_(indicadoresSheet, idsRemover, headerRowIndicadores, ['id', 'file_id']);
  }
  const createdAt = new Date();
  const novos = [];
  selecionados.lista.forEach(function(item) {
    const file = item.file;
    const fileId = item.fileId;
    if (!file || !fileId) return;
    if (existing.has(fileId)) return;
    const meta = item.meta || parseFileName(file.getName());
    novos.push(montarLinhaProcessamento_(fileId, file.getName(), meta, lastCol, createdAt));
  });
  const novoConteudo = [header].concat(rowsMantidas, novos);
  if (novoConteudo.length > 0) {
    procSheet.getRange(1, 1, novoConteudo.length, lastCol).setValues(novoConteudo);
  }
  if (lastRow > novoConteudo.length) {
    procSheet.getRange(novoConteudo.length + 1, 1, lastRow - novoConteudo.length, lastCol).clearContent();
  }
}

function deletarRegistrosPorFileId_(sheet, idsRemover, headerRow, possiveisCampos) {
  if (!sheet || !idsRemover || idsRemover.size === 0) return;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= headerRow) return;
  const header = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  const idxId = encontrarIndiceCabecalho_(header, possiveisCampos);
  if (idxId < 0) return;
  const data = sheet.getRange(headerRow + 1, 1, lastRow - headerRow, lastCol).getValues();
  const filtradas = [];
  data.forEach(function(row) {
    const fileId = String(row[idxId] || '').trim();
    if (fileId && idsRemover.has(fileId)) return;
    filtradas.push(row);
  });
  if (filtradas.length === data.length) return;
  const headerRows = sheet.getRange(1, 1, headerRow, lastCol).getValues();
  const output = headerRows.concat(filtradas);
  sheet.getRange(1, 1, output.length, lastCol).setValues(output);
  if (lastRow > output.length) {
    sheet.getRange(output.length + 1, 1, lastRow - output.length, lastCol).clearContent();
  }
}

function listarArquivosEntrada_(folder) {
  const files = [];
  if (!folder) return files;
  const it = folder.getFiles();
  while (it.hasNext()) {
    files.push(it.next());
  }
  return files;
}

function montarLinhaProcessamento_(fileId, fileName, meta, colCount, createdAt) {
  const row = new Array(colCount).fill('');
  if (colCount > 0) row[0] = fileId || '';
  if (colCount > 1) row[1] = fileName || '';
  if (colCount > 2) row[2] = coagirNomeEmpresa_(meta.empresa || '');
  if (colCount > 3) row[3] = meta.mes || '';
  if (colCount > 4) row[4] = meta.ano || '';
  if (colCount > 5) row[5] = meta.tipo || '';
  if (colCount > 6) row[6] = statusPendenteExtracao_();
  if (colCount > 7) row[7] = '';
  if (colCount > 8) row[8] = createdAt || new Date();
  return row;
}

function encontrarIndiceCabecalho_(header, nomes) {
  if (!header || !nomes || !nomes.length) return -1;
  const normalize = (typeof sanitizeName === 'function')
    ? sanitizeName
    : function(val) { return String(val || '').toLowerCase().trim(); };
  const targets = nomes.map(function(nome) { return normalize(nome); });
  for (let i = 0; i < header.length; i++) {
    const norm = normalize(header[i] || '');
    if (targets.indexOf(norm) !== -1) return i;
  }
  return -1;
}

function normalizarChaveDocumento_(empresa, mes, ano, tipo) {
  if (empresa == null || mes == null || ano == null) return '';
  const m = parseInt(mes, 10);
  const a = parseInt(ano, 10);
  if (!m || !a) return '';
  const nome = chaveEmpresa_(empresa);
  if (!nome) return '';
  const tipoRaw = String(tipo || '').toLowerCase();
  let tipoNorm = '';
  if (tipoRaw.indexOf('balan') !== -1) tipoNorm = 'BALANCO';
  else if (tipoRaw.indexOf('dre') !== -1) tipoNorm = 'DRE';
  else tipoNorm = String(tipo || '').toUpperCase().trim();
  return nome + '|' + m + '|' + a + '|' + tipoNorm;
}

function selecionarArquivosEntradaPorChave_(files) {
  const porChave = {};
  (files || []).forEach(function(file) {
    if (!file) return;
    const fileId = file.getId();
    const meta = parseFileName(file.getName());
    const key = normalizarChaveDocumento_(meta.empresa, meta.mes, meta.ano, meta.tipo) || ('id:' + fileId);
    const updated = file.getLastUpdated ? file.getLastUpdated().getTime() : 0;
    const atual = porChave[key];
    if (!atual || (updated && updated > atual.updated)) {
      porChave[key] = { file: file, fileId: fileId, meta: meta, updated: updated };
    }
  });
  const lista = Object.keys(porChave).map(function(k) { return porChave[k]; });
  return { porChave: porChave, lista: lista };
}
