'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { carregarProjeto, plano } = require('./harness');

const gs = carregarProjeto();

test('parseFileName reconhece período nos formatos aaaa-mm, aaaamm, mm.aa e mm-aaaa', () => {
  assert.deepEqual(plano(gs.parseFileName('ACME_BALANCO_2025-07.pdf')),
    { empresa: 'ACME', mes: '07', ano: '2025', tipo: 'BALANCO' });
  assert.deepEqual(plano(gs.parseFileName('ACME_DRE_202507.xlsx')),
    { empresa: 'ACME', mes: '07', ano: '2025', tipo: 'DRE' });
  const curto = gs.parseFileName('Balancete Acme 07.25.pdf');
  assert.equal(curto.mes, '07');
  assert.equal(curto.ano, '2025');
  assert.equal(curto.tipo, 'BALANCO');
  const longo = gs.parseFileName('Acme DRE 7-2025.pdf');
  assert.equal(longo.mes, '07');
  assert.equal(longo.ano, '2025');
});

test('parseFileName sem data ou tipo devolve nulos e OUTRO', () => {
  assert.deepEqual(plano(gs.parseFileName('relatorio.pdf')),
    { empresa: 'relatorio', mes: null, ano: null, tipo: 'OUTRO' });
});

test('parseFileName trata nomes acentuados (regressão: literais corrompidos por codificação)', () => {
  const r = gs.parseFileName('ACME_balanço_2025-07.pdf');
  assert.equal(r.tipo, 'BALANCO');
  assert.equal(r.empresa, 'ACME', 'a palavra "balanço" não pode sobrar no nome da empresa');
  assert.equal(gs.parseFileName('ACME demonstração 2025-07.pdf').tipo, 'DRE');
});

test('inferTipoFromConteudo decide pelo vocabulário predominante', () => {
  assert.equal(gs.inferTipoFromConteudo('ATIVO CIRCULANTE 10 PASSIVO 5 PATRIMONIO LIQUIDO 5'), 'BALANCO');
  assert.equal(gs.inferTipoFromConteudo('Receita bruta 100 Despesas 40 Lucro 60 Resultado 60'), 'DRE');
});

test('extrairEmpresaMesAnoDoTexto lê o cabeçalho de um balancete', () => {
  const texto = [
    'Empresa: Folha: 0001',
    'ACME COMERCIO DE PECAS LTDA',
    'C.N.P.J.: 00.000.000/0001-00',
    'Período: 01/07/2025 - 31/07/2025',
    'BALANCETE DE VERIFICACAO',
    'ATIVO 1.000,00D',
  ].join('\n');
  assert.deepEqual(plano(gs.extrairEmpresaMesAnoDoTexto(texto)),
    { empresa: 'ACME COMERCIO DE PECAS LTDA', mes: '07', ano: '2025' });
});

test('extrairEmpresaMesAnoDoTexto usa a data mais recente quando não há "Período"', () => {
  const r = gs.extrairEmpresaMesAnoDoTexto('Saldos em 30/06/2025\nEmitido com base em 31/05/2025');
  assert.equal(r.mes, '06');
  assert.equal(r.ano, '2025');
});

test('extrairEmpresaMesAnoDoTexto descarta títulos confundidos com o nome da empresa', () => {
  const r = gs.extrairEmpresaMesAnoDoTexto('Empresa: Demonstração do Resultado do Exercício\n07/2025');
  assert.equal(r.empresa, null);
  assert.equal(r.mes, '07');
});

test('extrairEmpresaMesAnoDoTexto com texto vazio devolve tudo nulo', () => {
  assert.deepEqual(plano(gs.extrairEmpresaMesAnoDoTexto('')), { empresa: null, mes: null, ano: null });
});
