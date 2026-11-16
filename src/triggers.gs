/**
 * Gatilhos de tempo usados para continuar trabalhos que não cabem em uma execução do Apps Script.
 */

/**
 * Agenda uma única execução futura de `handlerName`, removendo antes qualquer
 * gatilho pendente da mesma função. É assim que as filas continuam o trabalho
 * que não coube no limite de tempo de uma execução.
 *
 * @param {string} handlerName Nome da função global a executar
 * @param {number} [minutes=1] Atraso em minutos
 */
function criarTriggerUnico_(handlerName, minutes) {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  const delayMs = Math.max(1, minutes || 1) * 60 * 1000;
  ScriptApp.newTrigger(handlerName).timeBased().after(delayMs).create();
}
