/**
 * Prompts de extração de balancete e DRE.
 */

// Mensagem de sistema comum a todas as chamadas de extração.
const PROMPT_SISTEMA_EXTRACAO = 'Voce e um especialista contabil que extrai tabelas de balancetes e DREs. Devolva apenas JSON valido e sem comentarios.';

/**
 * Monta o prompt para extração de balancetes. Mantido como função
 * separada para manter a fila de extração mais legível.
 *
 * @param {string} conteudo Texto completo do balancete
 * @return {string} Prompt a ser enviado à IA
 */
function buildPromptBalanco(conteudo) {
  return [
    'A seguir está o texto completo de um balancete contábil (balancete de verificação ou balancete analítico).',
    'Extraia dele as informações contábeis em formato JSON. O JSON deve ter EXATAMENTE a estrutura:',
    '',
    '{',
    '  "metadados": {',
    '    "empresa": "INSIRA AQUI O NOME DA EMPRESA",',
    '    "mes": m,',
    '    "ano": yyyy',
    '  },',
    '  "linhas": [',
    '    {',
    '      "conta": "INSIRA AQUI O NOME DA CONTA",',
    '      "saldo_anterior": x,',
    '      "debito": x,',
    '      "credito": x,',
    '      "saldo_atual": x',
    '    }',
    '  ],',
    '  "sinteticos": [',
    '    {',
    '      "conta_sintetica": "ATIVO TOTAL",',
    '      "saldo_anterior": x,',
    '      "saldo_atual": x',
    '    }',
    '  ]',
    '}',
    '',
    'Regras para "metadados" e "linhas":',
    '- "empresa" deve ser a razão social correta do cliente, não o nome do sistema.',
    '- "mes" e "ano" devem corresponder ao período de competência do balancete.',
    '- Em "linhas", inclua uma entrada para cada conta contábil que apareça no balancete (exceto cabeçalhos e totalizadores genéricos).',
    '- Se uma linha corresponder a uma categoria sintética equivalente, normalize o nome da conta para exatamente um item da lista de categorias sintéticas e mantenha essa linha na posição em que apareceu.',
    '- Valores devem ser números JSON com ponto decimal e sem separador de milhar.',
    '- No texto de origem, alguns valores vêm com sufixo "D" ou "C" (ex.: "1.234.567,89D" ou "12.345,67C"). Esses sufixos indicam natureza (devedora/credora) e NÃO devem virar sinal negativo: sempre retorne o valor numérico como positivo (apenas o módulo).',
    '- NÃO use expressões matemáticas (ex.: "100 + 200"). Sempre retorne o valor final já calculado.',
    '- Esta regra vale tambem para todos os campos, incluindo "sinteticos": "saldo_anterior" e "saldo_atual". Eles devem ser numeros finais, nunca expressoes.',
    '- Retorne JSON estrito: nada de comentários, texto extra ou vírgulas sobrando.',
    '- Preserve a ordem original de leitura das contas: percorra as colunas da esquerda para a direita e, em PDFs/planilhas com duas colunas na mesma página, liste primeiro todas as linhas da coluna esquerda e depois todas as da coluna direita.',
    '',
    'Classificação em categorias sintéticas (balancete):',
    '- Além das linhas detalhadas, classifique cada conta em zero ou uma das seguintes categorias sintéticas:',
    '  * ' + SINTETICOS_BALANCO.join('\n  * '),
    '- Em "sinteticos", use exatamente os nomes da lista acima (normalize variações de nomenclatura).',
    '- Somente as contas classificadas devem ser usadas na soma de saldos de cada categoria.',
    '- Sempre retorne todas as categorias sintéticas, mesmo que o saldo seja zero.',
    '',
    'Texto do balancete:',
    conteudo
  ].join('\n');
}

/**
 * Monta o prompt para extração de DREs.
 *
 * @param {string} conteudo Texto completo da DRE
 * @return {string} Prompt a ser enviado à IA
 */
function buildPromptDre(conteudo) {
  return [
    'A seguir está o texto completo de uma Demonstração do Resultado (DRE) de uma empresa.',
    'Interprete o relatório e produza um resumo em categorias sintéticas predefinidas, em formato JSON.',
    '',
    '{',
    '  "metadados": {',
    '    "empresa": "INSIRA AQUI O NOME DA EMPRESA",',
    '    "mes": m,',
    '    "ano": yyyy',
    '  },',
    '  "linhas": [',
    '    {',
    '      "conta": "INSIRA AQUI O NOME DA CATEGORIA SINTÉTICA",',
    '      "valor_atual": x,',
    '      "valor_anterior": x',
    '    }',
    '  ]',
    '}',
    '',
    'Categorias sintéticas de DRE (use exatamente estes nomes):',
    '  * ' + SINTETICOS_DRE.join('\n  * '),
    '',
    'Regras:',
    '- Classifique cada linha da DRE em uma dessas categorias sintéticas.',
    '- "valor_atual" deve ser a soma dos valores do período atual das linhas que pertencem à categoria.',
    '- "valor_anterior" deve ser a soma dos valores do período anterior ou 0 se não existir a coluna.',
    '- Sempre retorne todas as categorias, mesmo que os valores sejam zero.',
    '- Caso os campos a seguir não estejam expressos no documento, calcule-os da seguinte maneira: Receita Liquida = Receita Bruta - Deduções; Lucro Bruto = Receita Liquida - Custos; Resultado Operacional = Lucro Bruto - Despesas Operacionais - Depreciacao e Amortizacao; Lucro ou Prejuizo do Exercicio = Resultado Operacional - Distribuicao de Resultados.',
    '- NÃO use expressões matemáticas (ex.: "100 + 200"). Sempre retorne o valor final já calculado.',
    '- Retorne JSON estrito: nada de comentários, texto extra ou vírgulas sobrando.',
    '',
    'Texto da DRE:',
    conteudo
  ].join('\n');
}
