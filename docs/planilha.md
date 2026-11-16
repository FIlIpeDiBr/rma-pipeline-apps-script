# A planilha

O script é vinculado a uma planilha Google, que faz três papéis: configuração, banco de dados e painel de operação. As abas de dados são criadas pelo próprio script quando faltam. "Config" e "Processamento" precisam existir; a função `configurarPlanilha()` cria as duas, com os cabeçalhos abaixo, e as pastas do Drive.

## Config

Pares chave/valor nas colunas A e B:

| Chave | Valor |
|---|---|
| `ENTRADA_FOLDER_ID` | Pasta do Drive onde os documentos chegam |
| `PROCESSADO_FOLDER_ID` | Pasta para onde o arquivo é movido depois de extraído (opcional) |
| `RELATORIOS_FOLDER_ID` | Pasta onde os relatórios gerados são gravados |

Na mesma aba, uma tabela de modelos de relatório. O cabeçalho começa com `nome` na coluna A:

| nome | id | grupo |
|---|---|---|
| Relatório mensal | ID do Google Docs do modelo | `sim` se o modelo serve para grupos |

## Processamento

Uma linha por documento recebido. É a fila de trabalho e o registro do que aconteceu com cada arquivo.

| Coluna | Conteúdo |
|---|---|
| `file_id` | ID do arquivo no Drive |
| `Nome_arquivo` | Nome original |
| `Empresa`, `Mes`, `Ano` | Preenchidos pelo nome do arquivo e corrigidos pelo conteúdo |
| `Tipo` | `BALANCO` ou `DRE` |
| `Status` | `PENDENTE_EXTRACAO`, `EXTRAINDO`, `PROCESSANDO`, `PROCESSADO` ou `ERRO` |
| `Mensagem` | Detalhe do erro, quando há |
| `Criado_em` | Data do registro |
| `Grupo` | Grupo econômico da empresa |
| `RMA_URL` | Link do último relatório gerado (opcional) |

## BalancoBase e DreBase

As bases multi-período. Cada extração apaga e regrava as linhas da mesma empresa e período, então reprocessar um arquivo não duplica dados.

- **BalancoBase:** `id`, `mes`, `ano`, `empresa`, `conta`, `saldo anterior`, `debito`, `credito`, `saldo atual`, mais as colunas de análise vertical e horizontal.
- **DreBase:** `id`, `mes`, `ano`, `empresa`, `conta`, `valor atual`, `av atual (%)`, `valor anterior`, `av anterior (%)`, `ah (%)`.

A coluna `id` guarda o `file_id` de origem. É ela que permite excluir um documento e levar junto tudo o que saiu dele.

## Indicadores

A linha 1 mostra a fórmula de cada indicador em formato legível, só para consulta. A linha 2 é o cabeçalho (`id`, `Mes`, `Ano`, `Empresa` e um indicador por coluna). Os dados começam na linha 3.

Grupos consolidados aparecem na coluna `Empresa` como `[GRUPO] nome do grupo`.

## DebugIA

Criada sob demanda. Guarda, para cada extração, o prompt enviado e o JSON devolvido pelo modelo. Serve para investigar uma extração errada sem repetir a chamada.

## Propriedades do script

Fora da planilha, em *Configurações do projeto > Propriedades do script*:

| Propriedade | Uso |
|---|---|
| `OPENAI_API_KEY` | Chave da API. Nunca fica no código nem na planilha |
| `FILA_RELATORIOS` | Status dos relatórios em geração, lido pelo portal |
| `IA_DOC_QUEUE`, `IA_GRUPO_QUEUE` | Documentos com blocos de IA pendentes |
| `EXCLUSAO_ARQUIVOS_QUEUE` | Arquivos aguardando exclusão no Drive |
