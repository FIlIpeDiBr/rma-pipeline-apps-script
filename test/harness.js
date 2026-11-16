'use strict';
/**
 * Carrega os arquivos .gs de src/ em um contexto isolado do Node, do mesmo
 * jeito que o Apps Script faz: todos os arquivos compartilham o escopo global.
 * Os serviços do Google (PropertiesService, UrlFetchApp...) são substituídos
 * por dublês passados pelo teste.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');

function carregarProjeto(servicos = {}) {
  const contexto = vm.createContext({
    console,
    Logger: { log() {} },
    ...servicos,
  });
  const arquivos = fs.readdirSync(SRC).filter((f) => f.endsWith('.gs')).sort();
  for (const arquivo of arquivos) {
    vm.runInContext(fs.readFileSync(path.join(SRC, arquivo), 'utf8'), contexto, { filename: arquivo });
  }
  return contexto;
}

/** Avalia uma expressão no escopo global do projeto (para ler constantes `const`). */
function avaliar(contexto, expressao) {
  return vm.runInContext(expressao, contexto);
}

/** Objetos criados dentro do contexto têm outro Object.prototype; isto os traz para o do teste. */
function plano(valor) {
  return valor === undefined ? undefined : JSON.parse(JSON.stringify(valor));
}

/** PropertiesService em memória. */
function criarPropertiesService(inicial = {}) {
  const dados = { ...inicial };
  const props = {
    getProperty: (k) => (k in dados ? dados[k] : null),
    setProperty: (k, v) => { dados[k] = String(v); },
    deleteProperty: (k) => { delete dados[k]; },
    getProperties: () => ({ ...dados }),
  };
  return { getScriptProperties: () => props, _dados: dados };
}

/** UrlFetchApp que devolve respostas enfileiradas e registra as requisições. */
function criarUrlFetchApp(respostas) {
  const fila = respostas.slice();
  const chamadas = [];
  const resposta = (r) => ({
    getResponseCode: () => r.code || 200,
    getContentText: () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)),
  });
  return {
    chamadas,
    fetch(url, opcoes) {
      chamadas.push({ url, ...opcoes });
      return resposta(fila.shift());
    },
    fetchAll(reqs) {
      return reqs.map((req) => {
        chamadas.push(req);
        return resposta(fila.shift());
      });
    },
  };
}

/** Resposta no formato do Chat Completions. */
function respostaChat(conteudo) {
  return { body: { choices: [{ message: { content: conteudo } }] } };
}

module.exports = { carregarProjeto, avaliar, plano, criarPropertiesService, criarUrlFetchApp, respostaChat };
