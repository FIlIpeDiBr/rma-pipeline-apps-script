/**
 * Instalação: prepara uma planilha nova para o primeiro uso.
 */

// Cabeçalho da aba "Processamento". A ordem importa: parte do pipeline lê por posição.
const PROCESSAMENTO_HEADER = [
  'file_id', 'Nome_arquivo', 'Empresa', 'Mes', 'Ano', 'Tipo', 'Status', 'Mensagem', 'Criado_em', 'Grupo', 'RMA_URL'
];

// Chave da aba "Config" -> nome da pasta criada ao lado da planilha.
const PASTAS_PADRAO = {
  ENTRADA_FOLDER_ID: 'Entrada',
  PROCESSADO_FOLDER_ID: 'Processados',
  RELATORIOS_FOLDER_ID: 'Relatórios'
};

/**
 * Cria as abas "Config" e "Processamento" se faltarem e, para cada pasta ainda
 * não configurada, cria uma pasta ao lado da planilha e grava o ID na Config.
 * Pode ser executada mais de uma vez: nunca sobrescreve o que já está preenchido.
 */
function configurarPlanilha() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let proc = ss.getSheetByName('Processamento');
  if (!proc) proc = ss.insertSheet('Processamento');
  if (proc.getLastRow() === 0) {
    proc.getRange(1, 1, 1, PROCESSAMENTO_HEADER.length).setValues([PROCESSAMENTO_HEADER]);
    proc.setFrozenRows(1);
  }

  let config = ss.getSheetByName('Config');
  if (!config) config = ss.insertSheet('Config');

  const valores = config.getLastRow() > 0 ? config.getDataRange().getValues() : [];
  const plano = planejarConfig_(valores, Object.keys(PASTAS_PADRAO));
  const criadas = [];
  if (plano.chavesSemValor.length > 0) {
    const pastaBase = pastaDaPlanilha_(ss);
    plano.chavesSemValor.forEach(function(chave) {
      const pasta = pastaBase.createFolder(PASTAS_PADRAO[chave]);
      definirConfigValue_(config, chave, pasta.getId());
      criadas.push(PASTAS_PADRAO[chave]);
    });
  }
  if (!plano.temTabelaDeModelos) {
    const linha = config.getLastRow() + 2; // uma linha em branco separa as chaves dos modelos
    config.getRange(linha, 1, 1, 3).setValues([['nome', 'id', 'grupo']]);
  }

  const msg = 'Planilha configurada.'
    + (criadas.length ? ' Pastas criadas: ' + criadas.join(', ') + '.' : '')
    + ' Falta definir OPENAI_API_KEY nas propriedades do script e cadastrar ao menos um modelo de relatório na aba Config.';
  alertSafe(msg);
  return msg;
}

/**
 * Decide o que falta na aba "Config" sem tocar na planilha.
 *
 * @param {Array<Array>} valores Conteúdo atual da aba
 * @param {string[]} chaves Chaves obrigatórias
 * @return {{chavesSemValor: string[], temTabelaDeModelos: boolean}}
 */
function planejarConfig_(valores, chaves) {
  const preenchidas = {};
  let temTabelaDeModelos = false;
  (valores || []).forEach(function(linha) {
    const chave = String(linha[0] || '').trim();
    if (!chave) return;
    if (['nome', 'model_name', 'modelo_nome', 'nome_modelo', 'modelo nome'].indexOf(chave.toLowerCase()) !== -1) {
      temTabelaDeModelos = true;
      return;
    }
    if (String(linha[1] == null ? '' : linha[1]).trim() !== '') preenchidas[chave] = true;
  });
  return {
    chavesSemValor: chaves.filter(function(c) { return !preenchidas[c]; }),
    temTabelaDeModelos: temTabelaDeModelos
  };
}

/**
 * Grava um par chave/valor na aba "Config". Atualiza a linha se a chave já
 * existir; senão, insere no topo, para nunca cair dentro da tabela de modelos.
 */
function definirConfigValue_(config, chave, valor) {
  const ultima = config.getLastRow();
  if (ultima > 0) {
    const coluna = config.getRange(1, 1, ultima, 1).getValues();
    for (let i = 0; i < coluna.length; i++) {
      if (String(coluna[i][0] || '').trim() === chave) {
        config.getRange(i + 1, 2).setValue(valor);
        return;
      }
    }
    config.insertRowBefore(1);
  }
  config.getRange(1, 1, 1, 2).setValues([[chave, valor]]);
}

/**
 * Pasta do Drive onde a planilha está (ou a raiz, se não houver pasta).
 */
function pastaDaPlanilha_(ss) {
  const pais = DriveApp.getFileById(ss.getId()).getParents();
  return pais.hasNext() ? pais.next() : DriveApp.getRootFolder();
}
