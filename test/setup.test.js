'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { carregarProjeto, avaliar, plano } = require('./harness');

const gs = carregarProjeto();
const CHAVES = ['ENTRADA_FOLDER_ID', 'PROCESSADO_FOLDER_ID', 'RELATORIOS_FOLDER_ID'];

test('planilha vazia: todas as pastas faltam e não há tabela de modelos', () => {
  assert.deepEqual(plano(gs.planejarConfig_([], CHAVES)), { chavesSemValor: CHAVES, temTabelaDeModelos: false });
});

test('chave com valor é preservada; chave sem valor é tratada como faltante', () => {
  const valores = [
    ['ENTRADA_FOLDER_ID', 'abc123'],
    ['PROCESSADO_FOLDER_ID', ''],
    ['', ''],
    ['nome', 'id', 'grupo'],
    ['Relatório mensal', 'doc1', 'sim'],
  ];
  assert.deepEqual(plano(gs.planejarConfig_(valores, CHAVES)),
    { chavesSemValor: ['PROCESSADO_FOLDER_ID', 'RELATORIOS_FOLDER_ID'], temTabelaDeModelos: true });
});

test('o cabeçalho de Processamento cobre as colunas que o pipeline lê por posição', () => {
  const header = plano(avaliar(gs, 'PROCESSAMENTO_HEADER'));
  assert.deepEqual(header.slice(0, 10),
    ['file_id', 'Nome_arquivo', 'Empresa', 'Mes', 'Ano', 'Tipo', 'Status', 'Mensagem', 'Criado_em', 'Grupo']);
  assert.equal(header[6], 'Status', 'atualizarStatus grava nas colunas 7 e 8');
});
