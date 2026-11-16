/**
 * Leitura das bases para uma empresa e período, no formato consumido pelos relatórios.
 */

/**
 * Lê a aba BalancoBase e retorna as linhas do balancete para uma
 * determinada empresa e período. A coluna "id" (file_id) é ignorada.
 * As contas sintéticas definidas
 * em SINTETICOS_BALANCO são separadas das demais.
 *
 * @param {string} empresa Nome da empresa
 * @param {string|number} mes Mês de competência (numérico ou string)
 * @param {string|number} ano Ano de competência
 * @param {string} [fileId] ID do arquivo (file_id). Se informado, filtra pelo id.
 * @return {{detalhados: Array<Object>, sinteticos: Array<Object>, todos: Array<Object>}}
 */
function carregarBalancoEmpresaPeriodo(empresa, mes, ano, fileId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('BalancoBase');
  if (!sheet) {
    throw new Error('Aba "BalancoBase" não encontrada.');
  }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { detalhados: [], sinteticos: [] };
  }
  const data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
  const header = data[0];
  const idxMes = header.indexOf('mes');
  const idxAno = header.indexOf('ano');
  const idxEmpresa = header.indexOf('empresa');
  const idxConta = header.indexOf('conta');
  let idxId = -1;
  for (let h = 0; h < header.length; h++) {
    const name = String(header[h] || '').toLowerCase().trim();
    if (name === 'file_id' || name === 'id') {
      idxId = h;
      break;
    }
  }
  const idxSaldoAnt = header.indexOf('saldo anterior');
  const idxDebito = header.indexOf('debito');
  const idxCredito = header.indexOf('credito');
  const idxSaldoAtu = header.indexOf('saldo atual');
  let idxAvAtual = header.indexOf('av atual (%)');
  if (idxAvAtual < 0) idxAvAtual = header.indexOf('av atual');
  let idxAvAnterior = header.indexOf('av anterior (%)');
  if (idxAvAnterior < 0) idxAvAnterior = header.indexOf('av anterior');
  let idxAh = header.indexOf('ah (%)');
  if (idxAh < 0) idxAh = header.indexOf('ah');
  if (idxMes < 0 || idxAno < 0 || idxEmpresa < 0 || idxConta < 0) {
    throw new Error('Cabeçalho da aba "BalancoBase" não está no formato esperado.');
  }
  // Conjunto de nomes de contas sintéticas em minúsculo para separação
  const sintSet = {};
  getSinteticosBalanco().forEach(function(nome) {
    sintSet[String(nome).toLowerCase()] = true;
  });
  const detalhados = [];
  const sinteticos = [];
  const todos = [];
  const mesNum = parseInt(mes, 10);
  const anoNum = parseInt(ano, 10);
  const empKey = chaveEmpresa_(empresa);
  const fileIdStr = fileId != null ? String(fileId).trim() : '';
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (fileIdStr && idxId >= 0) {
      const rowId = String(row[idxId] || '').trim();
      if (rowId !== fileIdStr) continue;
    }
    const rMes = parseInt(row[idxMes], 10);
    const rAno = parseInt(row[idxAno], 10);
    const rEmp = coagirNomeEmpresa_(row[idxEmpresa]);
    if (!rEmp) continue;
    if (chaveEmpresa_(rEmp) !== empKey) continue;
    if (rMes !== mesNum || rAno !== anoNum) continue;
    const conta = String(row[idxConta] || '').trim();
    if (!conta) continue;
    const entry = {
      conta: conta,
      saldoAnterior: idxSaldoAnt >= 0 ? (row[idxSaldoAnt] || 0) : 0,
      debito: idxDebito >= 0 ? (row[idxDebito] || 0) : 0,
      credito: idxCredito >= 0 ? (row[idxCredito] || 0) : 0,
      saldoAtual: idxSaldoAtu >= 0 ? (row[idxSaldoAtu] || 0) : 0,
      avAtual: idxAvAtual >= 0 ? row[idxAvAtual] : '',
      avAnterior: idxAvAnterior >= 0 ? row[idxAvAnterior] : '',
      ah: idxAh >= 0 ? row[idxAh] : ''
    };
    todos.push(entry);
    const key = conta.toLowerCase();
    if (sintSet[key]) {
      sinteticos.push(entry);
    } else {
      detalhados.push(entry);
    }
  }
  // Fallback: se o ID selecionado não tiver linhas (cadastro antigo),
  // busca pelo mesmo período/empresa ignorando o file_id.
  if (fileIdStr && todos.length === 0) {
    return carregarBalancoEmpresaPeriodo(empresa, mes, ano);
  }
  if (idxSaldoAnt >= 0 && idxSaldoAtu >= 0) {
    const precisaAnterior = todos.some(function(item) {
      return converterValor(item.saldoAnterior) === 0;
    });
    if (precisaAnterior) {
      const prev = _ajustarPeriodoComOffset(mesNum, anoNum, -1);
      const prevMes = prev ? parseInt(prev.mes, 10) : NaN;
      const prevAno = prev ? parseInt(prev.ano, 10) : NaN;
      if (!isNaN(prevMes) && !isNaN(prevAno)) {
        const mapPrev = {};
        for (let j = 1; j < data.length; j++) {
          const rowPrev = data[j];
          const pMes = parseInt(rowPrev[idxMes], 10);
          const pAno = parseInt(rowPrev[idxAno], 10);
          const pEmp = coagirNomeEmpresa_(rowPrev[idxEmpresa]);
          if (!pEmp) continue;
          if (chaveEmpresa_(pEmp) !== empKey) continue;
          if (pMes !== prevMes || pAno !== prevAno) continue;
          const contaPrev = String(rowPrev[idxConta] || '').trim();
          if (!contaPrev) continue;
          mapPrev[contaPrev.toLowerCase()] = rowPrev[idxSaldoAtu] || 0;
        }
        todos.forEach(function(item) {
          if (converterValor(item.saldoAnterior) !== 0) return;
          const key = String(item.conta || '').toLowerCase();
          if (mapPrev.hasOwnProperty(key)) {
            item.saldoAnterior = mapPrev[key];
          }
        });
      }
    }
  }
  return { detalhados: detalhados, sinteticos: sinteticos, todos: todos };
}

/**
 * Lê a aba DreBase e retorna as linhas da DRE para uma empresa e
 * período específicos. A coluna "id" (file_id) é ignorada. A DRE não possui separação entre contas
 * sintéticas e detalhadas neste contexto; todas as linhas são
 * retornadas em um único array.
 *
 * @param {string} empresa Nome da empresa
 * @param {string|number} mes Mês de competência
 * @param {string|number} ano Ano de competência
 * @param {string} [fileId] ID do arquivo (file_id). Se informado, filtra pelo id.
 * @return {Array<Object>} Lista de linhas da DRE
 */
function carregarDreEmpresaPeriodo(empresa, mes, ano, fileId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('DreBase');
  if (!sheet) {
    throw new Error('Aba "DreBase" não encontrada.');
  }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  const data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
  const header = data[0];
  const idxMes = header.indexOf('mes');
  const idxAno = header.indexOf('ano');
  const idxEmpresa = header.indexOf('empresa');
  const idxConta = header.indexOf('conta');
  let idxId = -1;
  for (let h = 0; h < header.length; h++) {
    const name = String(header[h] || '').toLowerCase().trim();
    if (name === 'file_id' || name === 'id') {
      idxId = h;
      break;
    }
  }
  const idxValAtual = header.indexOf('valor atual');
  const idxAvAtual = header.indexOf('av atual (%)');
  const idxValAnterior = header.indexOf('valor anterior');
  const idxAvAnterior = header.indexOf('av anterior (%)');
  const idxAh = header.indexOf('ah (%)');
  if (idxMes < 0 || idxAno < 0 || idxEmpresa < 0 || idxConta < 0) {
    throw new Error('Cabeçalho da aba "DreBase" não está no formato esperado.');
  }
  const mesNum = parseInt(mes, 10);
  const anoNum = parseInt(ano, 10);
  const empKey = chaveEmpresa_(empresa);
  const fileIdStr = fileId != null ? String(fileId).trim() : '';
  const linhas = [];
  let encontrouIdReal = false;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (fileIdStr && idxId >= 0) {
      const rowId = String(row[idxId] || '').trim();
      if (rowId !== fileIdStr) continue;
    }
    const rMes = parseInt(row[idxMes], 10);
    const rAno = parseInt(row[idxAno], 10);
    const rEmp = coagirNomeEmpresa_(row[idxEmpresa]);
    if (!rEmp) continue;
    if (chaveEmpresa_(rEmp) !== empKey) continue;
    if (rMes !== mesNum || rAno !== anoNum) continue;
    const conta = String(row[idxConta] || '').trim();
    if (!conta) continue;
    const rowId = idxId >= 0 ? String(row[idxId] || '').trim() : '';
    if (rowId) encontrouIdReal = true;
    linhas.push({
      _rowId: rowId,
      conta: conta,
      valorAtual: idxValAtual >= 0 ? (row[idxValAtual] || 0) : 0,
      valorAnterior: idxValAnterior >= 0 ? (row[idxValAnterior] || 0) : 0,
      avAtual: idxAvAtual >= 0 ? row[idxAvAtual] : '',
      avAnterior: idxAvAnterior >= 0 ? row[idxAvAnterior] : '',
      ah: idxAh >= 0 ? row[idxAh] : ''
    });
  }
  // Fallback: se o ID selecionado não tiver linhas (cadastro antigo),
  // busca pelo mesmo período/empresa ignorando o file_id.
  if (fileIdStr && linhas.length === 0) {
    return carregarDreEmpresaPeriodo(empresa, mes, ano);
  }
  if (!fileIdStr && encontrouIdReal) {
    for (let i = linhas.length - 1; i >= 0; i--) {
      if (!linhas[i]._rowId) linhas.splice(i, 1);
    }
  }
  if (idxValAnterior >= 0 && idxValAtual >= 0) {
    const precisaAnterior = linhas.some(function(item) {
      return converterValor(item.valorAnterior) === 0;
    });
    if (precisaAnterior) {
      const prev = _ajustarPeriodoComOffset(mesNum, anoNum, -1);
      const prevMes = prev ? parseInt(prev.mes, 10) : NaN;
      const prevAno = prev ? parseInt(prev.ano, 10) : NaN;
      if (!isNaN(prevMes) && !isNaN(prevAno)) {
        const mapPrev = {};
        for (let j = 1; j < data.length; j++) {
          const rowPrev = data[j];
          const pMes = parseInt(rowPrev[idxMes], 10);
          const pAno = parseInt(rowPrev[idxAno], 10);
          const pEmp = coagirNomeEmpresa_(rowPrev[idxEmpresa]);
          if (!pEmp) continue;
          if (chaveEmpresa_(pEmp) !== empKey) continue;
          if (pMes !== prevMes || pAno !== prevAno) continue;
          const contaPrev = String(rowPrev[idxConta] || '').trim();
          if (!contaPrev) continue;
          mapPrev[contaPrev.toLowerCase()] = rowPrev[idxValAtual] || 0;
        }
        linhas.forEach(function(item) {
          if (converterValor(item.valorAnterior) !== 0) return;
          const key = String(item.conta || '').toLowerCase();
          if (mapPrev.hasOwnProperty(key)) {
            item.valorAnterior = mapPrev[key];
          }
        });
      }
    }
  }
  linhas.forEach(function(item) { delete item._rowId; });
  linhas.sort(function(a, b) { return a.conta.localeCompare(b.conta); });
  return linhas;
}
