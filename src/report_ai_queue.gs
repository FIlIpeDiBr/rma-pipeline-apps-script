/**
 * Processamento assíncrono dos blocos de IA dos relatórios, retomado por gatilho até concluir o documento.
 */

function agendarProcessamentoIaDocIndividual_(docId, stage) {
  const props = PropertiesService.getScriptProperties();
  const key = 'IA_DOC_QUEUE';
  let queue = [];
  try {
    queue = JSON.parse(props.getProperty(key) || '[]');
  } catch (e) {
    queue = [];
  }
  queue.push({ docId: String(docId), stage: String(stage || 'prompts') });
  props.setProperty(key, JSON.stringify(queue));
  criarTriggerUnico_('processarFilaIaDocIndividual_', 1);
}

function _processarPromptsENegritoComLimite_(docId, body) {
  if (!body) return;
  const startMs = Date.now();
  const deadlineMs = startMs + 220000; // buffer para evitar timeout
  const maxBlocks = (typeof MAX_BLOCOS_IA_POR_EXECUCAO === 'number' && isFinite(MAX_BLOCOS_IA_POR_EXECUCAO))
    ? Math.max(1, Math.floor(MAX_BLOCOS_IA_POR_EXECUCAO))
    : 3;

  const res = processarMarcadoresTextoIa(body, { maxBlocks: maxBlocks, deadlineMs: deadlineMs });
  if (res && res.remaining) {
    agendarProcessamentoIaDocIndividual_(docId, 'prompts');
    atualizarRelatorioFila_(docId, { status: 'IA: prompts pendente', progresso: 75 });
    return;
  }
  atualizarRelatorioFila_(docId, { status: 'IA: prompts concluídos', progresso: 80 });

  const r = formatarNegritoMarkdownNoBodyComLimite_(body, { deadlineMs: deadlineMs });
  if (r && r.remaining) {
    agendarProcessamentoIaDocIndividual_(docId, 'bold');
    atualizarRelatorioFila_(docId, { status: 'IA: negrito pendente', progresso: 90 });
    return;
  }
  marcarRelatorioConcluido_(docId, true);
}

function processarFilaIaDocIndividual_() {
  const props = PropertiesService.getScriptProperties();
  const key = 'IA_DOC_QUEUE';
  let queue = [];
  try {
    queue = JSON.parse(props.getProperty(key) || '[]');
  } catch (e) {
    queue = [];
  }
  if (!queue.length) return;

  const item = queue.shift();
  props.setProperty(key, JSON.stringify(queue));

  try {
    const doc = DocumentApp.openById(item.docId);
    const body = doc.getBody();
    const startMs = Date.now();
    const deadlineMs = startMs + 220000;
    const maxBlocks = (typeof MAX_BLOCOS_IA_POR_EXECUCAO === 'number' && isFinite(MAX_BLOCOS_IA_POR_EXECUCAO))
      ? Math.max(1, Math.floor(MAX_BLOCOS_IA_POR_EXECUCAO))
      : 3;

    const stage = String(item.stage || 'prompts');
    if (stage === 'prompts') {
      atualizarRelatorioFila_(item.docId, { status: 'IA: prompts', progresso: 75 });
      const res = processarMarcadoresTextoIa(body, { maxBlocks: maxBlocks, deadlineMs: deadlineMs });
      if (res && res.remaining) {
        queue.push(item);
        props.setProperty(key, JSON.stringify(queue));
        doc.saveAndClose();
        atualizarRelatorioFila_(item.docId, { status: 'IA: prompts pendente', progresso: 75 });
        criarTriggerUnico_('processarFilaIaDocIndividual_', 1);
        return;
      }
      atualizarRelatorioFila_(item.docId, { status: 'IA: prompts concluídos', progresso: 80 });
      item.stage = 'bold';
    }

    if (String(item.stage || stage) === 'bold') {
      atualizarRelatorioFila_(item.docId, { status: 'IA: negrito', progresso: 90 });
      const r = formatarNegritoMarkdownNoBodyComLimite_(body, { deadlineMs: deadlineMs });
      if (r && r.remaining) {
        item.stage = 'bold';
        queue.push(item);
        props.setProperty(key, JSON.stringify(queue));
        doc.saveAndClose();
        atualizarRelatorioFila_(item.docId, { status: 'IA: negrito pendente', progresso: 90 });
        criarTriggerUnico_('processarFilaIaDocIndividual_', 1);
        return;
      }
    }

    doc.saveAndClose();
    const aindaNaFila = queue.some(function(q) { return String(q.docId) === String(item.docId); });
    if (!aindaNaFila) {
      marcarRelatorioConcluido_(item.docId, true);
    }
  } catch (e) {
    Logger.log('Erro no processamento IA individual: ' + e);
    try {
      const doc = DocumentApp.openById(item.docId);
      doc.getBody().insertParagraph(0, 'ERRO no processamento de prompts individuais: ' + e);
      doc.saveAndClose();
    } catch (e2) {}
    marcarRelatorioConcluido_(item.docId, false, e);
  }

  if (queue.length) {
    criarTriggerUnico_('processarFilaIaDocIndividual_', 1);
  }
}

function agendarProcessamentoIaGrupo_(docId, grupo, mes, ano) {
  const props = PropertiesService.getScriptProperties();
  const key = 'IA_GRUPO_QUEUE';
  let queue = [];
  try {
    queue = JSON.parse(props.getProperty(key) || '[]');
  } catch (e) {
    queue = [];
  }
  queue.push({
    docId: String(docId),
    grupo: String(grupo),
    mes: mes,
    ano: ano,
    stage: 'prompts'
  });
  props.setProperty(key, JSON.stringify(queue));
  criarTriggerUnico_('processarFilaIaGrupo_', 1);
}

function processarFilaIaGrupo_() {
  const props = PropertiesService.getScriptProperties();
  const key = 'IA_GRUPO_QUEUE';
  let queue = [];
  try {
    queue = JSON.parse(props.getProperty(key) || '[]');
  } catch (e) {
    queue = [];
  }
  if (!queue.length) return;

  const item = queue.shift();
  props.setProperty(key, JSON.stringify(queue));

  try {
    const doc = DocumentApp.openById(item.docId);
    const body = doc.getBody();
    const stage = String(item.stage || 'prompts');
    const startMs = Date.now();
    const deadlineMs = startMs + 220000; // buffer para evitar timeout do Apps Script (~4m)

    if (stage === 'prompts') {
      if (typeof atualizarRelatorioFila_ === 'function') {
        atualizarRelatorioFila_(item.docId, { status: 'IA: prompts', progresso: 75 });
      }
      const maxBlocks = (typeof MAX_BLOCOS_IA_POR_EXECUCAO === 'number' && isFinite(MAX_BLOCOS_IA_POR_EXECUCAO))
        ? Math.max(1, Math.floor(MAX_BLOCOS_IA_POR_EXECUCAO))
        : 3;
      const res = processarMarcadoresTextoIa(body, { maxBlocks: maxBlocks, deadlineMs: deadlineMs });
      if (res && res.remaining) {
        queue.push(item);
        props.setProperty(key, JSON.stringify(queue));
        doc.saveAndClose();
        if (typeof atualizarRelatorioFila_ === 'function') {
          atualizarRelatorioFila_(item.docId, { status: 'IA: prompts pendente', progresso: 75 });
        }
        criarTriggerUnico_('processarFilaIaGrupo_', 1);
        return;
      }
      if (typeof atualizarRelatorioFila_ === 'function') {
        atualizarRelatorioFila_(item.docId, { status: 'IA: prompts concluidos', progresso: 80 });
      }
      // Proxima etapa: aplicar negrito no markdown. Se nao houver tempo, re-enfileira.
      item.stage = 'bold';
      if (Date.now() > (deadlineMs - 5000)) {
        queue.push(item);
        props.setProperty(key, JSON.stringify(queue));
        doc.saveAndClose();
        if (typeof atualizarRelatorioFila_ === 'function') {
          atualizarRelatorioFila_(item.docId, { status: 'IA: negrito pendente', progresso: 90 });
        }
        criarTriggerUnico_('processarFilaIaGrupo_', 1);
        return;
      }
    }

    if (String(item.stage || stage) === 'bold') {
      if (typeof atualizarRelatorioFila_ === 'function') {
        atualizarRelatorioFila_(item.docId, { status: 'IA: negrito', progresso: 90 });
      }
      try {
        if (typeof formatarNegritoMarkdownNoBodyComLimite_ === 'function') {
          const r = formatarNegritoMarkdownNoBodyComLimite_(body, { deadlineMs: deadlineMs });
          if (r && r.remaining) {
            item.stage = 'bold';
            queue.push(item);
            props.setProperty(key, JSON.stringify(queue));
            doc.saveAndClose();
            if (typeof atualizarRelatorioFila_ === 'function') {
              atualizarRelatorioFila_(item.docId, { status: 'IA: negrito pendente', progresso: 90 });
            }
            criarTriggerUnico_('processarFilaIaGrupo_', 1);
            return;
          }
        } else if (typeof formatarNegritoMarkdownNoBody_ === 'function') {
          formatarNegritoMarkdownNoBody_(body);
        }
      } catch (e) {
        Logger.log('Falha ao formatar negrito markdown: ' + e);
      }
    }

    doc.saveAndClose();
    if (typeof marcarRelatorioConcluido_ === 'function') {
      marcarRelatorioConcluido_(item.docId, true);
    }
  } catch (e) {
    Logger.log('Erro no processamento IA do grupo: ' + e);
    try {
      const doc = DocumentApp.openById(item.docId);
      const body = doc.getBody();
      const msg = 'ERRO no processamento de prompts do grupo "' + item.grupo + '" em ' + item.mes + '/' + item.ano + ': ' + e;
      body.insertParagraph(0, msg);
      doc.saveAndClose();
    } catch (e2) {
      Logger.log('Falha ao registrar erro no documento: ' + e2);
    }
    if (typeof marcarRelatorioConcluido_ === 'function') {
      marcarRelatorioConcluido_(item.docId, false, e);
    }
  }

  if (queue.length) {
    criarTriggerUnico_('processarFilaIaGrupo_', 1);
  }
}
