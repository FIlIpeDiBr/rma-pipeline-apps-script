'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { carregarProjeto, plano } = require('./harness');

const gs = carregarProjeto();
const calc = (expr) => gs.avaliarExpressaoAritmetica_(expr);

test('aritmética básica respeita precedência, parênteses e sinais', () => {
  assert.equal(calc('1 + 2 * 3'), 7);
  assert.equal(calc('(1 + 2) * 3'), 9);
  assert.equal(calc('10 - 4 - 3'), 3, 'subtração associa à esquerda');
  assert.equal(calc('8 / 4 / 2'), 1, 'divisão associa à esquerda');
  assert.equal(calc('10 - -5'), 15);
  assert.equal(calc('-(2 + 3) * 2'), -10);
  assert.equal(calc(' 1.5e3 + .5 '), 1500.5);
});

test('safeDivide devolve null na divisão por zero e aceita expressões nos argumentos', () => {
  assert.equal(calc('safeDivide(10, 4)'), 2.5);
  assert.equal(calc('safeDivide(1, 0)'), null);
  assert.equal(calc('safeDivide((2000 - 500), (1000 + 500))'), 1);
  assert.equal(calc('safeDivide(safeDivide(8, 2), 2) * 100'), 200);
});

test('rejeita tudo que não é aritmética: nada de código chega a ser executado', () => {
  const proibidas = [
    'ScriptApp.getProjectTriggers()',
    'PropertiesService.getScriptProperties().deleteAllProperties()',
    'constructor.constructor(1)',
    'safeDivide',
    'safeDivide(1)',
    'safeDivide(1, 2, 3)',
    'outraFuncao(1, 2)',
    '1; 2',
    '1, 2',
    '2 ** 3',
    '(1 + 2',
    '1 +',
    '',
  ];
  for (const expr of proibidas) {
    assert.throws(() => calc(expr), /Expressao invalida/, `deveria rejeitar: ${expr}`);
  }
});

test('teste diferencial: mesmo resultado que o JavaScript nativo em todas as fórmulas do catálogo', () => {
  // Gerador determinístico (LCG) para o teste ser reproduzível.
  let semente = 20250701;
  const aleatorio = () => {
    semente = (semente * 1664525 + 1013904223) % 4294967296;
    return semente / 4294967296;
  };
  const defs = gs.getIndicadoresDefinitions();
  let comparadas = 0;
  for (let rodada = 0; rodada < 300; rodada++) {
    for (const def of defs) {
      const expr = def.formula.replace(/\{\{[^}]+\}\}/g, () => {
        const sorteio = aleatorio();
        if (sorteio < 0.15) return '0'; // força divisões por zero
        if (sorteio < 0.2) return '1e-7'; // notação científica vinda de String(numero)
        return String(Math.round((aleatorio() - 0.3) * 1e8) / 100); // inclui negativos
      });
      const esperado = new Function('safeDivide', 'return (' + expr + ');')(gs.safeDivide);
      assert.ok(Object.is(calc(expr), esperado), `${def.key}: ${expr}`);
      comparadas += 1;
    }
  }
  assert.equal(comparadas, 300 * defs.length);
});

test('avaliarFormulaIndicador resolve {{chaves}} em indicadores já calculados e na base', () => {
  const contexto = { indicadores: { lucroliquido: 300 }, base: { drereceitaliquida: 900 } };
  const margem = gs.avaliarFormulaIndicador('safeDivide({{lucro_liquido}}, {{dre.receita_liquida}}) * 100', contexto);
  assert.ok(Math.abs(margem - 33.3333333) < 1e-6);
  assert.equal(gs.avaliarFormulaIndicador('=1 + 1', contexto), 2, 'aceita o "=" inicial de planilha');
  assert.equal(gs.avaliarFormulaIndicador(42, contexto), 42);
});

test('avaliarFormulaIndicador devolve null quando falta dado ou a fórmula é inválida', () => {
  const contexto = { indicadores: {}, base: { drereceitaliquida: 900 } };
  assert.equal(gs.avaliarFormulaIndicador('{{nao_existe}} + 1', contexto), null);
  assert.equal(gs.avaliarFormulaIndicador('safeDivide({{dre.receita_liquida}}, 0)', contexto), null);
  assert.equal(gs.avaliarFormulaIndicador('ScriptApp.getProjectTriggers()', contexto), null);
  assert.equal(gs.avaliarFormulaIndicador('', contexto), null);
});

test('calcularLinhaIndicadores: indicadores de uma empresa a partir de DRE e balancete sintéticos', () => {
  const dre = [
    ['Receita Bruta', 1000], ['Deduções (-)', 100], ['Receita Liquida', 900], ['Custos (-)', 300],
    ['Lucro Bruto', 600], ['Despesas Operacionais (-)', 200], ['Depreciacao', 10], ['Amortizacao', 5],
    ['Depreciacao e Amortizacao', 15], ['Resultado Operacional', 385],
    ['Distribuicao de Resultados (-)', 85], ['Lucro ou Prejuizo do Exercicio', 300],
  ].map(([conta, valorAtual]) => ({ conta, valorAtual }));
  const balancete = [
    ['ATIVO TOTAL', 5000], ['ATIVO CIRCULANTE', 2000], ['CONTAS/BANCOS', 500], ['ATIVO NAO CIRCULANTE', 3000],
    ['IMOBILIZADO', 2500], ['PASSIVO CIRCULANTE', 1000], ['PASSIVO NAO CIRCULANTE', 1500], ['PATRIMONIO LIQUIDO', 2500],
  ].map(([conta, saldoAtual]) => ({ conta, saldoAtual }));

  const defs = gs.getIndicadoresDefinitions();
  const base = gs.criarLookupBaseIndicadores(dre, balancete);
  const linha = plano(gs.calcularLinhaIndicadores(defs, gs.construirFormulasCalculo(defs), base, {}));

  const esperado = {
    receitabruta: 1000,
    receitaliquida: 900,
    lucroliquido: 300,
    ebitda: 385 + 15, // resultado operacional + depreciação e amortização
    ebitdapercentual: (400 / 900) * 100,
    margemoperacional: (385 / 900) * 100,
    margemliquida: (300 / 900) * 100,
    pesodeducoespercentual: (100 / 1000) * 100,
    distribuicaoresultadospercentual: (85 / 300) * 100,
    endividamento: 1000 / 2500, // passivo circulante / PL
    imobilizacao: (2500 + 3000) / 2500,
    solvenciageral: 5000 / (1000 + 1500),
    liquidezcorrente: 2000 / 1000,
    liquidezimediata: 500 / 1000,
  };
  for (const [chave, valor] of Object.entries(esperado)) {
    assert.ok(Math.abs(linha[chave] - valor) < 1e-9, `${chave}: esperado ${valor}, obtido ${linha[chave]}`);
  }
  assert.equal(Object.keys(linha).length, defs.length, 'todo indicador do catálogo recebe um valor');
});
