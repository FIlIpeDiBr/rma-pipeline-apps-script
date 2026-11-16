/**
 * Constantes do pipeline: modelos, limites de execução, categorias sintéticas e cores dos gráficos.
 */

// Modelos da OpenAI usados em cada etapa.
const MODELO_EXTRACAO_LEVE = 'gpt-4.1-mini';    // documentos curtos enviados como texto
const MODELO_EXTRACAO_ROBUSTO = 'gpt-5.1';      // documentos longos e PDFs enviados como arquivo
const MODELO_JSON_PADRAO = 'gpt-5.4-nano';      // chamadas avulsas que devolvem JSON
const MODELO_TEXTO_PADRAO = 'gpt-4.1-mini';     // textos de análise dos relatórios

// Limite de tokens por arquivo para trocar o modelo de extração.
// Acima deste valor usa MODELO_EXTRACAO_ROBUSTO; abaixo, MODELO_EXTRACAO_LEVE.
var TOKENS_SWITCH_THRESHOLD = 5000;

var MAX_CONCORRENCIA_EXTRACAO = 8;

// Limite de blocos de IA (&&(...)) processados por execução para evitar timeout do Apps Script.
var MAX_BLOCOS_IA_POR_EXECUCAO = 30;

var LIMITE_DE_INDICADORES = 10;

// Categorias sintéticas para DRE. Essas strings precisam ser
// exatamente iguais às que a IA retorna e às usadas na classificação.
const SINTETICOS_DRE = [
  'Receita Bruta',
  'Deduções (-)',
  'Receita Liquida',
  'Custos (-)',
  'Lucro Bruto',
  'Despesas Operacionais (-)',
  'Depreciacao',
  'Amortizacao',
  'Depreciacao e Amortizacao',
  'Resultado Operacional',
  'Distribuicao de Resultados (-)',
  'Lucro ou Prejuizo do Exercicio'
];

// Categorias sintéticas para balancete.
const SINTETICOS_BALANCO = [
  'ATIVO',
  'ATIVO TOTAL',
  'ATIVO CIRCULANTE',
  'CONTAS/BANCOS',
  'ATIVO NAO CIRCULANTE',
  'IMOBILIZADO',
  'PASSIVO CIRCULANTE',
  'PASSIVO NAO CIRCULANTE',
  'PATRIMONIO LIQUIDO',
];

// Cores padrão para os gráficos.
const CORES_PADRAO = [
  '#4285f4',
  '#ea4335',
  '#fbbc04',
  '#34a853',
  '#ff6d01',
  '#46bdc6'
];
