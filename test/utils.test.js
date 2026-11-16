'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { carregarProjeto, plano } = require('./harness');

const gs = carregarProjeto();

test('sanitizeName remove acentos, espaços e pontuação', () => {
  assert.equal(gs.sanitizeName('  Patrimônio Líquido (R$) '), 'patrimonioliquidor');
  assert.equal(gs.sanitizeName(null), '');
});

test('canonicalName unifica variações de nomenclatura de contas', () => {
  assert.equal(gs.canonicalName('ATIVO N CIRCULANTE'), 'ativonaocirculante');
  assert.equal(gs.canonicalName('Ativo Não Circulante'), 'ativonaocirculante');
  assert.equal(gs.canonicalName('Caixa e Bancos'), 'contasbancos');
  assert.equal(gs.canonicalName('Estoques'), 'estoques');
});

test('converterValor lê números no formato brasileiro', () => {
  assert.equal(gs.converterValor('1.234.567,89'), 1234567.89);
  assert.equal(gs.converterValor('-12,5'), -12.5);
  assert.equal(gs.converterValor(42), 42);
  assert.equal(gs.converterValor(''), 0);
  assert.equal(gs.converterValor('abc'), 0);
});

test('tentarConverterStringParaNumero distingue formatos e rejeita texto', () => {
  assert.equal(gs.tentarConverterStringParaNumero('1.234,56'), 1234.56);
  assert.equal(gs.tentarConverterStringParaNumero('1234,56'), 1234.56);
  assert.equal(gs.tentarConverterStringParaNumero('1234.56'), 1234.56);
  assert.equal(gs.tentarConverterStringParaNumero('1.5e3'), 1500);
  assert.equal(gs.tentarConverterStringParaNumero('12/2025'), null);
  assert.equal(gs.tentarConverterStringParaNumero(''), null);
});

test('formatarValorParaDoc formata números e preserva textos e percentuais', () => {
  assert.equal(gs.formatarValorParaDoc(1234.5), '1.234,50');
  assert.equal(gs.formatarValorParaDoc('1234.5'), '1.234,50');
  assert.equal(gs.formatarValorParaDoc(1e21), gs.formatarNumeroPtBr(1e21), 'sem notação científica');
  assert.equal(gs.formatarValorParaDoc('ATIVO CIRCULANTE'), 'ATIVO CIRCULANTE');
  assert.equal(gs.formatarValorParaDoc('12,5%'), '12,5%');
  assert.equal(gs.formatarValorParaDoc(null), '');
  assert.equal(gs.formatarValorParaDoc(-0), '0,00');
});

test('getMonthName traduz o mês e devolve o original fora do intervalo', () => {
  assert.equal(gs.getMonthName('03'), 'Março');
  assert.equal(gs.getMonthName(12), 'Dezembro');
  assert.equal(gs.getMonthName(13), '13');
});

test('extrairEmpresaGrupo_ aceita texto, objeto, JSON e mapa serializado', () => {
  assert.deepEqual(plano(gs.extrairEmpresaGrupo_('Acme Ltda')), { empresa: 'Acme Ltda', grupo: '' });
  assert.deepEqual(plano(gs.extrairEmpresaGrupo_({ nome: ' Acme ', grupo: 'Grupo A' })), { empresa: 'Acme', grupo: 'Grupo A' });
  assert.deepEqual(plano(gs.extrairEmpresaGrupo_('{"empresa":"Acme","grupo":"Grupo A"}')), { empresa: 'Acme', grupo: 'Grupo A' });
  assert.deepEqual(plano(gs.extrairEmpresaGrupo_('{empresa=Acme, grupo=Grupo A}')), { empresa: 'Acme', grupo: 'Grupo A' });
  assert.deepEqual(plano(gs.extrairEmpresaGrupo_(null)), { empresa: '', grupo: '' });
});

test('coagirNomeGrupo_ não confunde um mapa sem grupo com o nome do grupo', () => {
  assert.equal(gs.coagirNomeGrupo_('Grupo A'), 'Grupo A');
  assert.equal(gs.coagirNomeGrupo_('{empresa=Acme}'), '');
  assert.equal(gs.coagirNomeGrupo_({ empresa: 'Acme' }), '');
});

test('chaveEmpresa_ gera a mesma chave para grafias diferentes', () => {
  assert.equal(gs.chaveEmpresa_('ACME Comércio Ltda.'), gs.chaveEmpresa_('acme comercio ltda'));
});
