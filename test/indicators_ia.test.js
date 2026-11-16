'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { carregarProjeto, plano, criarPropertiesService, criarUrlFetchApp, respostaChat } = require('./harness');

const DRE = [
  ['Receita Bruta', 1000], ['Deduções (-)', 100], ['Receita Liquida', 900], ['Custos (-)', 300],
  ['Lucro Bruto', 600], ['Despesas Operacionais (-)', 200], ['Depreciacao e Amortizacao', 15],
  ['Resultado Operacional', 385], ['Distribuicao de Resultados (-)', 85], ['Lucro ou Prejuizo do Exercicio', 300],
].map(([conta, valorAtual]) => ({ conta, valorAtual }));

const BALANCETE = [
  ['ATIVO TOTAL', 5000], ['ATIVO CIRCULANTE', 2000], ['CONTAS/BANCOS', 500], ['ATIVO NAO CIRCULANTE', 3000],
  ['IMOBILIZADO', 2500], ['PASSIVO CIRCULANTE', 1000], ['PASSIVO NAO CIRCULANTE', 1500], ['PATRIMONIO LIQUIDO', 2500],
].map(([conta, saldoAtual]) => ({ conta, saldoAtual }));

function calcular(dre, balancete, respostas) {
  const UrlFetchApp = criarUrlFetchApp(respostas);
  const gs = carregarProjeto({ UrlFetchApp, PropertiesService: criarPropertiesService({ OPENAI_API_KEY: 'chave-de-teste' }) });
  const defs = gs.getIndicadoresDefinitions();
  const base = gs.criarLookupBaseIndicadores(dre, balancete);
  const resultado = gs.calcularIndicadoresComIaSobDemanda_(defs, gs.construirFormulasCalculo(defs), base, {
    identificador: 'Acme', mes: 7, ano: 2025, dreData: dre, balSintetico: balancete,
  });
  return { resultado: plano(resultado), chamadas: UrlFetchApp.chamadas };
}

test('com DRE e balancete completos, nenhuma chamada ao modelo é feita', () => {
  const { resultado, chamadas } = calcular(DRE, BALANCETE, []);
  assert.equal(chamadas.length, 0);
  assert.equal(resultado.consultouIa, false);
  assert.deepEqual(resultado.faltantes, []);
  assert.equal(resultado.valores.liquidezcorrente, 2);
});

test('quando falta dado, o modelo é consultado uma vez e só pelos indicadores sem valor', () => {
  const semPassivo = BALANCETE.filter((l) => !/PASSIVO|PATRIMONIO/.test(l.conta));
  const { resultado, chamadas } = calcular(DRE, semPassivo, [respostaChat('{"Liquidez Corrente": 1.75}')]);

  assert.equal(chamadas.length, 1);
  assert.equal(resultado.consultouIa, true);
  assert.ok(resultado.faltantes.includes('liquidez_corrente'));
  assert.ok(!resultado.faltantes.includes('margem_liquida'), 'o que a fórmula calcula não é pedido ao modelo');

  const prompt = JSON.parse(chamadas[0].payload).messages[1].content;
  assert.match(prompt, /- Liquidez Corrente/);
  assert.doesNotMatch(prompt, /- Margem Liquida/);
  assert.match(prompt, /Entidade: Acme\nMes \(1-12\): 7\nAno: 2025/, 'prompt com uma informação por linha');

  assert.equal(resultado.valores.liquidezcorrente, 1.75, 'a lacuna é preenchida pela resposta');
  assert.ok(Math.abs(resultado.valores.margemliquida - (300 / 900) * 100) < 1e-9, 'a fórmula prevalece sobre o modelo');
});

test('a resposta do modelo nunca substitui um valor calculado por fórmula', () => {
  const semPassivo = BALANCETE.filter((l) => !/PASSIVO|PATRIMONIO/.test(l.conta));
  const { resultado } = calcular(DRE, semPassivo, [respostaChat('{"Liquidez Corrente": 1.75, "Receita Bruta (R$)": 999999}')]);
  assert.equal(resultado.valores.receitabruta, 1000);
});

test('falha do modelo não interrompe o cálculo: a lacuna fica em branco e o erro é devolvido', () => {
  const semPassivo = BALANCETE.filter((l) => !/PASSIVO|PATRIMONIO/.test(l.conta));
  const { resultado, chamadas } = calcular(DRE, semPassivo, [{ code: 500, body: 'indisponivel' }]);
  assert.equal(chamadas.length, 1);
  assert.match(resultado.erroIa, /Erro OpenAI 500/);
  assert.equal(resultado.valores.liquidezcorrente, '');
  assert.equal(resultado.valores.receitabruta, 1000);
});
