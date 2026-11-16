/**
 * Cliente da API da OpenAI (Chat Completions e Responses), com chamadas em
 * lote via UrlFetchApp.fetchAll e reparo de JSON malformado.
 */

const OPENAI_URL_CHAT = 'https://api.openai.com/v1/chat/completions';
const OPENAI_URL_RESPONSES = 'https://api.openai.com/v1/responses';

/**
 * Monta as opções de UrlFetchApp para uma chamada à OpenAI. A chave fica nas
 * propriedades do script, nunca no código nem na planilha.
 *
 * @param {Object} payload Corpo da requisição
 * @return {Object} Opções para UrlFetchApp.fetch / fetchAll
 */
function montarOpcoesOpenAi_(payload) {
  const apiKey = getOpenAiApiKey_();
  if (!apiKey) {
    throw new Error('Propriedade OPENAI_API_KEY nao definida. Defina a chave da API nas propriedades do script.');
  }
  return {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
}

/**
 * Extrai o texto de uma resposta HTTP da OpenAI.
 *
 * @param {GoogleAppsScript.URL_Fetch.HTTPResponse} resp
 * @param {string} modo 'chat' (Chat Completions) ou 'responses' (Responses API)
 * @return {string} Texto devolvido pelo modelo
 */
function lerRespostaOpenAi_(resp, modo) {
  const code = resp.getResponseCode();
  const body = resp.getContentText();
  if (code >= 400) {
    throw new Error('Erro OpenAI ' + code + ': ' + body);
  }
  const json = JSON.parse(body);
  const content = (modo === 'responses')
    ? extrairTextoRespostaResponses_(json)
    : (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content);
  if (!content) {
    throw new Error('Resposta vazia da OpenAI.');
  }
  return content;
}

/**
 * Remove delimitadores de bloco ```json ... ``` que o modelo às vezes devolve.
 *
 * @param {string} content
 * @return {string}
 */
function removerCercaMarkdown_(content) {
  let cleaned = String(content).trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n/, '').replace(/```\s*$/m, '').trim();
  }
  return cleaned;
}

/**
 * Converte o texto do modelo em objeto, tentando reparar o JSON antes de desistir.
 *
 * @param {string} content Texto devolvido pelo modelo
 * @return {Object}
 */
function parsearJsonOpenAi_(content) {
  const parsed = tentarParseJsonOpenAi_(removerCercaMarkdown_(content));
  if (parsed.ok) return parsed.value;
  throw new Error('Falha ao parsear JSON retornado pela OpenAI: ' + parsed.error + '\nConteudo: ' + content);
}

/**
 * Faz uma chamada ao Chat Completions e devolve o texto da resposta.
 *
 * @param {Array<Object>} messages
 * @param {string} model
 * @param {number} [temperature=0]
 * @return {string}
 */
function chamarChatOpenAi_(messages, model, temperature) {
  const opcoes = montarOpcoesOpenAi_({
    model: model,
    messages: messages,
    temperature: temperature == null ? 0 : temperature
  });
  return lerRespostaOpenAi_(UrlFetchApp.fetch(OPENAI_URL_CHAT, opcoes), 'chat');
}

/**
 * Envia um array de mensagens para a API da OpenAI e retorna JSON.
 *
 * @param {Array<Object>} messages
 * @param {string} [model=MODELO_JSON_PADRAO]
 * @param {number} [temperature=0]
 * @return {Object}
 */
function chamarOpenAiComMensagens_(messages, model, temperature) {
  return parsearJsonOpenAi_(chamarChatOpenAi_(messages, model || MODELO_JSON_PADRAO, temperature));
}

/**
 * Envia mensagens para a API da OpenAI e retorna o texto bruto.
 *
 * @param {Array<Object>} messages
 * @param {string} [model=MODELO_TEXTO_PADRAO]
 * @param {number} [temperature=0]
 * @return {string}
 */
function chamarOpenAiTextoComMensagens_(messages, model, temperature) {
  return removerCercaMarkdown_(chamarChatOpenAi_(messages, model || MODELO_TEXTO_PADRAO, temperature));
}

/**
 * Atalho para um prompt único com a mensagem de sistema padrão de extração.
 *
 * @param {string} prompt
 * @return {Object}
 */
function chamarOpenAi_(prompt) {
  return chamarOpenAiComMensagens_(_montarMensagensPadraoOpenAi_(prompt));
}

function _montarMensagensPadraoOpenAi_(prompt) {
  return [
    { role: 'system', content: PROMPT_SISTEMA_EXTRACAO },
    { role: 'user', content: String(prompt || '') }
  ];
}

/**
 * Envia vários pedidos em paralelo (UrlFetchApp.fetchAll). Cada item pode ser
 * um prompt (string) ou um objeto {prompt | messages | responsesInput, model,
 * temperature}. Itens com `responsesInput` usam a Responses API, que aceita
 * arquivos PDF; os demais usam Chat Completions.
 *
 * A falha de um item não derruba o lote: cada posição do retorno traz
 * {ok: true, value} ou {ok: false, error}.
 *
 * @param {Array<string|Object>} prompts
 * @param {string} [model] Modelo padrão do lote
 * @param {number} [temperature] Temperatura padrão do lote
 * @return {Array<{ok: boolean, value: (Object|undefined), error: (string|undefined)}>}
 */
function chamarOpenAiEmLote_(prompts, model, temperature) {
  const lista = Array.isArray(prompts) ? prompts : [];
  if (!lista.length) return [];

  const modos = [];
  const reqs = lista.map(function(item) {
    const ehObjeto = item && typeof item === 'object';
    const modelItem = (ehObjeto && item.model) ? item.model : model;
    const temperatureItem = (ehObjeto && item.temperature != null) ? item.temperature : temperature;

    if (ehObjeto && Array.isArray(item.responsesInput)) {
      const payloadResp = { model: modelItem || MODELO_EXTRACAO_ROBUSTO, input: item.responsesInput };
      if (temperatureItem != null) payloadResp.temperature = temperatureItem;
      modos.push('responses');
      return Object.assign({ url: OPENAI_URL_RESPONSES }, montarOpcoesOpenAi_(payloadResp));
    }

    const messages = (ehObjeto && Array.isArray(item.messages))
      ? item.messages
      : _montarMensagensPadraoOpenAi_(ehObjeto ? item.prompt : item);
    modos.push('chat');
    return Object.assign({ url: OPENAI_URL_CHAT }, montarOpcoesOpenAi_({
      model: modelItem || MODELO_EXTRACAO_LEVE,
      messages: messages,
      temperature: temperatureItem == null ? 0 : temperatureItem
    }));
  });

  return UrlFetchApp.fetchAll(reqs).map(function(resp, idx) {
    try {
      return { ok: true, value: parsearJsonOpenAi_(lerRespostaOpenAi_(resp, modos[idx])) };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? e.message : String(e) };
    }
  });
}

/**
 * Tenta interpretar o texto como JSON. Se falhar, repara dois defeitos comuns
 * nas respostas do modelo (expressões aritméticas em campos numéricos e
 * vírgulas sobrando) e tenta de novo.
 *
 * @param {string} text
 * @return {{ok: boolean, value: (Object|undefined), error: (*|undefined)}}
 */
function tentarParseJsonOpenAi_(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return { ok: false, error: 'Resposta vazia apos limpeza de markdown.' };

  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e1) {
    // Ex.: "saldo_atual": 100 + 200
    let repaired = repararExpressoesNumericasJson_(raw);
    // Remove virgulas sobrando antes de } ou ]
    repaired = repaired.replace(/,\s*([}\]])/g, '$1');

    if (repaired !== raw) {
      try {
        return { ok: true, value: JSON.parse(repaired) };
      } catch (e2) {
        return { ok: false, error: e2 };
      }
    }

    return { ok: false, error: e1 };
  }
}

function repararExpressoesNumericasJson_(jsonText) {
  const text = String(jsonText || '');
  const reExpr = /(:\s*)([-+]?\d+(?:\.\d+)?(?:\s*[+\-]\s*[-+]?\d+(?:\.\d+)?)+)(\s*[,}\]])/g;
  return text.replace(reExpr, function(fullMatch, prefixo, expr, sufixo) {
    const valor = avaliarExpressaoSomaSub_(expr);
    if (valor == null) return fullMatch;
    return prefixo + valor + sufixo;
  });
}

function avaliarExpressaoSomaSub_(expr) {
  const s = String(expr || '').replace(/\s+/g, '');
  // Aceita apenas soma/subtracao de numeros decimais simples
  if (!/^[-+]?\d+(?:\.\d+)?(?:[+\-]\d+(?:\.\d+)?)+$/.test(s)) return null;

  const parts = s.match(/[+\-]?\d+(?:\.\d+)?/g) || [];
  let total = 0;
  for (let i = 0; i < parts.length; i++) {
    const n = Number(parts[i]);
    if (!isFinite(n)) return null;
    total += n;
  }
  if (!isFinite(total)) return null;

  // Evita notacao cientifica em casos extremos
  return String(Number(total.toFixed(10)));
}

function extrairTextoRespostaResponses_(json) {
  if (!json) return '';
  if (typeof json.output_text === 'string' && json.output_text.trim()) {
    return json.output_text;
  }
  const output = Array.isArray(json.output) ? json.output : [];
  const partes = [];
  output.forEach(function(item) {
    if (!item || item.type !== 'message') return;
    const contentArr = Array.isArray(item.content) ? item.content : [];
    contentArr.forEach(function(c) {
      if (!c) return;
      if (c.type === 'output_text' && typeof c.text === 'string') partes.push(c.text);
      if (c.type === 'text' && typeof c.text === 'string') partes.push(c.text);
    });
  });
  return partes.join('\n').trim();
}
