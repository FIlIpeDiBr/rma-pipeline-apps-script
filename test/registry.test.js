'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { carregarProjeto, plano } = require('./harness');

const gs = carregarProjeto();

/** Aba em memória com o mínimo que o código usa: dimensões e leitura por intervalo. */
function abaFalsa(linhas) {
  return {
    getLastRow: () => linhas.length,
    getLastColumn: () => (linhas[0] || []).length,
    getRange: (linha, coluna, numLinhas, numColunas) => ({
      getValues: () => linhas.slice(linha - 1, linha - 1 + numLinhas).map((l) => l.slice(coluna - 1, coluna - 1 + numColunas)),
    }),
  };
}

const PROCESSAMENTO = abaFalsa([
  ['file_id', 'Nome_arquivo', 'Empresa'],
  ['doc-1', 'ACME_BALANCO_2025-07.pdf', 'ACME'],
  ['doc-2', 'ACME_DRE_2025-07.pdf', 'ACME'],
]);

test('a exclusão só aceita IDs que estão no cadastro, não qualquer ID vindo do navegador', () => {
  const pedido = ['doc-2', 'id-de-um-arquivo-qualquer-do-drive', 'doc-1'];
  assert.deepEqual(plano(gs.filtrarIdsCadastrados_(PROCESSAMENTO, pedido)), ['doc-2', 'doc-1']);
});

test('sem cadastro, nada é aceito para exclusão', () => {
  assert.deepEqual(plano(gs.filtrarIdsCadastrados_(abaFalsa([['file_id']]), ['doc-1'])), []);
  assert.deepEqual(plano(gs.filtrarIdsCadastrados_(null, ['doc-1'])), []);
});

test('a coluna de ID é localizada pelo cabeçalho, mesmo fora da primeira posição', () => {
  const aba = abaFalsa([['Empresa', 'file_id'], ['ACME', 'doc-9']]);
  assert.deepEqual(plano(gs.filtrarIdsCadastrados_(aba, ['ACME', 'doc-9'])), ['doc-9']);
});
