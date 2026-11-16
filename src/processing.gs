/**
 * Normalização da resposta do modelo: reconcilia contas com as categorias sintéticas e grava nas bases.
 */

function processarConteudoComResposta_(t, meta, conteudo, resp, prompt) {
  try {
    registrarDebugIa_(t, meta, prompt, resp);
  } catch (e) {
    Logger.log('Falha ao registrar DebugIA: ' + e);
  }
  if (!resp) {
    throw new Error('Resposta vazia da OpenAI.');
  }
  const metadados = resp.metadados || resp.meta || {};
  const empresaResp = coagirNomeEmpresa_(metadados.empresa);
  const empresaBase = coagirNomeEmpresa_(meta.empresa);
  const grupoResp = coagirNomeGrupo_(metadados.grupo);
  const grupoBase = coagirNomeGrupo_(meta.grupo);
  const metaFinal = {
    empresa: empresaResp || empresaBase || '',
    mes: metadados.mes || meta.mes || '',
    ano: metadados.ano || meta.ano || '',
    grupo: grupoResp || grupoBase || '',
    file_id: meta.file_id || meta.fileId || meta.id || ''
  };
  if (t === 'BALANCO') {
    let linhas = resp.linhas || resp.itens || resp.rows || [];
    if (!Array.isArray(linhas)) {
      throw new Error('Resposta da OpenAI (BALANCO) não possui lista "linhas".');
    }
    const sintNomePorCanonical = {};
    SINTETICOS_BALANCO.forEach(function(nomeOriginal) {
      sintNomePorCanonical[canonicalName(nomeOriginal)] = nomeOriginal;
    });
    const sintResp = Array.isArray(resp.sinteticos) ? resp.sinteticos : [];
    const sintMap = {};
    sintResp.forEach(function(s) {
      if (!s) return;
      const nome = (s.conta_sintetica || s.conta || '').trim();
      if (!nome) return;
      const canon = canonicalName(nome);
      if (!sintNomePorCanonical[canon]) return;
      const sa = (s.saldo_anterior != null) ? Number(s.saldo_anterior) : 0;
      const sat = (s.saldo_atual != null) ? Number(s.saldo_atual) : 0;
      if (!sintMap[canon]) sintMap[canon] = { saldo_anterior: 0, saldo_atual: 0 };
      sintMap[canon].saldo_anterior += sa;
      sintMap[canon].saldo_atual += sat;
    });
    const linhasNormalizadas = [];
    const sintIndex = {};
    function somarCampo(target, source, campo) {
      const a = Number(target[campo] || 0);
      const b = Number(source[campo] || 0);
      target[campo] = a + b;
    }
    linhas.forEach(function(l) {
      if (!l) return;
      const contaRaw = l.conta || l.nome || l.descricao || '';
      const contaTrim = String(contaRaw || '').trim();
      if (!contaTrim) return;
      const canon = canonicalName(contaTrim);
      const contaFinal = sintNomePorCanonical[canon] || contaTrim;
      const entry = Object.assign({}, l, { conta: contaFinal });
      if (sintNomePorCanonical[canon]) {
        if (sintIndex.hasOwnProperty(canon)) {
          const existente = linhasNormalizadas[sintIndex[canon]];
          somarCampo(existente, entry, 'saldo_anterior');
          somarCampo(existente, entry, 'saldo_atual');
          if (entry.debito != null) somarCampo(existente, entry, 'debito');
          if (entry.credito != null) somarCampo(existente, entry, 'credito');
          return;
        }
        sintIndex[canon] = linhasNormalizadas.length;
      }
      linhasNormalizadas.push(entry);
    });
    SINTETICOS_BALANCO.forEach(function(nomeOriginal) {
      const canon = canonicalName(nomeOriginal);
      if (sintIndex.hasOwnProperty(canon)) return;
      const agg = sintMap[canon] || { saldo_anterior: 0, saldo_atual: 0 };
      linhasNormalizadas.push({
        conta: nomeOriginal,
        saldo_anterior: agg.saldo_anterior,
        debito: null,
        credito: null,
        saldo_atual: agg.saldo_atual
      });
    });
    removerBalancoPeriodo_(metaFinal.empresa, metaFinal.mes, metaFinal.ano);
    salvarLinhasBalanco_(metaFinal, linhasNormalizadas);
    tentarGerarDreAPartirDoBalanco(metaFinal, conteudo);
  } else {
    let linhas = resp.linhas || resp.categorias || resp.rows || [];
    if (!Array.isArray(linhas)) {
      throw new Error('Resposta da OpenAI (DRE) não possui lista "linhas".');
    }
    const canonicalByNorm = {};
    SINTETICOS_DRE.forEach(function(nomeOriginal) {
      canonicalByNorm[sanitizeName(nomeOriginal)] = nomeOriginal;
    });
    function canonicalPorNorm(normKey, fallback) {
      return canonicalByNorm[normKey] || fallback;
    }
    const catReceitaBruta = canonicalPorNorm('receitabruta', 'Receita Bruta');
    const catDeducoes = canonicalPorNorm('deducoes', 'Deduções (-)');
    const catReceitaLiquida = canonicalPorNorm('receitaliquida', 'Receita Liquida');
    const catCustos = canonicalPorNorm('custos', 'Custos (-)');
    const catLucroBruto = canonicalPorNorm('lucrobruto', 'Lucro Bruto');
    const catDespesas = canonicalPorNorm('despesasoperacionais', 'Despesas Operacionais (-)');
    const catDepreciacao = canonicalPorNorm('depreciacao', 'Depreciacao');
    const catAmortizacao = canonicalPorNorm('amortizacao', 'Amortizacao');
    const catDepAmort = canonicalPorNorm('depreciacaoeamortizacao', 'Depreciacao e Amortizacao');
    const catResultadoOperacional = canonicalPorNorm('resultadooperacional', 'Resultado Operacional');
    const catDistribuicao = canonicalPorNorm('distribuicaoderesultados', 'Distribuicao de Resultados (-)');
    const catLucroLiquido = canonicalPorNorm('lucroouprejuizodoexercicio', 'Lucro ou Prejuizo do Exercicio');
    const aliases = {};
    function alias(canonical, arr) {
      arr.forEach(function(nome) {
        aliases[sanitizeName(nome)] = canonical;
      });
    }
    alias(catReceitaBruta, ['Receita Bruta', 'Receitas', 'Receitas Operacionais']);
    alias(catDeducoes, ['Deduções', 'Deduções (-)', 'Total Deduções']);
    alias(catReceitaLiquida, ['Receita Liquida', 'Receita Líquida']);
    alias(catCustos, ['Custos', 'Custos (-)', 'Custos Operacionais']);
    alias(catLucroBruto, ['Lucro Bruto']);
    alias(catDespesas, ['Despesas Operacionais', 'Despesas Operacionais (-)', 'Despesas']);
    alias(catDepreciacao, ['Depreciacao']);
    alias(catAmortizacao, ['Amortizacao']);
    alias(catDepAmort, ['Depreciacao e Amortizacao', 'Depreciacao/Amortizacao']);
    alias(catResultadoOperacional, ['Resultado Operacional', 'Lucro Operacional']);
    alias(catDistribuicao, ['Distribuicao de Resultados', 'Distribuicao de Resultados (-)']);
    alias(catLucroLiquido, ['Lucro ou Prejuizo do Exercicio', 'Lucro Liquido']);
    function resolverContaDre(nome) {
      const norm = sanitizeName(nome || '');
      if (!norm) return null;
      if (canonicalByNorm[norm]) return canonicalByNorm[norm];
      if (aliases[norm]) return aliases[norm];
      if (norm.indexOf('receitabruta') !== -1 || norm === 'receitas' || norm.indexOf('receitasoperacionais') !== -1) return catReceitaBruta;
      if (norm.indexOf('deduco') !== -1) return catDeducoes;
      if (norm.indexOf('receitaliquida') !== -1) return catReceitaLiquida;
      if (norm.indexOf('custo') !== -1) return catCustos;
      if (norm.indexOf('lucrobruto') !== -1) return catLucroBruto;
      if (norm.indexOf('despesa') !== -1) return catDespesas;
      if (norm === 'depreciacao') return catDepreciacao;
      if (norm === 'amortizacao') return catAmortizacao;
      if (norm.indexOf('depreciacaoeamortizacao') !== -1 || (norm.indexOf('depreciacao') !== -1 && norm.indexOf('amortizacao') !== -1)) return catDepAmort;
      if (norm.indexOf('resultadooperacional') !== -1 || norm.indexOf('lucrooperacional') !== -1) return catResultadoOperacional;
      if (norm.indexOf('distribuicaoderesultados') !== -1) return catDistribuicao;
      if (norm.indexOf('lucroouprejuizodoexercicio') !== -1 || norm.indexOf('lucroliquido') !== -1) return catLucroLiquido;
      return null;
    }
    const mapa = {};
    linhas.forEach(function(l) {
      if (!l) return;
      const nome = (l.conta || l.categoria || '').trim();
      if (!nome) return;
      const contaCanonica = resolverContaDre(nome);
      if (!contaCanonica) return;
      const key = contaCanonica.toLowerCase();
      const va = (l.valor_atual != null) ? Number(l.valor_atual) : 0;
      const van = (l.valor_anterior != null) ? Number(l.valor_anterior) : 0;
      if (!mapa[key]) {
        mapa[key] = { valor_atual: 0, valor_anterior: 0 };
      }
      mapa[key].valor_atual    += va;
      mapa[key].valor_anterior += van;
    });
    const linhasCanonicas = [];
    SINTETICOS_DRE.forEach(function(nomeOriginal) {
      const key = nomeOriginal.toLowerCase();
      const agg = mapa[key] || { valor_atual: 0, valor_anterior: 0 };
      linhasCanonicas.push({
        conta: nomeOriginal,
        valor_atual: agg.valor_atual,
        valor_anterior: agg.valor_anterior
      });
    });
    removerDrePeriodo_(metaFinal.empresa, metaFinal.mes, metaFinal.ano);
    salvarLinhasDre_(metaFinal, linhasCanonicas);
  }
  // Devolve o metadado efetivamente usado para que a aba Processamento seja sincronizada com BalancoBase/DreBase
  return metaFinal;
}

function registrarDebugIa_(tipo, metaBase, prompt, respObj) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('DebugIA');
  if (!sheet) {
    sheet = ss.insertSheet('DebugIA');
    sheet.appendRow(['timestamp', 'tipo', 'empresa_base', 'mes_base', 'ano_base', 'prompt', 'resposta_json']);
  }
  let respostaStr = '';
  try {
    respostaStr = JSON.stringify(respObj);
  } catch (e) {
    respostaStr = String(respObj);
  }
  sheet.appendRow([
    new Date(),
    tipo || '',
    metaBase ? coagirNomeEmpresa_(metaBase.empresa || '') : '',
    metaBase ? (metaBase.mes || '') : '',
    metaBase ? (metaBase.ano || '') : '',
    prompt || '',
    respostaStr
  ]);
}
