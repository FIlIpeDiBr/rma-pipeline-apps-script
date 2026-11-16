/**
 * Geração dos relatórios no Google Docs: copia o modelo, preenche marcadores e delega os blocos de IA à fila.
 */

function _ordenarLinhasDrePorSintetico(linhas) {
  if (!Array.isArray(linhas)) return [];
  const pos = {};
  try {
    (typeof SINTETICOS_DRE !== 'undefined' ? SINTETICOS_DRE : []).forEach(function(n, i) {
      pos[sanitizeName(n)] = i;
    });
  } catch (e) {
    Logger.log('Nao foi possivel mapear SINTETICOS_DRE: ' + e);
  }
  const conhecidos = [];
  const desconhecidos = [];
  linhas.forEach(function(l, idx) {
    const nome = sanitizeName(l && (l.conta || l.nome || l.descricao || ''));
    if (pos.hasOwnProperty(nome)) {
      conhecidos.push({ ordem: pos[nome], idx: idx, linha: l });
    } else {
      desconhecidos.push({ idx: idx, linha: l });
    }
  });
  conhecidos.sort(function(a, b) {
    if (a.ordem === b.ordem) return a.idx - b.idx;
    return a.ordem - b.ordem;
  });
  desconhecidos.sort(function(a, b) { return a.idx - b.idx; });
  return conhecidos.map(function(x) { return x.linha; }).concat(desconhecidos.map(function(x) { return x.linha; }));
}

/**
 * Ação principal para relatório individual. Mostra a janela de seleção
 * de modelo e, quando o usuário confirma, chama
 * exportarRelatorioIndividualComModelo(modeloId).
 */
function exportarRelatorioIndividualDaLinha() {
  mostrarSelecaoModelo(false, 'exportarRelatorioIndividualComModelo');
}

/**
 * Ação principal para relatório de grupo. Mostra a janela de seleção
 * de modelo (filtrada para modelos com suporte a grupos) e, ao
 * confirmar, chama exportarRelatorioGrupoComModelo(modeloId).
 */
function exportarRelatorioGrupoDaLinha() {
  mostrarSelecaoModelo(true, 'exportarRelatorioGrupoComModelo');
}

/**
 * Gera um relatório individual usando o modelo especificado. O
 * templateId é passado pela seleção de modelos e os dados vêm da
 * linha selecionada na aba "Processamento".
 *
 * @param {string} templateId ID do template a utilizar
 */
function exportarRelatorioIndividualComModelo(templateId) {
  const meta = obterLinhaSelecionadaProcessamento();
  if (!meta) return;
  const empresa = meta.empresa;
  const mes     = meta.mes;
  const ano     = meta.ano;
  const dadosBal = carregarBalancoEmpresaPeriodo(empresa, mes, ano, meta.fileId);
  const linhasDre = carregarDreEmpresaPeriodo(empresa, mes, ano, meta.fileId);
  const outputFolderId = getConfigValue('RELATORIOS_FOLDER_ID');
  if (!templateId || !outputFolderId) {
    alertSafe('Defina RELATORIOS_FOLDER_ID na aba Config e selecione um modelo.');
    return;
  }
  const templateFile = DriveApp.getFileById(templateId);
  const outFolder = DriveApp.getFolderById(outputFolderId);
  const monthName = getMonthName(mes);
  const docName = 'Relatório ' + empresa + ' ' + monthName + '/' + ano;
  const newFile = templateFile.makeCopy(docName, outFolder);
  registrarRelatorioFila_({
    tipo: 'Individual',
    entidade: empresa,
    mes: mes,
    ano: ano,
    docId: newFile.getId(),
    docUrl: newFile.getUrl(),
    status: 'Criando documento',
    progresso: 10
  });
  const doc = DocumentApp.openById(newFile.getId());
  const body = doc.getBody();
  const scalars = { empresa: String(empresa), mes: monthName, ano: String(ano), grupo: String(meta.grupo || '') };
  substituirPlaceholdersNoBody(body, scalars);
  atualizarRelatorioFila_(newFile.getId(), { status: 'Preenchendo dados', progresso: 30 });
  // Preenche tabelas se houverem tags
  const rowsBalCompleta = (dadosBal.todos || (dadosBal.detalhados || []).concat(dadosBal.sinteticos || [])).map(function(r) {
    return [r.conta, r.saldoAnterior, r.debito, r.credito, r.saldoAtual];
  });
  substituirTagPorTabelaNoBody(body, 'tabela_bal_completa', ['Conta', 'Saldo anterior', 'Débito', 'Crédito', 'Saldo atual'], rowsBalCompleta);
  const rowsBalResumida = dadosBal.sinteticos.map(function(r) {
    return [r.conta, r.saldoAnterior, r.saldoAtual];
  });
  substituirTagPorTabelaNoBody(body, 'tabela_bal_resumida', ['Conta', 'Saldo anterior', 'Saldo atual'], rowsBalResumida);
  const linhasDreOrdenadas = _ordenarLinhasDrePorSintetico(linhasDre);
  const rowsDre = linhasDreOrdenadas.map(function(r) {
    return [r.conta, r.valorAtual, r.valorAnterior];
  });
  substituirTagPorTabelaNoBody(body, 'tabela_dre', ['Conta', 'Valor atual', 'Valor anterior'], rowsDre);
  const dataContext = { balancobase: dadosBal, drebase: { linhas: linhasDreOrdenadas } };
  processarMarcadoresTabela(body, dataContext, scalars);
  atualizarRelatorioFila_(newFile.getId(), { status: 'Dados preenchidos', progresso: 40 });
  const graficoContexto = {
    empresa: String(empresa),
    empresaLabel: String(empresa),
    grupo: String(meta.grupo || ''),
    mes: _mesParaNumero(mes),
    ano: parseInt(ano, 10),
    integrantesGrupo: meta.grupo ? obterEmpresasDoGrupoNoPeriodo(meta.grupo, mes, ano) : []
  };
  atualizarRelatorioFila_(newFile.getId(), { status: 'Gerando gráficos', progresso: 50 });
  processarMarcadoresGraficos(body, graficoContexto);
  atualizarRelatorioFila_(newFile.getId(), { status: 'Gráficos concluídos', progresso: 60 });
  atualizarRelatorioFila_(newFile.getId(), { status: 'Processando IA', progresso: 70 });
  _processarPromptsENegritoComLimite_(newFile.getId(), body);
  doc.saveAndClose();
  if (meta.rmaUrlColIndex) {
    meta.sheet.getRange(meta.rowIndex, meta.rmaUrlColIndex).setValue(doc.getUrl());
  }
  // Aviso de conclusão removido (status via fila).
}

/**
 * Gera um relatório de grupo usando o modelo especificado. Esta
 * função consolida dados de todas as empresas do grupo e repete
 * blocos do template para cada integrante, adicionando também o
 * consolidado ao final. Usa o modelo informado para qualquer
 * relatório de grupo.
 *
 * @param {string} templateId ID do template selecionado
 */
function exportarRelatorioGrupoComModelo(templateId) {
  const meta = obterLinhaSelecionadaProcessamento();
  if (!meta) return;
  const grupo = meta.grupo;
  if (!grupo) {
    alertSafe('A linha selecionada não possui grupo definido (coluna "Grupo").');
    return;
  }
  const mes = meta.mes;
  const ano = meta.ano;
  const empresas = obterEmpresasDoGrupoNoPeriodo(grupo, mes, ano);
  if (!empresas || empresas.length === 0) {
    alertSafe('Nenhuma empresa encontrada no grupo "' + grupo + '" para o período ' + mes + '/' + ano + '.');
    return;
  }
  const dadosGrupo = montarDadosGrupo(grupo, mes, ano, empresas);
  const outputFolderId = getConfigValue('RELATORIOS_FOLDER_ID');
  if (!templateId || !outputFolderId) {
    alertSafe('Defina RELATORIOS_FOLDER_ID na aba Config e selecione um modelo.');
    return;
  }
  const templateFile = DriveApp.getFileById(templateId);
  const outFolder = DriveApp.getFolderById(outputFolderId);
  const monthName = getMonthName(mes);
  const docName = 'Relatório Grupo ' + grupo + ' ' + monthName + '/' + ano;
  const newFile = templateFile.makeCopy(docName, outFolder);
  registrarRelatorioFila_({
    tipo: 'Grupo',
    entidade: grupo,
    mes: mes,
    ano: ano,
    docId: newFile.getId(),
    docUrl: newFile.getUrl(),
    status: 'Criando documento',
    progresso: 10
  });
  const doc = DocumentApp.openById(newFile.getId());
  const body = doc.getBody();
  // Substitui placeholders básicos
  const scalars = { grupo: String(grupo), mes: monthName, ano: String(ano) };
  substituirPlaceholdersNoBody(body, scalars);
  atualizarRelatorioFila_(newFile.getId(), { status: 'Preenchendo dados', progresso: 30 });
  // Repete e preenche bloco delimited by [[[ e ]]] com salvamento em lotes
  replicarBlocoGrupo(body, dadosGrupo, monthName, ano, grupo, scalars, newFile.getId());
  atualizarRelatorioFila_(newFile.getId(), { status: 'Dados preenchidos', progresso: 40 });
  // Reabre para garantir que o documento esteja aberto após os salvamentos internos da replicação
  const reopened = DocumentApp.openById(newFile.getId());
  const reopenedBody = reopened.getBody();
  const graficoContexto = {
    empresa: '',
    empresaLabel: '',
    grupo: String(grupo),
    mes: _mesParaNumero(mes),
    ano: parseInt(ano, 10),
    integrantesGrupo: dadosGrupo.integrantes || []
  };
  atualizarRelatorioFila_(newFile.getId(), { status: 'Gerando gráficos', progresso: 50 });
  processarMarcadoresGraficos(reopenedBody, graficoContexto);
  atualizarRelatorioFila_(newFile.getId(), { status: 'Gráficos concluídos', progresso: 60 });
  reopened.saveAndClose();
  // Prompts ficam para processamento assíncrono (ordem: gráficos primeiro).
  try {
    if (typeof agendarProcessamentoIaGrupo_ === 'function') {
      agendarProcessamentoIaGrupo_(newFile.getId(), grupo, mes, ano);
      atualizarRelatorioFila_(newFile.getId(), { status: 'IA enfileirada', progresso: 70 });
    }
  } catch (e) {
    Logger.log('Falha ao agendar IA do grupo: ' + e);
    atualizarRelatorioFila_(newFile.getId(), { status: 'Erro ao enfileirar IA', progresso: 70, erro: String(e) });
  }
  if (meta.rmaUrlColIndex) {
    meta.sheet.getRange(meta.rowIndex, meta.rmaUrlColIndex).setValue(reopened.getUrl());
  }
  // Aviso de conclusão removido (status via fila).
}

/**
 * Gera um relatório individual para uma empresa específica em um
 * determinado período, usando o modelo selecionado. Esta função
 * não depende da linha selecionada na aba Processamento.
 *
 * @param {string} empresa Nome da empresa
 * @param {number} mes Mês (1-12)
 * @param {number} ano Ano
 * @param {string} templateId ID do template a utilizar
 */
function exportarRelatorioIndividualParaEmpresaComModelo(empresa, mes, ano, templateId) {
  if (!empresa || !templateId) {
    alertSafe('Empresa ou template não informado.');
    return;
  }
  const dadosBal = carregarBalancoEmpresaPeriodo(empresa, mes, ano);
  const linhasDre = carregarDreEmpresaPeriodo(empresa, mes, ano);
  const outputFolderId = getConfigValue('RELATORIOS_FOLDER_ID');
  if (!outputFolderId) {
    alertSafe('Defina RELATORIOS_FOLDER_ID na aba Config.');
    return;
  }
  const templateFile = DriveApp.getFileById(templateId);
  const outFolder = DriveApp.getFolderById(outputFolderId);
  const monthName = getMonthName(mes);
  const docName = 'Relatório ' + empresa + ' ' + monthName + '/' + ano;
  const newFile = templateFile.makeCopy(docName, outFolder);
  registrarRelatorioFila_({
    tipo: 'Individual',
    entidade: empresa,
    mes: mes,
    ano: ano,
    docId: newFile.getId(),
    docUrl: newFile.getUrl(),
    status: 'Criando documento',
    progresso: 10
  });
  const doc = DocumentApp.openById(newFile.getId());
  const body = doc.getBody();
  const scalars = { empresa: String(empresa), mes: monthName, ano: String(ano), grupo: '' };
  substituirPlaceholdersNoBody(body, scalars);
  atualizarRelatorioFila_(newFile.getId(), { status: 'Preenchendo dados', progresso: 30 });
  const rowsBalCompleta = (dadosBal.todos || (dadosBal.detalhados || []).concat(dadosBal.sinteticos || [])).map(function(r) {
    return [r.conta, r.saldoAnterior, r.debito, r.credito, r.saldoAtual];
  });
  substituirTagPorTabelaNoBody(body, 'tabela_bal_completa', ['Conta', 'Saldo anterior', 'Débito', 'Crédito', 'Saldo atual'], rowsBalCompleta);
  const rowsBalResumida = dadosBal.sinteticos.map(function(r) {
    return [r.conta, r.saldoAnterior, r.saldoAtual];
  });
  substituirTagPorTabelaNoBody(body, 'tabela_bal_resumida', ['Conta', 'Saldo anterior', 'Saldo atual'], rowsBalResumida);
  const linhasDreOrdenadas = _ordenarLinhasDrePorSintetico(linhasDre);
  const rowsDre = linhasDreOrdenadas.map(function(r) {
    return [r.conta, r.valorAtual, r.valorAnterior];
  });
  substituirTagPorTabelaNoBody(body, 'tabela_dre', ['Conta', 'Valor atual', 'Valor anterior'], rowsDre);
  const dataContext = { balancobase: dadosBal, drebase: { linhas: linhasDreOrdenadas } };
  processarMarcadoresTabela(body, dataContext, scalars);
  atualizarRelatorioFila_(newFile.getId(), { status: 'Dados preenchidos', progresso: 40 });
  const graficoContexto = {
    empresa: String(empresa),
    empresaLabel: String(empresa),
    grupo: '',
    mes: _mesParaNumero(mes),
    ano: parseInt(ano, 10),
    integrantesGrupo: []
  };
  atualizarRelatorioFila_(newFile.getId(), { status: 'Gerando gráficos', progresso: 50 });
  processarMarcadoresGraficos(body, graficoContexto);
  atualizarRelatorioFila_(newFile.getId(), { status: 'Gráficos concluídos', progresso: 60 });
  atualizarRelatorioFila_(newFile.getId(), { status: 'Processando IA', progresso: 70 });
  _processarPromptsENegritoComLimite_(newFile.getId(), body);
  doc.saveAndClose();
  // Aviso de conclusão removido (status via fila).
}

/**
 * Gera um relatório consolidado para um grupo específico em um
 * determinado período usando o template selecionado. Esta função
 * não depende da linha selecionada.
 *
 * @param {string} grupo Nome do grupo
 * @param {number} mes Mês (1-12)
 * @param {number} ano Ano
 * @param {string} templateId ID do modelo
 */
function exportarRelatorioGrupoParaGrupoComModelo(grupo, mes, ano, templateId) {
  if (!grupo || !templateId) {
    alertSafe('Grupo ou template nao informado.');
    return;
  }
  const empresas = obterEmpresasDoGrupoNoPeriodo(grupo, mes, ano);
  if (!empresas || empresas.length === 0) {
    alertSafe('Nenhuma empresa encontrada no grupo "' + grupo + '" para o periodo ' + mes + '/' + ano + '.');
    return;
  }
  const dadosGrupo = montarDadosGrupo(grupo, mes, ano, empresas);
  const outputFolderId = getConfigValue('RELATORIOS_FOLDER_ID');
  if (!outputFolderId) {
    alertSafe('Defina RELATORIOS_FOLDER_ID na aba Config.');
    return;
  }
  const templateFile = DriveApp.getFileById(templateId);
  const outFolder = DriveApp.getFolderById(outputFolderId);
  const monthName = getMonthName(mes);
  const docName = 'Relatorio Grupo ' + grupo + ' ' + monthName + '/' + ano;
  const newFile = templateFile.makeCopy(docName, outFolder);
  registrarRelatorioFila_({
    tipo: 'Grupo',
    entidade: grupo,
    mes: mes,
    ano: ano,
    docId: newFile.getId(),
    docUrl: newFile.getUrl(),
    status: 'Criando documento',
    progresso: 10
  });
  const doc = DocumentApp.openById(newFile.getId());
  const body = doc.getBody();
  body.replaceText('{{grupo}}', String(grupo));
  body.replaceText('{{mes}}', monthName);
  body.replaceText('{{ano}}', String(ano));
  atualizarRelatorioFila_(newFile.getId(), { status: 'Preenchendo dados', progresso: 30 });
  replicarBlocoGrupo(body, dadosGrupo, monthName, ano, grupo);
  atualizarRelatorioFila_(newFile.getId(), { status: 'Dados preenchidos', progresso: 40 });
  // Gráficos já nesta execução; prompts ficam para a fila.
  try {
    const graficoContexto = {
      empresa: '',
      empresaLabel: '',
      grupo: String(grupo),
      mes: _mesParaNumero(mes),
      ano: parseInt(ano, 10),
      integrantesGrupo: dadosGrupo.integrantes || []
    };
    atualizarRelatorioFila_(newFile.getId(), { status: 'Gerando gráficos', progresso: 50 });
    processarMarcadoresGraficos(body, graficoContexto);
    atualizarRelatorioFila_(newFile.getId(), { status: 'Gráficos concluídos', progresso: 60 });
  } catch (e) {
    Logger.log('Falha ao gerar gráficos no relatório de grupo: ' + e);
    atualizarRelatorioFila_(newFile.getId(), { status: 'Erro nos gráficos', progresso: 60, erro: String(e) });
  }
  doc.saveAndClose();
  agendarProcessamentoIaGrupo_(newFile.getId(), grupo, mes, ano);
  atualizarRelatorioFila_(newFile.getId(), { status: 'IA enfileirada', progresso: 70 });
  // Aviso de conclusão removido (status via fila).
}
