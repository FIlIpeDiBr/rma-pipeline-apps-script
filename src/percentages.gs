/**
 * Análise vertical (AV%) e horizontal (AH%) das bases de DRE e balancete.
 */

function _limitarDuasCasas(val) {
  if (typeof val !== 'number' || !isFinite(val)) return val;
  return Math.round(val * 100) / 100;
}

function _numeroCelulaIndicador_(val) {
  if (val === '' || val == null) return 0;
  if (typeof val === 'number') return isFinite(val) ? val : 0;
  const n = Number(val);
  if (isFinite(n)) return n;
  if (typeof converterValor === 'function') {
    const conv = converterValor(val);
    return isFinite(conv) ? conv : 0;
  }
  return 0;
}

function _valorAnteriorZeradoOuVazio_(val) {
  if (val === '' || val == null) return true;
  return Math.abs(_numeroCelulaIndicador_(val)) < 1e-12;
}

function preencherValorAnteriorDreComPeriodoAnterior_(quiet) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('DreBase');
  if (!sheet) {
    if (!quiet) alertSafe('Aba "DreBase" não encontrada.');
    return { ok: false, atualizadas: 0 };
  }
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return { ok: true, atualizadas: 0 };
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idxMes = header.indexOf('mes');
  const idxAno = header.indexOf('ano');
  const idxEmpresa = header.indexOf('empresa');
  const idxConta = header.indexOf('conta');
  const idxValAtual = header.indexOf('valor atual');
  const idxValAnt = header.indexOf('valor anterior');
  if (idxMes < 0 || idxAno < 0 || idxEmpresa < 0 || idxConta < 0 || idxValAtual < 0 || idxValAnt < 0) {
    if (!quiet) alertSafe('Cabeçalho da aba "DreBase" não está no formato esperado.');
    return { ok: false, atualizadas: 0 };
  }
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const lookupAtual = {};
  values.forEach(function(row) {
    const empresaKey = chaveEmpresa_(row[idxEmpresa]);
    const contaKey = normalizarChaveIndicador(row[idxConta]);
    const mes = parseInt(row[idxMes], 10);
    const ano = parseInt(row[idxAno], 10);
    if (!empresaKey || !contaKey || !mes || !ano) return;
    lookupAtual[empresaKey + '|' + mes + '|' + ano + '|' + contaKey] = row[idxValAtual];
  });
  let atualizadas = 0;
  values.forEach(function(row) {
    if (!_valorAnteriorZeradoOuVazio_(row[idxValAnt])) return;
    const empresaKey = chaveEmpresa_(row[idxEmpresa]);
    const contaKey = normalizarChaveIndicador(row[idxConta]);
    const mes = parseInt(row[idxMes], 10);
    const ano = parseInt(row[idxAno], 10);
    if (!empresaKey || !contaKey || !mes || !ano) return;
    const prevMes = mes === 1 ? 12 : (mes - 1);
    const prevAno = mes === 1 ? (ano - 1) : ano;
    if (prevAno <= 0) return;
    const prevKey = empresaKey + '|' + prevMes + '|' + prevAno + '|' + contaKey;
    if (!Object.prototype.hasOwnProperty.call(lookupAtual, prevKey)) return;
    const valorPrevAtual = lookupAtual[prevKey];
    if (_numeroCelulaIndicador_(row[idxValAnt]) !== _numeroCelulaIndicador_(valorPrevAtual) || row[idxValAnt] !== valorPrevAtual) {
      row[idxValAnt] = valorPrevAtual;
      atualizadas++;
    }
  });
  if (atualizadas > 0) {
    sheet.getRange(2, 1, values.length, lastCol).setValues(values);
  }
  return { ok: true, atualizadas: atualizadas };
}

function preencherSaldoAnteriorBalancoComPeriodoAnterior_(quiet) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('BalancoBase');
  if (!sheet) {
    if (!quiet) alertSafe('Aba "BalancoBase" não encontrada.');
    return { ok: false, atualizadas: 0 };
  }
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return { ok: true, atualizadas: 0 };
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idxMes = header.indexOf('mes');
  const idxAno = header.indexOf('ano');
  const idxEmpresa = header.indexOf('empresa');
  const idxConta = header.indexOf('conta');
  const idxSaldoAtual = header.indexOf('saldo atual');
  const idxSaldoAnt = header.indexOf('saldo anterior');
  if (idxMes < 0 || idxAno < 0 || idxEmpresa < 0 || idxConta < 0 || idxSaldoAtual < 0 || idxSaldoAnt < 0) {
    if (!quiet) alertSafe('Cabeçalho da aba "BalancoBase" não está no formato esperado.');
    return { ok: false, atualizadas: 0 };
  }
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const lookupAtual = {};
  values.forEach(function(row) {
    const empresaKey = chaveEmpresa_(row[idxEmpresa]);
    const contaKey = normalizarChaveIndicador(row[idxConta]);
    const mes = parseInt(row[idxMes], 10);
    const ano = parseInt(row[idxAno], 10);
    if (!empresaKey || !contaKey || !mes || !ano) return;
    lookupAtual[empresaKey + '|' + mes + '|' + ano + '|' + contaKey] = row[idxSaldoAtual];
  });
  let atualizadas = 0;
  values.forEach(function(row) {
    if (!_valorAnteriorZeradoOuVazio_(row[idxSaldoAnt])) return;
    const empresaKey = chaveEmpresa_(row[idxEmpresa]);
    const contaKey = normalizarChaveIndicador(row[idxConta]);
    const mes = parseInt(row[idxMes], 10);
    const ano = parseInt(row[idxAno], 10);
    if (!empresaKey || !contaKey || !mes || !ano) return;
    const prevMes = mes === 1 ? 12 : (mes - 1);
    const prevAno = mes === 1 ? (ano - 1) : ano;
    if (prevAno <= 0) return;
    const prevKey = empresaKey + '|' + prevMes + '|' + prevAno + '|' + contaKey;
    if (!Object.prototype.hasOwnProperty.call(lookupAtual, prevKey)) return;
    const valorPrevAtual = lookupAtual[prevKey];
    if (_numeroCelulaIndicador_(row[idxSaldoAnt]) !== _numeroCelulaIndicador_(valorPrevAtual) || row[idxSaldoAnt] !== valorPrevAtual) {
      row[idxSaldoAnt] = valorPrevAtual;
      atualizadas++;
    }
  });
  if (atualizadas > 0) {
    sheet.getRange(2, 1, values.length, lastCol).setValues(values);
  }
  return { ok: true, atualizadas: atualizadas };
}

function preencherValoresAnterioresComPeriodoAnterior_(quiet) {
  const dre = preencherValorAnteriorDreComPeriodoAnterior_(true);
  const bal = preencherSaldoAnteriorBalancoComPeriodoAnterior_(true);
  if (!quiet) {
    alertSafe(
      'Preenchimento de periodo anterior concluido. DRE: ' + dre.atualizadas +
      ' linha(s), Balanco: ' + bal.atualizadas + ' linha(s).'
    );
  }
  return { dre: dre, bal: bal };
}

function calcularPercentuaisDre(quiet) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('DreBase');
  if (!sheet) {
    if (!quiet) alertSafe('Aba "DreBase" não encontrada.');
    return false;
  }
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) {
    if (!quiet) alertSafe('Aba "DreBase" não possui dados.');
    return false;
  }
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idxMes     = header.indexOf('mes');
  const idxAno     = header.indexOf('ano');
  const idxEmpresa = header.indexOf('empresa');
  const idxConta   = header.indexOf('conta');
  const idxValAtual  = header.indexOf('valor atual');
  const idxAvAtual   = header.indexOf('av atual (%)');
  const idxValAnt    = header.indexOf('valor anterior');
  const idxAvAnt     = header.indexOf('av anterior (%)');
  const idxAh        = header.indexOf('ah (%)');
  if (idxMes < 0 || idxAno < 0 || idxEmpresa < 0 ||
      idxConta < 0 || idxValAtual < 0 || idxValAnt < 0 || idxAvAtual < 0 ||
      idxAvAnt < 0 || idxAh < 0) {
    if (!quiet) alertSafe('Cabeçalho da aba "DreBase" não está no formato esperado.');
    return false;
  }
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const basePrincipal = normalizarChaveIndicador('receita bruta');
  const baseFallback  = normalizarChaveIndicador('receita liquida');
  function escolherBaseDoGrupo(grupo, anterior) {
    const candidatos = anterior
      ? [grupo.baseAnterior, grupo.baseFallbackAnterior, grupo.somaAnterior]
      : [grupo.baseAtual, grupo.baseFallbackAtual, grupo.somaAtual];
    for (let i = 0; i < candidatos.length; i++) {
      const v = candidatos[i];
      if (v === '' || v == null) continue;
      const n = Number(v);
      if (!isFinite(n) || n === 0) continue;
      return n;
    }
    return null;
  }
  // Calcula somatórios por grupo (empresa|mes|ano)
  const grupos = {};
  values.forEach(function(row) {
    const empresaKey = chaveEmpresa_(row[idxEmpresa]);
    if (!empresaKey) return;
    const mes = parseInt(row[idxMes], 10);
    const ano = parseInt(row[idxAno], 10);
    if (!mes || !ano) return;
    const key = empresaKey + '|' + mes + '|' + ano;
    const contaNorm = normalizarChaveIndicador(row[idxConta]);
    const vAtual = row[idxValAtual] === '' || row[idxValAtual] == null ? 0 : Number(row[idxValAtual]);
    const vAnt   = row[idxValAnt]   === '' || row[idxValAnt]   == null ? 0 : Number(row[idxValAnt]);
    if (!grupos[key]) {
      grupos[key] = {
        somaAtual: 0,
        somaAnterior: 0,
        baseAtual: null,
        baseAnterior: null,
        baseFallbackAtual: null,
        baseFallbackAnterior: null
      };
    }
    grupos[key].somaAtual    += vAtual;
    grupos[key].somaAnterior += vAnt;
    if (contaNorm === basePrincipal) {
      if (grupos[key].baseAtual == null) grupos[key].baseAtual = vAtual;
      if (grupos[key].baseAnterior == null) grupos[key].baseAnterior = vAnt;
    } else if (contaNorm === baseFallback) {
      if (grupos[key].baseFallbackAtual == null) grupos[key].baseFallbackAtual = vAtual;
      if (grupos[key].baseFallbackAnterior == null) grupos[key].baseFallbackAnterior = vAnt;
    }
  });
  // Calcula AV% e AH% para cada linha
  values.forEach(function(row) {
    const empresaKey = chaveEmpresa_(row[idxEmpresa]);
    if (!empresaKey) return;
    const mes = parseInt(row[idxMes], 10);
    const ano = parseInt(row[idxAno], 10);
    if (!mes || !ano) return;
    const key = empresaKey + '|' + mes + '|' + ano;
    const grupo = grupos[key];
    if (!grupo) return;
    const vAtual = row[idxValAtual] === '' || row[idxValAtual] == null ? 0 : Number(row[idxValAtual]);
    const vAnt   = row[idxValAnt]   === '' || row[idxValAnt]   == null ? 0 : Number(row[idxValAnt]);
    // Análise vertical atual
    const baseAtual = escolherBaseDoGrupo(grupo, false);
    let avAtual = '';
    if (baseAtual != null) {
      avAtual = (vAtual / baseAtual) * 100;
      avAtual = Math.round(avAtual * 100) / 100; // duas casas decimais
    }
    // Análise vertical anterior
    const baseAnterior = escolherBaseDoGrupo(grupo, true);
    let avAnt = '';
    if (baseAnterior != null) {
      avAnt = (vAnt / baseAnterior) * 100;
      avAnt = Math.round(avAnt * 100) / 100;
    }
    // Análise horizontal
    let ah = '';
    if (vAnt !== 0) {
      ah = ((vAtual - vAnt) / Math.abs(vAnt)) * 100;
      ah = Math.round(ah * 100) / 100;
    }
    row[idxAvAtual] = avAtual;
    row[idxAvAnt]   = avAnt;
    row[idxAh]      = ah;
  });
  sheet.getRange(2, 1, values.length, lastCol).setValues(values);
  if (!quiet) alertSafe('Percentuais de DRE recalculados com sucesso.');
  return true;
}

function calcularPercentuaisBalanco(quiet) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('BalancoBase');
  if (!sheet) {
    if (!quiet) alertSafe('Aba "BalancoBase" não encontrada.');
    return false;
  }
  const lastRow = sheet.getLastRow();
  let lastCol = sheet.getLastColumn();
  if (lastRow < 2) {
    if (!quiet) alertSafe('Aba "BalancoBase" não possui dados.');
    return false;
  }
  let header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idxMes = header.indexOf('mes');
  const idxAno = header.indexOf('ano');
  const idxEmpresa = header.indexOf('empresa');
  const idxConta = header.indexOf('conta');
  const idxSaldoAnt = header.indexOf('saldo anterior');
  const idxSaldoAtual = header.indexOf('saldo atual');
  if (idxMes < 0 || idxAno < 0 || idxEmpresa < 0 || idxConta < 0 || idxSaldoAnt < 0 || idxSaldoAtual < 0) {
    if (!quiet) alertSafe('Cabeçalho da aba "BalancoBase" não está no formato esperado.');
    return false;
  }

  let headerChanged = false;
  function ensureCol(name) {
    let idx = header.indexOf(name);
    if (idx < 0) {
      header.push(name);
      idx = header.length - 1;
      headerChanged = true;
    }
    return idx;
  }
  const idxAvAtual = ensureCol('av atual (%)');
  const idxAvAnt = ensureCol('av anterior (%)');
  const idxAh = ensureCol('ah (%)');
  if (headerChanged) {
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
    lastCol = header.length;
  }

  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const basePrincipal = normalizarChaveIndicador('ativo total');
  const baseFallback = normalizarChaveIndicador('ativo');

  function escolherBaseDoGrupo(grupo, anterior) {
    const candidatos = anterior
      ? [grupo.baseAnterior, grupo.baseFallbackAnterior, grupo.somaAnterior]
      : [grupo.baseAtual, grupo.baseFallbackAtual, grupo.somaAtual];
    for (let i = 0; i < candidatos.length; i++) {
      const v = candidatos[i];
      if (v === '' || v == null) continue;
      const n = Number(v);
      if (!isFinite(n) || n === 0) continue;
      return n;
    }
    return null;
  }

  const grupos = {};
  values.forEach(function(row) {
    const empresaKey = chaveEmpresa_(row[idxEmpresa]);
    if (!empresaKey) return;
    const mes = parseInt(row[idxMes], 10);
    const ano = parseInt(row[idxAno], 10);
    if (!mes || !ano) return;
    const key = empresaKey + '|' + mes + '|' + ano;
    const contaNorm = normalizarChaveIndicador(row[idxConta]);
    const vAtual = row[idxSaldoAtual] === '' || row[idxSaldoAtual] == null ? 0 : Number(row[idxSaldoAtual]);
    const vAnt = row[idxSaldoAnt] === '' || row[idxSaldoAnt] == null ? 0 : Number(row[idxSaldoAnt]);
    if (!grupos[key]) {
      grupos[key] = {
        somaAtual: 0,
        somaAnterior: 0,
        baseAtual: null,
        baseAnterior: null,
        baseFallbackAtual: null,
        baseFallbackAnterior: null
      };
    }
    grupos[key].somaAtual += vAtual;
    grupos[key].somaAnterior += vAnt;
    if (contaNorm === basePrincipal) {
      if (grupos[key].baseAtual == null) grupos[key].baseAtual = vAtual;
      if (grupos[key].baseAnterior == null) grupos[key].baseAnterior = vAnt;
    } else if (contaNorm === baseFallback) {
      if (grupos[key].baseFallbackAtual == null) grupos[key].baseFallbackAtual = vAtual;
      if (grupos[key].baseFallbackAnterior == null) grupos[key].baseFallbackAnterior = vAnt;
    }
  });

  values.forEach(function(row) {
    const empresaKey = chaveEmpresa_(row[idxEmpresa]);
    if (!empresaKey) return;
    const mes = parseInt(row[idxMes], 10);
    const ano = parseInt(row[idxAno], 10);
    if (!mes || !ano) return;
    const key = empresaKey + '|' + mes + '|' + ano;
    const grupo = grupos[key];
    if (!grupo) return;
    const vAtual = row[idxSaldoAtual] === '' || row[idxSaldoAtual] == null ? 0 : Number(row[idxSaldoAtual]);
    const vAnt = row[idxSaldoAnt] === '' || row[idxSaldoAnt] == null ? 0 : Number(row[idxSaldoAnt]);

    const baseAtual = escolherBaseDoGrupo(grupo, false);
    let avAtual = '';
    if (baseAtual != null) {
      avAtual = (vAtual / baseAtual) * 100;
      avAtual = Math.round(avAtual * 100) / 100;
    }

    const baseAnterior = escolherBaseDoGrupo(grupo, true);
    let avAnt = '';
    if (baseAnterior != null) {
      avAnt = (vAnt / baseAnterior) * 100;
      avAnt = Math.round(avAnt * 100) / 100;
    }

    let ah = '';
    if (vAnt !== 0) {
      ah = ((vAtual - vAnt) / Math.abs(vAnt)) * 100;
      ah = Math.round(ah * 100) / 100;
    }

    row[idxAvAtual] = avAtual;
    row[idxAvAnt] = avAnt;
    row[idxAh] = ah;
  });

  sheet.getRange(2, 1, values.length, lastCol).setValues(values);
  if (!quiet) alertSafe('Percentuais de Balanço recalculados com sucesso.');
  return true;
}

function calcularPercentuaisDreEBalanco() {
  try {
    preencherValoresAnterioresComPeriodoAnterior_(true);
  } catch (e) {
    Logger.log('Falha ao preencher valores anteriores automaticamente: ' + e);
  }
  const okDre = calcularPercentuaisDre(true);
  const okBal = calcularPercentuaisBalanco(true);
  if (okDre && okBal) {
    alertSafe('Percentuais de DRE e Balanço recalculados com sucesso.');
  } else if (okDre && !okBal) {
    alertSafe('Percentuais de DRE recalculados. Verifique a aba "BalancoBase".');
  } else if (!okDre && okBal) {
    alertSafe('Percentuais de Balanço recalculados. Verifique a aba "DreBase".');
  } else {
    alertSafe('Não foi possível recalcular percentuais de DRE e Balanço.');
  }
}
