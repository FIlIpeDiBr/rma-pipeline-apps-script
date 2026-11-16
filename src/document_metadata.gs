/**
 * Heurísticas para identificar empresa, período e tipo do documento a partir do nome do arquivo e do texto.
 */

/**
 * Extrai metadados do nome de um arquivo: empresa, período e tipo.
 * Reconhece o período como aaaa-mm, aaaamm, mm.aa ou mm-aaaa, e o tipo por
 * palavras como "balancete", "balanço", "DRE" ou "demonstração". O que sobra
 * do nome (sem datas e sem as palavras de tipo) vira o nome da empresa.
 *
 * @param {string} name Nome completo do arquivo
 * @return {{empresa:string, mes:(string|null), ano:(string|null), tipo:string}}
 */
function parseFileName(name) {
  const baseName = name.replace(/\.[^\.]+$/, '');
  const lower = baseName.toLowerCase();
  let mes = null;
  let ano = null;
  // Padrão aaaa-mm ou aaaamm
  const dateMatch = lower.match(/(20\d{2})[-_]?([01]\d)/);
  if (dateMatch) {
    ano = dateMatch[1];
    mes = dateMatch[2];
  } else {
    // Padrão mm.yy ou mm-yyyy (ex.: 07.25 ou 07-2025)
    const shortMatch = lower.match(/([01]?\d)[\.\-_]([0-9]{2,4})/);
    if (shortMatch) {
      const m = parseInt(shortMatch[1], 10);
      let y = shortMatch[2];
      if (y.length === 2) {
        const yy = parseInt(y, 10);
        y = (yy >= 0 && yy <= 99) ? String(2000 + yy) : y;
      }
      if (!isNaN(m) && m >= 1 && m <= 12) {
        mes = String(m).padStart(2, '0');
        ano = y;
      }
    }
  }
  // Determina tipo
  let tipo = 'OUTRO';
  if (lower.indexOf('balan') !== -1 || lower.indexOf('balanço') !== -1 || lower.indexOf('balanco') !== -1) {
    tipo = 'BALANCO';
  } else if (lower.indexOf('dre') !== -1 || lower.indexOf('resultado') !== -1 || lower.indexOf('demonstracao') !== -1 || lower.indexOf('demonstração') !== -1) {
    tipo = 'DRE';
  }
  // Extrai tokens que compõem o nome da empresa
  const tokens = baseName.split(/[_\-\s]+/);
  const companyTokens = [];
  tokens.forEach(tok => {
    const t = tok.toLowerCase();
    if (t.match(/^20\d{2}/)) return;
    if (t.match(/^(0?\d{1,2})$/)) return;
    if (['balanco', 'balanço', 'dre', 'rma', 'final'].indexOf(t) !== -1) return;
    companyTokens.push(tok);
  });
  const empresa = companyTokens.join(' ').trim() || baseName;
  return { empresa: empresa, mes: mes, ano: ano, tipo: tipo };
}

/**
 * Tenta inferir se o texto extraído de um documento é de balancete
 * (balanco) ou de DRE. Utiliza heurísticas simples baseadas em
 * palavras‑chave típicas de cada tipo.
 *
 * @param {string} text Conteúdo do documento
 * @return {string} 'BALANCO' ou 'DRE'
 */
function inferTipoFromConteudo(text) {
  const lower = String(text || '').toLowerCase();
  const dreMatches = lower.match(/receita|despesa|lucro|resultado|dre/g) || [];
  const balMatches = lower.match(/ativo|passivo|patrimonio|patrim[oô]nio|balan/g) || [];
  return balMatches.length >= dreMatches.length ? 'BALANCO' : 'DRE';
}

/**
 * Extrai heuristicamente o nome da empresa, o mês e o ano a partir de
 * texto de relatório contábil. Caso a IA falhe na extração
 * estruturada, esta função usa expressões regulares e padrões
 * simples como “Empresa:”, datas no formato dd/mm/aaaa e outros
 * indicativos para tentar obter essas informações.
 *
 * @param {string} text Texto completo do documento
 * @return {{empresa:(string|null), mes:(string|null), ano:(string|null)}}
 */
function extrairEmpresaMesAnoDoTexto(text) {
  const content = String(text || '');
  let empresa = null;
  let mes = null;
  let ano = null;
  function _limparEmpresa(cand) {
    let out = String(cand || '').trim();
    if (!out) return '';
    out = out.replace(/^Empresa\s*:?\s*/i, '').trim();
    out = out.replace(/\bFolha\b[: ]?.*$/i, '').trim();
    out = out.replace(/\bP[aá]gina\b[: ]?.*$/i, '').trim();
    return out.trim();
  }
  // Heurísticas baseadas em regex para empresa
  try {
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');
    for (let i = 0; i < lines.length; i++) {
      if (/C\.?.?N\.?.?P\.?.?J\.?/i.test(lines[i])) {
        for (let j = i - 1; j >= 0; j--) {
          let cand = lines[j];
          if (!cand) continue;
          if (/^CONSOLIDADO$/i.test(cand)) continue;
          if (/^Per[ií]odo/i.test(cand)) continue;
          if (/Empresa\s*:?.*Folha/i.test(cand)) continue;
          if (/^Empresa\s*:/i.test(cand)) {
            cand = cand.replace(/^Empresa\s*:?.?/i, '').trim();
          }
          cand = cand.replace(/\bFolha\b[: ]*$/i, '').trim();
          cand = cand.replace(/\bP[aá]gina\b[: ]?.*$/i, '').trim();
          if (cand) {
            empresa = cand;
            break;
          }
        }
        if (empresa) break;
      }
    }
    if (!empresa) {
      const matchEmp = content.match(/Empresa\s*:?.?([^\n]+)/i);
      if (matchEmp && matchEmp[1]) {
        let cand = matchEmp[1].trim();
        cand = cand.replace(/\bFolha\b[: ]*$/i, '').trim();
        cand = cand.replace(/\bP[aá]gina\b[: ]?.*$/i, '').trim();
        if (cand) empresa = cand;
      }
    }
    // Mês e ano a partir de “Período: dd/mm/aaaa - dd/mm/aaaa”
    if (!mes || !ano) {
      const periodoMatch = content.match(/Per[ií]odo[\s\S]{0,80}?(\d{1,2})\/(\d{1,2})\/(\d{4})[\s\S]{0,40}?(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
      if (periodoMatch) {
        mes = mes || String(periodoMatch[5]).padStart(2, '0');
        ano = ano || String(periodoMatch[6]);
      }
    }
    // Período simples como dd/mm/aaaa
    if (!mes || !ano) {
      const periodoSimples = content.match(/(?:Per[ií]odo|Referente a|em)\s*[:\-]?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
      if (periodoSimples) {
        mes = mes || String(periodoSimples[2]).padStart(2, '0');
        ano = ano || String(periodoSimples[3]);
      }
    }
    // Data mais recente no texto
    if (!mes || !ano) {
      const re = /(\d{1,2})\/(\d{1,2})\/(\d{4})/g;
      let m;
      let best = null;
      while ((m = re.exec(content)) !== null) {
        const d = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10);
        const y = parseInt(m[3], 10);
        if (!best || y > best.y || (y === best.y && mo > best.mo) || (y === best.y && mo === best.mo && d > best.d)) {
          best = { d: d, mo: mo, y: y };
        }
      }
      if (best) {
        mes = mes || String(best.mo).padStart(2, '0');
        ano = ano || String(best.y);
      }
    }
    // Datas ISO yyyy-mm-dd ou yyyy/mm/dd (pega a mais recente)
    if (!mes || !ano) {
      const reIso = /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/g;
      let mIso;
      let bestIso = null;
      while ((mIso = reIso.exec(content)) !== null) {
        const y = parseInt(mIso[1], 10);
        const mo = parseInt(mIso[2], 10);
        const d = parseInt(mIso[3], 10);
        if (!bestIso || y > bestIso.y || (y === bestIso.y && mo > bestIso.mo) || (y === bestIso.y && mo === bestIso.mo && d > bestIso.d)) {
          bestIso = { d: d, mo: mo, y: y };
        }
      }
      if (bestIso) {
        mes = mes || String(bestIso.mo).padStart(2, '0');
        ano = ano || String(bestIso.y);
      }
    }
    // Formato mm/aaaa simples
    if (!mes || !ano) {
      const mesAnoMatch = content.match(/\b(\d{1,2})\s*\/\s*(\d{4})/);
      if (mesAnoMatch) {
        mes = mes || String(mesAnoMatch[1]).padStart(2, '0');
        ano = ano || String(mesAnoMatch[2]);
      }
    }
    if (empresa) {
      const empresaNorm = sanitizeName(empresa);
      const pareceTitulo =
        empresaNorm === 'dre' ||
        empresaNorm === 'balanco' ||
        empresaNorm === 'balancopatrimonial' ||
        empresaNorm.indexOf('demonstracaodoresultadodoexercicio') !== -1 ||
        empresaNorm.indexOf('demonstracaodoresultado') !== -1;
      if (empresa.length < 3 || /^\d+$/.test(empresa) || pareceTitulo) {
        empresa = null;
      }
    }
  } catch (e) {
    // Fallback silencioso
  }
  return { empresa: empresa, mes: mes, ano: ano };
}
