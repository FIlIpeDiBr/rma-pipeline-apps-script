'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { carregarProjeto, plano } = require('./harness');

const gs = carregarProjeto();

test('{{chave}} e {{periodo(±n)}} são substituídos no texto', () => {
  const scalars = { empresa: 'Acme', mes: 1, ano: 2025 };
  assert.equal(gs.substituirPlaceholdersSimples('Relatório de {{empresa}}', scalars), 'Relatório de Acme');
  assert.equal(gs.substituirPlaceholdersSimples('{{periodo}}', scalars), 'Janeiro/2025');
  assert.equal(gs.substituirPlaceholdersSimples('{{ periodo(-1) }}', scalars), 'Dezembro/2024', 'vira o ano para trás');
  assert.equal(gs.substituirPlaceholdersSimples('{{periodo(+12)}}', scalars), 'Janeiro/2026');
});

test('_ajustarPeriodoComOffset aceita mês por nome e atravessa anos', () => {
  assert.deepEqual(plano(gs._ajustarPeriodoComOffset('dezembro', 2024, 2)), { mes: 2, ano: 2025 });
  assert.deepEqual(plano(gs._ajustarPeriodoComOffset('03', '2025', -15)), { mes: 12, ano: 2023 });
  assert.equal(gs._mesParaNumero('Março'), 3);
});

test('marcador de tabela: flags p: e modo', () => {
  assert.deepEqual(plano(gs.parseTabelaFlags('p:BalancoBase; completa')), { ok: true, origem: 'balancobase', modo: 'completa' });
  assert.deepEqual(plano(gs.parseTabelaFlags('p:drebase')), { ok: true, origem: 'drebase', modo: 'resumida' });
  assert.equal(gs.parseTabelaFlags('completa').ok, false, 'p: é obrigatório');
  assert.equal(gs.parseTabelaFlags('p:outra').ok, false);
});

test('cabeçalho da tabela-modelo: [campo: Título] liga a coluna ao dado', () => {
  const scalars = { empresa: 'Acme', mes: 7, ano: 2025 };
  assert.deepEqual(plano(gs.analisarCelulaCabecalho('[saldo atual: Saldo em {{periodo}}]', 'balancobase', scalars)),
    { headerText: 'Saldo em Julho/2025', fieldKey: 'saldoAtual', valido: true });
  assert.deepEqual(plano(gs.analisarCelulaCabecalho('[débito]', 'balancobase', scalars)),
    { headerText: 'débito', fieldKey: 'debito', valido: true });
  const invalido = gs.analisarCelulaCabecalho('[valor atual]', 'balancobase', scalars);
  assert.equal(invalido.valido, false, 'campo de DRE não existe no balancete');
  assert.match(invalido.headerText, /^ERRO/);
  assert.deepEqual(plano(gs.analisarCelulaCabecalho('Observações', 'drebase', scalars)),
    { headerText: 'Observações', fieldKey: null, valido: true });
});

test('obterLinhasParaOrigem escolhe sintéticos ou a lista completa', () => {
  const ctx = { balancobase: { detalhados: [{ conta: 'Caixa' }], sinteticos: [{ conta: 'ATIVO' }] }, drebase: { linhas: [{ conta: 'Receita Bruta' }] } };
  assert.equal(gs.obterLinhasParaOrigem('balancobase', 'resumida', ctx).length, 1);
  assert.equal(gs.obterLinhasParaOrigem('balancobase', 'completa', ctx).length, 2);
  assert.equal(gs.obterLinhasParaOrigem('drebase', 'resumida', ctx).length, 1);
});

test('marcador de gráfico: título, eixo horizontal com deslocamento e séries com cor', () => {
  const r = plano(gs._parseGraficoTag('t: Receita x Lucro; h: empresa(-2)|empresa(-1)|empresa; v: Receita Bruta[#4285f4]|Lucro Liquido; supressAI'));
  assert.equal(r.ok, true);
  assert.deepEqual(r.config, {
    titulo: 'Receita x Lucro',
    horizontais: [{ tipo: 'empresa', offset: -2 }, { tipo: 'empresa', offset: -1 }, { tipo: 'empresa', offset: 0 }],
    verticais: [{ nome: 'Receita Bruta', cor: '#4285f4' }, { nome: 'Lucro Liquido', cor: '' }],
    supressAI: true,
    supressCaption: false,
  });
});

test('marcador de gráfico sem eixo horizontal ou sem séries devolve erro legível', () => {
  assert.match(gs._parseGraficoTag('v: Receita Bruta').erro, /horizontal \(h:\) não informado/);
  assert.match(gs._parseGraficoTag('h: empresa').erro, /vertical \(v:\) não informado/);
});

test('eixo horizontal distingue empresa, grupo e consolidado', () => {
  assert.deepEqual(plano(gs._parseHorizontais('grupo | consolidado(-1) | empresa')),
    [{ tipo: 'grupo', offset: 0 }, { tipo: 'consolidado', offset: -1 }, { tipo: 'empresa', offset: 0 }]);
});

test('_escolherIndicador casa o nome do modelo com a coluna da planilha', () => {
  const colunas = ['Receita Bruta (R$)', 'EBITDA (R$)', 'EBITDA (%)', 'Endividamento (Passivo/PL)', 'Liquidez Corrente'];
  assert.equal(gs._escolherIndicador('liquidez corrente', colunas), 'Liquidez Corrente', 'ignora caixa e espaços');
  assert.equal(gs._escolherIndicador('Endividamento', colunas), 'Endividamento (Passivo/PL)', 'prefixo vence a distância de edição');
  assert.equal(gs._escolherIndicador('Liquidez Corente', colunas), 'Liquidez Corrente', 'tolera erro de digitação');
  assert.equal(gs._escolherIndicador('Qualquer', []), 'Qualquer');
});

test('_levenshtein compara nomes já normalizados', () => {
  assert.equal(gs._levenshtein('Margem Líquida', 'margem liquida'), 0);
  assert.equal(gs._levenshtein('ebitda', 'ebit'), 2);
});

test('_validarCorHex aceita com ou sem # e rejeita o resto', () => {
  assert.equal(gs._validarCorHex('4285F4'), '#4285F4');
  assert.equal(gs._validarCorHex('#ea4335'), '#ea4335');
  assert.equal(gs._validarCorHex('vermelho'), null);
  assert.equal(gs._validarCorHex('#fff'), null);
});

test('bloco de IA: prompt, mensagem de sistema e posição do texto gerado', () => {
  assert.deepEqual(plano(gs._parseIaBlockParams_('system: Você é um analista; prompt: Compare os períodos: atual e anterior; inicio')),
    { system: 'Você é um analista', prompt: 'Compare os períodos: atual e anterior', pos: 'inicio' });
  assert.deepEqual(plano(gs._parseIaBlockParams_('')), { system: '', prompt: '', pos: 'final' });
});

test('_ordenarLinhasDrePorSintetico segue a ordem da DRE e mantém desconhecidas no fim', () => {
  const linhas = [{ conta: 'Outra' }, { conta: 'Lucro Bruto' }, { conta: 'Receita Bruta' }];
  assert.deepEqual(plano(gs._ordenarLinhasDrePorSintetico(linhas)).map((l) => l.conta), ['Receita Bruta', 'Lucro Bruto', 'Outra']);
});
