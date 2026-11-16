/**
 * Catálogo de indicadores financeiros (fórmulas declarativas) e estrutura da aba "Indicadores".
 */

/**
 * Recalcula as colunas "av atual (%)", "av anterior (%)" e "ah (%)"
 * na aba DreBase. A análise vertical utiliza as somas de cada
 * categoria dentro de (empresa, mes, ano); a análise horizontal
 * compara valores atuais e anteriores. O resultado é gravado na
 * própria aba.
 */
const INDICADORES_HEADER_ROW = 2;

const INDICADORES_DATA_START_ROW = 3;

function getIndicadoresDefinitions() {
  return [
    { key: 'receita_bruta', label: 'Receita Bruta (R$)', formula: '{{dre.receita_bruta}}', aliases: ['receita_bruta', 'receita bruta', 'receitabruta', 'receita_bruta_rs'] },
    { key: 'custos', label: 'Custos (R$)', formula: '{{dre.custos}}', aliases: ['custos', 'custo', 'custos_rs', 'custos(-)'] },
    { key: 'despesas', label: 'Despesas (R$)', formula: '{{dre.despesas_operacionais}}', aliases: ['despesas', 'despesa', 'despesas_rs', 'despesas_operacionais'] },
    { key: 'lucro_bruto', label: 'Lucro Bruto (R$)', formula: '{{dre.lucro_bruto}}', aliases: ['lucro_bruto', 'lucro bruto'] },
    { key: 'lucro_liquido', label: 'Lucro Liquido (R$)', formula: '{{dre.lucro_ou_prejuizo_do_exercicio}}', aliases: ['lucro_liquido', 'lucro liquido', 'lucro_prejuizo'] },
    { key: 'ebitda', label: 'EBITDA (R$)', formula: '{{dre.resultado_operacional}} + {{dre.depreciacao_amortizacao_total}}', aliases: ['ebitda', 'ebitda_rs', 'resultado_operacional'] },
    { key: 'ebitda_percentual', label: 'EBITDA (%)', formula: 'safeDivide({{ebitda}}, {{receita_liquida}}) * 100', aliases: ['ebitda_percentual', 'ebitda%', 'ebitda_percent'] },
    { key: 'endividamento', label: 'Endividamento (Passivo/PL)', formula: 'safeDivide({{bal.passivo_circulante}}, {{bal.patrimonio_liquido}})', aliases: ['endividamento', 'passivo_pl'] },
    { key: 'imobilizacao', label: 'Imobilizacao (ANC/PL)', formula: 'safeDivide({{bal.imobilizado}} + {{bal.ativo_nao_circulante}}, {{bal.patrimonio_liquido}})', aliases: ['imobilizacao', 'imobilizacao_pl'] },
    { key: 'solvencia_geral', label: 'Solvencia Geral (Ativo/Passivo)', formula: 'safeDivide({{bal.ativo_total}}, ({{bal.passivo_circulante}} + {{bal.passivo_nao_circulante}}))', aliases: ['solvencia_geral', 'solvencia'] },
    { key: 'distribuicao_resultados_percentual', label: 'Distribuicao de Resultados (% sobre Lucro)', formula: 'safeDivide({{dre.distribuicao_de_resultados}}, {{lucro_liquido}}) * 100', aliases: ['distribuicao_resultados_percentual', 'distribuicao_resultados', 'payout'] },
    { key: 'liquidez_geral', label: 'Liquidez Geral', formula: 'safeDivide(({{bal.ativo_circulante}} + {{bal.realizavel_a_longo_prazo}}), ({{bal.passivo_circulante}} + {{bal.passivo_nao_circulante}}))', aliases: ['liquidez_geral'] },
    { key: 'liquidez_corrente', label: 'Liquidez Corrente', formula: 'safeDivide({{bal.ativo_circulante}}, {{bal.passivo_circulante}})', aliases: ['liquidez_corrente'] },
    { key: 'liquidez_seca', label: 'Liquidez Seca', formula: 'safeDivide(({{bal.ativo_circulante}} - {{bal.estoques}}), {{bal.passivo_circulante}})', aliases: ['liquidez_seca'] },
    { key: 'liquidez_imediata', label: 'Liquidez Imediata', formula: 'safeDivide({{bal.contas_bancos}}, {{bal.passivo_circulante}})', aliases: ['liquidez_imediata'] },
    { key: 'lucratividade_percentual', label: 'Lucratividade (%)', formula: 'safeDivide({{lucro_liquido}}, {{receita_liquida}}) * 100', aliases: ['lucratividade_percentual', 'lucratividade'] },
    { key: 'margem_operacional', label: 'Margem Operacional (%)', formula: 'safeDivide({{dre.resultado_operacional}}, {{receita_liquida}}) * 100', aliases: ['margem_operacional', 'margem operacional'] },
    { key: 'margem_liquida', label: 'Margem Liquida (%)', formula: 'safeDivide({{lucro_liquido}}, {{receita_liquida}}) * 100', aliases: ['margem_liquida', 'margem liquida', 'margem líquida'] },
    { key: 'fluxo_resultados', label: 'Fluxo de Resultados (R$)', formula: '{{lucro_liquido}}', aliases: ['fluxo_resultados'] },
    { key: 'lucratividade_acumulada_percentual', label: 'Lucratividade Acumulada (%)', formula: 'safeDivide({{acum.lucro_liquido}}, {{acum.receita_liquida}}) * 100', aliases: ['lucratividade_acumulada_percentual', 'lucratividade_acumulada'] },
    { key: 'receita_liquida', label: 'Receita Liquida (R$)', formula: '{{dre.receita_liquida}}', aliases: ['receita_liquida', 'receita liquida'] },
    { key: 'total_deducoes', label: 'Total Deducoes (R$)', formula: '{{dre.deducoes}}', aliases: ['total_deducoes', 'total deducoes', 'deducoes', 'deducoes(-)'] },
    { key: 'peso_deducoes_percentual', label: 'Peso das Deducoes (%)', formula: 'safeDivide({{total_deducoes}}, {{receita_bruta}}) * 100', aliases: ['peso_deducoes_percentual', 'peso_deducoes'] }
  ];
}

function normalizarChaveIndicador(nome) {
  return String(nome || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function construirHeaderIndicadores(defs) {
  return ['id', 'Mes', 'Ano', 'Empresa'].concat(defs.map(function(d) { return d.label; }));
}

function normalizarHeaderIndicadores_(valor) {
  return String(valor || '').toLowerCase().trim();
}

function chaveIdentificadorIndicador_(valor) {
  const raw = String(valor == null ? '' : valor).trim();
  if (!raw) return '';
  if (raw.indexOf('[GRUPO] ') === 0) return raw;
  return chaveEmpresa_(raw);
}

function _indiceCabecalhoIndicadores_(header, nomes) {
  if (!header || !nomes || !nomes.length) return -1;
  const alvos = nomes.map(function(n) { return sanitizeName(n); });
  for (let i = 0; i < header.length; i++) {
    const norm = sanitizeName(header[i] || '');
    if (alvos.indexOf(norm) !== -1) return i;
  }
  return -1;
}

function _statusProcessadoIndicadores_(valor) {
  const norm = sanitizeName(valor || '');
  return norm === 'processado';
}

function isHeaderIndicadoresRow_(row) {
  if (!row || row.length === 0) return false;
  const first = normalizarHeaderIndicadores_(row[0]);
  return first === 'mes' || first === 'id';
}

function getIndicadoresColIndexMap_(sheet) {
  const lastCol = sheet.getLastColumn();
  const header = sheet.getRange(INDICADORES_HEADER_ROW, 1, 1, lastCol).getValues()[0];
  const map = {};
  for (let i = 0; i < header.length; i++) {
    const key = normalizarHeaderIndicadores_(header[i]);
    if (key) map[key] = i;
  }
  return {
    header: header,
    idxId: map.id,
    idxMes: map.mes,
    idxAno: map.ano,
    idxEmpresa: map.empresa
  };
}

/**
 * Garante a existência da aba "Indicadores" e retorna seu objeto
 * Sheet. A primeira linha contém o cabeçalho padrão com todos os
 * indicadores suportados. Se a aba não existir, ela é criada.
 *
 * @return {GoogleAppsScript.Spreadsheet.Sheet} A aba de indicadores
 */
function getIndicadoresSheet() {
  return ensureIndicadoresEstrutura().sheet;
}

function ensureIndicadoresEstrutura() {
  const defs = getIndicadoresDefinitions();
  const header = construirHeaderIndicadores(defs);
  const formulaPadrao = construirFormulasPadrao(defs);
  const formulaCalculo = construirFormulasCalculo(defs);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Indicadores');
  if (!sheet) {
    sheet = ss.insertSheet('Indicadores');
  }
  const largura = header.length;
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.getRange(1, 1, 1, largura).setValues([formulaPadrao]);
    sheet.getRange(2, 1, 1, largura).setValues([header]);
    sheet.setFrozenRows(2);
  } else {
    const primeiraLinha = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), largura)).getValues()[0];
    if (isHeaderIndicadoresRow_(primeiraLinha)) {
      sheet.insertRows(1, 1);
    }
    const headerRow = sheet.getRange(INDICADORES_HEADER_ROW, 1, 1, Math.max(sheet.getLastColumn(), largura)).getValues()[0];
    if (normalizarHeaderIndicadores_(headerRow[0]) !== 'id') {
      sheet.insertColumnBefore(1);
    }
    const colCount = Math.max(sheet.getLastColumn(), largura);
    const existentes = sheet.getRange(1, 1, 1, colCount).getValues()[0];
    const mescladas = [];
    for (let i = 0; i < largura; i++) {
      const atual = existentes[i];
      const padrao = formulaPadrao[i] || '';
      mescladas.push((atual !== '' && atual != null) ? atual : padrao);
    }
    sheet.getRange(1, 1, 1, largura).setValues([mescladas]);
    sheet.getRange(2, 1, 1, largura).setValues([header]);
    sheet.setFrozenRows(2);
  }
  // Usa sempre as fórmulas originais para cálculo; a linha 1 fica apenas como referência visual
  return { sheet: sheet, defs: defs, header: header, formulaRow: formulaCalculo };
}

function indicadoresJaExistem(identificador, mes, ano) {
  const sheet = getIndicadoresSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < INDICADORES_DATA_START_ROW) return false;
  const colMap = getIndicadoresColIndexMap_(sheet);
  const idxMes = colMap.idxMes;
  const idxAno = colMap.idxAno;
  const idxEmpresa = colMap.idxEmpresa;
  if (idxMes == null || idxAno == null || idxEmpresa == null) return false;
  const idKey = chaveIdentificadorIndicador_(identificador);
  if (!idKey) return false;
  const linhas = sheet.getRange(INDICADORES_DATA_START_ROW, 1, lastRow - INDICADORES_DATA_START_ROW + 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i][idxMes];
    const a = linhas[i][idxAno];
    const eKey = chaveIdentificadorIndicador_(linhas[i][idxEmpresa]);
    if (String(m) === String(mes) && String(a) === String(ano) && eKey === idKey) {
      return true;
    }
  }
  return false;
}
