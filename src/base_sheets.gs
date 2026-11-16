/**
 * Persistência nas abas BalancoBase e DreBase (a planilha funciona como banco de dados).
 */

/**
 * Insere as linhas extraídas de um balancete na aba BalancoBase.
 * A aba possui as colunas: id, mes, ano, empresa, conta, saldo anterior,
 * débito, crédito e saldo atual. Novas linhas são anexadas ao final.
 *
 * @param {Object} meta Metadados {empresa, mes, ano}
 * @param {Array<Object>} linhas Lista de objetos com os campos de conta e valores
 */
function ensureIdColumn_(sheet) {
  if (!sheet) return;
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return;
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const first = String(header[0] || '').toLowerCase().trim();
  if (first !== 'id') {
    sheet.insertColumnBefore(1);
    sheet.getRange(1, 1).setValue('id');
  }
}

function salvarLinhasBalanco_(meta, linhas) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('BalancoBase');
  if (!sheet) {
    sheet = ss.insertSheet('BalancoBase');
    sheet.appendRow(['id', 'mes', 'ano', 'empresa', 'conta', 'saldo anterior', 'debito', 'credito', 'saldo atual']);
  } else {
    ensureIdColumn_(sheet);
  }
  if (!linhas || !linhas.length) return;
  const fileId = meta.file_id || meta.fileId || meta.id || '';
  const empresa = coagirNomeEmpresa_(meta.empresa || '');
  const rows = [];
  linhas.forEach(function(l) {
    if (!l) return;
    const conta = l.conta || l.nome || l.descricao || '';
    if (!conta) return;
    const saldoAnterior = (l.saldo_anterior !== undefined && l.saldo_anterior !== null) ? l.saldo_anterior : '';
    const debito        = (l.debito        !== undefined && l.debito        !== null) ? l.debito        : '';
    const credito       = (l.credito       !== undefined && l.credito       !== null) ? l.credito       : '';
    const saldoAtual    = (l.saldo_atual   !== undefined && l.saldo_atual   !== null) ? l.saldo_atual   : '';
    rows.push([
      fileId,
      meta.mes || '',
      meta.ano || '',
      empresa,
      conta,
      saldoAnterior,
      debito,
      credito,
      saldoAtual
    ]);
  });
  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

/**
 * Insere as linhas extraídas de uma DRE na aba DreBase. A aba possui
 * as colunas: id, mes, ano, empresa, conta, valor atual, av atual (%),
 * valor anterior, av anterior (%) e ah (%). Novas linhas são
 * anexadas ao final.
 *
 * @param {Object} meta Metadados {empresa, mes, ano}
 * @param {Array<Object>} linhas Lista de objetos com os campos de conta e valores
 */
function salvarLinhasDre_(meta, linhas) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('DreBase');
  if (!sheet) {
    sheet = ss.insertSheet('DreBase');
    sheet.appendRow([
      'id', 'mes', 'ano', 'empresa', 'conta',
      'valor atual', 'av atual (%)',
      'valor anterior', 'av anterior (%)', 'ah (%)'
    ]);
  } else {
    ensureIdColumn_(sheet);
  }
  if (!linhas || !linhas.length) return;
  const fileId = meta.file_id || meta.fileId || meta.id || '';
  const empresa = coagirNomeEmpresa_(meta.empresa || '');
  const rows = [];
  linhas.forEach(function(l) {
    if (!l) return;
    const conta = l.conta || l.nome || l.descricao || '';
    if (!conta) return;
    let valorAtual = null;
    if (l.valor_atual !== undefined && l.valor_atual !== null) {
      valorAtual = l.valor_atual;
    } else if (l.valorAtual !== undefined && l.valorAtual !== null) {
      valorAtual = l.valorAtual;
    }
    let valorAnterior = null;
    if (l.valor_anterior !== undefined && l.valor_anterior !== null) {
      valorAnterior = l.valor_anterior;
    } else if (l.valorAnterior !== undefined && l.valorAnterior !== null) {
      valorAnterior = l.valorAnterior;
    }
    rows.push([
      fileId,
      meta.mes || '',
      meta.ano || '',
      empresa,
      conta,
      valorAtual !== null ? valorAtual : '',
      '',
      valorAnterior !== null ? valorAnterior : '',
      '',
      ''
    ]);
  });
  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function drePeriodoExiste(empresa, mes, ano) {
  try {
    const dre = carregarDreEmpresaPeriodo(empresa, mes, ano);
    return Array.isArray(dre) && dre.length > 0;
  } catch (e) {
    return false;
  }
}

function removerDrePeriodo_(empresa, mes, ano) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('DreBase');
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const lastCol = sheet.getLastColumn();
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idxMes = header.indexOf('mes');
  const idxAno = header.indexOf('ano');
  const idxEmpresa = header.indexOf('empresa');
  if (idxMes < 0 || idxAno < 0 || idxEmpresa < 0) return;
  const mesAlvo = parseInt(mes, 10);
  const anoAlvo = parseInt(ano, 10);
  const empresaKey = chaveEmpresa_(empresa);
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const kept = [];
  let removed = 0;
  values.forEach(function(row) {
    const rMes = parseInt(row[idxMes], 10);
    const rAno = parseInt(row[idxAno], 10);
    const rEmp = row[idxEmpresa];
    if (rMes === mesAlvo && rAno === anoAlvo && chaveEmpresa_(rEmp) === empresaKey) {
      removed++;
      return;
    }
    kept.push(row);
  });
  if (!removed) return;
  if (kept.length > 0) {
    sheet.getRange(2, 1, kept.length, lastCol).setValues(kept);
  }
  if (kept.length < values.length) {
    sheet.getRange(2 + kept.length, 1, values.length - kept.length, lastCol).clearContent();
  }
}

function removerBalancoPeriodo_(empresa, mes, ano) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('BalancoBase');
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const lastCol = sheet.getLastColumn();
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idxMes = header.indexOf('mes');
  const idxAno = header.indexOf('ano');
  const idxEmpresa = header.indexOf('empresa');
  if (idxMes < 0 || idxAno < 0 || idxEmpresa < 0) return;
  const mesAlvo = parseInt(mes, 10);
  const anoAlvo = parseInt(ano, 10);
  const empresaKey = chaveEmpresa_(empresa);
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const kept = [];
  let removed = 0;
  values.forEach(function(row) {
    const rMes = parseInt(row[idxMes], 10);
    const rAno = parseInt(row[idxAno], 10);
    const rEmp = row[idxEmpresa];
    if (rMes === mesAlvo && rAno === anoAlvo && chaveEmpresa_(rEmp) === empresaKey) {
      removed++;
      return;
    }
    kept.push(row);
  });
  if (!removed) return;
  if (kept.length > 0) {
    sheet.getRange(2, 1, kept.length, lastCol).setValues(kept);
  }
  if (kept.length < values.length) {
    sheet.getRange(2 + kept.length, 1, values.length - kept.length, lastCol).clearContent();
  }
}
