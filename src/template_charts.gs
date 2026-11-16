/**
 * Marcadores de gráfico: ~~(t:título; h:eixo; v:indicadores)~~ vira imagem renderizada pelo QuickChart.
 */

// Cache de indicadores para os gráficos em tags ~~(... )~~
var _graficoIndicadoresCache = null;

function _graficoKey(entidade, mes, ano) {
  if (mes === null || ano === null || mes === undefined || ano === undefined) return null;
  const m = parseInt(mes, 10);
  const a = parseInt(ano, 10);
  if (isNaN(m) || isNaN(a)) return null;
  return sanitizeName(String(entidade || '')) + '|' + m + '|' + a;
}

function _obterCacheIndicadoresGraficos() {
  if (_graficoIndicadoresCache) return _graficoIndicadoresCache;
  const data = getIndicadoresData();
  const map = {};
  (data.rows || []).forEach(function(r) {
    const key = _graficoKey(r.empresa, r.mes, r.ano);
    if (key) map[key] = r;
  });
  _graficoIndicadoresCache = { indicators: data.indicators || [], rows: data.rows || [], map: map };
  return _graficoIndicadoresCache;
}

function _validarCorHex(cor) {
  if (!cor) return null;
  const m = String(cor).trim();
  if (!m) return null;
  const re = /^#?[0-9a-fA-F]{6}$/;
  if (!re.test(m)) return null;
  return m.charAt(0) === '#' ? m : ('#' + m);
}

function _levenshtein(a, b) {
  const s = sanitizeName(a || '');
  const t = sanitizeName(b || '');
  const n = s.length;
  const m = t.length;
  const d = [];
  for (let i = 0; i <= n; i++) {
    d[i] = [i];
  }
  for (let j = 0; j <= m; j++) {
    d[0][j] = j;
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = s.charAt(i - 1) === t.charAt(j - 1) ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }
  return d[n][m];
}

function _escolherIndicador(nomeDesejado, disponiveis) {
  if (!disponiveis || !disponiveis.length) return nomeDesejado;
  const alvo = sanitizeName(nomeDesejado);
  // 1) match exato por nome sanitizado
  for (let i = 0; i < disponiveis.length; i++) {
    const cand = disponiveis[i];
    if (sanitizeName(cand) === alvo) return cand;
  }
  // 2) prefixos/containment para evitar escolher indicadores errados (ex.: "Endividamento" vs "EBITDA")
  let melhor = disponiveis[0];
  let melhorScore = _levenshtein(alvo, sanitizeName(melhor));
  for (let i = 0; i < disponiveis.length; i++) {
    const cand = disponiveis[i];
    const norm = sanitizeName(cand);
    if (norm.indexOf(alvo) === 0 || alvo.indexOf(norm) === 0) {
      return cand;
    }
    const score = _levenshtein(alvo, norm);
    if (score < melhorScore) {
      melhorScore = score;
      melhor = cand;
      if (score === 0) break;
    }
  }
  return melhor;
}

function _parseHorizontais(raw) {
  const parts = String(raw || '').split('|').map(function(p) { return p.trim(); }).filter(Boolean);
  return parts.map(function(item) {
    const m = item.match(/^([a-zçÇãÁâéêíõóú]+)(?:\s*\(\s*([+-]?\d+)\s*\))?$/i);
    const tipoRaw = m && m[1] ? sanitizeName(m[1]) : sanitizeName(item);
    const tipo = (tipoRaw === 'grupo') ? 'grupo' : (tipoRaw === 'consolidado' ? 'consolidado' : 'empresa');
    const off = m && m[2] ? parseInt(m[2], 10) : 0;
    return { tipo: tipo, offset: isNaN(off) ? 0 : off };
  });
}

function _parseVerticais(raw) {
  const parts = String(raw || '').split('|').map(function(p) { return p.trim(); }).filter(Boolean);
  return parts.map(function(item) {
    const m = item.match(/^(.*?)(?:\[(.+)\])?$/);
    const nome = m && m[1] ? m[1].trim() : item;
    const cor = m && m[2] ? m[2].trim() : '';
    return { nome: nome, cor: cor };
  }).filter(function(v) { return v.nome; });
}

function _parseGraficoTag(raw) {
  const cfg = { titulo: '', horizontais: [], verticais: [], supressAI: false, supressCaption: false };
  const partes = String(raw || '').split(';').map(function(p) { return p.trim(); }).filter(Boolean);
  partes.forEach(function(p) {
    const lower = p.toLowerCase();
    if (lower === 'supressai') {
      cfg.supressAI = true;
      return;
    }
    if (lower === 'supresscaption') {
      cfg.supressCaption = true;
      return;
    }
    if (lower.indexOf('t:') === 0 || lower.indexOf('titulo:') === 0) {
      cfg.titulo = p.split(':').slice(1).join(':').trim();
      return;
    }
    if (lower.indexOf('h:') === 0 || lower.indexOf('horizontal:') === 0) {
      const val = p.split(':').slice(1).join(':').trim();
      cfg.horizontais = _parseHorizontais(val);
      return;
    }
    if (lower.indexOf('v:') === 0 || lower.indexOf('vertical:') === 0) {
      const val = p.split(':').slice(1).join(':').trim();
      cfg.verticais = _parseVerticais(val);
    }
  });
  if (!cfg.horizontais.length) return { ok: false, erro: 'Parâmetro horizontal (h:) não informado' };
  if (!cfg.verticais.length) return { ok: false, erro: 'Parâmetro vertical (v:) não informado' };
  return { ok: true, config: cfg };
}

function _resolverEntidadeEmpresa(ctx) {
  if (ctx && ctx.empresa) {
    return { key: ctx.empresa, label: ctx.empresaLabel || ctx.empresa };
  }
  if (ctx && ctx.grupo) {
    const nomeGrupo = String(ctx.grupo);
    return { key: '[GRUPO] ' + nomeGrupo, label: 'Consolidado ' + nomeGrupo };
  }
  return null;
}

function _resolverEntidadeConsolidado(ctx) {
  if (ctx && ctx.grupo) {
    const nomeGrupo = String(ctx.grupo);
    return { key: '[GRUPO] ' + nomeGrupo, label: 'Consolidado ' + nomeGrupo };
  }
  return null;
}

function _obterListaIntegrantes(ctx) {
  if (!ctx || !ctx.integrantesGrupo || !ctx.integrantesGrupo.length) return [];
  return ctx.integrantesGrupo.map(function(item) {
    if (item && typeof item === 'object' && item.nome) return item.nome;
    return item;
  }).filter(Boolean);
}

function _formatarPeriodoLabel_(mes, ano) {
  const m = (mes == null || mes === '') ? '?' : String(mes).padStart(2, '0');
  const a = (ano == null || ano === '') ? '?' : String(ano);
  return m + '/' + a;
}

function _construirCategoriasHorizontais(cfgHorizontais, ctx) {
  const cats = [];
  cfgHorizontais.forEach(function(item) {
    const periodo = _ajustarPeriodoComOffset(ctx.mes, ctx.ano, item.offset || 0);
    const labelPeriodo = _formatarPeriodoLabel_(periodo.mes, periodo.ano);
    if (item.tipo === 'grupo') {
      const membros = _obterListaIntegrantes(ctx);
      membros.forEach(function(nome) {
        cats.push({ label: labelPeriodo, chave: nome, mes: periodo.mes, ano: periodo.ano });
      });
      return;
    }
    if (item.tipo === 'consolidado') {
      const entC = _resolverEntidadeConsolidado(ctx);
      if (entC) {
        cats.push({ label: labelPeriodo, chave: entC.key, mes: periodo.mes, ano: periodo.ano });
      }
      return;
    }
    const ent = _resolverEntidadeEmpresa(ctx);
    if (ent) {
      cats.push({ label: labelPeriodo, chave: ent.key, mes: periodo.mes, ano: periodo.ano });
    }
  });
  return cats;
}

function _buscarValorIndicador(rowMap, chave, nomeIndicador) {
  if (!chave || !rowMap[chave]) return null;
  const row = rowMap[chave];
  // Prefere valores brutos, cai para formatados se necessário
  const valRaw = row.values ? row.values[nomeIndicador] : undefined;
  const valFmt = row.formatted ? row.formatted[nomeIndicador] : undefined;
  const candidato = (valRaw !== undefined) ? valRaw : valFmt;
  if (candidato === '' || candidato === null || typeof candidato === 'undefined') return null;
  if (typeof candidato === 'number') return candidato;
  const num = converterValor(candidato);
  return isNaN(num) ? null : num;
}

function _montarDadosGrafico(cfg, ctx) {
  const cache = _obterCacheIndicadoresGraficos();
  const indicadoresDisponiveis = cache.indicators || [];
  const verticais = cfg.verticais.map(function(v, idx) {
    const nomePlanilha = _escolherIndicador(v.nome, indicadoresDisponiveis);
    const corValida = _validarCorHex(v.cor);
    const cor = corValida || CORES_PADRAO[idx % CORES_PADRAO.length];
    return {
      nomeOriginal: v.nome,
      nomePlanilha: nomePlanilha,
      cor: cor
    };
  });
  const cats = _construirCategoriasHorizontais(cfg.horizontais, ctx);
  if (!cats.length) return { ok: false, erro: 'Nenhum item válido para o eixo horizontal' };
  const rows = [];
  const catsComDados = [];
  let temNegativo = false;
  let minVal = null;
  let maxVal = null;
  cats.forEach(function(cat) {
    const key = _graficoKey(cat.chave, cat.mes, cat.ano);
    if (!key || !cache.map[key]) return; // ignora período/entidade sem linha na aba Indicadores
    const linha = [cat.label];
    verticais.forEach(function(v) {
      const valor = _buscarValorIndicador(cache.map, key, v.nomePlanilha);
      if (typeof valor === 'number' && valor < 0) temNegativo = true;
      if (typeof valor === 'number') {
        minVal = (minVal === null) ? valor : Math.min(minVal, valor);
        maxVal = (maxVal === null) ? valor : Math.max(maxVal, valor);
      }
      linha.push(valor === undefined ? null : valor);
      if (!cat.valores) cat.valores = [];
      cat.valores.push(valor === undefined ? null : valor);
    });
    rows.push(linha);
    catsComDados.push(cat);
  });
  if (!rows.length) return { ok: false, erro: 'Sem dados para os períodos selecionados' };
  const titulo = cfg.titulo || verticais.map(function(v) { return v.nomePlanilha; }).join(', ');
  return { ok: true, titulo: titulo, verticais: verticais, categorias: catsComDados, rows: rows, temNegativo: temNegativo, minVal: minVal, maxVal: maxVal };
}

function _gerarLegendaAI(titulo, verticais, categorias) {
  const linhas = [];
  linhas.push('Gráfico: ' + (titulo || 'Indicadores'));
  categorias.forEach(function(cat) {
    const partes = [];
    verticais.forEach(function(v, idx) {
      const val = cat.valores ? cat.valores[idx] : null;
      const textoVal = (val === null || typeof val === 'undefined') ? 'sem dado' : formatarValorParaDoc(val);
      partes.push(v.nomePlanilha + ': ' + textoVal);
    });
    linhas.push(cat.label + ' -> ' + partes.join('; '));
  });
  return linhas.join('\n');
}

function processarMarcadoresGraficos(body, ctx, startIdx, endIdx) {
  if (!body) return;
  let start = typeof startIdx === 'number' ? startIdx : 0;
  let end = typeof endIdx === 'number' ? endIdx : (body.getNumChildren() - 1);
  let i = start;
  while (i <= end) {
    const total = body.getNumChildren();
    if (i >= total || total === 0) break;
    const child = body.getChild(i);
    // Também processa marcadores dentro de tabelas (ex.: blocos replicados em relatórios de grupo).
    if (child.getType() === DocumentApp.ElementType.TABLE) {
      const table = child.asTable();
      for (let r = 0; r < table.getNumRows(); r++) {
        const row = table.getRow(r);
        for (let c = 0; c < row.getNumCells(); c++) {
          processarMarcadoresGraficos(row.getCell(c), ctx);
        }
      }
      i++;
      continue;
    }
    if (child.getType() !== DocumentApp.ElementType.PARAGRAPH &&
        child.getType() !== DocumentApp.ElementType.LIST_ITEM) {
      i++;
      continue;
    }
    const par = (child.getType() === DocumentApp.ElementType.LIST_ITEM) ? child.asListItem() : child.asParagraph();
    const text = par.getText() || '';
    const m = text.match(/~~\s*\(([\s\S]+?)\)\s*~~/);
    if (!m) {
      i++;
      continue;
    }
    const parsed = _parseGraficoTag(m[1]);
    if (!parsed.ok) {
      par.setText('ERRO: ' + parsed.erro);
      i++;
      continue;
    }
    const dados = _montarDadosGrafico(parsed.config, ctx || {});
    if (!dados.ok) {
      par.setText('ERRO: ' + dados.erro);
      i++;
      continue;
    }
    const usarAnotacoes = parsed.config.supressCaption !== true;
    const blob = _criarImagemGraficoQuickChart(dados, usarAnotacoes);
    if (!blob) {
      par.setText('ERRO: não foi possível renderizar o gráfico (serviço externo)');
      i++;
      continue;
    }
    const parent = par.getParent();
    let idx = parent.getChildIndex(par);
    if (idx < 0) idx = parent.getNumChildren();
    // insertParagraph exige índice < numChildren; caso contrário, usar append
    const safeIdx = idx >= parent.getNumChildren() ? null : idx;
    const imagePar = (safeIdx === null) ? parent.appendParagraph('') : parent.insertParagraph(safeIdx, '');
    const img = imagePar.insertInlineImage(0, blob);
    try {
      const scale = 0.4; // 40% do tamanho original
      img.setWidth(img.getWidth() * scale);
      img.setHeight(img.getHeight() * scale);
    } catch (e) {
      Logger.log('Nao foi possivel redimensionar a imagem: ' + e);
    }
    let inseridos = 1;
    if (parsed.config.supressAI !== true) {
      const legenda = _gerarLegendaAI(dados.titulo, dados.verticais, dados.categorias);
      let legendaIdx = imagePar.getParent().getChildIndex(imagePar) + inseridos;
      if (legendaIdx < 0) legendaIdx = parent.getNumChildren();
      let insertIdx = legendaIdx;
      if (insertIdx >= parent.getNumChildren()) {
        parent.appendParagraph('%%%');
      } else {
        parent.insertParagraph(insertIdx, '%%%');
      }
      insertIdx += 1;
      if (insertIdx >= parent.getNumChildren()) {
        parent.appendParagraph(legenda);
      } else {
        parent.insertParagraph(insertIdx, legenda);
      }
      insertIdx += 1;
      if (insertIdx >= parent.getNumChildren()) {
        parent.appendParagraph('%%%');
      } else {
        parent.insertParagraph(insertIdx, '%%%');
      }
      inseridos += 3;
    }
    const trimmed = text.trim();
    let removidos = 0;
    if (trimmed === m[0].trim()) {
      parent.removeChild(par);
      removidos = 1;
    } else {
      const textEl = par.editAsText();
      textEl.replaceText(escaparRegex(m[0]), '');
    }
    const delta = inseridos - removidos;
    if (typeof endIdx === 'number') {
      end += delta;
      const maxEnd = body.getNumChildren() - 1;
      if (end > maxEnd) end = maxEnd;
    } else {
      end = body.getNumChildren() - 1;
    }
    i += inseridos > 0 ? inseridos : 1;
  }
}

function _criarImagemGraficoQuickChart(dados, usarAnotacoes) {
  const config = _montarConfigChartJs(dados, usarAnotacoes);
  const payload = {
    chart: config,
    width: 800,
    height: 450,
    version: '4.4.0',
    format: 'png',
    plugins: ['chartjs-plugin-datalabels']
  };
  try {
    const resp = UrlFetchApp.fetch('https://quickchart.io/chart', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const code = resp.getResponseCode();
    if (code >= 200 && code < 300) {
      return resp.getBlob().setName((dados.titulo || 'grafico') + '.png');
    }
    Logger.log('QuickChart response code: ' + code + ' body: ' + resp.getContentText());
  } catch (e) {
    Logger.log('Falha ao gerar gráfico QuickChart: ' + e);
  }
  return null;
}

function _montarConfigChartJs(dados, usarAnotacoes) {
  const labels = dados.categorias.map(function(c) { return c.label; });
  const margin = (function(minVal, maxVal) {
    if (minVal == null || maxVal == null) return null;
    if (maxVal <= 0) {
      const m = Math.max(1, Math.abs(minVal) * 0.1);
      return { min: minVal - m, max: m };
    }
    const span = Math.abs(maxVal - minVal);
    const m = Math.max(1, span * 0.1 || Math.abs(maxVal || 0) * 0.1);
    return { min: minVal - m, max: maxVal + m };
  })(dados.minVal, dados.maxVal);
  const datasets = dados.verticais.map(function(v, idx) {
    const data = dados.categorias.map(function(cat) {
      const val = cat.valores ? cat.valores[idx] : null;
      return (val === null || typeof val === 'undefined') ? null : val;
    });
    // alterna âncora/alinhamento para afastar rótulos entre séries
    const seriePar = idx % 2 === 0;
    return {
      label: v.nomePlanilha,
      backgroundColor: v.cor,
      borderWidth: 0,
      data: data,
      datalabels: usarAnotacoes ? {
        display: true,
        color: '#000000',
        clamp: true,
        offset: seriePar ? 4 : 12,
        anchor: function(ctx) {
          const val = ctx.parsed.y;
          const positivo = typeof val === 'number' ? val >= 0 : true;
          if (seriePar) return positivo ? 'end' : 'start';
          return positivo ? 'start' : 'end';
        },
        align: function(ctx) {
          const val = ctx.parsed.y;
          const positivo = typeof val === 'number' ? val >= 0 : true;
          if (seriePar) return positivo ? 'end' : 'start';
          return positivo ? 'start' : 'end';
        },
        formatter: function(value) {
          if (value === null || typeof value === 'undefined') return '';
          if (typeof value === 'number') {
            return String(value);
          }
          return String(value);
        }
      } : { display: false }
    };
  });
  return {
    type: 'bar',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      animation: false,
      plugins: {
        legend: { position: 'top' },
        datalabels: { display: usarAnotacoes === true }
      },
      scales: {
        y: {
          beginAtZero: false,
          min: margin && margin.min !== undefined ? margin.min : undefined,
          max: margin && margin.max !== undefined ? margin.max : undefined
        }
      }
    }
  };
}
