/**
 * Grupos econômicos: cadastro, integrantes por período e dados consolidados.
 */

/**
 * Obtém o índice da coluna "empresa" na aba Processamento. Se não
 * existir, retorna o índice da coluna 3, que é o local padrão.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} procSheet Aba Processamento
 * @return {number} Índice da coluna (1‑based)
 */
function getEmpresaColIndex_(procSheet) {
  const lastCol = procSheet.getLastColumn();
  if (lastCol === 0) return 3;
  const header = procSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (let i = 0; i < header.length; i++) {
    if (String(header[i] || '').toLowerCase() === 'empresa') {
      return i + 1;
    }
  }
  return 3;
}

/**
 * Garante a existência de uma coluna "Grupo" na aba Processamento e
 * devolve seu índice. Se a coluna não existir, ela é criada ao
 * final da linha de cabeçalho.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} procSheet Aba Processamento
 * @return {number} Índice da coluna (1‑based)
 */
function ensureGrupoColumn_(procSheet) {
  const lastCol = procSheet.getLastColumn();
  let header = [];
  if (lastCol > 0) header = procSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let grupoCol = -1;
  for (let i = 0; i < header.length; i++) {
    if (String(header[i] || '').toLowerCase() === 'grupo') {
      grupoCol = i + 1;
      break;
    }
  }
  if (grupoCol === -1) {
    grupoCol = lastCol + 1;
    procSheet.getRange(1, grupoCol).setValue('Grupo');
  }
  return grupoCol;
}

/**
 * Abre um diálogo para gerenciar os grupos das empresas. Lista
 * todas as empresas encontradas na aba Processamento com seus grupos
 * atuais e permite edição em um formulário HTML. O salvamento é
 * feito pela função salvarGrupos().
 */
function gerenciarGrupos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const procSheet = ss.getSheetByName('Processamento');
  if (!procSheet) {
    SpreadsheetApp.getUi().alert('A aba "Processamento" não existe.');
    return;
  }
  const empresaCol = getEmpresaColIndex_(procSheet);
  const grupoCol   = ensureGrupoColumn_(procSheet);
  const data = procSheet.getDataRange().getValues();
  if (data.length < 2) {
    SpreadsheetApp.getUi().alert('A aba "Processamento" não possui dados.');
    return;
  }
  const gruposPorEmpresa = {};
  for (let i = 1; i < data.length; i++) {
    const empresa = coagirNomeEmpresa_(data[i][empresaCol - 1]);
    if (!empresa) continue;
    const grupo = coagirNomeGrupo_(data[i][grupoCol - 1]);
    if (typeof gruposPorEmpresa[empresa] === 'undefined') {
      gruposPorEmpresa[empresa] = grupo;
    } else if (grupo) {
      gruposPorEmpresa[empresa] = grupo;
    }
  }
  const empresas = Object.keys(gruposPorEmpresa).sort();
  if (empresas.length === 0) {
    SpreadsheetApp.getUi().alert('Nenhuma empresa encontrada na aba "Processamento".');
    return;
  }
  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  let rowsHtml = '';
  empresas.forEach(emp => {
    const grupo = gruposPorEmpresa[emp] || '';
    rowsHtml += '<tr>' +
      '<td class="empresa">' + esc(emp) + '</td>' +
      '<td><input class="grupo-input" type="text" value="' + esc(grupo) + '"/></td>' +
      '</tr>';
  });
  const html = `
    <html>
      <head>
        <base target="_top">
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; padding: 10px; }
          h2 { margin-top: 0; }
          table { border-collapse: collapse; width: 100%; max-height: 400px; overflow-y: auto; display: block; }
          th, td { border: 1px solid #ccc; padding: 4px 6px; }
          th { background-color: #f0f0f0; position: sticky; top: 0; }
          .buttons { margin-top: 10px; text-align: right; }
          button { margin-left: 4px; }
        </style>
      </head>
      <body>
        <h2>Gerenciar grupos</h2>
        <p>Edite o grupo de cada empresa e clique em <b>Salvar</b>.</p>
        <table>
          <thead>
            <tr><th>Empresa</th><th>Grupo</th></tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div class="buttons">
          <button onclick="google.script.host.close()">Cancelar</button>
          <button onclick="salvar()">Salvar</button>
        </div>
        <script>
          function salvar() {
            var linhas = document.querySelectorAll('tbody tr');
            var grupos = {};
            linhas.forEach(function(tr) {
              var empresa = tr.querySelector('.empresa').textContent.trim();
              var input = tr.querySelector('.grupo-input');
              grupos[empresa] = input.value;
            });
            google.script.run
              .withSuccessHandler(function() { google.script.host.close(); })
              .salvarGrupos(grupos);
          }
        </script>
      </body>
    </html>
  `;
  const output = HtmlService.createHtmlOutput(html).setWidth(500).setHeight(500);
  SpreadsheetApp.getUi().showModalDialog(output, 'Gerenciar grupos');
}

/**
 * Retorna a lista de empresas com seus respectivos grupos para uso no portal.
 *
 * @return {Array<{empresa:string, grupo:string}>}
 */
function listarEmpresasGrupos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const procSheet = ss.getSheetByName('Processamento');
  if (!procSheet) return [];
  const empresaCol = getEmpresaColIndex_(procSheet);
  const grupoCol = ensureGrupoColumn_(procSheet);
  const data = procSheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const empresa = coagirNomeEmpresa_(data[i][empresaCol - 1]);
    if (!empresa) continue;
    const grupo = coagirNomeGrupo_(data[i][grupoCol - 1]);
    if (typeof map[empresa] === 'undefined') {
      map[empresa] = grupo;
    } else if (grupo) {
      map[empresa] = grupo;
    }
  }
  return Object.keys(map)
    .sort(function(a, b) { return a.localeCompare(b); })
    .map(function(emp) { return { empresa: emp, grupo: map[emp] || '' }; });
}

/**
 * Recebe o mapa empresa->grupo vindo do diálogo e grava na aba
 * Processamento, atualizando todas as linhas da empresa.
 *
 * @param {Object} grupos Mapa de empresas para grupos
 */
function salvarGrupos(grupos) {
  if (!grupos || typeof grupos !== 'object') return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const procSheet = ss.getSheetByName('Processamento');
  if (!procSheet) return;
  const empresaCol = getEmpresaColIndex_(procSheet);
  const grupoCol   = ensureGrupoColumn_(procSheet);
  const data = procSheet.getDataRange().getValues();
  if (data.length < 2) return;
  for (let i = 1; i < data.length; i++) {
    const empresa = coagirNomeEmpresa_(data[i][empresaCol - 1]);
    if (!empresa) continue;
    if (grupos.hasOwnProperty(empresa)) {
      const novoGrupo = coagirNomeGrupo_(grupos[empresa]);
      procSheet.getRange(i + 1, grupoCol).setValue(novoGrupo);
    }
  }
}

/**
 * Retorna a lista de empresas de um grupo em um determinado
 * período (mes/ano) a partir da aba Processamento. A lista é
 * ordenada alfabeticamente.
 *
 * @param {string} grupo Nome do grupo
 * @param {string|number} mes Mês
 * @param {string|number} ano Ano
 * @return {string[]} Empresas participantes
 */
function obterEmpresasDoGrupoNoPeriodo(grupo, mes, ano) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Processamento');
  if (!sheet) {
    throw new Error('Aba "Processamento" não encontrada.');
  }
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const data   = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const idxGrupo = header.indexOf('Grupo');
  const idxEmpresa = header.indexOf('Empresa');
  const idxMes = header.indexOf('Mes');
  const idxAno = header.indexOf('Ano');
  if (idxGrupo < 0 || idxEmpresa < 0 || idxMes < 0 || idxAno < 0) {
    throw new Error('Cabeçalho da aba "Processamento" não está no formato esperado.');
  }
  const setEmpresas = {};
  const grupoStr = coagirNomeGrupo_(grupo);
  const mesNum  = parseInt(mes, 10);
  const anoNum  = parseInt(ano, 10);
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rGrupo = coagirNomeGrupo_(row[idxGrupo]);
    if (!rGrupo || rGrupo !== grupoStr) continue;
    const rMes = parseInt(row[idxMes], 10);
    const rAno = parseInt(row[idxAno], 10);
    if (rMes !== mesNum || rAno !== anoNum) continue;
    const emp = coagirNomeEmpresa_(row[idxEmpresa]);
    if (!emp) continue;
    setEmpresas[emp] = true;
  }
  return Object.keys(setEmpresas).sort();
}

/**
 * Consolida dados de balancete e DRE para cada empresa de um grupo e
 * constrói também um consolidado geral. Retorna um objeto com a
 * lista de integrantes e o consolidado.
 *
 * @param {string} grupo Nome do grupo
 * @param {string|number} mes Mês
 * @param {string|number} ano Ano
 * @param {string[]} empresas Lista de empresas do grupo
 * @return {{integrantes:Array, consolidado:Object}}
 */
function montarDadosGrupo(grupo, mes, ano, empresas) {
  const integrantes = [];
  empresas.forEach(function(emp) {
    const bal = carregarBalancoEmpresaPeriodo(emp, mes, ano);
    const dre = carregarDreEmpresaPeriodo(emp, mes, ano);
    integrantes.push({
      nome: emp,
      isConsolidado: false,
      balanco: bal,
      dre: dre
    });
  });
  const mapBal = {};
  const sintSet = {};
  getSinteticosBalanco().forEach(function(nome) {
    sintSet[String(nome).toLowerCase()] = true;
  });
  integrantes.forEach(function(intg) {
    const todos = intg.balanco.detalhados.concat(intg.balanco.sinteticos);
    todos.forEach(function(r) {
      const conta = String(r.conta || '').trim();
      if (!conta) return;
      if (!mapBal[conta]) {
        mapBal[conta] = { saldoAnterior: 0, debito: 0, credito: 0, saldoAtual: 0 };
      }
      mapBal[conta].saldoAnterior += Number(r.saldoAnterior || 0);
      mapBal[conta].debito        += Number(r.debito || 0);
      mapBal[conta].credito       += Number(r.credito || 0);
      mapBal[conta].saldoAtual    += Number(r.saldoAtual || 0);
    });
  });
  const consolDetalhados = [];
  const consolSinteticos = [];
  Object.keys(mapBal).forEach(function(conta) {
    const agg = mapBal[conta];
    const entry = {
      conta: conta,
      saldoAnterior: agg.saldoAnterior,
      debito: agg.debito,
      credito: agg.credito,
      saldoAtual: agg.saldoAtual
    };
    const keyLower = conta.toLowerCase();
    if (sintSet[keyLower]) {
      consolSinteticos.push(entry);
    } else {
      consolDetalhados.push(entry);
    }
  });
  consolDetalhados.sort(function(a, b) { return a.conta.localeCompare(b.conta); });
  consolSinteticos.sort(function(a, b) { return a.conta.localeCompare(b.conta); });
  const mapDre = {};
  integrantes.forEach(function(intg) {
    intg.dre.forEach(function(r) {
      const conta = String(r.conta || '').trim();
      if (!conta) return;
      const key = conta.toLowerCase();
      if (!mapDre[key]) {
        mapDre[key] = { conta: conta, valorAtual: 0, valorAnterior: 0 };
      }
      mapDre[key].valorAtual    += Number(r.valorAtual || 0);
      mapDre[key].valorAnterior += Number(r.valorAnterior || 0);
    });
  });
  const consolDre = [];
  getSinteticosDre().forEach(function(nome) {
    const key = nome.toLowerCase();
    const agg = mapDre[key] || { valorAtual: 0, valorAnterior: 0 };
    consolDre.push({ conta: nome, valorAtual: agg.valorAtual, valorAnterior: agg.valorAnterior });
  });
  const consolidado = {
    nome: 'Consolidado',
    isConsolidado: true,
    balanco: { detalhados: consolDetalhados, sinteticos: consolSinteticos, todos: consolDetalhados.concat(consolSinteticos) },
    dre: consolDre
  };
  return { integrantes: integrantes, consolidado: consolidado };
}
