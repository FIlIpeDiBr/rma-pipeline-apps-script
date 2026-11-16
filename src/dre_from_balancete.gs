/**
 * Deriva uma DRE sintética a partir do balancete quando o cliente não envia a DRE.
 */

function tentarGerarDreAPartirDoBalanco(meta, conteudoFonte) {
  function nomeCategoriaDre(norm, fallback) {
    const lista = getSinteticosDre ? getSinteticosDre() : [];
    for (let i = 0; i < lista.length; i++) {
      const nome = String(lista[i] || '');
      if (sanitizeName(nome) === norm) return nome;
    }
    return fallback;
  }

  function extrairClasseConta(conta) {
    const texto = String(conta || '').trim();
    if (!texto) return '';
    const m = texto.match(/^(\d)/);
    return m && m[1] ? m[1] : '';
  }

  function marcadorKeywordResultado(norm) {
    if (!norm) return null;
    if (
      norm.indexOf('devolucao') !== -1 ||
      norm.indexOf('deducao') !== -1 ||
      norm.indexOf('impostofaturado') !== -1 ||
      norm.indexOf('icms') !== -1 ||
      norm.indexOf('ipi') !== -1 ||
      norm.indexOf('pis') !== -1 ||
      norm.indexOf('cofins') !== -1
    ) return 'deducao';
    if (
      norm.indexOf('receita') !== -1 ||
      norm.indexOf('renda') !== -1 ||
      norm.indexOf('venda') !== -1 ||
      norm.indexOf('faturamento') !== -1
    ) return 'receita';
    if (norm.indexOf('custo') !== -1) return 'custo';
    if (norm.indexOf('depreciacao') !== -1 || norm.indexOf('amortizacao') !== -1) return 'despesa';
    if (norm.indexOf('juro') !== -1 || norm.indexOf('variacaocambial') !== -1) return 'despesa';
    if (norm.indexOf('despesa') !== -1 || norm.indexOf('desp') !== -1) {
      if (norm.indexOf('antecipad') !== -1 || norm.indexOf('prepag') !== -1) return null;
      return 'despesa';
    }
    return null;
  }

  function inferirMapaClasseResultado(linhas) {
    const stats = {
      '3': { receita: 0, despesa: 0 },
      '4': { receita: 0, despesa: 0 },
      '5': { receita: 0, despesa: 0 }
    };
    (linhas || []).forEach(function(l) {
      if (!l) return;
      const conta = String(l.conta || '').trim();
      if (!conta) return;
      const classe = extrairClasseConta(conta);
      if (!stats[classe]) return;
      const marca = marcadorKeywordResultado(sanitizeName(conta));
      if (marca === 'receita') stats[classe].receita++;
      if (marca === 'despesa' || marca === 'custo' || marca === 'deducao') stats[classe].despesa++;
    });

    // Padrao classico: 3 receitas, 4 despesas, 5 despesas.
    const mapa = { '3': 'receita', '4': 'despesa', '5': 'despesa' };
    ['3', '4', '5'].forEach(function(classe) {
      const s = stats[classe];
      if (!s) return;
      if (s.receita > s.despesa && s.receita > 0) {
        mapa[classe] = 'receita';
      } else if (s.despesa > s.receita && s.despesa > 0) {
        mapa[classe] = 'despesa';
      }
    });
    return mapa;
  }

  function classificarContaResultado(conta, mapaClasse) {
    const texto = String(conta || '').trim();
    if (!texto) return null;
    const norm = sanitizeName(texto);
    if (!norm) return null;

    // Palavra-chave tem prioridade sobre a classe numerica.
    const marca = marcadorKeywordResultado(norm);
    if (marca) return marca;

    const primeiraClasse = extrairClasseConta(texto);
    if (mapaClasse && mapaClasse[primeiraClasse]) return mapaClasse[primeiraClasse];
    return null;
  }

  function numeroContabil_(raw) {
    const txt = String(raw || '').trim();
    if (!txt) return 0;
    const neg = /^\(.*\)$/.test(txt) || /^-/.test(txt);
    const limpo = txt
      .replace(/[()]/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^\d\.\-]/g, '');
    const n = Number(limpo);
    if (!isFinite(n)) return 0;
    return neg ? -Math.abs(n) : n;
  }

  function extrairResumoResultadoDoTexto_(texto) {
    const src = String(texto || '');
    if (!src) return null;
    function firstValue(regex) {
      const m = src.match(regex);
      if (!m || !m[1]) return null;
      return numeroContabil_(m[1]);
    }
    const receita = firstValue(/\b4(?:\.\d+)?\s+RECEITAS(?:\s+OPERACIONAIS)?\s+(\(?\d{1,3}(?:\.\d{3})*,\d{2}\)?)/i);
    const custosDespesas = firstValue(/\b5(?:\.\d+)?\s+(?:CUSTOS(?:\s+E\s+DESPESAS)?|DESPESAS(?:\s+OPERACIONAIS)?)\s+(\(?\d{1,3}(?:\.\d{3})*,\d{2}\)?)/i);
    const lucro = firstValue(/\b8(?:\.\d+)?\s+RESULTADO\s+LIQUIDO\s+DO\s+EXERCICIO\s+(\(?\d{1,3}(?:\.\d{3})*,\d{2}\)?)/i);
    if (receita == null && custosDespesas == null && lucro == null) return null;
    return {
      receitasAtual: Math.abs(receita || 0),
      deducoesAtual: 0,
      custosAtual: Math.abs(custosDespesas || 0),
      despesasAtual: 0,
      lucroAtual: lucro != null ? lucro : (Math.abs(receita || 0) - Math.abs(custosDespesas || 0))
    };
  }

  const empresa = coagirNomeEmpresa_(meta.empresa || '');
  const mes = parseInt(meta.mes, 10);
  const ano = parseInt(meta.ano, 10);
  const fileId = meta.file_id || meta.fileId || meta.id || '';
  if (!empresa || !mes || !ano) {
    Logger.log('DRE sintetica ignorada por metadados incompletos. empresa=' + empresa + ', mes=' + mes + ', ano=' + ano);
    return false;
  }
  if (drePeriodoExiste(empresa, mes, ano)) {
    const vinculadas = vincularFileIdDreSemId_(empresa, mes, ano, fileId);
    if (vinculadas > 0) {
      Logger.log('DRE existente recebeu file_id em ' + vinculadas + ' linha(s) para ' + empresa + ' ' + mes + '/' + ano);
    }
    Logger.log('DRE sintetica nao gerada porque ja existe DRE para ' + empresa + ' ' + mes + '/' + ano);
    return false;
  }
  let bal;
  try {
    bal = carregarBalancoEmpresaPeriodo(empresa, mes, ano);
  } catch (e) {
    Logger.log('Nao foi possivel carregar balanco para gerar DRE: ' + e);
    return false;
  }
  const linhas = (bal.detalhados || []).concat(bal.sinteticos || []);
  if (!linhas.length) {
    Logger.log('DRE sintetica ignorada: balanco sem linhas para ' + empresa + ' ' + mes + '/' + ano);
    return false;
  }
  const mapaClasse = inferirMapaClasseResultado(linhas);
  let receitasAtual = 0, receitasAnterior = 0;
  let deducoesAtual = 0, deducoesAnterior = 0;
  let custosAtual = 0, custosAnterior = 0;
  let despesasAtual = 0, despesasAnterior = 0;
  let contasClassificadas = 0;
  linhas.forEach(function(l) {
    if (!l) return;
    const conta = String(l.conta || '').trim();
    if (!conta) return;
    const tipo = classificarContaResultado(conta, mapaClasse);
    if (!tipo) return;
    const valAtu = Number(l.saldoAtual || l.saldo_atual || 0);
    const valAnt = Number(l.saldoAnterior || l.saldo_anterior || 0);
    if (tipo === 'receita') {
      receitasAtual += valAtu;
      receitasAnterior += valAnt;
      contasClassificadas++;
    } else if (tipo === 'deducao') {
      deducoesAtual += Math.abs(valAtu);
      deducoesAnterior += Math.abs(valAnt);
      contasClassificadas++;
    } else if (tipo === 'custo') {
      custosAtual += Math.abs(valAtu);
      custosAnterior += Math.abs(valAnt);
      contasClassificadas++;
    } else if (tipo === 'despesa') {
      despesasAtual += Math.abs(valAtu);
      despesasAnterior += Math.abs(valAnt);
      contasClassificadas++;
    }
  });

  if (contasClassificadas === 0) {
    const resumoTexto = extrairResumoResultadoDoTexto_(conteudoFonte);
    if (resumoTexto) {
      receitasAtual = resumoTexto.receitasAtual;
      deducoesAtual = resumoTexto.deducoesAtual;
      custosAtual = resumoTexto.custosAtual;
      despesasAtual = resumoTexto.despesasAtual;
      Logger.log(
        'DRE sintetica: fallback por texto bruto aplicado para ' + empresa + ' ' + mes + '/' + ano +
        ' (IA sem contas de resultado classificaveis).'
      );
    }
  }

  const catReceitaBruta = nomeCategoriaDre('receitabruta', 'Receita Bruta');
  const catDeducoes = nomeCategoriaDre('deducoes', 'Deduções (-)');
  const catReceitaLiquida = nomeCategoriaDre('receitaliquida', 'Receita Liquida');
  const catCustos = nomeCategoriaDre('custos', 'Custos (-)');
  const catLucroBruto = nomeCategoriaDre('lucrobruto', 'Lucro Bruto');
  const catDespesas = nomeCategoriaDre('despesasoperacionais', 'Despesas Operacionais (-)');
  const catResultadoOperacional = nomeCategoriaDre('resultadooperacional', 'Resultado Operacional');
  const catDistribuicao = nomeCategoriaDre('distribuicaoderesultados', 'Distribuicao de Resultados (-)');
  const catLucroExercicio = nomeCategoriaDre('lucroouprejuizodoexercicio', 'Lucro ou Prejuizo do Exercicio');

  const receitaLiquidaAtual = receitasAtual - deducoesAtual;
  const receitaLiquidaAnterior = receitasAnterior - deducoesAnterior;
  const lucroBrutoAtual = receitaLiquidaAtual - custosAtual;
  const lucroBrutoAnterior = receitaLiquidaAnterior - custosAnterior;
  const resultadoOperacionalAtual = lucroBrutoAtual - despesasAtual;
  const resultadoOperacionalAnterior = lucroBrutoAnterior - despesasAnterior;
  const distribuicaoAtual = 0;
  const distribuicaoAnterior = 0;
  const lucroExercicioAtual = resultadoOperacionalAtual - distribuicaoAtual;
  const lucroExercicioAnterior = resultadoOperacionalAnterior - distribuicaoAnterior;

  const mapDre = {};
  function setDre(nome, atual, anterior) {
    mapDre[String(nome).toLowerCase()] = { valor_atual: atual, valor_anterior: anterior };
  }
  setDre(catReceitaBruta, receitasAtual, receitasAnterior);
  setDre(catDeducoes, deducoesAtual, deducoesAnterior);
  setDre(catReceitaLiquida, receitaLiquidaAtual, receitaLiquidaAnterior);
  setDre(catCustos, custosAtual, custosAnterior);
  setDre(catLucroBruto, lucroBrutoAtual, lucroBrutoAnterior);
  setDre(catDespesas, despesasAtual, despesasAnterior);
  setDre(catResultadoOperacional, resultadoOperacionalAtual, resultadoOperacionalAnterior);
  setDre(catDistribuicao, distribuicaoAtual, distribuicaoAnterior);
  setDre(catLucroExercicio, lucroExercicioAtual, lucroExercicioAnterior);
  const linhasCanonicas = [];
  getSinteticosDre().forEach(function(nome) {
    const agg = mapDre[String(nome).toLowerCase()] || { valor_atual: 0, valor_anterior: 0 };
    linhasCanonicas.push({ conta: nome, valor_atual: agg.valor_atual, valor_anterior: agg.valor_anterior });
  });
  const temMovimento = linhasCanonicas.some(function(l) {
    return Number(l.valor_atual || 0) !== 0 || Number(l.valor_anterior || 0) !== 0;
  });
  if (!temMovimento) {
    Logger.log(
      'DRE sintetica ignorada por falta de movimento para ' + empresa + ' ' + mes + '/' + ano +
      '. Contas classificadas: ' + contasClassificadas
    );
    return false;
  }
  salvarLinhasDre_({
    empresa: empresa,
    mes: mes,
    ano: ano,
    file_id: fileId
  }, linhasCanonicas);
  Logger.log('DRE sintetica gerada a partir do balanco para ' + empresa + ' ' + mes + '/' + ano);
  return true;
}
