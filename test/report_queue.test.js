'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { carregarProjeto, plano, criarPropertiesService } = require('./harness');

function projeto() {
  const PropertiesService = criarPropertiesService();
  return { gs: carregarProjeto({ PropertiesService }), dados: PropertiesService._dados };
}

test('registra, atualiza e conclui um relatório na fila', () => {
  const { gs } = projeto();
  gs.registrarRelatorioFila_({ docId: 'doc1', tipo: 'Individual', entidade: 'Acme', mes: 7, ano: 2025, status: 'Criando documento', progresso: 10 });
  gs.atualizarRelatorioFila_('doc1', { status: 'Gerando gráficos', progresso: 50 });

  let [item] = plano(gs.listarFilaRelatorios());
  assert.equal(item.periodo, '07/2025');
  assert.equal(item.status, 'Gerando gráficos');
  assert.equal(item.progresso, 50);
  assert.equal(item.doneAt, null);

  gs.marcarRelatorioConcluido_('doc1', true);
  [item] = plano(gs.listarFilaRelatorios());
  assert.equal(item.status, 'Concluído');
  assert.equal(item.progresso, 100);
  assert.ok(item.doneAt > 0);
});

test('progresso fica entre 0 e 100 e erro guarda a mensagem', () => {
  const { gs } = projeto();
  gs.registrarRelatorioFila_({ docId: 'doc1', progresso: 250 });
  assert.equal(plano(gs.listarFilaRelatorios())[0].progresso, 100);
  gs.marcarRelatorioConcluido_('doc1', false, 'modelo não encontrado');
  const [item] = plano(gs.listarFilaRelatorios());
  assert.equal(item.status, 'Erro');
  assert.equal(item.erro, 'modelo não encontrado');
});

test('registrar o mesmo documento de novo substitui a entrada anterior', () => {
  const { gs } = projeto();
  gs.registrarRelatorioFila_({ docId: 'doc1', status: 'Criando documento' });
  gs.registrarRelatorioFila_({ docId: 'doc1', status: 'Recomeçando' });
  const fila = plano(gs.listarFilaRelatorios());
  assert.equal(fila.length, 1);
  assert.equal(fila[0].status, 'Recomeçando');
});

test('itens concluídos somem da fila depois do tempo de retenção', () => {
  const { gs, dados } = projeto();
  gs.registrarRelatorioFila_({ docId: 'antigo' });
  gs.registrarRelatorioFila_({ docId: 'recente' });
  gs.marcarRelatorioConcluido_('antigo', true);
  gs.marcarRelatorioConcluido_('recente', true);

  const fila = JSON.parse(dados.FILA_RELATORIOS);
  fila.find((i) => i.docId === 'antigo').doneAt = Date.now() - 6 * 60 * 1000; // retenção: 5 min
  dados.FILA_RELATORIOS = JSON.stringify(fila);

  assert.deepEqual(plano(gs.listarFilaRelatorios()).map((i) => i.docId), ['recente']);
});

test('atualizar um documento desconhecido cria a entrada (gatilho que roda depois da limpeza)', () => {
  const { gs } = projeto();
  gs.atualizarRelatorioFila_('doc9', { status: 'IA: prompts', progresso: 75 });
  const [item] = plano(gs.listarFilaRelatorios());
  assert.equal(item.docId, 'doc9');
  assert.equal(item.status, 'IA: prompts');
});

test('propriedade corrompida não derruba a fila', () => {
  const { gs, dados } = projeto();
  dados.FILA_RELATORIOS = '{isto não é json';
  assert.deepEqual(plano(gs.listarFilaRelatorios()), []);
});
