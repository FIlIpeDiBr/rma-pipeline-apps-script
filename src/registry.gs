/**
 * Cadastros do portal: listagem, edição e exclusão de empresas, períodos e documentos.
 */

function localizarIndiceCabecalho_(header, nomes) {
  if (!header || !nomes || !nomes.length) return -1;
  const targets = nomes.map(function(nome) { return sanitizeName(nome); });
  for (let i = 0; i < header.length; i++) {
    const norm = sanitizeName(header[i] || '');
    if (targets.indexOf(norm) !== -1) return i;
  }
  return -1;
}

function normalizarEmpresaKey_(empresa) {
  return chaveEmpresa_(empresa);
}

function formatarPeriodoCadastro_(mes, ano) {
  const m = parseInt(mes, 10);
  const a = parseInt(ano, 10);
  if (!m || !a) return '';
  return String(m).padStart(2, '0') + '/' + a;
}

function formatarDocumentoCadastro_(tipo) {
  const norm = sanitizeName(tipo || '');
  if (norm.indexOf('balanco') === 0) return 'Balanço';
  if (norm === 'dre') return 'DRE';
  return String(tipo || '').trim();
}

function normalizarStatusCadastro_(status) {
  const norm = sanitizeName(status || '');
  if (!norm) return '';
  if (norm === 'processado') return 'PROCESSADO';
  if (norm.indexOf('erro') === 0) return 'ERRO';
  return 'EXTRAÇÃO PENDENTE';
}

function formatarIndicadoresCadastro_(disponivel) {
  return disponivel ? 'DISPONÍVEIS' : 'INDISPONÍVEIS';
}

function construirIndicadoresLookup_() {
  const indicadoresSheet = getIndicadoresSheet();
  const lastRow = indicadoresSheet.getLastRow();
  const lastCol = indicadoresSheet.getLastColumn();
  if (lastRow < INDICADORES_DATA_START_ROW) return {};
  const colMap = getIndicadoresColIndexMap_(indicadoresSheet);
  if (colMap.idxMes == null || colMap.idxAno == null || colMap.idxEmpresa == null) return {};
  const values = indicadoresSheet.getRange(INDICADORES_DATA_START_ROW, 1, lastRow - INDICADORES_DATA_START_ROW + 1, lastCol).getValues();
  const lookup = {};
  values.forEach(function(row) {
    const empresaRaw = row[colMap.idxEmpresa];
    const empresa = coagirNomeEmpresa_(empresaRaw);
    if (!empresa || empresa.indexOf('[GRUPO] ') === 0) return;
    const mes = parseInt(row[colMap.idxMes], 10);
    const ano = parseInt(row[colMap.idxAno], 10);
    if (!mes || !ano) return;
    const key = normalizarEmpresaKey_(empresa) + '|' + mes + '|' + ano;
    lookup[key] = true;
  });
  return lookup;
}

/**
 * Retorna a lista detalhada de cadastros para o portal.
 *
 * @return {Array<Object>} Lista de linhas com grupo/empresa/periodo/documento/status/indicadores
 */
function listarCadastrosDetalhados() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const procSheet = ss.getSheetByName('Processamento');
  if (!procSheet) return [];
  const lastRow = procSheet.getLastRow();
  const lastCol = procSheet.getLastColumn();
  if (lastRow < 2) return [];
  const header = procSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idxEmpresa = localizarIndiceCabecalho_(header, ['empresa']);
  const idxGrupo = localizarIndiceCabecalho_(header, ['grupo']);
  const idxMes = localizarIndiceCabecalho_(header, ['mes', 'mês']);
  const idxAno = localizarIndiceCabecalho_(header, ['ano']);
  const idxTipo = localizarIndiceCabecalho_(header, ['tipo']);
  const idxStatus = localizarIndiceCabecalho_(header, ['status']);
  const idxFileId = localizarIndiceCabecalho_(header, ['file_id', 'id']);
  const idxNome = localizarIndiceCabecalho_(header, ['nome', 'nome do arquivo', 'nome arquivo', 'arquivo', 'file name', 'filename']);
  if (idxEmpresa < 0 || idxMes < 0 || idxAno < 0 || idxTipo < 0 || idxStatus < 0) {
    return [];
  }
  const indicadoresLookup = construirIndicadoresLookup_();
  const values = procSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const map = {};
  values.forEach(function(row) {
    const empresa = coagirNomeEmpresa_(row[idxEmpresa]);
    if (!empresa) return;
    const mes = parseInt(row[idxMes], 10);
    const ano = parseInt(row[idxAno], 10);
    if (!mes || !ano) return;
    const documento = formatarDocumentoCadastro_(row[idxTipo]);
    if (!documento) return;
    const grupo = idxGrupo >= 0 ? coagirNomeGrupo_(row[idxGrupo]) : '';
    const status = normalizarStatusCadastro_(row[idxStatus]);
    const periodo = formatarPeriodoCadastro_(mes, ano);
    const fileId = idxFileId >= 0 ? String(row[idxFileId] || '').trim() : '';
    const fileName = idxNome >= 0 ? String(row[idxNome] || '').trim() : '';
    const indicadorKey = normalizarEmpresaKey_(empresa) + '|' + mes + '|' + ano;
    const indicadores = formatarIndicadoresCadastro_(!!indicadoresLookup[indicadorKey]);
    const key = [grupo, empresa, periodo, documento].join('|');
    map[key] = {
      grupo: grupo,
      empresa: empresa,
      mes: mes,
      ano: ano,
      periodo: periodo,
      documento: documento,
      status: status,
      indicadores: indicadores,
      fileId: fileId,
      fileName: fileName
    };
  });
  return Object.keys(map).map(function(k) { return map[k]; });
}

function atualizarEmpresaEmSheet_(sheet, headerRow, dataStartRow, mapa) {
  if (!sheet) return 0;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < dataStartRow || lastCol < 1) return 0;
  let header = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  let idxEmpresa = localizarIndiceCabecalho_(header, ['empresa']);
  let startRow = dataStartRow;
  if (idxEmpresa < 0) {
    // Fallback: tenta localizar o cabecalho nas primeiras linhas.
    const maxCheck = Math.min(lastRow, 5);
    for (let r = 1; r <= maxCheck; r++) {
      const rowHeader = sheet.getRange(r, 1, 1, lastCol).getValues()[0];
      const idx = localizarIndiceCabecalho_(rowHeader, ['empresa']);
      if (idx >= 0) {
        header = rowHeader;
        idxEmpresa = idx;
        startRow = r + 1;
        break;
      }
    }
  }
  if (idxEmpresa < 0) return 0;
  const mapaNorm = {};
  const origem = (mapa && typeof mapa === 'object') ? mapa : {};
  Object.keys(origem).forEach(function(k) {
    const key = chaveEmpresa_(k);
    if (!key) return;
    const alvo = coagirNomeEmpresa_(origem[k]);
    if (alvo) mapaNorm[key] = alvo;
  });
  if (lastRow < startRow) return 0;
  const data = sheet.getRange(startRow, 1, lastRow - startRow + 1, lastCol).getValues();
  let alteradas = 0;
  for (let i = 0; i < data.length; i++) {
    const empRaw = data[i][idxEmpresa];
    const emp = coagirNomeEmpresa_(empRaw);
    const key = chaveEmpresa_(empRaw);
    const rawStr = String(empRaw == null ? '' : empRaw).trim();
    const pareceObjetoSerializado =
      typeof empRaw === 'object' ||
      /^\{[\s\S]*\}$/.test(rawStr) ||
      /^\[object\s+Object\]$/i.test(rawStr) ||
      /(?:^|[,{]\s*)empresa\s*[=:]/i.test(rawStr);
    if (!key && !emp) continue;
    if (key && mapaNorm[key]) {
      if (emp !== mapaNorm[key] || rawStr !== mapaNorm[key]) {
        data[i][idxEmpresa] = mapaNorm[key];
        alteradas++;
      }
    } else if (emp && (rawStr !== emp || pareceObjetoSerializado)) {
      data[i][idxEmpresa] = emp;
      alteradas++;
    }
  }
  if (alteradas > 0) {
    sheet.getRange(startRow, 1, data.length, lastCol).setValues(data);
  }
  return alteradas;
}

function atualizarGrupoEmProcessamento_(sheet) {
  if (!sheet) return 0;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return 0;
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idxGrupo = localizarIndiceCabecalho_(header, ['grupo']);
  if (idxGrupo < 0) return 0;
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  let alteradas = 0;
  for (let i = 0; i < values.length; i++) {
    const raw = values[i][idxGrupo];
    const grupo = coagirNomeGrupo_(raw);
    if (String(raw == null ? '' : raw).trim() !== grupo) {
      values[i][idxGrupo] = grupo;
      alteradas++;
    }
  }
  if (alteradas > 0) {
    sheet.getRange(2, 1, values.length, lastCol).setValues(values);
  }
  return alteradas;
}

/**
 * Atualiza empresa e grupo a partir do portal.
 *
 * @param {Array<{empresaOriginal:string, empresaNova:string, grupo:string}>} ajustes
 */
function salvarCadastros(ajustes) {
    if (!ajustes || !ajustes.length) return;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const procSheet = ss.getSheetByName('Processamento');
    if (!procSheet) return;
    const empresaCol = getEmpresaColIndex_(procSheet);
    const grupoCol = ensureGrupoColumn_(procSheet);
    const data = procSheet.getDataRange().getValues();
    if (data.length < 2) return;
    const mapa = {};
    const mapaNorm = {};
    const mapaEmpresaNome = {};
    ajustes.forEach(function(item) {
      if (!item) return;
      const original = coagirNomeEmpresa_(item.empresaOriginal || '');
      if (!original) return;
      const novoNome = coagirNomeEmpresa_(item.empresaNova || '') || original;
      const novoGrupo = coagirNomeGrupo_(item.grupo || '');
      mapa[original] = { empresa: novoNome, grupo: novoGrupo };
      mapaNorm[chaveEmpresa_(original)] = { empresa: novoNome, grupo: novoGrupo };
      mapaEmpresaNome[original] = novoNome;
    });
    const chaves = Object.keys(mapa);
    if (!chaves.length) return;
    for (let i = 1; i < data.length; i++) {
      const emp = coagirNomeEmpresa_(data[i][empresaCol - 1]);
      const key = chaveEmpresa_(data[i][empresaCol - 1]);
      if (!emp || !key || !mapaNorm[key]) continue;
      const alvo = mapaNorm[key];
      if (alvo.empresa !== emp) {
        procSheet.getRange(i + 1, empresaCol).setValue(alvo.empresa);
      }
      procSheet.getRange(i + 1, grupoCol).setValue(coagirNomeGrupo_(alvo.grupo));
    }

    // Atualiza o nome da empresa nas bases e indicadores
    atualizarEmpresaEmSheet_(ss.getSheetByName('BalancoBase'), 1, 2, mapaEmpresaNome);
    atualizarEmpresaEmSheet_(ss.getSheetByName('DreBase'), 1, 2, mapaEmpresaNome);
    if (typeof INDICADORES_HEADER_ROW === 'number' && typeof INDICADORES_DATA_START_ROW === 'number') {
      atualizarEmpresaEmSheet_(ss.getSheetByName('Indicadores'), INDICADORES_HEADER_ROW, INDICADORES_DATA_START_ROW, mapaEmpresaNome);
    } else {
      atualizarEmpresaEmSheet_(ss.getSheetByName('Indicadores'), 1, 2, mapaEmpresaNome);
    }
  }

function excluirCadastrosSelecionados(selecionados) {
  if (!selecionados || !selecionados.length) return;
  const idsSet = {};
  (selecionados || []).forEach(function(item) {
    if (item && item.fileId) {
      idsSet[String(item.fileId)] = true;
    }
  });
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // O pedido vem do navegador: só vale para arquivos que estão no cadastro.
  const ids = filtrarIdsCadastrados_(ss.getSheetByName('Processamento'), Object.keys(idsSet));
  if (!ids.length) return;
  Object.keys(idsSet).forEach(function(id) {
    if (ids.indexOf(id) === -1) delete idsSet[id];
  });

  removerLinhasPorIds_(ss.getSheetByName('Processamento'), 1, 2, ['file_id', 'id'], idsSet);
  removerLinhasPorIds_(ss.getSheetByName('DreBase'), 1, 2, ['id', 'file_id'], idsSet);
  removerLinhasPorIds_(ss.getSheetByName('BalancoBase'), 1, 2, ['id', 'file_id'], idsSet);
  removerLinhasPorIds_(ss.getSheetByName('Indicadores'), INDICADORES_HEADER_ROW, INDICADORES_DATA_START_ROW, ['id', 'file_id'], idsSet);

  enfileirarArquivosParaExclusao_(ids);
  processarFilaExclusaoArquivos_();
}

/**
 * Devolve, dos IDs pedidos, só os que estão cadastrados na aba "Processamento".
 * Sem este filtro, quem abre o portal poderia mandar para a lixeira qualquer
 * arquivo do Drive de quem implantou o web app, bastando conhecer o ID.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} procSheet Aba Processamento
 * @param {string[]} ids IDs recebidos do navegador
 * @return {string[]} IDs que existem no cadastro
 */
function filtrarIdsCadastrados_(procSheet, ids) {
  if (!procSheet || procSheet.getLastRow() < 2) return [];
  const header = procSheet.getRange(1, 1, 1, procSheet.getLastColumn()).getValues()[0];
  let idx = localizarIndiceCabecalho_(header, ['file_id', 'id']);
  if (idx < 0) idx = 0;
  const cadastrados = {};
  procSheet.getRange(2, idx + 1, procSheet.getLastRow() - 1, 1).getValues().forEach(function(linha) {
    const id = String(linha[0] || '').trim();
    if (id) cadastrados[id] = true;
  });
  return (ids || []).filter(function(id) { return cadastrados[String(id)] === true; });
}

function enfileirarArquivosParaExclusao_(ids) {
  const props = PropertiesService.getScriptProperties();
  const key = 'EXCLUSAO_ARQUIVOS_QUEUE';
  let fila = [];
  try {
    fila = JSON.parse(props.getProperty(key) || '[]');
  } catch (e) {
    fila = [];
  }
  const set = {};
  fila.forEach(function(id) { if (id) set[String(id)] = true; });
  (ids || []).forEach(function(id) {
    const k = String(id || '').trim();
    if (!k || set[k]) return;
    set[k] = true;
    fila.push(k);
  });
  props.setProperty(key, JSON.stringify(fila));
}

function processarFilaExclusaoArquivos_() {
  const props = PropertiesService.getScriptProperties();
  const key = 'EXCLUSAO_ARQUIVOS_QUEUE';
  let fila = [];
  try {
    fila = JSON.parse(props.getProperty(key) || '[]');
  } catch (e) {
    fila = [];
  }
  if (!fila.length) return;

  const maxPorExecucao = 40;
  let processados = 0;
  while (fila.length && processados < maxPorExecucao) {
    const id = String(fila.shift() || '').trim();
    if (!id) continue;
    try {
      DriveApp.getFileById(id).setTrashed(true);
    } catch (e) {}
    processados++;
  }

  if (fila.length) {
    props.setProperty(key, JSON.stringify(fila));
    criarTriggerUnico_('processarFilaExclusaoArquivos_', 1);
  } else {
    props.deleteProperty(key);
  }
}

function removerLinhasPorIds_(sheet, headerRow, dataStartRow, idHeaders, idsSet) {
  if (!sheet) return 0;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < dataStartRow || lastCol < 1) return 0;
  const header = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  const idx = localizarIndiceCabecalho_(header, idHeaders);
  if (idx < 0) return 0;
  const totalRows = lastRow - dataStartRow + 1;
  const values = sheet.getRange(dataStartRow, 1, totalRows, lastCol).getValues();
  const filtradas = [];
  let removidos = 0;
  for (let i = 0; i < values.length; i++) {
    const val = String(values[i][idx] || '').trim();
    if (val && idsSet[val]) {
      removidos++;
      continue;
    }
    filtradas.push(values[i]);
  }
  if (!removidos) return 0;
  if (filtradas.length > 0) {
    sheet.getRange(dataStartRow, 1, filtradas.length, lastCol).setValues(filtradas);
  }
  const limpar = totalRows - filtradas.length;
  if (limpar > 0) {
    sheet.getRange(dataStartRow + filtradas.length, 1, limpar, lastCol).clearContent();
  }
  return removidos;
}
