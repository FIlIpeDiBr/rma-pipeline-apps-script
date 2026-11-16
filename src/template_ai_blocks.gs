/**
 * Blocos de IA do modelo: &&(prompt: ...) ... && envia o conteúdo da seção ao modelo e insere o texto gerado.
 */

function _extrairTextoTabelaIa_(table) {
  const rows = [];
  for (let r = 0; r < table.getNumRows(); r++) {
    const row = table.getRow(r);
    const cells = [];
    for (let c = 0; c < row.getNumCells(); c++) {
      const cell = row.getCell(c);
      const parts = [];
      for (let k = 0; k < cell.getNumChildren(); k++) {
        const child = cell.getChild(k);
        const tipo = child.getType();
        if (tipo === DocumentApp.ElementType.PARAGRAPH) {
          const t = child.asParagraph().getText();
          if (t) parts.push(t);
        } else if (tipo === DocumentApp.ElementType.LIST_ITEM) {
          const t = child.asListItem().getText();
          if (t) parts.push(t);
        }
      }
      const cellText = parts.join(' ').trim();
      cells.push(cellText);
    }
    const rowText = cells.join(' | ').trim();
    if (rowText) rows.push(rowText);
  }
  return rows.join('\n');
}

function _extrairTextoElementoIa_(child) {
  if (!child) return '';
  const tipo = child.getType();
  if (tipo === DocumentApp.ElementType.PARAGRAPH) {
    const t = child.asParagraph().getText() || '';
    return t.trim() === '%%%' ? '' : t;
  }
  if (tipo === DocumentApp.ElementType.LIST_ITEM) return child.asListItem().getText();
  if (tipo === DocumentApp.ElementType.TABLE) return _extrairTextoTabelaIa_(child.asTable());
  if (tipo === DocumentApp.ElementType.INLINE_IMAGE) return '';
  if (tipo === DocumentApp.ElementType.PAGE_BREAK || tipo === DocumentApp.ElementType.HORIZONTAL_RULE) return '';
  try {
    return child.getText ? child.getText() : '';
  } catch (e) {
    return '';
  }
}

function _extrairTextoIntervaloIa_(body, startIdx, endIdx) {
  const partes = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const texto = _extrairTextoElementoIa_(body.getChild(i));
    if (texto) partes.push(texto);
  }
  return partes.join('\n').trim();
}

function _parseIaBlockParams_(raw) {
  const params = { system: '', prompt: '', pos: 'final' };
  if (!raw) return params;
  const parts = String(raw).split(';').map(function(p) { return p.trim(); }).filter(Boolean);
  parts.forEach(function(p) {
    const lower = p.toLowerCase();
    if (lower === 'inicio' || lower === 'final') {
      params.pos = lower;
      return;
    }
    if (lower.indexOf('system:') === 0) {
      params.system = p.split(':').slice(1).join(':').trim();
      return;
    }
    if (lower.indexOf('prompt:') === 0) {
      params.prompt = p.split(':').slice(1).join(':').trim();
    }
  });
  return params;
}

function _removerDescricoesGraficosIA(body) {
  if (!body) return;
  let i = 0;
  while (i < body.getNumChildren()) {
    const child = body.getChild(i);
    if (child.getType() !== DocumentApp.ElementType.PARAGRAPH) {
      i++;
      continue;
    }
    const text = child.asParagraph().getText() || '';
    if (text.trim() !== '%%%') {
      i++;
      continue;
    }
    let endIdx = -1;
    for (let j = i + 1; j < body.getNumChildren(); j++) {
      const next = body.getChild(j);
      if (next.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;
      const t = next.asParagraph().getText() || '';
      if (t.trim() === '%%%') {
        endIdx = j;
        break;
      }
    }
    if (endIdx === -1) {
      body.removeChild(child);
      continue;
    }
    for (let k = endIdx; k >= i; k--) {
      body.removeChild(body.getChild(k));
    }
  }
}

/**
 * Processa blocos &&(...) ... && gerando texto com IA a partir do conteúdo.
 *
 * @param {GoogleAppsScript.Document.Body} body Corpo do documento
 */
function processarMarcadoresTextoIa(body, opts) {
  if (!body) return { processed: 0, remaining: false };
  const maxBlocks = (opts && typeof opts.maxBlocks === 'number' && isFinite(opts.maxBlocks))
    ? Math.max(1, Math.floor(opts.maxBlocks))
    : null;
  const deadlineMs = (opts && typeof opts.deadlineMs === 'number' && isFinite(opts.deadlineMs)) ? opts.deadlineMs : null;
  const state = { processed: 0, remaining: false };

  function walk_(container) {
    if (!container || state.remaining) return;
    if (deadlineMs != null && Date.now() > deadlineMs) {
      state.remaining = true;
      return;
    }
    let i = 0;
    let end = container.getNumChildren() - 1;
    while (i <= end) {
      if (state.remaining) return;
      if (deadlineMs != null && Date.now() > deadlineMs) {
        state.remaining = true;
        return;
      }
      const child = container.getChild(i);
      // Também processa blocos de IA dentro de tabelas.
      if (child.getType() === DocumentApp.ElementType.TABLE) {
        const table = child.asTable();
        for (let r = 0; r < table.getNumRows(); r++) {
          const row = table.getRow(r);
          for (let c = 0; c < row.getNumCells(); c++) {
            walk_(row.getCell(c));
            if (state.remaining) return;
          }
        }
        i++;
        end = container.getNumChildren() - 1;
        continue;
      }
      if (child.getType() !== DocumentApp.ElementType.PARAGRAPH &&
          child.getType() !== DocumentApp.ElementType.LIST_ITEM) {
        i++;
        continue;
      }
      const par = (child.getType() === DocumentApp.ElementType.LIST_ITEM) ? child.asListItem() : child.asParagraph();
      const text = par.getText() || '';
      const startPos = text.indexOf('&&(');
      if (startPos === -1) {
        i++;
        continue;
      }
      if (maxBlocks != null && state.processed >= maxBlocks) {
        state.remaining = true;
        return;
      }
      if (deadlineMs != null && Date.now() > deadlineMs) {
        state.remaining = true;
        return;
      }
      const endParen = text.indexOf(')', startPos);
      if (endParen === -1) {
        i++;
        continue;
      }
      const rawFlags = text.substring(startPos + 3, endParen).trim();
      const params = _parseIaBlockParams_(rawFlags);
      let closeIdx = -1;
      for (let j = i + 1; j <= end; j++) {
        const next = container.getChild(j);
        if (next.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;
        const t = next.asParagraph().getText() || '';
        if (t.trim() === '&&') {
          closeIdx = j;
          break;
        }
      }
      if (closeIdx === -1) {
        par.setText('ERRO: fechamento && não encontrado.');
        i++;
        continue;
      }
      const conteudo = _extrairTextoIntervaloIa_(container, i + 1, closeIdx - 1);
      const promptBase = params.prompt || 'Descreva os dados de maneira profissional e não faça sugestões.';
      const userPrompt = promptBase + '\n\nConteúdo da seção:\n' + conteudo;
      if (!conteudo || !conteudo.trim()) {
        const msg = 'ERRO: conteúdo vazio para geração de texto.';
        if (params.pos === 'inicio') {
          par.setText(msg);
          container.removeChild(container.getChild(closeIdx));
          end -= 1;
          i++;
        } else {
          const closePar = container.getChild(closeIdx).asParagraph();
          const insertPar = container.insertParagraph(closeIdx + 1, msg);
          container.removeChild(par);
          container.removeChild(closePar);
          end = container.getNumChildren() - 1;
          i = container.getChildIndex(insertPar) + 1;
        }
        continue;
      }
      let resposta = '';
      try {
        const messages = [];
        if (params.system) messages.push({ role: 'system', content: params.system });
        messages.push({ role: 'user', content: userPrompt });
        resposta = chamarOpenAiTextoComMensagens_(messages);
      } catch (e) {
        resposta = 'ERRO AO GERAR TEXTO: ' + e;
      }
      state.processed += 1;
      if (deadlineMs != null && Date.now() > deadlineMs) {
        state.remaining = true;
        return;
      }
      if (params.pos === 'inicio') {
        par.setText(resposta || '');
        container.removeChild(container.getChild(closeIdx));
        end -= 1;
        i++;
      } else {
        const closePar = container.getChild(closeIdx).asParagraph();
        const insertPar = container.insertParagraph(closeIdx + 1, resposta || '');
        container.removeChild(par);
        container.removeChild(closePar);
        end = container.getNumChildren() - 1;
        i = container.getChildIndex(insertPar) + 1;
      }
    }
  }

  walk_(body);
  if (!state.remaining) {
    _removerDescricoesGraficosIA(body);
  }
  return { processed: state.processed, remaining: state.remaining };
}

function formatarNegritoMarkdownNoBody_(container) {
  return formatarNegritoMarkdownNoBodyComLimite_(container, null);
}

function formatarNegritoMarkdownNoBodyComLimite_(container, opts) {
  if (!container) return { remaining: false };
  const deadlineMs = (opts && typeof opts.deadlineMs === 'number' && isFinite(opts.deadlineMs)) ? opts.deadlineMs : null;
  function aplicarNoText_(textEl) {
    if (!textEl) return;
    const s = textEl.getText();
    if (!s || s.indexOf('**') === -1) return;
    const matches = [];
    const re = /\*\*([^*]+?)\*\*/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      matches.push({ start: m.index, len: m[0].length });
    }
    for (let i = matches.length - 1; i >= 0; i--) {
      const start = matches[i].start;
      const end = start + matches[i].len - 1;
      const contentStart = start + 2;
      const contentEnd = end - 2;
      if (contentEnd >= contentStart) {
        try { textEl.setBold(contentStart, contentEnd, true); } catch (e) {}
      }
      try { textEl.deleteText(contentEnd + 1, contentEnd + 2); } catch (e) {}
      try { textEl.deleteText(start, start + 1); } catch (e) {}
    }
  }
  function walk_(parent) {
    if (deadlineMs != null && Date.now() > deadlineMs) return false;
    for (let i = 0; i < parent.getNumChildren(); i++) {
      if (deadlineMs != null && Date.now() > deadlineMs) return false;
      const child = parent.getChild(i);
      const t = child.getType();
      if (t === DocumentApp.ElementType.PARAGRAPH) {
        aplicarNoText_(child.asParagraph().editAsText());
      } else if (t === DocumentApp.ElementType.LIST_ITEM) {
        aplicarNoText_(child.asListItem().editAsText());
      } else if (t === DocumentApp.ElementType.TABLE) {
        const table = child.asTable();
        for (let r = 0; r < table.getNumRows(); r++) {
          const row = table.getRow(r);
          for (let c = 0; c < row.getNumCells(); c++) {
            const ok = walk_(row.getCell(c));
            if (ok === false) return false;
          }
        }
      }
    }
    return true;
  }
  const ok = walk_(container);
  return { remaining: ok === false };
}
