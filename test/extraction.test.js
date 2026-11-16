'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { carregarProjeto, avaliar } = require('./harness');

const gs = carregarProjeto();

test('normalizarStatus_ tolera variações escritas à mão na planilha', () => {
  assert.equal(gs.normalizarStatus_('PENDENTE_EXTRACAO'), 'pendenteextracao');
  assert.equal(gs.normalizarStatus_(' Pendente Extração '), 'pendenteextracao');
  assert.equal(gs.normalizarStatus_('PROCESSANDO_DESDE:2025-07-01'), 'processando');
  assert.equal(gs.normalizarStatus_('Processado'), 'processado');
  assert.equal(gs.normalizarStatus_('ERRO: timeout'), 'erro');
});

test('deveProcessarLinhaExtracao_: modo normal pega pendentes e travadas; modo "todos" pega tudo menos processado', () => {
  assert.equal(gs.deveProcessarLinhaExtracao_('PENDENTE_EXTRACAO', false), true);
  assert.equal(gs.deveProcessarLinhaExtracao_('PROCESSANDO', false), true);
  assert.equal(gs.deveProcessarLinhaExtracao_('ERRO', false), false);
  assert.equal(gs.deveProcessarLinhaExtracao_('PROCESSADO', false), false);
  assert.equal(gs.deveProcessarLinhaExtracao_('ERRO', true), true);
  assert.equal(gs.deveProcessarLinhaExtracao_('PROCESSADO', true), false);
});

test('isConteudoBinario detecta PDF cru e bytes não imprimíveis', () => {
  assert.equal(gs.isConteudoBinario('%PDF-1.7 ...'), true);
  assert.equal(gs.isConteudoBinario('\u0000\u0001\u0002'.repeat(50)), true);
  assert.equal(gs.isConteudoBinario('ATIVO CIRCULANTE\t1.000,00\nPASSIVO\t500,00'), false);
  assert.equal(gs.isConteudoBinario(''), false);
});

test('escolherModeloExtracaoPorTokens_ troca de modelo acima do limite', () => {
  const limite = avaliar(gs, 'TOKENS_SWITCH_THRESHOLD');
  assert.equal(gs.escolherModeloExtracaoPorTokens_(limite), avaliar(gs, 'MODELO_EXTRACAO_LEVE'));
  assert.equal(gs.escolherModeloExtracaoPorTokens_(limite + 1), avaliar(gs, 'MODELO_EXTRACAO_ROBUSTO'));
  assert.equal(gs.estimarTokens_('a'.repeat(400)), 100);
});

test('inferTipoFromNomeArquivo_ e normalizarChaveDocumento_ existem para a deduplicação da entrada', () => {
  assert.equal(typeof gs.inferTipoFromNomeArquivo_, 'function');
  assert.equal(
    gs.normalizarChaveDocumento_('ACME Ltda.', '7', 2025, 'dre'),
    gs.normalizarChaveDocumento_('acme ltda', '07', '2025', 'DRE'),
    'mesmo documento com grafias diferentes gera a mesma chave',
  );
});
