/**
 * Utilitários gerais: normalização de nomes, conversão e formatação de números pt-BR e leitura da linha selecionada.
 */

/**
 * Remove acentos, espaços e caracteres não alfanuméricos de um texto.
 * Útil para normalizar nomes de contas ao comparar categorias.
 *
 * @param {string} name Texto de entrada
 * @return {string} Texto normalizado
 */
function sanitizeName(name) {
  return String(name == null ? '' : name)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Mapeia variações de nomenclatura de contas para uma chave canônica.
 * Isso permite agrupar contas equivalentes, como “ATIVO N CIRCULANTE”
 * e “ATIVO NÃO CIRCULANTE”, sob a mesma identificação.
 *
 * @param {string} name Nome original da conta
 * @return {string} Nome canônico
 */
function canonicalName(name) {
  const s = sanitizeName(name);
  const map = {
    'ativoncirculante': 'ativonaocirculante',
    'ativonaocirculante': 'ativonaocirculante',
    'passivoncirculante': 'passivonaocirculante',
    'passivonaocirculante': 'passivonaocirculante',
    'caixaebancos': 'contasbancos',
    'disponibilidades': 'contasbancos',
    'bancos': 'contasbancos',
    'caixabancos': 'contasbancos'
  };
  return map[s] || s;
}

/**
 * Converte valores numéricos no formato brasileiro para número
 * JavaScript. Aceita strings com separador de milhar (ponto) e
 * separador decimal (vírgula) ou números já em formato nativo.
 *
 * @param {any} val Valor a converter
 * @return {number} Valor numérico ou 0 se não for possível converter
 */
function converterValor(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const s = String(val).trim();
  const clean = s.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

// Normaliza valores numericos para pt-BR e evita notacao cientifica em tabelas do Docs.
function formatarValorParaDoc(valor) {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'number') return formatarNumeroPtBr(valor);
  if (valor instanceof Date) return valor.toISOString();
  const texto = String(valor);
  const trimmed = texto.trim();
  if (trimmed === '') return '';
  if (/[a-zA-Z]/.test(trimmed) || trimmed.indexOf('%') !== -1) return texto;
  const num = tentarConverterStringParaNumero(trimmed);
  if (num === null) return texto;
  return formatarNumeroPtBr(num);
}

function tentarConverterStringParaNumero(texto) {
  if (!texto) return null;
  if (/^[+-]?(?:\d+\.?\d*|\d*\.\d+)[eE][+-]?\d+$/.test(texto)) {
    const n = Number(texto.replace(',', '.'));
    return isNaN(n) ? null : n;
  }
  if (/^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(texto)) {
    const n = Number(texto.replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
  }
  if (/^[+-]?\d+(,\d+)$/.test(texto)) {
    const n = Number(texto.replace(',', '.'));
    return isNaN(n) ? null : n;
  }
  if (/^[+-]?\d+(\.\d+)?$/.test(texto)) {
    const n = Number(texto);
    return isNaN(n) ? null : n;
  }
  return null;
}

function formatarNumeroPtBr(num) {
  if (typeof num !== 'number') num = Number(num);
  if (!isFinite(num)) return String(num);
  if (Object.is(num, -0)) num = 0;
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Traduz um número de mês (1–12) no nome correspondente em português.
 * Caso o número esteja fora do intervalo, retorna o próprio valor.
 *
 * @param {string|number} mes Número do mês
 * @return {string} Nome do mês ou o valor original
 */
function getMonthName(mes) {
  const names = {
    1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril',
    5: 'Maio', 6: 'Junho', 7: 'Julho', 8: 'Agosto',
    9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro'
  };
  const m = parseInt(mes, 10);
  return names[m] || String(mes);
}

/**
 * Extrai empresa e grupo a partir de um valor que pode vir como texto
 * simples, objeto JS ou representação textual de mapa/JSON.
 *
 * @param {any} valor
 * @return {{empresa:string, grupo:string}}
 */
function extrairEmpresaGrupo_(valor) {
  function trimSafe(v) {
    return String(v == null ? '' : v).trim();
  }
  function fromObject(obj) {
    if (!obj || typeof obj !== 'object') return { empresa: '', grupo: '' };
    const empresaRaw = obj.empresa != null ? obj.empresa : (obj.nome != null ? obj.nome : '');
    const grupoRaw = obj.grupo != null ? obj.grupo : '';
    return { empresa: trimSafe(empresaRaw), grupo: trimSafe(grupoRaw) };
  }

  if (valor == null) return { empresa: '', grupo: '' };

  if (typeof valor === 'object') {
    return fromObject(valor);
  }

  const raw = trimSafe(valor);
  if (!raw) return { empresa: '', grupo: '' };

  // JSON textual: {"empresa":"...", "grupo":"..."}.
  if ((raw.startsWith('{') || raw.startsWith('[')) && raw.indexOf(':') !== -1) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const parsedObj = fromObject(parsed);
        if (parsedObj.empresa || parsedObj.grupo) return parsedObj;
      }
    } catch (e) {
      // Segue para outros formatos.
    }
  }

  // Formato de mapa serializado pelo Apps Script: {empresa=..., grupo=...}.
  const empMatch = raw.match(/(?:^|[,{]\s*)empresa\s*=\s*([^,}]+)/i);
  const grpMatch = raw.match(/(?:^|[,{]\s*)grupo\s*=\s*([^,}]+)/i);
  if (empMatch || grpMatch) {
    return {
      empresa: trimSafe(empMatch && empMatch[1] ? empMatch[1] : ''),
      grupo: trimSafe(grpMatch && grpMatch[1] ? grpMatch[1] : '')
    };
  }

  return { empresa: raw, grupo: '' };
}

function coagirNomeEmpresa_(valor) {
  const parsed = extrairEmpresaGrupo_(valor);
  return String(parsed.empresa || '').trim();
}

function coagirNomeGrupo_(valor) {
  const parsed = extrairEmpresaGrupo_(valor);
  if (parsed.grupo) return String(parsed.grupo).trim();
  const raw = String(valor == null ? '' : valor).trim();
  if (!raw) return '';
  if (/^\{[\s\S]*\}$/.test(raw) && (raw.indexOf('=') !== -1 || raw.indexOf(':') !== -1)) {
    return '';
  }
  if (typeof valor === 'object') return '';
  return raw;
}

function chaveEmpresa_(valor) {
  return sanitizeName(coagirNomeEmpresa_(valor));
}

/**
 * Devolve a lista de categorias sintéticas de balancete. Usa a
 * constante SINTETICOS_BALANCO definida em `constants.gs`.
 *
 * @return {string[]}
 */
function getSinteticosBalanco() {
  return SINTETICOS_BALANCO.slice();
}

/**
 * Devolve a lista de categorias sintéticas de DRE. Usa a constante
 * SINTETICOS_DRE definida em `constants.gs`.
 *
 * @return {string[]}
 */
function getSinteticosDre() {
  return SINTETICOS_DRE.slice();
}

/**
 * Atualiza o status e a mensagem de uma determinada linha na aba
 * Processamento. As colunas de status e mensagem são fixas no
 * pipeline: a coluna 7 para o status e a 8 para a mensagem.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Aba Processamento
 * @param {number} rowIndex Índice da linha (1‑based)
 * @param {string} status Novo valor de status
 * @param {string} mensagem Mensagem opcional
 */
function atualizarStatus(sheet, rowIndex, status, mensagem) {
  sheet.getRange(rowIndex, 7, 1, 2).setValues([[status, mensagem || '']]);
}

/**
 * Lê a linha atualmente selecionada na aba "Processamento" e
 * devolve os valores de suas colunas em um objeto. Se a seleção
 * estiver fora da aba ou for a linha de cabeçalho, uma mensagem de
 * alerta é exibida e null é retornado.
 *
 * @return {Object|null} Objeto com os dados da linha selecionada ou null
 */
function obterLinhaSelecionadaProcessamento() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  if (!sheet || sheet.getName() !== 'Processamento') {
    SpreadsheetApp.getUi().alert('Selecione uma célula na aba "Processamento" para gerar o relatório.');
    return null;
  }
  const cell = sheet.getActiveCell();
  const row = cell.getRow();
  if (row < 2) {
    SpreadsheetApp.getUi().alert('Selecione uma linha de dados (abaixo do cabeçalho).');
    return null;
  }
  const lastCol = sheet.getLastColumn();
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const valores = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
  const map = {};
  for (let c = 0; c < header.length; c++) {
    const nome = String(header[c] || '').trim();
    if (nome) map[nome] = c;
  }
  function get(nomeCol) {
    if (map[nomeCol] == null) return '';
    return valores[map[nomeCol]];
  }
  return {
    rowIndex: row,
    fileId: get('file_id'),
    nomeArquivo: get('Nome_arquivo'),
    empresa: coagirNomeEmpresa_(get('Empresa')),
    mes: get('Mes'),
    ano: get('Ano'),
    tipo: get('Tipo'),
    status: get('Status'),
    mensagem: get('Mensagem'),
    criadoEm: get('Criado_em'),
    grupo: coagirNomeGrupo_(get('Grupo')),
    rmaUrlColIndex: map['RMA_URL'] != null ? (map['RMA_URL'] + 1) : null,
    sheet: sheet
  };
}
