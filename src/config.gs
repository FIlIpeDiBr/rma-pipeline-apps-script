/**
 * Leitura de configuração: aba "Config" da planilha e propriedades do script.
 */

/**
 * Lê um valor da aba "Config" a partir de uma chave. A aba deve ter
 * duas colunas: coluna A com o nome da chave e coluna B com o valor.
 *
 * @param {string} key Chave a procurar na coluna A
 * @return {string|null} Valor correspondente ou null se não existir
 */
function getConfigValue(key) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName('Config');
  if (!configSheet) return null;
  const data = configSheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    const k = String(data[i][0] || '').trim();
    if (k === key) {
      return String(data[i][1] || '').trim();
    }
  }
  return null;
}

/**
 * Recupera a API key da OpenAI armazenada nas propriedades do script.
 * Certifique‑se de definir "OPENAI_API_KEY" nas propriedades do
 * projeto antes de chamar a IA.
 *
 * Privada (sufixo _): no Apps Script, toda função global sem sublinhado final
 * pode ser chamada pelo navegador de quem abre o web app, via google.script.run.
 *
 * @return {string|null} A chave da API ou null se não definida
 */
function getOpenAiApiKey_() {
  return PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
}
