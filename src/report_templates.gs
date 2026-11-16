/**
 * Modelos de relatório cadastrados na aba "Config" e diálogo de seleção.
 */

/**
 * Lê a lista de modelos de relatório cadastrados na aba Config.
 * A tabela deve ter um cabeçalho contendo palavras como "nome",
 * "id" e opcionalmente "grupo" para indicar suporte a grupos.
 * Retorna um array de objetos {nome, id, suportaGrupo}. Qualquer
 * linha sem nome ou id é ignorada.
 *
 * @return {Array<Object>} Lista de modelos
 */
function getRelatorioModelos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName('Config');
  if (!configSheet) return [];
  const data = configSheet.getDataRange().getValues();
  // Procura uma linha de cabeçalho contendo campos de modelos
  let headerRow = -1;
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    const cell = String(row[0] || '').toLowerCase().trim();
    if (cell === 'model_name' || cell === 'modelo_nome' || cell === 'nome_modelo' || cell === 'modelo nome' || cell === 'nome') {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) return [];
  const header = data[headerRow];
  const idxName = header.findIndex(function(h) { return String(h).toLowerCase().trim().indexOf('nome') !== -1; });
  const idxId   = header.findIndex(function(h) { return String(h).toLowerCase().trim().indexOf('id') !== -1; });
  const idxGrp  = header.findIndex(function(h) { return String(h).toLowerCase().trim().indexOf('grupo') !== -1; });
  if (idxName < 0 || idxId < 0) return [];
  const modelos = [];
  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i];
    const nome = row[idxName];
    const id   = row[idxId];
    if (!nome || !id) continue;
    let suportaGrupo = false;
    if (idxGrp >= 0) {
      const v = String(row[idxGrp] || '').toLowerCase().trim();
      suportaGrupo = v === 'true' || v === '1' || v === 'sim' || v === 'yes';
    }
    modelos.push({ nome: nome, id: id, suportaGrupo: suportaGrupo });
  }
  return modelos;
}

/**
 * Exibe um alerta na planilha; fora dela (gatilho ou web app), registra no log.
 *
 * @param {string} msg
 */
function alertSafe(msg) {
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    Logger.log(msg);
  }
}

/**
 * Exibe um diálogo modal para seleção de um modelo de relatório. O
 * usuário escolhe entre os modelos cadastrados; opcionalmente, o
 * parâmetro isGrupo filtra apenas modelos que suportam agrupamentos.
 * Após a seleção, a callback JS chama a função indicada.
 *
 * @param {boolean} isGrupo Se true, mostra apenas modelos com suportaGrupo
 * @param {string} callbackFun Nome da função Apps Script que será invocada com o ID do modelo
 */
function mostrarSelecaoModelo(isGrupo, callbackFun) {
  const modelos = getRelatorioModelos().filter(function(m) {
    return !isGrupo || m.suportaGrupo;
  });
  if (modelos.length === 0) {
    alertSafe(isGrupo ? 'Nenhum modelo de grupo definido na aba Config.' : 'Nenhum modelo definido na aba Config.');
    return;
  }
  // Monta HTML de seleção
  let optionsHtml = '';
  modelos.forEach(function(m) {
    const escName = String(m.nome).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    const escId   = String(m.id).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    optionsHtml += '<option value="' + escId + '">' + escName + '</option>';
  });
  const html = HtmlService.createHtmlOutput(
    '<html><head><base target="_top"><style>' +
    'body{font-family:Arial, sans-serif;font-size:13px;padding:10px;}' +
    'select{width:100%; padding:4px; margin-top:8px;}' +
    '.buttons{margin-top:10px;text-align:right;}' +
    '</style></head><body>' +
    '<h3>Escolha o modelo de relatório</h3>' +
    '<select id="modeloSelect">' + optionsHtml + '</select>' +
    '<div class="buttons">' +
    '<button onclick="google.script.host.close()">Cancelar</button>' +
    '<button onclick="salvar()">Gerar</button>' +
    '</div>' +
    '<script>' +
    'function salvar(){' +
    ' var el=document.getElementById("modeloSelect");' +
    ' var modelo=el.value;' +
    ' google.script.run.withSuccessHandler(function(){ google.script.host.close(); }).' + callbackFun + '(modelo);' +
    '}' +
    '</script>' +
    '</body></html>');
  SpreadsheetApp.getUi().showModalDialog(html, 'Selecionar modelo');
}
