/**
 * Fila de extração: envia os documentos pendentes ao modelo em lotes paralelos, com lock, retomada de linhas travadas e reagendamento por gatilho.
 */

function statusPendenteExtracao_() {
  return 'PENDENTE_EXTRACAO';
}

function statusProcessado_() {
  return 'PROCESSADO';
}

function statusProcessando_() {
  return 'PROCESSANDO';
}

function normalizarStatus_(valor) {
  const base = String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const compact = base.replace(/[^a-z0-9]/g, '');
  if (compact.indexOf('processando') === 0) return 'processando';
  if (compact.indexOf('processado') === 0) return 'processado';
  if (compact.indexOf('erro') === 0) return 'erro';
  if (compact.indexOf('pendente') === 0 && compact.indexOf('extra') !== -1) return 'pendenteextracao';
  return compact;
}

function recuperarLinhasProcessandoTravadas_(procSheet, maxMinutes) {
  if (!procSheet) return 0;
  const data = procSheet.getDataRange().getValues();
  if (data.length < 2) return 0;
  let recuperadas = 0;
  for (let i = 1; i < data.length; i++) {
    const statusNorm = normalizarStatus_(data[i][6]);
    if (statusNorm !== normalizarStatus_(statusProcessando_())) continue;
    // Com lock exclusivo de execucao, qualquer PROCESSANDO remanescente
    // no inicio da rotina indica execucao interrompida.
    atualizarStatus(
      procSheet,
      i + 1,
      statusPendenteExtracao_(),
      'Reagendado automaticamente: execucao anterior interrompida.'
    );
    recuperadas++;
  }
  return recuperadas;
}

/**
 * Processa linhas da aba "Processamento" com chamadas em lote para a IA.
 * A extração de texto continua sequencial, mas o envio para a OpenAI roda
 * em paralelo via UrlFetchApp.fetchAll, limitado por MAX_CONCORRENCIA_EXTRACAO.
 */
function extrairConteudoArquivosPendentes() {
  return executarExtracao_(false);
}

function extrairConteudoNaoProcessado() {
  return executarExtracao_(true);
}

function executarExtracao_(naoProcessado) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    Logger.log(
      naoProcessado
        ? 'Extracao (nao processados) ignorada: outra execucao ja esta em andamento.'
        : 'Extracao ignorada: outra execucao ja esta em andamento.'
    );
    return false;
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const procSheet = ss.getSheetByName('Processamento');
    if (!procSheet) {
      SpreadsheetApp.getUi().alert('A aba "Processamento" nao existe.');
      return false;
    }

    recuperarLinhasProcessandoTravadas_(procSheet, 20);
    const data = procSheet.getDataRange().getValues();
    const fila = [];
    const limiteExecucao = Math.max(1, Number(MAX_CONCORRENCIA_EXTRACAO) || 1);
    let tentativasNaExecucao = 0;

    for (let i = 1; i < data.length; i++) {
      if (tentativasNaExecucao >= limiteExecucao) break;
      const row = data[i];
      const status = String(row[6] || '').trim();
      if (!deveProcessarLinhaExtracao_(status, naoProcessado)) continue;
      tentativasNaExecucao++;

      const rowIndex = i + 1;
      const fileId = row[0];
      const meta = {
        empresa: coagirNomeEmpresa_(row[2]),
        mes: row[3],
        ano: row[4],
        file_id: fileId,
        grupo: coagirNomeGrupo_(row[9]) || coagirNomeEmpresa_(row[2])
      };
      const tipo = row[5];
      const fileName = String(row[1] || '');

      try {
        atualizarStatus(procSheet, rowIndex, 'EXTRAINDO', '');
        const entradaIa = prepararEntradaIaArquivo_(fileId);
        const texto = entradaIa && entradaIa.modo === 'texto'
          ? String(entradaIa.texto || '')
          : '';

        if (entradaIa && entradaIa.modo === 'texto' && isConteudoBinario(texto)) {
          let nomeArquivo = '';
          let mimeArquivo = '';
          try {
            const f = DriveApp.getFileById(fileId);
            nomeArquivo = String(f.getName() || '');
            mimeArquivo = String(f.getMimeType() || '');
          } catch (infoErr) {}
          try {
            registrarDebugIa_('ERRO_EXTRACAO', meta, texto.slice(0, 2000), {
              erro: 'Conteudo binario detectado (arquivo nao convertido para texto)',
              nome_arquivo: nomeArquivo,
              mime_type: mimeArquivo,
              amostra: texto.slice(0, 2000)
            });
          } catch (e) {}
          throw new Error(
            'Conteudo binario detectado; verifique a conversao do arquivo para texto (formato/MIME nao suportado).'
            + (nomeArquivo || mimeArquivo ? ' [arquivo=' + nomeArquivo + ', mime=' + mimeArquivo + ']' : '')
          );
        }

        const tokensEstimados = (entradaIa && entradaIa.modo === 'texto')
          ? estimarTokens_(texto)
          : 0;
        const modelo = escolherModeloExtracaoPorTokens_(tokensEstimados);

        if (entradaIa && entradaIa.modo === 'texto') {
          const extraidos = extrairEmpresaMesAnoDoTexto(texto);
          if (extraidos.empresa) meta.empresa = coagirNomeEmpresa_(extraidos.empresa);
          if (extraidos.mes) meta.mes = extraidos.mes;
          if (extraidos.ano) meta.ano = extraidos.ano;
        }
        if (!meta.grupo) meta.grupo = coagirNomeEmpresa_(meta.empresa);

        let tipoFinal = tipo;
        if ((tipoFinal !== 'BALANCO' && tipoFinal !== 'DRE') && entradaIa && entradaIa.modo === 'texto') {
          tipoFinal = inferTipoFromConteudo(texto);
        }
        if (tipoFinal !== 'BALANCO' && tipoFinal !== 'DRE') {
          tipoFinal = inferTipoFromNomeArquivo_(fileName);
        }
        if (tipoFinal !== 'BALANCO' && tipoFinal !== 'DRE') {
          throw new Error('Nao foi possivel determinar se o documento e BALANCO ou DRE para envio da IA.');
        }
        procSheet.getRange(rowIndex, 6).setValue(tipoFinal);

        let conteudoPrompt = texto;
        if (!(entradaIa && entradaIa.modo === 'texto')) {
          conteudoPrompt = (entradaIa && entradaIa.modo === 'pdf_file')
            ? 'Documento PDF completo enviado como arquivo. Extraia as informacoes de TODAS as paginas do PDF anexado.'
            : 'Documento enviado como imagem. Extraia as informacoes diretamente da imagem anexada.';
        }
        const prompt = (tipoFinal === 'BALANCO')
          ? buildPromptBalanco(conteudoPrompt)
          : buildPromptDre(conteudoPrompt);

        let messages = null;
        if (entradaIa && entradaIa.modo === 'imagem') {
          messages = [
            {
              role: 'system',
              content: PROMPT_SISTEMA_EXTRACAO
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: entradaIa.imageDataUrl } }
              ]
            }
          ];
        }

        atualizarStatus(procSheet, rowIndex, statusProcessando_(), 'PROCESSANDO_DESDE:' + new Date().toISOString());
        fila.push({
          rowIndex: rowIndex,
          fileId: fileId,
          meta: meta,
          tipoFinal: tipoFinal,
          texto: (entradaIa && entradaIa.modo === 'texto')
            ? texto
            : (entradaIa && entradaIa.modo === 'pdf_file' ? '[DOCUMENTO_PDF]' : '[DOCUMENTO_IMAGEM]'),
          prompt: prompt,
          modelo: modelo,
          messages: messages,
          entradaModo: entradaIa ? entradaIa.modo : 'texto'
        });
      } catch (e) {
        atualizarStatus(procSheet, rowIndex, 'ERRO', String(e));
      }
    }

    processarFilaExtracaoEmLote_(procSheet, fila);

    const aindaPendentes = naoProcessado
      ? existemPendentes_(procSheet, statusProcessado_(), true)
      : existemPendentes_(procSheet, statusPendenteExtracao_());

    if (aindaPendentes) {
      agendarExtracao_(naoProcessado);
    }

    return !aindaPendentes;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function deveProcessarLinhaExtracao_(status, naoProcessado) {
  const norm = normalizarStatus_(status);
  if (naoProcessado) {
    return norm !== normalizarStatus_(statusProcessado_());
  }
  return norm === normalizarStatus_(statusPendenteExtracao_())
    || norm === normalizarStatus_(statusProcessando_());
}

/**
 * Escolhe o modelo de extração pelo tamanho estimado do documento: textos
 * curtos vão para o modelo leve; acima de TOKENS_SWITCH_THRESHOLD, para o robusto.
 *
 * @param {number} tokensEstimados
 * @return {string} Nome do modelo
 */
function escolherModeloExtracaoPorTokens_(tokensEstimados) {
  const limite = Number(TOKENS_SWITCH_THRESHOLD);
  if (isFinite(limite) && limite > 0 && Number(tokensEstimados || 0) > limite) {
    return MODELO_EXTRACAO_ROBUSTO;
  }
  return MODELO_EXTRACAO_LEVE;
}

function processarFilaExtracaoEmLote_(procSheet, fila) {
  if (!fila || !fila.length) return;
  const procFolderId = getConfigValue('PROCESSADO_FOLDER_ID');
  const concorrencia = Math.max(1, Number(MAX_CONCORRENCIA_EXTRACAO) || 1);

  for (let i = 0; i < fila.length; i += concorrencia) {
    const lote = fila.slice(i, i + concorrencia);
    const requisicoes = lote.map(function(item) {
      if (item.entradaModo === 'pdf_file') {
        const file = DriveApp.getFileById(item.fileId);
        const blob = file.getBlob();
        const base64 = Utilities.base64Encode(blob.getBytes());
        return {
          responsesInput: [
            {
              role: 'user',
              content: [
                { type: 'input_text', text: item.prompt },
                {
                  type: 'input_file',
                  filename: String(file.getName() || 'documento.pdf'),
                  file_data: base64
                }
              ]
            }
          ],
          // Forca modelo com suporte robusto a arquivo/PDF em modo visao.
          model: MODELO_EXTRACAO_ROBUSTO
        };
      }
      if (item.messages && item.messages.length) {
        return { messages: item.messages, model: item.modelo };
      }
      return { prompt: item.prompt, model: item.modelo };
    });

    let respostas;
    try {
      respostas = chamarOpenAiEmLote_(requisicoes);
    } catch (e) {
      const erroLote = 'Falha ao chamar OpenAI em lote: ' + String(e);
      lote.forEach(function(item) {
        atualizarStatus(procSheet, item.rowIndex, 'ERRO', erroLote);
      });
      continue;
    }

    for (let j = 0; j < lote.length; j++) {
      const item = lote[j];
      const retorno = respostas && respostas[j];
      try {
        if (!retorno || !retorno.ok) {
          throw new Error((retorno && retorno.error) ? retorno.error : 'Resposta invalida no lote da OpenAI.');
        }

        const metaEfetiva = processarConteudoComResposta_(
          item.tipoFinal,
          item.meta,
          item.texto,
          retorno.value,
          item.prompt
        ) || {};

        const empresaFinal = coagirNomeEmpresa_(metaEfetiva.empresa || item.meta.empresa);
        const mesFinal = metaEfetiva.mes || item.meta.mes;
        const anoFinal = metaEfetiva.ano || item.meta.ano;
        procSheet.getRange(item.rowIndex, 3, 1, 3).setValues([[empresaFinal, mesFinal, anoFinal]]);
        atualizarStatus(procSheet, item.rowIndex, statusProcessado_(), '');

        if (procFolderId) {
          const file = DriveApp.getFileById(item.fileId);
          const dest = DriveApp.getFolderById(procFolderId);
          file.moveTo(dest);
        }
      } catch (e) {
        atualizarStatus(procSheet, item.rowIndex, 'ERRO', String(e));
      }
    }
  }
}

function existemPendentes_(sheet, status, negado) {
  if (!sheet) return false;
  const data = sheet.getDataRange().getValues();
  const alvo = normalizarStatus_(status);
  for (let i = 1; i < data.length; i++) {
    const atual = String(data[i][6] || '').trim();
    const atualNorm = normalizarStatus_(atual);
    if (negado) {
      if (atual && atualNorm !== alvo) return true;
    } else {
      if (atualNorm === alvo) return true;
    }
  }
  return false;
}

function agendarExtracao_(naoProcessado) {
  const handler = naoProcessado ? 'extrairConteudoNaoProcessado' : 'extrairConteudoArquivosPendentes';
  criarTriggerUnico_(handler, 1);
}
