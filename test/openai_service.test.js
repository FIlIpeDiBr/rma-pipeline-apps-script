'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  carregarProjeto, avaliar, plano, criarPropertiesService, criarUrlFetchApp, respostaChat,
} = require('./harness');

function projeto(respostas, propriedades = { OPENAI_API_KEY: 'chave-de-teste' }) {
  const UrlFetchApp = criarUrlFetchApp(respostas);
  const gs = carregarProjeto({ UrlFetchApp, PropertiesService: criarPropertiesService(propriedades) });
  return { gs, UrlFetchApp };
}

test('sem OPENAI_API_KEY a chamada falha antes de ir à rede', () => {
  const { gs, UrlFetchApp } = projeto([], {});
  assert.throws(() => gs.chamarOpenAi_('oi'), /OPENAI_API_KEY nao definida/);
  assert.equal(UrlFetchApp.chamadas.length, 0);
});

test('chamarOpenAiComMensagens_ envia chave, modelo padrão e temperatura 0', () => {
  const { gs, UrlFetchApp } = projeto([respostaChat('{"ok": true}')]);
  const r = gs.chamarOpenAiComMensagens_([{ role: 'user', content: 'oi' }]);
  assert.deepEqual(plano(r), { ok: true });
  const req = UrlFetchApp.chamadas[0];
  assert.equal(req.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(req.headers.Authorization, 'Bearer chave-de-teste');
  assert.equal(req.muteHttpExceptions, true);
  const payload = JSON.parse(req.payload);
  assert.equal(payload.model, avaliar(gs, 'MODELO_JSON_PADRAO'));
  assert.equal(payload.temperature, 0);
});

test('remove a cerca ```json antes de interpretar a resposta', () => {
  const { gs } = projeto([respostaChat('```json\n{"linhas": [1, 2]}\n```')]);
  assert.deepEqual(plano(gs.chamarOpenAi_('x')), { linhas: [1, 2] });
});

test('repara expressões aritméticas e vírgulas sobrando no JSON do modelo', () => {
  const { gs } = projeto([respostaChat('{"saldo_atual": 100.5 + 200 - 0.5, "linhas": [1, 2,],}')]);
  assert.deepEqual(plano(gs.chamarOpenAi_('x')), { saldo_atual: 300, linhas: [1, 2] });
});

test('JSON irrecuperável vira erro com o conteúdo original para diagnóstico', () => {
  const { gs } = projeto([respostaChat('desculpe, não consegui')]);
  assert.throws(() => gs.chamarOpenAi_('x'), /Falha ao parsear JSON[\s\S]*desculpe/);
});

test('erro HTTP e resposta vazia viram exceções descritivas', () => {
  const a = projeto([{ code: 429, body: 'rate limit' }]);
  assert.throws(() => a.gs.chamarOpenAi_('x'), /Erro OpenAI 429: rate limit/);
  const b = projeto([{ body: { choices: [] } }]);
  assert.throws(() => b.gs.chamarOpenAi_('x'), /Resposta vazia/);
});

test('chamarOpenAiTextoComMensagens_ devolve texto, sem exigir JSON', () => {
  const { gs, UrlFetchApp } = projeto([respostaChat('  A receita cresceu **12%**.  ')]);
  assert.equal(gs.chamarOpenAiTextoComMensagens_([{ role: 'user', content: 'analise' }]), 'A receita cresceu **12%**.');
  assert.equal(JSON.parse(UrlFetchApp.chamadas[0].payload).model, avaliar(gs, 'MODELO_TEXTO_PADRAO'));
});

test('chamarOpenAiEmLote_ mistura Chat e Responses e isola a falha de cada item', () => {
  const { gs, UrlFetchApp } = projeto([
    respostaChat('{"a": 1}'),
    { body: { output: [{ type: 'message', content: [{ type: 'output_text', text: '{"b": 2}' }] }] } },
    { code: 500, body: 'falhou' },
    respostaChat('{"d": 4}'),
  ]);
  const r = plano(gs.chamarOpenAiEmLote_([
    'prompt simples',
    { responsesInput: [{ role: 'user', content: [] }], model: 'modelo-pdf' },
    { prompt: 'vai falhar' },
    { messages: [{ role: 'user', content: 'pronto' }], model: 'modelo-x', temperature: 0.3 },
  ]));
  assert.deepEqual(r, [
    { ok: true, value: { a: 1 } },
    { ok: true, value: { b: 2 } },
    { ok: false, error: 'Erro OpenAI 500: falhou' },
    { ok: true, value: { d: 4 } },
  ]);

  const [simples, pdf, , completo] = UrlFetchApp.chamadas.map((c) => ({ url: c.url, payload: JSON.parse(c.payload) }));
  assert.equal(simples.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(simples.payload.messages[0].role, 'system');
  assert.equal(simples.payload.messages[1].content, 'prompt simples');
  assert.equal(pdf.url, 'https://api.openai.com/v1/responses');
  assert.equal(pdf.payload.model, 'modelo-pdf');
  assert.ok(!('temperature' in pdf.payload), 'Responses API só recebe temperatura quando informada');
  assert.equal(completo.payload.model, 'modelo-x');
  assert.equal(completo.payload.temperature, 0.3);
});

test('chamarOpenAiEmLote_ com lista vazia não faz requisição', () => {
  const { gs, UrlFetchApp } = projeto([]);
  assert.deepEqual(plano(gs.chamarOpenAiEmLote_([])), []);
  assert.equal(UrlFetchApp.chamadas.length, 0);
});

test('avaliarExpressaoSomaSub_ só aceita soma e subtração de decimais', () => {
  const { gs } = projeto([]);
  assert.equal(gs.avaliarExpressaoSomaSub_('100 + 200 - 50.5'), '249.5');
  assert.equal(gs.avaliarExpressaoSomaSub_('0.1 + 0.2'), '0.3');
  assert.equal(gs.avaliarExpressaoSomaSub_('2 * 3'), null);
  assert.equal(gs.avaliarExpressaoSomaSub_('alert(1)'), null);
});
