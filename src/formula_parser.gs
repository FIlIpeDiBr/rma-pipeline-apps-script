/**
 * Avaliador de expressões aritméticas usado pelas fórmulas dos indicadores.
 *
 * Substitui `new Function`: a expressão é analisada por um parser descendente
 * recursivo que só reconhece números, + - * /, parênteses e safeDivide(a, b).
 * Qualquer outro identificador ou chamada é rejeitado, então nenhum texto
 * montado em tempo de execução é executado como código.
 *
 * Gramática:
 *   expressao := termo (('+' | '-') termo)*
 *   termo     := fator (('*' | '/') fator)*
 *   fator     := ('+' | '-') fator | '(' expressao ')' | chamada | numero
 *   chamada   := 'safeDivide' '(' expressao ',' expressao ')'
 */

/**
 * Avalia uma expressão aritmética. As operações usam a aritmética do
 * JavaScript, inclusive quando safeDivide devolve null (divisão por zero):
 * o null entra na conta como 0, igual ao comportamento anterior.
 *
 * @param {string} texto Expressão já com os valores substituídos
 * @return {number|null} Resultado
 * @throws {Error} Se a expressão tiver algo fora da gramática
 */
function avaliarExpressaoAritmetica_(texto) {
  const src = String(texto == null ? '' : texto);
  let pos = 0;

  function erro(msg) {
    throw new Error('Expressao invalida: ' + msg + ' (posicao ' + pos + ')');
  }

  function pularEspacos() {
    while (pos < src.length && /\s/.test(src.charAt(pos))) pos++;
  }

  function consumir(ch) {
    pularEspacos();
    if (src.charAt(pos) !== ch) return false;
    pos++;
    return true;
  }

  function exigir(ch) {
    if (!consumir(ch)) erro('"' + ch + '" esperado');
  }

  function numero() {
    const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(pos));
    if (!m) erro('numero esperado');
    pos += m[0].length;
    return Number(m[0]);
  }

  function fator() {
    pularEspacos();
    const ch = src.charAt(pos);
    if (ch === '+') { pos++; return +fator(); }
    if (ch === '-') { pos++; return -fator(); }
    if (ch === '(') {
      pos++;
      const valor = expressao();
      exigir(')');
      return valor;
    }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(pos));
    if (!id) return numero();
    pos += id[0].length;
    // Valores nao finitos chegam como texto quando um saldo vem assim da base.
    if (id[0] === 'Infinity') return Infinity;
    if (id[0] === 'NaN') return NaN;
    if (id[0] !== 'safeDivide') erro('identificador nao permitido: ' + id[0]);
    exigir('(');
    const num = expressao();
    exigir(',');
    const den = expressao();
    exigir(')');
    return safeDivide(num, den);
  }

  function termo() {
    let valor = fator();
    for (;;) {
      if (consumir('*')) valor = valor * fator();
      else if (consumir('/')) valor = valor / fator();
      else return valor;
    }
  }

  function expressao() {
    let valor = termo();
    for (;;) {
      if (consumir('+')) valor = valor + termo();
      else if (consumir('-')) valor = valor - termo();
      else return valor;
    }
  }

  const resultado = expressao();
  pularEspacos();
  if (pos < src.length) erro('sobra apos a expressao');
  return resultado;
}
