/**
 * Blocos repetidos por integrante nos relatórios de grupo.
 */

/**
 * Preenche um bloco de elementos do corpo do documento com dados de um
 * integrante. Substitui tags {{empresa}}, {{mes}}, {{ano}}, {{grupo}}
 * e insere tabelas de balancete e DRE do integrante.
 *
 * @param {GoogleAppsScript.Document.Body} body Corpo do documento
 * @param {number} startIdx Índice inicial do bloco
 * @param {number} endIdx Índice final do bloco
 * @param {Object} intg Objeto do integrante (ou consolidado)
 * @param {string} monthName Nome do mês
 * @param {string} ano Ano
 * @param {string} grupo Nome do grupo
 */
function preencherBlocoGrupo(body, startIdx, endIdx, intg, monthName, ano, grupo, scalars, integrantesGrupo) {
  const dataContext = {
    balancobase: intg.balanco || { detalhados: [], sinteticos: [] },
    drebase: { linhas: intg.dre || [] }
  };
  const scalarKeys = Object.keys(scalars || {});
  let i = startIdx;
  while (i <= endIdx) {
    const child = body.getChild(i);
    const type = child.getType();
    if (type === DocumentApp.ElementType.PARAGRAPH) {
      const par = child.asParagraph();
      const textElement = par.editAsText();
      if (textElement) {
        scalarKeys.forEach(function(key) {
          const token = '{{' + key + '}}';
          textElement.replaceText(token, scalars[key]);
        });
        if (typeof _substituirPeriodoNoText_ === 'function') {
          _substituirPeriodoNoText_(textElement, scalars);
        }
      }
      i++;
    } else if (type === DocumentApp.ElementType.TABLE) {
      const table = child.asTable();
      const numRows = table.getNumRows();
      for (let r = 0; r < numRows; r++) {
        const row = table.getRow(r);
        const numCells = row.getNumCells();
        for (let c = 0; c < numCells; c++) {
          const cell = row.getCell(c);
          const text = cell.editAsText();
          scalarKeys.forEach(function(key) {
            const pattern = '{{' + key + '}}';
            text.replaceText(pattern, scalars[key]);
          });
          if (typeof _substituirPeriodoNoText_ === 'function') {
            _substituirPeriodoNoText_(text, scalars);
          }
        }
      }
      i++;
    } else {
      i++;
    }
  }
  // Processa os novos blocos de tabela dentro do intervalo do integrante
  processarMarcadoresTabela(body, dataContext, scalars, startIdx, endIdx);
  // Graficos e IA serao processados em uma etapa posterior.
}

/**
 * Replica o bloco delimitado por <<(...)>> no documento para cada
 * integrante do grupo e opcionalmente para o consolidado.
 * O texto entre parênteses no marcador de início define flags
 * separadas por vírgulas. A flag "consolidar" inclui o
 * consolidado ao final. Sem essa flag, o consolidado não é gerado.
 *
 * @param {GoogleAppsScript.Document.Body} body Corpo do documento
 * @param {Object} dadosGrupo Objeto retornado por montarDadosGrupo
 * @param {string} monthName Nome do mês
 * @param {string|number} ano Ano
 * @param {string} grupo Nome do grupo
 */
function replicarBlocoGrupo(body, dadosGrupo, monthName, ano, grupo, scalarsBase, docIdForChunks) {
  // Procura blocos até que não haja mais marcadores
  while (true) {
    const numChildren = body.getNumChildren();
    let startIdx = -1;
      let endIdx = -1;
      let flags = '';
      // Localiza início e fim do bloco
      for (let i = 0; i < numChildren; i++) {
        const child = body.getChild(i);
        if (child.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;
        const text = child.asParagraph().getText() || '';
        const startPos = text.indexOf('<<(');
        if (startPos !== -1 && startIdx === -1) {
          // Extrai flags entre <<( e )>> se presentes
          const endPosFlags = text.indexOf(') >>');
          const endPosFlagsNoSpace = text.indexOf(')>>');
          let endPos = -1;
          if (endPosFlags !== -1) {
            endPos = endPosFlags;
          } else if (endPosFlagsNoSpace !== -1) {
            endPos = endPosFlagsNoSpace;
          }
          if (endPos !== -1) {
            flags = text.substring(startPos + 3, endPos).trim();
          }
          startIdx = i;
          continue;
        }
        // Detecta fim do bloco com )>>
        if (text.indexOf(')>>') !== -1 && startIdx !== -1) {
          endIdx = i;
          break;
        }
      }
      // Se não encontrou um bloco válido, sai do loop
      if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) break;
      // Determina os integrantes a replicar
      let incluirConsolidado = true; // por padrão inclui consolidado
      if (flags) {
        const parts = flags.split(',');
        parts.forEach(function(p) {
          const t = String(p).trim().toLowerCase();
          const normalized = t.replace(/\s+/g, '');
          if (normalized === 'consolidar' || normalized === 'consolidado') incluirConsolidado = true;
          if (normalized === 'semconsolidado' || normalized === 'semconsolidar' || normalized === 'naoconsolidar' || normalized === 'nao-consolidar') {
            incluirConsolidado = false;
          }
        });
      }
      const lista = dadosGrupo.integrantes.slice();
      if (incluirConsolidado && dadosGrupo.consolidado) {
        lista.push(dadosGrupo.consolidado);
      }
      // Caso o marcador de início e fim estejam no mesmo parágrafo,
      // replica apenas esse parágrafo para cada integrante.
      if (startIdx === endIdx) {
        const par = body.getChild(startIdx).asParagraph();
        const parText = par.getText() || '';
        const cleaned = parText
          .replace(/<<[^)]*\)/, '')
          .replace(/\)\s*>>/, '')
          .trim();
        if (lista.length === 1) {
          const scalars = Object.assign({}, scalarsBase || {}, {
            empresa: lista[0].isConsolidado ? ('Consolidado - ' + String(grupo || '')) : lista[0].nome,
            mes: monthName,
            ano: String(ano),
            grupo: String(grupo || '')
          });
          const textEl = par.editAsText();
          textEl.setText(substituirPlaceholdersSimples(cleaned, scalars));
        } else {
          let insertIdx = startIdx;
          // Se houver mais elementos no body, removemos o original; senão, apenas limpamos.
          if (body.getNumChildren() > 1) {
            body.removeChild(par);
          } else {
            par.editAsText().setText('');
          }
          lista.forEach(function(intg, idxInt) {
            const scalars = Object.assign({}, scalarsBase || {}, {
              empresa: intg.isConsolidado ? ('Consolidado - ' + String(grupo || '')) : intg.nome,
              mes: monthName,
              ano: String(ano),
              grupo: String(grupo || '')
            });
            const newPar = body.insertParagraph(insertIdx, cleaned);
            newPar.editAsText().setText(substituirPlaceholdersSimples(cleaned, scalars));
            insertIdx++;
            if (idxInt < lista.length - 1) {
              body.insertParagraph(insertIdx, '');
              insertIdx++;
            }
          });
        }
        continue;
      }
    // Copia os elementos do padrão
    const patternElements = [];
    for (let i = startIdx + 1; i < endIdx; i++) {
      patternElements.push(body.getChild(i).copy());
    }
    // Usa o parágrafo do marcador inicial como âncora (não removemos, apenas limpamos)
    const anchorPar = body.getChild(startIdx).asParagraph();
    anchorPar.clear();
    // Remove os elementos entre startIdx+1 e endIdx (inclusive) garantindo ao menos o anchor
    for (let i = endIdx; i > startIdx; i--) {
      body.removeChild(body.getChild(i));
    }
    // Reposiciona startIdx se ficou além do final após as remoções
    if (startIdx > body.getNumChildren()) startIdx = body.getNumChildren();
    // Insere clones para cada integrante, clampando inserção ao final caso o bloco tenha sido removido.
    const anchorIndex = startIdx;
    let insertIdx = startIdx;
    const CHUNK_SAVE_EVERY = 1; // salva a cada integrante para evitar excesso de alterações
    lista.forEach(function(intg, idxInt) {
      const blocoStart = Math.min(insertIdx, body.getNumChildren());
      patternElements.forEach(function(modelo) {
        const tipo = modelo.getType();
        const safeIdx = Math.min(insertIdx, body.getNumChildren());
        if (tipo === DocumentApp.ElementType.PARAGRAPH) {
          body.insertParagraph(safeIdx, modelo.asParagraph().copy());
        } else if (tipo === DocumentApp.ElementType.TABLE) {
          body.insertTable(safeIdx, modelo.asTable().copy());
        } else {
          const texto = (modelo.getText && modelo.getText()) ? modelo.getText() : '';
          body.insertParagraph(safeIdx, texto);
        }
        insertIdx++;
      });
      // Sentinela para delimitar o fim do bloco inserido
      const sentinel = body.insertParagraph(insertIdx, '[[[SENTINEL_RMA_BLOCK]]]');
      const sentinelIdxInicial = body.getChildIndex(sentinel);
      const blocoEnd = sentinelIdxInicial - 1;
      if (blocoStart >= 0 && blocoEnd >= blocoStart) {
        const scalars = Object.assign({}, scalarsBase || {}, {
          empresa: intg.isConsolidado ? ('Consolidado - ' + String(grupo || '')) : intg.nome,
          mes: monthName,
          ano: String(ano),
          grupo: String(grupo || '')
        });
        preencherBlocoGrupo(body, blocoStart, blocoEnd, intg, monthName, ano, grupo, scalars, dadosGrupo.integrantes);
      }
      // Reposiciona inserções após o sentinela (considerando inserções internas)
      const sentinelIdx = body.getChildIndex(sentinel);
      insertIdx = sentinelIdx + 1;
      try {
        body.removeChild(sentinel);
      } catch (err) {
        // Nao e possivel remover o ultimo paragrafo de uma secao.
        sentinel.asParagraph().clear();
      }
      // Adiciona linha em branco entre blocos
      if (idxInt < lista.length - 1) {
        const safeBreakIdx = Math.min(insertIdx, body.getNumChildren());
        body.insertParagraph(safeBreakIdx, '');
        insertIdx = safeBreakIdx + 1;
      }
      // Salva em lotes para evitar excesso de operações no doc
      if (docIdForChunks && ((idxInt + 1) % CHUNK_SAVE_EVERY === 0)) {
        const d = DocumentApp.openById(docIdForChunks);
        d.saveAndClose();
        const reopened = DocumentApp.openById(docIdForChunks);
        body = reopened.getBody();
        // Reposiciona inserção com base no anchor original
        startIdx = Math.min(anchorIndex, body.getNumChildren());
        insertIdx = Math.min(startIdx + (insertIdx - anchorIndex), body.getNumChildren());
      }
    });
  }
}
