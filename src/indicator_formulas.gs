/**
 * Motor de fórmulas dos indicadores: monta o contexto (DRE, balancete, acumulados) e avalia cada expressão.
 */

function safeDivide(num, den) {
  const a = Number(num);
  const b = Number(den);
  if (!isFinite(a) || !isFinite(b) || b === 0) return null;
  return a / b;
}

function _formataFormulaLegivel(formula) {
  if (!formula) return '';
  let expr = String(formula);
  // converte safeDivide(a,b) para (a / b)
  expr = expr.replace(/safeDivide\s*\(\s*([^,]+?)\s*,\s*([^)]+?)\)/g, function(_, a, b) {
    return '(' + a.trim() + ' / ' + b.trim() + ')';
  });
  // remove chaves duplas {{...}}
  expr = expr.replace(/\{\{\s*/g, '').replace(/\s*\}\}/g, '');
  return expr;
}

function construirFormulasPadrao(defs) {
  // Linha 1 apenas para consulta: fórmulas legíveis, sem safeDivide/{{}}
  return ['', '', '', ''].concat(defs.map(function(d) {
    return _formataFormulaLegivel(d.formula || d.label || '');
  }));
}

function construirFormulasCalculo(defs) {
  // Fórmulas originais usadas no cálculo interno (sem simplificação)
  return ['', '', '', ''].concat(defs.map(function(d) { return d.formula || ''; }));
}

function criarLookupBaseIndicadores(dreData, balSintetico) {
  const base = {};
  (dreData || []).forEach(function(row) {
    const conta = String(row.conta || '').trim();
    if (!conta) return;
    const key = normalizarChaveIndicador('dre ' + conta);
    const val = row.valorAtual != null ? row.valorAtual : row.valor_atual;
    base[key] = Number(val || 0);
  });
  (balSintetico || []).forEach(function(row) {
    const conta = String(row.conta || '').trim();
    if (!conta) return;
    const key = normalizarChaveIndicador('bal ' + conta);
    const valAnterior = (row.saldoAnterior != null) ? row.saldoAnterior : row.saldo_anterior;
    const valAtual = (row.saldoAtual != null) ? row.saldoAtual : row.saldo_atual;
    const val = (valAtual != null) ? valAtual : valAnterior;
    base[key] = Number(val || 0);
  });
  function alias(origem, destino) {
    if (base[origem] != null && base[destino] == null) {
      base[destino] = base[origem];
    }
  }
  // DRE aliases comuns
  alias(normalizarChaveIndicador('dre lucro operacional'), normalizarChaveIndicador('dre resultado operacional'));
  alias(normalizarChaveIndicador('dre resultado operacional'), normalizarChaveIndicador('dre lucro operacional'));

  alias(normalizarChaveIndicador('bal ativo'), normalizarChaveIndicador('bal ativo_total'));
  alias(normalizarChaveIndicador('bal patrimonio liquido'), normalizarChaveIndicador('bal pl'));
  base[normalizarChaveIndicador('bal passivo_total')] =
    (base[normalizarChaveIndicador('bal passivo circulante')] || 0) +
    (base[normalizarChaveIndicador('bal passivo nao circulante')] || 0);
  // Deriva passivo não circulante se faltar, a partir do total e do circulante
  const keyPassivoNC = normalizarChaveIndicador('bal passivo nao circulante');
  if (base[keyPassivoNC] == null && base.hasOwnProperty(normalizarChaveIndicador('bal passivo_total'))) {
    const tot = base[normalizarChaveIndicador('bal passivo_total')];
    const circ = base[normalizarChaveIndicador('bal passivo circulante')] || 0;
    base[keyPassivoNC] = tot - circ;
  }

  // Deriva Estoques / Realizável a Longo Prazo / Depreciação+Amortização, se existirem nas contas.
  function pickFirst_(keys) {
    for (let i = 0; i < keys.length; i++) {
      const k = normalizarChaveIndicador(keys[i]);
      if (base.hasOwnProperty(k)) return base[k];
    }
    return null;
  }
  function sumBySubstring_(prefixNorm, substrNorm, skipSubstrNorm) {
    let sum = 0;
    let found = false;
    Object.keys(base).forEach(function(k) {
      if (prefixNorm && k.indexOf(prefixNorm) !== 0) return;
      if (skipSubstrNorm && k.indexOf(skipSubstrNorm) !== -1) return;
      if (k.indexOf(substrNorm) === -1) return;
      const v = Number(base[k] || 0);
      if (!isFinite(v)) return;
      sum += v;
      found = true;
    });
    return found ? sum : null;
  }

  const estoquesVal =
    pickFirst_([
      'bal.estoques',
      'bal.estoques_de_mercadorias',
      'bal.estoques_de_mercadorias_mtz'
    ]) ||
    sumBySubstring_('bal', 'estoques', null);
  if (estoquesVal != null) {
    base[normalizarChaveIndicador('bal estoques')] = Number(estoquesVal) || 0;
  }

  const realizavelVal =
    pickFirst_([
      'bal.realizavel_a_longo_prazo',
      'bal.realizavel_a_longo_prazo_mtz'
    ]) ||
    sumBySubstring_('bal', 'realizavelalongoprazo', null);
  if (realizavelVal != null) {
    base[normalizarChaveIndicador('bal realizavel a longo prazo')] = Number(realizavelVal) || 0;
  }

  const depAmortContaUnica = pickFirst_([
    'dre.depreciacao_e_amortizacao',
    'dre.depreciacao_amortizacao',
    'dre.depreciacao_e_amortizacao(-)'
  ]);
  let depAmortTotal = depAmortContaUnica;
  if (depAmortTotal == null) {
    const dep = pickFirst_(['dre.depreciacao', 'dre.depreciacoes', 'dre.depreciacao(-)']);
    const amort = pickFirst_(['dre.amortizacao', 'dre.amortizacoes', 'dre.amortizacao(-)']);
    if (dep != null || amort != null) depAmortTotal = (dep || 0) + (amort || 0);
  }
  if (depAmortTotal == null) {
    const depPart = sumBySubstring_('dre', 'depreciacao', 'depreciacaoeamortizacao') || 0;
    const amortPart = sumBySubstring_('dre', 'amortizacao', 'depreciacaoeamortizacao') || 0;
    const combinado = sumBySubstring_('dre', 'depreciacaoeamortizacao', null) || 0;
    const total = depPart + amortPart + combinado;
    if (total !== 0) depAmortTotal = total;
  }
  if (depAmortTotal != null) {
    base[normalizarChaveIndicador('dre depreciacao_amortizacao_total')] = Number(depAmortTotal) || 0;
  }
  return base;
}

function _calcularSomasAcumuladasDre_(empresas, mes, ano) {
  const mesNum = parseInt(mes, 10);
  const anoNum = parseInt(ano, 10);
  if (!mesNum || !anoNum) return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('DreBase');
  if (!sheet) return null;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return null;

  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idxMes = header.indexOf('mes');
  const idxAno = header.indexOf('ano');
  const idxEmpresa = header.indexOf('empresa');
  const idxConta = header.indexOf('conta');
  const idxValor = header.indexOf('valor atual');
  if (idxMes < 0 || idxAno < 0 || idxEmpresa < 0 || idxConta < 0 || idxValor < 0) return null;

  const alvoReceita = new Set([
    normalizarChaveIndicador('Receita Liquida'),
    normalizarChaveIndicador('Receita Líquida')
  ]);
  const alvoLucro = new Set([
    normalizarChaveIndicador('Lucro ou Prejuizo do Exercicio'),
    normalizarChaveIndicador('Lucro ou Prejuízo do Exercício'),
    normalizarChaveIndicador('Lucro Liquido'),
    normalizarChaveIndicador('Lucro Líquido')
  ]);

  const empSet = new Set((empresas || []).map(function(e) { return chaveEmpresa_(e); }).filter(Boolean));
  if (empSet.size === 0) return null;

  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  let somaLucro = 0;
  let somaReceita = 0;
  values.forEach(function(row) {
    const empKey = chaveEmpresa_(row[idxEmpresa]);
    if (!empSet.has(empKey)) return;
    const m = parseInt(row[idxMes], 10);
    const a = parseInt(row[idxAno], 10);
    if (a !== anoNum) return;
    if (!m || m > mesNum) return;
    const contaNorm = normalizarChaveIndicador(row[idxConta]);
    if (!alvoReceita.has(contaNorm) && !alvoLucro.has(contaNorm)) return;
    const v = Number(row[idxValor] || 0);
    if (!isFinite(v)) return;
    if (alvoReceita.has(contaNorm)) somaReceita += v;
    if (alvoLucro.has(contaNorm)) somaLucro += v;
  });
  return { somaLucro: somaLucro, somaReceita: somaReceita };
}

function _adicionarAcumuladosNaBase_(base, identificador, mes, ano, opts) {
  if (!base) return;
  const ident = String(identificador || '').trim();
  if (!ident) return;
  const empresas = [];
  if (ident.indexOf('[GRUPO] ') === 0) {
    const lista = (opts && Array.isArray(opts.empresasGrupo)) ? opts.empresasGrupo : [];
    lista.forEach(function(e) { if (e) empresas.push(e); });
  } else {
    empresas.push(ident);
  }
  const somas = _calcularSomasAcumuladasDre_(empresas, mes, ano);
  if (!somas) return;
  base[normalizarChaveIndicador('acum.lucro_liquido')] = Number(somas.somaLucro) || 0;
  base[normalizarChaveIndicador('acum.receita_liquida')] = Number(somas.somaReceita) || 0;
}

function pegarPrimeiroValor(base, nomes) {
  for (let i = 0; i < nomes.length; i++) {
    const key = normalizarChaveIndicador(nomes[i]);
    if (base.hasOwnProperty(key)) return base[key];
  }
  return null;
}

/**
 * Calcula uma fórmula de indicador. Cada {{chave}} é trocada pelo valor já
 * calculado de outro indicador ou pelo valor da base (dre.*, bal.*, acum.*).
 * Se alguma chave não tiver valor, o indicador fica vazio (null).
 *
 * @param {string|number} formula Ex.: 'safeDivide({{lucro_liquido}}, {{receita_liquida}}) * 100'
 * @param {{indicadores: Object, base: Object}} contexto
 * @return {number|null}
 */
function avaliarFormulaIndicador(formula, contexto) {
  if (formula == null) return null;
  if (typeof formula === 'number') return formula;
  let expr = String(formula || '').trim();
  if (expr === '') return null;
  if (expr.startsWith('=')) expr = expr.slice(1);
  let hasMissing = false;
  expr = expr.replace(/\{\{\s*([^\}]+)\s*\}\}/g, function(_, token) {
    const key = normalizarChaveIndicador(token);
    if (contexto.indicadores.hasOwnProperty(key)) {
      const v = contexto.indicadores[key];
      if (v == null || v === '') {
        hasMissing = true;
        return '0';
      }
      return String(v);
    }
    if (contexto.base.hasOwnProperty(key)) {
      const v2 = contexto.base[key];
      if (v2 == null || v2 === '') {
        hasMissing = true;
        return '0';
      }
      return String(v2);
    }
    hasMissing = true;
    return '0';
  });
  if (hasMissing) return null;
  try {
    const result = avaliarExpressaoAritmetica_(expr);
    if (result == null || isNaN(result)) return null;
    return result;
  } catch (e) {
    return null;
  }
}

function extrairMapaRespostaIa(resp) {
  const mapa = {};
  function walk(obj, prefix) {
    if (obj == null) return;
    if (typeof obj === 'number' || typeof obj === 'string') {
      const num = Number(obj);
      if (!isNaN(num)) {
        mapa[normalizarChaveIndicador(prefix)] = num;
      }
      return;
    }
    if (Array.isArray(obj)) return;
    if (typeof obj === 'object') {
      Object.keys(obj).forEach(function(k) {
        const nextPrefix = prefix ? (prefix + '.' + k) : k;
        walk(obj[k], nextPrefix);
      });
    }
  }
  walk(resp, '');
  return mapa;
}

function obterValorDaIa(def, mapaIa) {
  const possiveis = [def.key, def.label].concat(def.aliases || []);
  for (let i = 0; i < possiveis.length; i++) {
    const k = normalizarChaveIndicador(possiveis[i]);
    if (mapaIa.hasOwnProperty(k)) return mapaIa[k];
  }
  return null;
}

function calcularLinhaIndicadores(defs, formulaRow, base, mapaIa) {
  const indicadores = {};
  const maxPasses = 3; // garante que dependencias tardias sejam resolvidas
  for (let pass = 0; pass < maxPasses; pass++) {
    defs.forEach(function(def, idx) {
      const keyNorm = normalizarChaveIndicador(def.key || def.label);
      if (indicadores[keyNorm] !== undefined && indicadores[keyNorm] !== '') return;
      const formula = (formulaRow[4 + idx] != null && formulaRow[4 + idx] !== '') ? formulaRow[4 + idx] : (def.formula || '');
      let valor = avaliarFormulaIndicador(formula, { indicadores: indicadores, base: base });
      if (valor == null) {
        // Fallbacks simples por chave
        if (keyNorm === normalizarChaveIndicador('receita_bruta')) {
          valor = pegarPrimeiroValor(base, ['dre.receita_bruta']);
        } else if (keyNorm === normalizarChaveIndicador('total_deducoes')) {
          valor = pegarPrimeiroValor(base, ['dre.deducoes']);
        } else if (keyNorm === normalizarChaveIndicador('receita_liquida')) {
          const rb = indicadores[normalizarChaveIndicador('receita_bruta')];
          const td = indicadores[normalizarChaveIndicador('total_deducoes')];
          const tdVal = (td == null || td === '') ? 0 : td;
          if (rb != null && rb !== '') valor = rb - tdVal;
          if (valor == null) valor = pegarPrimeiroValor(base, ['dre.receita_liquida']);
        } else if (keyNorm === normalizarChaveIndicador('custos')) {
          valor = pegarPrimeiroValor(base, ['dre.custos', 'dre.custos_operacionais']);
        } else if (keyNorm === normalizarChaveIndicador('despesas')) {
          valor = pegarPrimeiroValor(base, ['dre.despesas_operacionais', 'dre.despesas']);
        } else if (keyNorm === normalizarChaveIndicador('lucro_bruto')) {
          valor = pegarPrimeiroValor(base, ['dre.lucro_bruto']);
          if (valor == null) {
            const rl = indicadores[normalizarChaveIndicador('receita_liquida')];
            const c = indicadores[normalizarChaveIndicador('custos')];
            if (rl != null && rl !== '' && c != null && c !== '') valor = rl - c;
          }
        } else if (keyNorm === normalizarChaveIndicador('lucro_liquido')) {
          valor = pegarPrimeiroValor(base, ['dre.lucro_ou_prejuizo_do_exercicio', 'dre.resultado_operacional']);
          if (valor == null) {
            const lb = indicadores[normalizarChaveIndicador('lucro_bruto')];
            const d = indicadores[normalizarChaveIndicador('despesas')];
            if (lb != null && lb !== '' && d != null && d !== '') valor = lb - d;
          }
        } else if (keyNorm === normalizarChaveIndicador('ebitda')) {
          const ro = pegarPrimeiroValor(base, ['dre.resultado_operacional', 'dre.lucro_operacional']);
          const depAmort = pegarPrimeiroValor(base, ['dre.depreciacao_amortizacao_total']) || 0;
          if (ro != null) valor = Number(ro || 0) + Number(depAmort || 0);
        } else if (keyNorm === normalizarChaveIndicador('ebitda_percentual')) {
          const e = indicadores[normalizarChaveIndicador('ebitda')];
          const rl = indicadores[normalizarChaveIndicador('receita_liquida')];
          if (e != null && e !== '' && rl != null && rl !== '') {
            const divE = safeDivide(e, rl);
            valor = divE != null ? divE * 100 : null;
          }
        } else if (keyNorm === normalizarChaveIndicador('liquidez_corrente')) {
          valor = safeDivide(
            pegarPrimeiroValor(base, ['bal.ativo_circulante']),
            pegarPrimeiroValor(base, ['bal.passivo_circulante'])
          );
        } else if (keyNorm === normalizarChaveIndicador('liquidez_geral')) {
          valor = safeDivide(
            (pegarPrimeiroValor(base, ['bal.ativo_circulante']) || 0) + (pegarPrimeiroValor(base, ['bal.realizavel_a_longo_prazo']) || 0),
            (pegarPrimeiroValor(base, ['bal.passivo_circulante']) || 0) + (pegarPrimeiroValor(base, ['bal.passivo_nao_circulante']) || 0)
          );
        } else if (keyNorm === normalizarChaveIndicador('liquidez_seca')) {
          valor = safeDivide(
            (pegarPrimeiroValor(base, ['bal.ativo_circulante']) || 0) - (pegarPrimeiroValor(base, ['bal.estoques']) || 0),
            pegarPrimeiroValor(base, ['bal.passivo_circulante'])
          );
        } else if (keyNorm === normalizarChaveIndicador('liquidez_imediata')) {
          valor = safeDivide(
            pegarPrimeiroValor(base, ['bal.contas_bancos']),
            pegarPrimeiroValor(base, ['bal.passivo_circulante'])
          );
        } else if (keyNorm === normalizarChaveIndicador('distribuicao_resultados_percentual')) {
          const dr = pegarPrimeiroValor(base, ['dre.distribuicao_de_resultados']);
          const ll = indicadores[normalizarChaveIndicador('lucro_liquido')];
          const div = safeDivide(dr, ll);
          valor = div != null ? div * 100 : null;
        } else if (keyNorm === normalizarChaveIndicador('lucratividade_percentual')) {
          const ll = indicadores[normalizarChaveIndicador('lucro_liquido')];
          const rl = indicadores[normalizarChaveIndicador('receita_liquida')];
          const div = safeDivide(ll, rl);
          valor = div != null ? div * 100 : null;
        } else if (keyNorm === normalizarChaveIndicador('margem_operacional')) {
          const ro = pegarPrimeiroValor(base, ['dre.resultado_operacional', 'dre.lucro_operacional']);
          const rl = indicadores[normalizarChaveIndicador('receita_liquida')];
          const div = safeDivide(ro, rl);
          valor = div != null ? div * 100 : null;
        } else if (keyNorm === normalizarChaveIndicador('margem_liquida')) {
          const ll = indicadores[normalizarChaveIndicador('lucro_liquido')];
          const rl = indicadores[normalizarChaveIndicador('receita_liquida')];
          const div = safeDivide(ll, rl);
          valor = div != null ? div * 100 : null;
        } else if (keyNorm === normalizarChaveIndicador('peso_deducoes_percentual')) {
          const td = indicadores[normalizarChaveIndicador('total_deducoes')];
          const rb = indicadores[normalizarChaveIndicador('receita_bruta')];
          const div = safeDivide(td, rb);
          valor = div != null ? div * 100 : null;
        } else if (keyNorm === normalizarChaveIndicador('endividamento')) {
          valor = safeDivide(
            (pegarPrimeiroValor(base, ['bal.passivo_circulante']) || 0) + (pegarPrimeiroValor(base, ['bal.passivo_nao_circulante']) || 0),
            pegarPrimeiroValor(base, ['bal.patrimonio_liquido', 'bal.pl'])
          );
        } else if (keyNorm === normalizarChaveIndicador('imobilizacao')) {
          valor = safeDivide(
            (pegarPrimeiroValor(base, ['bal.imobilizado']) || 0) + (pegarPrimeiroValor(base, ['bal.ativo_nao_circulante']) || 0),
            pegarPrimeiroValor(base, ['bal.patrimonio_liquido', 'bal.pl'])
          );
        } else if (keyNorm === normalizarChaveIndicador('solvencia_geral')) {
          valor = safeDivide(
            pegarPrimeiroValor(base, ['bal.ativo_total']),
            (pegarPrimeiroValor(base, ['bal.passivo_circulante']) || 0) + (pegarPrimeiroValor(base, ['bal.passivo_nao_circulante']) || 0)
          );
        } else if (keyNorm === normalizarChaveIndicador('lucratividade_acumulada_percentual')) {
          const sumLucro = pegarPrimeiroValor(base, ['acum.lucro_liquido']);
          const sumReceita = pegarPrimeiroValor(base, ['acum.receita_liquida']);
          const div = safeDivide(sumLucro, sumReceita);
          valor = div != null ? div * 100 : indicadores[normalizarChaveIndicador('lucratividade_percentual')];
        } else if (keyNorm === normalizarChaveIndicador('fluxo_resultados')) {
          valor = indicadores[normalizarChaveIndicador('lucro_liquido')];
        }
      }
      if (valor == null || valor === '') {
        indicadores[keyNorm] = '';
      } else {
        const num = Number(valor);
        indicadores[keyNorm] = isNaN(num) ? valor : num;
      }
    });
  }
  // Preenche apenas o que continuar vazio com valores da IA (se houver),
  // evitando sobrescrever cálculos locais já resolvidos em múltiplos passes.
  if (mapaIa && Object.keys(mapaIa).length > 0) {
    defs.forEach(function(def) {
      const keyNorm = normalizarChaveIndicador(def.key || def.label);
      if (indicadores[keyNorm] !== '' && indicadores[keyNorm] !== undefined) return;
      const iaVal = obterValorDaIa(def, mapaIa);
      if (iaVal == null || iaVal === '') return;
      const num = Number(iaVal);
      indicadores[keyNorm] = isNaN(num) ? iaVal : num;
    });
  }
  return indicadores;
}
