/**
 * Marcadores simples do modelo: {{chave}} e {{periodo(±n)}}.
 */

/**
 * Substitui placeholders simples no formato {{chave}} pelos valores fornecidos.
 *
 * @param {string} str Texto a processar
 * @param {Object} scalars Valores para substituição
 * @return {string} Texto com placeholders substituídos
 */
function substituirPlaceholdersSimples(str, scalars) {
  if (!str) return '';
  let out = String(str);
  out = substituirPeriodoPlaceholder_(out, scalars);
  Object.keys(scalars || {}).forEach(function(key) {
    const token = '{{' + key + '}}';
    out = out.split(token).join(String(scalars[key]));
  });
  return out;
}

function escaparRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function substituirPlaceholdersNoBody(body, scalars) {
  if (!body || !scalars) return;
  Object.keys(scalars).forEach(function(key) {
    const pattern = escaparRegex('{{' + key + '}}');
    body.replaceText(pattern, String(scalars[key]));
  });
  substituirPeriodoNoBody_(body, scalars);
}

function _mesParaNumero(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  const s = String(val).trim();
  if (!s) return null;
  const num = parseInt(s, 10);
  if (!isNaN(num)) return num;
  const mapa = {
    'janeiro': 1, 'jan': 1,
    'fevereiro': 2, 'fev': 2,
    'marco': 3, 'marÇõo': 3, 'mar': 3,
    'abril': 4, 'abr': 4,
    'maio': 5,
    'junho': 6, 'jun': 6,
    'julho': 7, 'jul': 7,
    'agosto': 8, 'ago': 8,
    'setembro': 9, 'set': 9,
    'outubro': 10, 'out': 10,
    'novembro': 11, 'nov': 11,
    'dezembro': 12, 'dez': 12
  };
  const norm = sanitizeName(s);
  return mapa[norm] || null;
}

function _ajustarPeriodoComOffset(mes, ano, offset) {
  let m = _mesParaNumero(mes);
  let a = parseInt(ano, 10);
  if (isNaN(a)) a = null;
  if (m === null || a === null) return { mes: m, ano: a };
  const off = parseInt(offset, 10);
  if (isNaN(off) || off === 0) return { mes: m, ano: a };
  m += off;
  while (m > 12) { m -= 12; a += 1; }
  while (m < 1)  { m += 12; a -= 1; }
  return { mes: m, ano: a };
}

function formatarPeriodoComOffset_(mes, ano, offset) {
  if (mes == null || ano == null) return '';
  const periodo = _ajustarPeriodoComOffset(mes, ano, offset || 0);
  const mesNum = (periodo && periodo.mes != null) ? parseInt(periodo.mes, 10) : NaN;
  const anoNum = (periodo && periodo.ano != null) ? parseInt(periodo.ano, 10) : NaN;
  if (isNaN(mesNum) || isNaN(anoNum)) {
    return String(mes) + '/' + String(ano);
  }
  return getMonthName(mesNum) + '/' + String(anoNum);
}

function substituirPeriodoPlaceholder_(texto, scalars) {
  if (!texto) return '';
  const mes = scalars && scalars.mes != null ? scalars.mes : '';
  const ano = scalars && scalars.ano != null ? scalars.ano : '';
  return String(texto).replace(/{{\s*periodo(?:\s*\(\s*([+-]?\d+)\s*\))?\s*}}/gi, function(_, off) {
    const offset = off ? parseInt(off, 10) : 0;
    return formatarPeriodoComOffset_(mes, ano, isNaN(offset) ? 0 : offset);
  });
}

function _substituirPeriodoNoText_(textEl, scalars) {
  if (!textEl) return;
  const text = textEl.getText();
  if (!text) return;
  const re = /{{\s*periodo(?:\s*\(\s*([+-]?\d+)\s*\))?\s*}}/gi;
  const matches = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    matches.push({
      start: m.index,
      end: m.index + m[0].length - 1,
      offset: m[1]
    });
  }
  if (!matches.length) return;
  for (let i = matches.length - 1; i >= 0; i--) {
    const item = matches[i];
    const offset = item.offset ? parseInt(item.offset, 10) : 0;
    const replacement = formatarPeriodoComOffset_(
      scalars && scalars.mes != null ? scalars.mes : '',
      scalars && scalars.ano != null ? scalars.ano : '',
      isNaN(offset) ? 0 : offset
    );
    textEl.deleteText(item.start, item.end);
    textEl.insertText(item.start, replacement);
  }
}

function substituirPeriodoNoBody_(body, scalars) {
  if (!body) return;
  const numChildren = body.getNumChildren();
  for (let i = 0; i < numChildren; i++) {
    const child = body.getChild(i);
    const type = child.getType();
    if (type === DocumentApp.ElementType.PARAGRAPH) {
      const textEl = child.asParagraph().editAsText();
      _substituirPeriodoNoText_(textEl, scalars);
    } else if (type === DocumentApp.ElementType.LIST_ITEM) {
      const textEl = child.asListItem().editAsText();
      _substituirPeriodoNoText_(textEl, scalars);
    } else if (type === DocumentApp.ElementType.TABLE) {
      const table = child.asTable();
      for (let r = 0; r < table.getNumRows(); r++) {
        const row = table.getRow(r);
        for (let c = 0; c < row.getNumCells(); c++) {
          const cell = row.getCell(c);
          for (let k = 0; k < cell.getNumChildren(); k++) {
            const el = cell.getChild(k);
            if (el.getType() === DocumentApp.ElementType.PARAGRAPH) {
              _substituirPeriodoNoText_(el.asParagraph().editAsText(), scalars);
            } else if (el.getType() === DocumentApp.ElementType.LIST_ITEM) {
              _substituirPeriodoNoText_(el.asListItem().editAsText(), scalars);
            }
          }
        }
      }
    }
  }
}
