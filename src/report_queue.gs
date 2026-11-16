/**
 * Fila de relatórios exibida no portal: status e progresso por documento, guardados em propriedades do script.
 */

const FILA_RELATORIOS_KEY = 'FILA_RELATORIOS';

const FILA_RELATORIOS_MAX = 200;

const FILA_RELATORIOS_TTL_MS = 5 * 60 * 1000;

function _lerFilaRelatorios_() {
  const props = PropertiesService.getScriptProperties();
  try {
    return JSON.parse(props.getProperty(FILA_RELATORIOS_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

function _salvarFilaRelatorios_(lista) {
  const props = PropertiesService.getScriptProperties();
  const out = (lista || []).slice(0, FILA_RELATORIOS_MAX);
  props.setProperty(FILA_RELATORIOS_KEY, JSON.stringify(out));
}

function _limparFilaRelatorios_(lista) {
  const now = Date.now();
  return (lista || []).filter(function(item) {
    if (!item || !item.doneAt) return true;
    return (now - item.doneAt) <= FILA_RELATORIOS_TTL_MS;
  });
}

function _padPeriodo_(mes, ano) {
  const m = parseInt(mes, 10);
  const a = parseInt(ano, 10);
  if (!m || !a) return '';
  return String(m).padStart(2, '0') + '/' + a;
}

function registrarRelatorioFila_(info) {
  if (!info || !info.docId) return null;
  const now = Date.now();
  const item = {
    docId: String(info.docId),
    docUrl: String(info.docUrl || ''),
    tipo: String(info.tipo || ''),
    entidade: String(info.entidade || ''),
    mes: info.mes,
    ano: info.ano,
    periodo: _padPeriodo_(info.mes, info.ano),
    status: String(info.status || 'Iniciado'),
    progresso: isFinite(info.progresso) ? Math.max(0, Math.min(100, Number(info.progresso))) : 0,
    createdAt: now,
    updatedAt: now,
    doneAt: null,
    erro: ''
  };
  let lista = _lerFilaRelatorios_();
  lista = _limparFilaRelatorios_(lista).filter(function(r) { return String(r.docId) !== item.docId; });
  lista.unshift(item);
  _salvarFilaRelatorios_(lista);
  return item;
}

function atualizarRelatorioFila_(docId, patch) {
  if (!docId) return;
  const lista = _limparFilaRelatorios_(_lerFilaRelatorios_());
  const now = Date.now();
  let found = false;
  lista.forEach(function(item) {
    if (String(item.docId) !== String(docId)) return;
    found = true;
    const p = patch || {};
    if (p.status != null) item.status = String(p.status);
    if (p.progresso != null && isFinite(p.progresso)) {
      item.progresso = Math.max(0, Math.min(100, Number(p.progresso)));
    }
    if (p.docUrl != null) item.docUrl = String(p.docUrl);
    if (p.erro != null) item.erro = String(p.erro || '');
    if (p.doneAt != null) item.doneAt = p.doneAt;
    item.updatedAt = now;
  });
  if (!found && patch) {
    lista.unshift({
      docId: String(docId),
      docUrl: String(patch.docUrl || ''),
      tipo: String(patch.tipo || ''),
      entidade: String(patch.entidade || ''),
      mes: patch.mes,
      ano: patch.ano,
      periodo: _padPeriodo_(patch.mes, patch.ano),
      status: String(patch.status || 'Em andamento'),
      progresso: isFinite(patch.progresso) ? Math.max(0, Math.min(100, Number(patch.progresso))) : 0,
      createdAt: now,
      updatedAt: now,
      doneAt: patch.doneAt || null,
      erro: String(patch.erro || '')
    });
  }
  _salvarFilaRelatorios_(lista);
}

function marcarRelatorioConcluido_(docId, ok, msg) {
  if (!docId) return;
  const status = ok ? 'Concluído' : 'Erro';
  atualizarRelatorioFila_(docId, {
    status: status,
    progresso: 100,
    erro: ok ? '' : String(msg || ''),
    doneAt: Date.now()
  });
}

function listarFilaRelatorios() {
  let lista = _limparFilaRelatorios_(_lerFilaRelatorios_());
  lista.sort(function(a, b) {
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  _salvarFilaRelatorios_(lista);
  return lista.map(function(item) {
    return {
      docId: item.docId || '',
      docUrl: item.docUrl || '',
      tipo: item.tipo || '',
      entidade: item.entidade || '',
      periodo: item.periodo || '',
      status: item.status || '',
      progresso: isFinite(item.progresso) ? item.progresso : 0,
      erro: item.erro || '',
      doneAt: item.doneAt || null
    };
  });
}
