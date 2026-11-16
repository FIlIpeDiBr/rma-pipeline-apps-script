# Marcadores do modelo de relatório

O relatório é um Google Docs comum. Quem monta o modelo escreve o texto, formata como quiser e posiciona marcadores onde os dados devem entrar. Na geração, o pipeline copia o modelo e troca cada marcador pelo conteúdo. Mudar um relatório não exige alterar código.

Os marcadores são processados nesta ordem: valores simples, tabelas, gráficos e, por último, blocos de IA (que leem o que os anteriores produziram).

## Valores simples: `{{chave}}`

| Marcador | Vira |
|---|---|
| `{{empresa}}` | Nome da empresa |
| `{{grupo}}` | Nome do grupo econômico |
| `{{mes}}` | Mês por extenso |
| `{{ano}}` | Ano |
| `{{periodo}}` | Mês/ano do relatório, por exemplo `Julho/2025` |
| `{{periodo(-1)}}` | Período deslocado em meses: `Junho/2025`. Aceita qualquer inteiro e atravessa anos |

Implementação: [`template_placeholders.gs`](../src/template_placeholders.gs).

## Tabelas: `[[(p:origem; modo)]]`

Um parágrafo com o marcador, seguido de uma **tabela-modelo**. A tabela-modelo define as colunas e o estilo; o pipeline a substitui por uma tabela com uma linha por conta.

```
[[(p:balancobase; completa)]]

| [conta: Conta] | [saldo anterior: {{periodo(-1)}}] | [saldo atual: {{periodo}}] | [ah: AH %] |
| x              | x                                  | x                          | x          |
| x              | x                                  | x                          | x          |
```

Parâmetros:

- `p:` é obrigatório e indica a origem: `balancobase` ou `drebase`.
- `completa` lista todas as contas; `resumida` (padrão) lista só as categorias sintéticas.

Cada célula do cabeçalho no formato `[campo: Título]` liga a coluna a um campo. O título é opcional e aceita `{{chave}}`. Uma célula sem colchetes vira texto fixo e a coluna fica vazia. Um campo desconhecido aparece no documento como `ERRO: campo "..." não encontrado`, para quem edita o modelo ver o problema.

| Origem | Campos |
|---|---|
| `balancobase` | `conta`, `saldo anterior`, `debito`, `credito`, `saldo atual`, `av atual`, `av anterior`, `ah` |
| `drebase` | `conta`, `valor atual`, `valor anterior`, `av atual`, `av anterior`, `ah` |

O estilo vem das linhas da tabela-modelo: com duas linhas, a segunda é o molde das linhas de dados; com três ou mais, a segunda e a terceira se alternam (efeito zebrado).

Implementação: [`template_tables.gs`](../src/template_tables.gs).

## Gráficos: `~~(t: ...; h: ...; v: ...)~~`

```
~~(t: Receita e lucro; h: empresa(-2)|empresa(-1)|empresa; v: Receita Bruta[#4285f4]|Lucro Liquido)~~
```

| Parâmetro | Significado |
|---|---|
| `t:` | Título. Se omitido, usa os nomes dos indicadores |
| `h:` | Eixo horizontal, itens separados por `\|`. Cada item é `empresa`, `grupo` (uma barra por integrante) ou `consolidado`, com deslocamento opcional em meses: `empresa(-1)` |
| `v:` | Séries, separadas por `\|`. Cada série é o nome de um indicador da aba "Indicadores", com cor opcional em hexadecimal: `EBITDA[#34a853]` |
| `supresscaption` | Não escreve os valores sobre as barras |
| `supressai` | Não gera a descrição textual usada pelos blocos de IA |

O nome do indicador não precisa ser exato: a busca ignora acentos, caixa e pontuação, aceita prefixo (`Endividamento` encontra `Endividamento (Passivo/PL)`) e, por fim, escolhe o nome mais próximo por distância de edição.

O gráfico é renderizado como imagem pelo QuickChart (Chart.js). Períodos sem linha na aba "Indicadores" são ignorados.

Junto de cada gráfico o pipeline insere, entre duas linhas `%%%`, um resumo em texto dos valores plotados. Esse resumo existe só para que um bloco de IA na mesma seção consiga "ler" o gráfico; ele é removido do documento ao final.

Implementação: [`template_charts.gs`](../src/template_charts.gs).

## Blocos de IA: `&&(...)` ... `&&`

```
&&(prompt: Comente a evolução da receita e do lucro em até 5 linhas; final)

   ... tabelas, gráficos e textos da seção ...

&&
```

Tudo o que está entre a abertura e o fechamento (texto, tabelas já preenchidas e resumos de gráficos) é enviado ao modelo junto com o prompt. O texto gerado entra no documento, e trechos em `**negrito**` viram negrito de verdade.

| Parâmetro | Significado |
|---|---|
| `prompt:` | Instrução para o modelo. Padrão: descrever os dados de maneira profissional, sem sugestões |
| `system:` | Mensagem de sistema opcional |
| `inicio` ou `final` | Onde o texto gerado entra: no lugar da abertura ou depois do fechamento (padrão: `final`) |

Um documento pode ter dezenas de blocos, e cada um é uma chamada ao modelo. Como uma execução do Apps Script tem limite de tempo, os blocos são processados em lotes, com prazo por execução; o que sobra volta para uma fila e um gatilho retoma o documento minutos depois. O portal mostra o progresso.

Implementação: [`template_ai_blocks.gs`](../src/template_ai_blocks.gs) e [`report_ai_queue.gs`](../src/report_ai_queue.gs).

## Blocos por integrante (relatórios de grupo): `<<(flags)>>` ... `)>>`

Em relatórios de grupo econômico, o trecho do modelo entre a abertura `<<(...)>>` e um parágrafo de fechamento com `)>>` é repetido uma vez para cada empresa do grupo no período. Dentro do trecho valem todos os marcadores acima, resolvidos com os dados daquele integrante.

A flag `consolidar` acrescenta ao final uma repetição com os números consolidados do grupo.

Implementação: [`template_group_blocks.gs`](../src/template_group_blocks.gs).
