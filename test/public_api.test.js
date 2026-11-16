'use strict';
/**
 * No Apps Script, toda função global sem sublinhado final pode ser chamada pelo
 * navegador de quem abre o web app (google.script.run.nome()). Estes testes
 * tratam essa lista como uma API pública e vigiam o que não pode entrar nela.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { carregarProjeto } = require('./harness');

const gs = carregarProjeto();
const SRC = path.join(__dirname, '..', 'src');

const publicas = Object.keys(gs).filter((nome) => typeof gs[nome] === 'function' && !nome.endsWith('_'));

test('nenhuma função exposta ao cliente devolve a chave, chama o modelo direto ou grava direto nas bases', () => {
  const proibido = /apikey|^chamaropenai|^extrairtextodoarquivo|^salvarlinhas|^remover(balanco|dre)periodo|^registrardebugia|^gerarindicadorescomdados/i;
  assert.deepEqual(publicas.filter((nome) => proibido.test(nome)), []);
});

test('as versões privadas existem (o código interno continua funcionando)', () => {
  for (const nome of ['getOpenAiApiKey_', 'chamarOpenAi_', 'chamarOpenAiEmLote_', 'salvarLinhasBalanco_', 'registrarDebugIa_']) {
    assert.equal(typeof gs[nome], 'function', nome);
  }
});

test('toda função que o portal chama existe no servidor e é pública', () => {
  const chamadas = new Set();
  for (const arquivo of fs.readdirSync(SRC).filter((f) => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(SRC, arquivo), 'utf8');
    // google.script.run[.withXxxHandler(function(){...})]*.nomeDaFuncao(
    for (const trecho of html.split('google.script.run').slice(1)) {
      const diretas = trecho.match(/^\s*\.\s*([A-Za-z0-9_$]+)\s*\(/);
      if (diretas && !/^with/.test(diretas[1])) { chamadas.add(diretas[1]); continue; }
      const aposHandler = trecho.match(/\}\s*\)\s*\.\s*([A-Za-z0-9_$]+)\s*\(/);
      if (aposHandler && !/^with/.test(aposHandler[1])) chamadas.add(aposHandler[1]);
    }
  }
  assert.ok(chamadas.size >= 15, `esperava achar as chamadas do portal, achei ${chamadas.size}`);
  for (const nome of chamadas) {
    assert.equal(typeof gs[nome], 'function', `o portal chama ${nome}, que não existe no servidor`);
    assert.ok(!nome.endsWith('_'), `o portal chama ${nome}, que é privada`);
  }
});

test('todo item do menu aponta para uma função pública existente', () => {
  const menu = fs.readFileSync(path.join(SRC, 'menu.gs'), 'utf8');
  const alvos = [...menu.matchAll(/\.addItem\([^,]+,\s*'([A-Za-z0-9_$]+)'\)/g)].map((m) => m[1]);
  assert.ok(alvos.length >= 15);
  for (const nome of alvos) {
    assert.ok(publicas.includes(nome), `item de menu aponta para ${nome}`);
  }
});
