/**
 * Geração dos indicadores por empresa e por grupo (consolidado), individual ou em lote.
 */

/**
 * Indicadores que ficaram sem valor depois das fórmulas.
 *
 * @param {Array<Object>} defs Catálogo de indicadores
 * @param {Object} valores Mapa chave normalizada -> valor
 * @return {Array<Object>} Definições sem valor
 */
function indicadoresSemValor_(defs, valores) {
  return defs.filter(function(def) {
    const val = valores[normalizarChaveIndicador(def.key || def.label)];
    return val == null || val === '';
  });
}

/**
 * Monta o prompt que pede ao modelo os indicadores que as fórmulas não fecharam.
 * Só as categorias sintéticas de DRE e balancete entram no prompt.
 *
 * @param {{identificador: string, mes: (string|number), ano: (string|number), dreData: Array<Object>, balSintetico: Array<Object>}} dados
 * @param {Array<Object>} defsPedidos Indicadores a pedir
 * @return {string}
 */
function montarPromptIndicadores_(dados, defsPedidos) {
  function apenasSinteticos(linhas, nomes) {
    const permitidos = {};
    nomes.forEach(function(nome) { permitidos[normalizarChaveIndicador(nome)] = true; });
    return (linhas || []).filter(function(l) {
      const contaNorm = normalizarChaveIndicador(l && l.conta);
      return contaNorm && permitidos[contaNorm];
    });
  }
  const dreJson = JSON.stringify(apenasSinteticos(dados.dreData, getSinteticosDre()), null, 2);
  const balSintJson = JSON.stringify(apenasSinteticos(dados.balSintetico, getSinteticosBalanco()), null, 2);
  const lista = defsPedidos.map(function(d) { return '- ' + d.label; }).join('\n');
  return [
    'Voce é um analista contabil. Recebera os dados de DRE (categorias sinteticas) e de balancete (contas sinteticas de balanco) de uma entidade (empresa ou grupo consolidado) em um determinado mes/ano.',
    'Use APENAS esses dados para calcular indicadores financeiros e retornar um JSON.',
    '',
    'Entidade: ' + dados.identificador,
    'Mes (1-12): ' + dados.mes,
    'Ano: ' + dados.ano,
    '',
    'dreData = ' + dreJson,
    '',
    'balancoSintetico = ' + balSintJson,
    '',
    'Calcule e retorne somente JSON com os campos:',
    lista
  ].join('\n');
}

/**
 * Calcula a linha de indicadores. As fórmulas vêm primeiro; o modelo só é
 * consultado se algum indicador ficar sem valor, e só para esses. Quando todas
 * as fórmulas fecham (o caso normal), nenhuma chamada é feita.
 *
 * @param {Array<Object>} defs Catálogo de indicadores
 * @param {Array} formulaRow Fórmulas de cálculo, alinhadas ao cabeçalho da aba
 * @param {Object} base Valores de DRE, balancete e acumulados
 * @param {Object} dadosPrompt Dados para o prompt (ver montarPromptIndicadores_)
 * @return {{valores: Object, faltantes: string[], consultouIa: boolean, erroIa: (string|null)}}
 */
function calcularIndicadoresComIaSobDemanda_(defs, formulaRow, base, dadosPrompt) {
  const valores = calcularLinhaIndicadores(defs, formulaRow, base, {});
  const faltantes = indicadoresSemValor_(defs, valores);
  const resultado = {
    valores: valores,
    faltantes: faltantes.map(function(d) { return d.key; }),
    consultouIa: false,
    erroIa: null
  };
  if (faltantes.length === 0) return resultado;

  resultado.consultouIa = true;
  try {
    const resp = chamarOpenAi_(montarPromptIndicadores_(dadosPrompt, faltantes));
    const mapaIa = (resp && typeof resp === 'object') ? extrairMapaRespostaIa(resp) : {};
    if (Object.keys(mapaIa).length > 0) {
      resultado.valores = calcularLinhaIndicadores(defs, formulaRow, base, mapaIa);
    }
  } catch (iaErr) {
    resultado.erroIa = String(iaErr);
  }
  return resultado;
}

/**
 * Gera ou atualiza indicadores para uma empresa e período específicos.
 * Se já existir uma linha para (mes, ano, empresa) na aba
 * Indicadores, ela é sobrescrita; caso contrário, uma nova linha é
 * acrescentada. Os dados de balancete e DRE são fornecidos como
 * parâmetros, permitindo reuso tanto para empresas quanto para
 * grupos.
 *
 * @param {string} identificador Nome da entidade (empresa ou "[GRUPO] X")
 * @param {string|number} mes Mês de competência
 * @param {string|number} ano Ano de competência
 * @param {Array<Object>} dreData Linhas da DRE do período
 * @param {Array<Object>} balSintetico Linhas do balancete (sintéticas e/ou detalhadas)
 * @param {boolean} quiet Se true, não exibe alertas; se false, mostra mensagens de erro
 * @return {boolean} True se indicadores foram gravados com sucesso
 */
function gerarIndicadoresComDados_(identificador, mes, ano, dreData, balSintetico, quiet, fileId, opts) {
  try {
    if (!identificador || !mes || !ano) {
      if (!quiet) alertSafe('Identificador, mes e ano sao obrigatorios.');
      return false;
    }
    if ((!dreData || dreData.length === 0) && (!balSintetico || balSintetico.length === 0)) {
      Logger.log('Sem dados para indicadores de ' + identificador + ' ' + mes + '/' + ano);
      if (!quiet) alertSafe('Nao ha dados suficientes para gerar indicadores de ' + identificador + '.');
      return false;
    }
    const ctx = ensureIndicadoresEstrutura();
    const defs = ctx.defs;
    const header = ctx.header;
    const formulaRow = ctx.formulaRow;
    const indicadoresSheet = ctx.sheet;
    const base = criarLookupBaseIndicadores(dreData || [], balSintetico || []);
    _adicionarAcumuladosNaBase_(base, identificador, mes, ano, opts);
    const resultado = calcularIndicadoresComIaSobDemanda_(defs, formulaRow, base, {
      identificador: identificador,
      mes: mes,
      ano: ano,
      dreData: dreData || [],
      balSintetico: balSintetico || []
    });
    if (resultado.erroIa) {
      Logger.log('Falha na OpenAI para indicadores de ' + identificador + ' ' + mes + '/' + ano + ': ' + resultado.erroIa);
      if (!quiet) {
        alertSafe('Nao foi possivel usar a IA para ' + identificador + ' ' + mes + '/' + ano + '. Os indicadores sem dados suficientes ficaram em branco.');
      }
    }
    const calculados = resultado.valores;
    const linha = [fileId || '', mes, ano, identificador];
    defs.forEach(function(def) {
      const val = calculados[normalizarChaveIndicador(def.key || def.label)];
      if (val == null) {
        linha.push('');
      } else {
        linha.push(_limitarDuasCasas(val));
      }
    });
    const lastRowInd = indicadoresSheet.getLastRow();
    const colMap = getIndicadoresColIndexMap_(indicadoresSheet);
    const idxMes = colMap.idxMes;
    const idxAno = colMap.idxAno;
    const idxEmpresa = colMap.idxEmpresa;
    let targetRow = null;
    if (lastRowInd >= INDICADORES_DATA_START_ROW && idxMes != null && idxAno != null && idxEmpresa != null) {
      const idKey = chaveIdentificadorIndicador_(identificador);
      const keys = indicadoresSheet.getRange(INDICADORES_DATA_START_ROW, 1, lastRowInd - INDICADORES_DATA_START_ROW + 1, indicadoresSheet.getLastColumn()).getValues();
      for (let i = 0; i < keys.length; i++) {
        const m = keys[i][idxMes];
        const a = keys[i][idxAno];
        const eKey = chaveIdentificadorIndicador_(keys[i][idxEmpresa]);
        if (String(m) === String(mes) && String(a) === String(ano) && eKey === idKey) {
          targetRow = INDICADORES_DATA_START_ROW + i;
          break;
        }
      }
    }
    const largura = header.length;
    if (linha.length < largura) {
      while (linha.length < largura) linha.push('');
    }
    if (targetRow) {
      indicadoresSheet.getRange(targetRow, 1, 1, largura).setValues([linha]);
    } else {
      const insertRow = Math.max(INDICADORES_DATA_START_ROW, indicadoresSheet.getLastRow() + 1);
      indicadoresSheet.getRange(insertRow, 1, 1, largura).setValues([linha]);
    }
    Logger.log('Indicadores gerados para ' + identificador + ' ' + mes + '/' + ano);
    return true;
  } catch (e) {
    Logger.log('Erro em gerarIndicadoresComDados_: ' + e);
    if (!quiet) alertSafe('Erro ao gerar indicadores: ' + e);
    return false;
  }
}

/**
 * Gera indicadores para uma empresa e período a partir das bases
 * BalancoBase e DreBase. Internamente carrega as linhas do
 * balancete (sintéticas) e da DRE e chama gerarIndicadoresComDados_.
 *
 * @param {string} empresa Nome da empresa
 * @param {string|number} mes Mês
 * @param {string|number} ano Ano
 * @param {boolean} quiet Se true, silencia mensagens de alerta
 * @return {boolean} True se os indicadores foram gerados
 */
function gerarIndicadoresParaEmpresaPeriodo(empresa, mes, ano, quiet, fileId) {
  const bal = carregarBalancoEmpresaPeriodo(empresa, mes, ano);
  const dre = carregarDreEmpresaPeriodo(empresa, mes, ano);
  const balDados = (bal && Array.isArray(bal.todos) && bal.todos.length) ? bal.todos : (bal.sinteticos || []);
  if (balDados.length === 0 && dre.length === 0) {
    const msg = 'Sem dados de Balanco/DRE para ' + empresa + ' ' + mes + '/' + ano;
    Logger.log(msg);
    if (!quiet) alertSafe(msg);
    return false;
  }
  const okAtual = gerarIndicadoresComDados_(empresa, mes, ano, dre, balDados, quiet, fileId, null);
  try {
    tentarGerarIndicadoresPeriodoAnterior(empresa, mes, ano, dre, quiet);
  } catch (e) {
    Logger.log('Erro ao tentar gerar indicadores do periodo anterior: ' + e);
  }
  return okAtual;
}

/**
 * Gera indicadores para a linha selecionada na aba "Processamento". A
 * função lê os metadados da linha (empresa, mes, ano) e invoca
 * gerarIndicadoresParaEmpresaPeriodo. Exibe mensagem ao final.
 */
function gerarIndicadoresDaLinha() {
  const meta = obterLinhaSelecionadaProcessamento();
  if (!meta) return;
  const ok = gerarIndicadoresParaEmpresaPeriodo(meta.empresa, meta.mes, meta.ano, false, meta.fileId);
  if (ok) {
    alertSafe('Indicadores gerados/atualizados para ' + meta.empresa + ' ' + meta.mes + '/' + meta.ano + '.');
  }
}

/**
 * Gera indicadores em lote para todas as empresas na aba
 * Processamento com status "PROCESSADO" que ainda não possuem
 * indicadores gerados. O número de execuções é limitado por
 * LIMITE_DE_INDICADORES (ou 5 se não definido) para não
 * extrapolar o tempo de execução do Apps Script.
 */
function gerarIndicadoresPendentes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const proc = ss.getSheetByName('Processamento');
  if (!proc) {
    alertSafe('Aba "Processamento" não encontrada.');
    return;
  }
  const lastRow = proc.getLastRow();
  const lastCol = proc.getLastColumn();
  if (lastRow < 2) {
    alertSafe('Aba "Processamento" não possui dados.');
    return;
  }
  const header = proc.getRange(1, 1, 1, lastCol).getValues()[0];
  const data = proc.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const idxMes    = _indiceCabecalhoIndicadores_(header, ['Mes', 'mes', 'Mês', 'mês']);
  const idxAno    = _indiceCabecalhoIndicadores_(header, ['Ano', 'ano']);
  const idxEmp    = _indiceCabecalhoIndicadores_(header, ['Empresa', 'empresa']);
  const idxStatus = _indiceCabecalhoIndicadores_(header, ['Status', 'status']);
  let idxFileId = _indiceCabecalhoIndicadores_(header, ['file_id', 'id']);
  if (idxMes < 0 || idxAno < 0 || idxEmp < 0 || idxStatus < 0) {
    alertSafe('Cabeçalho da aba "Processamento" não está no formato esperado.');
    return;
  }
  if (idxFileId < 0) idxFileId = -1;
  // Conjuntos para rastrear combinacoes ja existentes na aba Indicadores
  const indicadoresSheet = getIndicadoresSheet();
  const lastRowInd = indicadoresSheet.getLastRow();
  const existing = new Set();
  if (lastRowInd >= INDICADORES_DATA_START_ROW) {
    const colMap = getIndicadoresColIndexMap_(indicadoresSheet);
    const idxMes = colMap.idxMes;
    const idxAno = colMap.idxAno;
    const idxEmpresa = colMap.idxEmpresa;
    if (idxMes != null && idxAno != null && idxEmpresa != null) {
      const indData = indicadoresSheet.getRange(INDICADORES_DATA_START_ROW, 1, lastRowInd - INDICADORES_DATA_START_ROW + 1, indicadoresSheet.getLastColumn()).getValues();
      indData.forEach(function(r) {
        const key = String(r[idxMes]) + '|' + String(r[idxAno]) + '|' + chaveIdentificadorIndicador_(r[idxEmpresa]);
        existing.add(key);
      });
    }
  }
  const limite = (typeof LIMITE_DE_INDICADORES === 'number' && LIMITE_DE_INDICADORES > 0) ? LIMITE_DE_INDICADORES : 5;
  let processados = 0;
  const vistos = new Set();
  for (let i = 0; i < data.length && processados < limite; i++) {
    const row = data[i];
    if (!_statusProcessadoIndicadores_(row[idxStatus])) continue;
    const mes = row[idxMes];
    const ano = row[idxAno];
    const emp = coagirNomeEmpresa_(row[idxEmp]);
    if (!emp || !mes || !ano) continue;
    const fileId = idxFileId >= 0 ? row[idxFileId] : '';
    const key = String(mes) + '|' + String(ano) + '|' + chaveIdentificadorIndicador_(emp);
    if (vistos.has(key) || existing.has(key)) continue;
    vistos.add(key);
    const ok = gerarIndicadoresParaEmpresaPeriodo(emp, mes, ano, true, fileId);
    if (ok) {
      existing.add(key);
      processados++;
    }
  }
  alertSafe('Indicadores gerados/atualizados para ' + processados + ' período(s).');
}

/**
 * Consolida dados de balancete e DRE para as empresas de um grupo e
 * gera indicadores para o período informado. O identificador na
 * aba Indicadores é prefixado com "[GRUPO] ".
 *
 * @param {string} grupo Nome do grupo
 * @param {string|number} mes Mês
 * @param {string|number} ano Ano
 * @param {boolean} quiet Se true, suprime alertas
 * @return {boolean} True se os indicadores foram gerados
 */
function gerarIndicadoresParaGrupoPeriodo(grupo, mes, ano, quiet) {
  const nomeGrupo = String(grupo || '').trim();
  if (!nomeGrupo) {
    if (!quiet) alertSafe('Grupo não informado.');
    return false;
  }
  const empresas = obterEmpresasDoGrupoNoPeriodo(nomeGrupo, mes, ano);
  if (!empresas || empresas.length === 0) {
    const msg = 'Nenhuma empresa encontrada no grupo "' + nomeGrupo + '" para o período ' + mes + '/' + ano + '.';
    Logger.log(msg);
    if (!quiet) alertSafe(msg);
    return false;
  }
  const dadosGrupo = montarDadosGrupo(nomeGrupo, mes, ano, empresas);
  const consol = dadosGrupo.consolidado;
  const identificador = '[GRUPO] ' + nomeGrupo;
  const dreDados = (consol && Array.isArray(consol.dreCompleta) && consol.dreCompleta.length) ? consol.dreCompleta : consol.dre;
  const balDados = (consol && consol.balanco && Array.isArray(consol.balanco.todos) && consol.balanco.todos.length) ? consol.balanco.todos : (consol.balanco.sinteticos || []);
  return gerarIndicadoresComDados_(identificador, mes, ano, dreDados, balDados, quiet, null, { empresasGrupo: empresas });
}

function tentarGerarIndicadoresPeriodoAnterior(empresa, mes, ano, dreAtual, quiet) {
  const m = parseInt(mes, 10);
  const a = parseInt(ano, 10);
  if (!empresa || isNaN(m) || isNaN(a)) return;
  const prevMes = m === 1 ? 12 : (m - 1);
  const prevAno = m === 1 ? (a - 1) : a;
  if (prevAno <= 0) return;
  // Se já existem indicadores para o período anterior, não faz nada
  if (indicadoresJaExistem(empresa, prevMes, prevAno)) return;
  // Se já existe uma DRE cadastrada para o período anterior, assumimos que haverá geração normal
  try {
    const drePrevExistente = carregarDreEmpresaPeriodo(empresa, prevMes, prevAno);
    if (Array.isArray(drePrevExistente) && drePrevExistente.length > 0) return;
  } catch (e) {
    // ignora falha de carregamento e segue
  }
  const dreAnterior = (dreAtual || []).map(function(l) {
    const valAnt = l.valor_anterior != null ? l.valor_anterior : l.valorAnterior;
    return {
      conta: l.conta,
      valor_atual: valAnt != null ? valAnt : 0,
      valor_anterior: 0
    };
  }).filter(function(l) { return l.conta; });
  const temDadosAnteriores = dreAnterior.some(function(l) { return Number(l.valor_atual || 0) !== 0; });
  if (!temDadosAnteriores) return;
  let balPrev = { sinteticos: [] };
  try {
    balPrev = carregarBalancoEmpresaPeriodo(empresa, prevMes, prevAno);
  } catch (e) {
    balPrev = { sinteticos: [] };
  }
  const balDados = (balPrev && Array.isArray(balPrev.todos) && balPrev.todos.length) ? balPrev.todos : (balPrev.sinteticos || []);
  gerarIndicadoresComDados_(empresa, prevMes, prevAno, dreAnterior, balDados, quiet, null, null);
}

/**
 * Gera indicadores em lote para todos os grupos presentes na aba
 * Processamento com status PROCESSADO que ainda não foram
 * cadastrados na aba Indicadores. Utiliza o mesmo limite de
 * execuções de gerarIndicadoresPendentes.
 */
function gerarIndicadoresGruposPendentes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const proc = ss.getSheetByName('Processamento');
  if (!proc) {
    alertSafe('Aba "Processamento" não encontrada.');
    return;
  }
  const lastRow = proc.getLastRow();
  const lastCol = proc.getLastColumn();
  if (lastRow < 2) {
    alertSafe('Aba "Processamento" não possui dados.');
    return;
  }
  const header = proc.getRange(1, 1, 1, lastCol).getValues()[0];
  const data = proc.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const idxMes    = _indiceCabecalhoIndicadores_(header, ['Mes', 'mes', 'Mês', 'mês']);
  const idxAno    = _indiceCabecalhoIndicadores_(header, ['Ano', 'ano']);
  const idxGrupo  = _indiceCabecalhoIndicadores_(header, ['Grupo', 'grupo']);
  const idxStatus = _indiceCabecalhoIndicadores_(header, ['Status', 'status']);
  if (idxMes < 0 || idxAno < 0 || idxGrupo < 0 || idxStatus < 0) {
    alertSafe('Cabeçalho da aba "Processamento" não está no formato esperado (Mes/Ano/Grupo/Status).');
    return;
  }
  const combos = {}; // key -> {grupo, mes, ano}
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!_statusProcessadoIndicadores_(row[idxStatus])) continue;
    const grupo = coagirNomeGrupo_(row[idxGrupo]);
    if (!grupo) continue;
    const mes = row[idxMes];
    const ano = row[idxAno];
    if (!mes || !ano) continue;
    const key = grupo + '|' + mes + '|' + ano;
    if (!combos[key]) combos[key] = { grupo: grupo, mes: mes, ano: ano };
  }
  // Conjuntos de grupos ja existentes na aba Indicadores
  const indicadoresSheet = getIndicadoresSheet();
  const lastRowInd = indicadoresSheet.getLastRow();
  const existing = new Set();
  if (lastRowInd >= INDICADORES_DATA_START_ROW) {
    const colMap = getIndicadoresColIndexMap_(indicadoresSheet);
    const idxMes = colMap.idxMes;
    const idxAno = colMap.idxAno;
    const idxEmpresa = colMap.idxEmpresa;
    if (idxMes != null && idxAno != null && idxEmpresa != null) {
      const indData = indicadoresSheet.getRange(INDICADORES_DATA_START_ROW, 1, lastRowInd - INDICADORES_DATA_START_ROW + 1, indicadoresSheet.getLastColumn()).getValues();
      indData.forEach(function(r) {
        const key = String(r[idxMes]) + '|' + String(r[idxAno]) + '|' + chaveIdentificadorIndicador_(r[idxEmpresa]);
        // Grupos sao prefixados com [GRUPO]  - compararemos apenas entradas que comecam assim
        if (String(r[idxEmpresa] || '').startsWith('[GRUPO] ')) {
          existing.add(key);
        }
      });
    }
  }
  const limite = (typeof LIMITE_DE_INDICADORES === 'number' && LIMITE_DE_INDICADORES > 0) ? LIMITE_DE_INDICADORES : 5;
  let gerados = 0;
  const keys = Object.keys(combos);
  for (let i = 0; i < keys.length && gerados < limite; i++) {
    const k = keys[i];
    const info = combos[k];
    const keyInd = String(info.mes) + '|' + String(info.ano) + '|' + chaveIdentificadorIndicador_('[GRUPO] ' + info.grupo);
    if (existing.has(keyInd)) continue;
    const ok = gerarIndicadoresParaGrupoPeriodo(info.grupo, info.mes, info.ano, true);
    if (ok) {
      existing.add(keyInd);
      gerados++;
    }
  }
  alertSafe('Indicadores de grupos gerados/atualizados para ' + gerados + ' período(s).');
}

/**
 * Gera indicadores para o grupo da linha atualmente selecionada na aba
 * Processamento. Se a linha não possui um grupo definido, exibe
 * mensagem de alerta. Caso contrário, delega para
 * gerarIndicadoresParaGrupoPeriodo.
 */
function gerarIndicadoresGrupoDaLinha() {
  const meta = obterLinhaSelecionadaProcessamento();
  if (!meta) return;
  const grupo = meta.grupo;
  if (!grupo) {
    alertSafe('A linha selecionada não possui grupo definido (coluna "Grupo").');
    return;
  }
  const ok = gerarIndicadoresParaGrupoPeriodo(grupo, meta.mes, meta.ano, false);
  if (ok) {
    alertSafe('Indicadores de grupo gerados/atualizados para [' + grupo + '] ' + meta.mes + '/' + meta.ano + '.');
  }
}
