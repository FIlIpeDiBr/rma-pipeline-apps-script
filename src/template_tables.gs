/**
 * Marcadores de tabela: [[(p:origem; modo)]] seguido de uma tabela-modelo que define colunas e estilo.
 */

// Campos aceitos por planilha para as novas tabelas
const _TABLE_FIELD_MAPS = {
  balancobase: {
    'conta': 'conta',
    'saldo anterior': 'saldoAnterior',
    'saldo_anterior': 'saldoAnterior',
    'debito': 'debito',
    'débito': 'debito',
    'credito': 'credito',
    'crédito': 'credito',
    'saldo atual': 'saldoAtual',
    'saldo_atual': 'saldoAtual',
    'av atual (%)': 'avAtual',
    'av atual': 'avAtual',
    'av anterior (%)': 'avAnterior',
    'av anterior': 'avAnterior',
    'ah (%)': 'ah',
    'ah': 'ah'
  },
  drebase: {
    'conta': 'conta',
    'valor atual': 'valorAtual',
    'valor_atual': 'valorAtual',
    'valor anterior': 'valorAnterior',
    'valor_anterior': 'valorAnterior',
    'av atual (%)': 'avAtual',
    'av atual': 'avAtual',
    'av anterior (%)': 'avAnterior',
    'av anterior': 'avAnterior',
    'ah (%)': 'ah',
    'ah': 'ah'
  }
};

function mapearCampoTabela(planilha, campoRaw) {
  if (!planilha || !campoRaw) return null;
  const mapa = _TABLE_FIELD_MAPS[String(planilha).toLowerCase()];
  if (!mapa) return null;
  const key = String(campoRaw).toLowerCase().trim();
  if (mapa.hasOwnProperty(key)) return mapa[key];
  if (Object.values(mapa).indexOf(campoRaw) !== -1) return campoRaw;
  return null;
}

function parseTabelaFlags(rawFlags) {
  const parts = String(rawFlags || '').split(/[,;]/).map(function(p) { return p.trim(); }).filter(Boolean);
  let origem = '';
  let modo = 'resumida';
  parts.forEach(function(p) {
    const lower = p.toLowerCase();
    if (lower.indexOf('p:') === 0) {
      origem = lower.replace('p:', '').trim();
    } else if (lower === 'completa') {
      modo = 'completa';
    } else if (lower === 'resumida') {
      modo = 'resumida';
    }
  });
  if (!origem) return { ok: false, erro: 'Flag obrigatória p: não informada' };
  if (origem !== 'balancobase' && origem !== 'drebase') return { ok: false, erro: 'Flag p: inválida. Use balancobase ou drebase.' };
  return { ok: true, origem: origem, modo: modo };
}

function obterLinhasParaOrigem(origem, modo, dataContext) {
  if (origem === 'balancobase') {
    const fonte = dataContext && dataContext.balancobase ? dataContext.balancobase : {};
    if (modo === 'completa') return fonte.todos || (fonte.detalhados || []).concat(fonte.sinteticos || []);
    return fonte.sinteticos || [];
  }
  if (origem === 'drebase') {
    const fonte = dataContext && dataContext.drebase ? dataContext.drebase : {};
    return fonte.linhas || [];
  }
  return [];
}

function analisarCelulaCabecalho(cellText, planilha, scalars) {
  const match = String(cellText || '').match(/^\s*\[\s*([^\]:]+?)(?:\s*:\s*(.+?))?\s*\]\s*$/);
  if (match) {
    const campo = match[1].trim();
    const displayRaw = match[2];
    const key = mapearCampoTabela(planilha, campo);
    if (!key) {
      return { headerText: 'ERRO: campo "' + campo + '" não encontrado', fieldKey: null, valido: false };
    }
    const display = displayRaw ? substituirPlaceholdersSimples(displayRaw, scalars) : campo;
    return { headerText: display, fieldKey: key, valido: true };
  }
  const texto = substituirPlaceholdersSimples(cellText, scalars);
  return { headerText: texto, fieldKey: null, valido: true };
}

function copiarEstiloCelula(src, dest) {
  if (!src || !dest) return;

  // 1) Estilo de CÉLULA (fundo/borda etc.)
  dest.setAttributes(src.getAttributes());

  // 2) Parágrafo (alinhamento, recuos, etc.)
  if (src.getNumChildren() === 0) return;
  let srcPar = null;
  for (let i = 0; i < src.getNumChildren(); i++) {
    if (src.getChild(i).getType() === DocumentApp.ElementType.PARAGRAPH) {
      srcPar = src.getChild(i).asParagraph();
      break;
    }
  }
  if (!srcPar) return;

  if (dest.getNumChildren() === 0) dest.appendParagraph('');
  const destPar = dest.getChild(0).asParagraph();
  destPar.setAttributes(srcPar.getAttributes());
  // redundâncias que às vezes o Docs ignora em setAttributes:
  destPar.setHeading(srcPar.getHeading());
  destPar.setAlignment(srcPar.getAlignment());

  // 3) Texto (fonte, tamanho, bold, cor…)
  const srcText = srcPar.editAsText();
  const destText = destPar.editAsText();
  if (!srcText || !destText) return;

  const dstLen = destText.getText().length;
  if (dstLen === 0) return;

  // Se a linha-molde tiver texto vazio, não há “primeiro char” com estilo.
  // Garanta que haja pelo menos 1 caractere na MOLDE (ex.: “x” invisível/ branco).
  const srcLen = srcText.getText().length;
  const baseAttrs = srcLen > 0 ? srcText.getAttributes(0) : {};

  // Aplique em FAIXA (0 .. dstLen-1)
  destText.setAttributes(0, dstLen - 1, baseAttrs);
}

function aplicarEstilosTabela(newTable, templateTable, pattern) {
  if (!newTable || !templateTable) return;
  const templateHeader = templateTable.getRow(0);
  const header = newTable.getRow(0);
  for (let c = 0; c < header.getNumCells(); c++) {
    const src = templateHeader.getCell(Math.min(c, templateHeader.getNumCells() - 1));
    copiarEstiloCelula(src, header.getCell(c));
  }
  const modelos = pattern && pattern.dataRows && pattern.dataRows.length ? pattern.dataRows : [templateHeader];
  for (let r = 1; r < newTable.getNumRows(); r++) {
    const modelIdx = modelos.length === 1 ? 0 : ((r - 1) % modelos.length);
    const modeloRow = modelos[modelIdx];
    const destRow = newTable.getRow(r);
    for (let c = 0; c < destRow.getNumCells(); c++) {
      const srcCell = modeloRow.getCell(Math.min(c, modeloRow.getNumCells() - 1));
      copiarEstiloCelula(srcCell, destRow.getCell(c));
    }
  }
}

/**
 * Helper de debug: lista parágrafos e marcações que começam com [[( ou <<(
 * e placeholders {{...}} no corpo do documento.
 *
 * @param {string} docId ID do documento Google Docs a inspecionar
 */
/**
 * Processa marcadores [[(... )]] que precedem uma tabela modelo e os
 * substitui por uma tabela preenchida a partir dos dados de origem.
 *
 * @param {GoogleAppsScript.Document.Body} body Corpo do documento
 * @param {Object} dataContext Dados para preenchimento
 * @param {Object} scalars Placeholders {empresa, mes, ano, grupo}
 * @param {number} [startIdx] Início do intervalo (default 0)
 * @param {number} [endIdx] Fim do intervalo (inclusive; default final)
 */
function processarMarcadoresTabela(body, dataContext, scalars, startIdx, endIdx) {
  if (!body) return;
  let start = typeof startIdx === 'number' ? startIdx : 0;
  let end = typeof endIdx === 'number' ? endIdx : (body.getNumChildren() - 1);
  let i = start;
  while (i <= end) {
    const child = body.getChild(i);
    if (child.getType() !== DocumentApp.ElementType.PARAGRAPH) {
      i++;
      continue;
    }
    const par = child.asParagraph();
    const text = par.getText() || '';
    // Ignora parágrafos que são apenas o fechamento ]]
    if (text.trim() === ']]') {
      body.removeChild(par);
      end--;
      continue;
    }
    // Aceita espaços entre [[, (, ) e permite ou não o fechamento ]]
    let m = text.match(/\[\[\s*\(\s*([^)]+?)\s*\)\s*\]?\]?/);
    if (!m) {
      const startMarker = text.indexOf('[[');
      const closeParen = text.indexOf(')', startMarker);
      if (startMarker !== -1 && closeParen !== -1) {
        const rawFlags = text.substring(startMarker + 2, closeParen).replace(/^\s*\(/, '').trim();
        if (rawFlags) {
          m = [null, rawFlags];
        }
      }
    }
    if (!m) {
      i++;
      continue;
    }
    const flagsInfo = parseTabelaFlags(m[1]);
    if (!flagsInfo.ok) {
      par.setText('ERRO: ' + flagsInfo.erro);
      i++;
      continue;
    }
    if (i + 1 > end) {
      par.setText('ERRO: tabela modelo ausente para marcador ' + m[0]);
      i++;
      continue;
    }
    const next = body.getChild(i + 1);
    if (next.getType() !== DocumentApp.ElementType.TABLE) {
      par.setText('ERRO: tabela modelo ausente para marcador ' + m[0]);
      i++;
      continue;
    }
    const templateTable = next.asTable();
    const headerRow = templateTable.getRow(0);
    const cols = [];
    for (let c = 0; c < headerRow.getNumCells(); c++) {
      const cellText = headerRow.getCell(c).getText();
      cols.push(analisarCelulaCabecalho(cellText, flagsInfo.origem, scalars));
    }
    const linhasDados = obterLinhasParaOrigem(flagsInfo.origem, flagsInfo.modo, dataContext);
    const valores = [];
    valores.push(cols.map(function(col) { return formatarValorParaDoc(col.headerText); }));
    linhasDados.forEach(function(row) {
      const line = [];
      cols.forEach(function(col) {
        if (!col.fieldKey || !col.valido) {
          line.push('');
        } else {
          const val = (typeof row[col.fieldKey] === 'undefined') ? '' : row[col.fieldKey];
          line.push(formatarValorParaDoc(val));
        }
      });
      valores.push(line);
    });
    const newTable = body.insertTable(i, valores);
    const numTemplateRows = templateTable.getNumRows();
    const pattern = { dataRows: [] };
    if (numTemplateRows === 1) {
      pattern.dataRows = [templateTable.getRow(0)];
    } else if (numTemplateRows === 2) {
      pattern.dataRows = [templateTable.getRow(1)];
    } else {
      pattern.dataRows = [templateTable.getRow(1), templateTable.getRow(2)];
    }
    aplicarEstilosTabela(newTable, templateTable, pattern);
    body.removeChild(body.getChild(i + 1)); // marcador original
    body.removeChild(body.getChild(i + 1)); // tabela modelo original
    end -= 1; // inseriu 1, removeu 2
    i++; // segue após a nova tabela
  }
}

/**
 * Substitui uma marca de tabela ({{nomeTag}}) por uma tabela no corpo
 * do documento. Se o parágrafo contém apenas a tag, ele é
 * substituído pela tabela; se a tag está misturada com texto, a
 * tabela é inserida abaixo e a tag é removida do texto.
 *
 * @param {GoogleAppsScript.Document.Body} body Corpo do documento
 * @param {string} tag Nome da tag a substituir
 * @param {string[]} headers Cabeçalho da tabela
 * @param {Array[]} rows Linhas da tabela
 */
function substituirTagPorTabelaNoBody(body, tag, headers, rows) {
  const placeholder = '{{' + tag + '}}';
  const numChildren = body.getNumChildren();
  const data = [];
  if (headers && headers.length) data.push(headers.map(formatarValorParaDoc));
  if (rows && rows.length) {
    rows.forEach(function(r) {
      if (!Array.isArray(r)) {
        data.push([formatarValorParaDoc(r)]);
        return;
      }
      data.push(r.map(formatarValorParaDoc));
    });
  }
  if (data.length === 0) return;
  for (let i = 0; i < numChildren; i++) {
    const child = body.getChild(i);
    if (child.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;
    const par = child.asParagraph();
    const text = par.getText() || '';
    if (text.indexOf(placeholder) === -1) continue;
    const parent = par.getParent();
    const idx = parent.getChildIndex(par);
    if (text.trim() === placeholder) {
      if (parent.getNumChildren() === 1) {
        parent.appendParagraph('');
      }
      parent.insertTable(idx, data);
      parent.removeChild(parent.getChild(idx + 1));
    } else {
      const textElem = par.editAsText();
      if (textElem) textElem.replaceText(placeholder, '');
      parent.insertTable(idx + 1, data);
    }
    break;
  }
}
