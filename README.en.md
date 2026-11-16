# RMA Pipeline

A Google Apps Script pipeline that takes trial balances and income statements as PDF, spreadsheet or image, extracts the figures with an LLM, computes financial indicators and assembles each company's monthly activity report (RMA, *Relatório Mensal de Atividades*) in Google Docs.

It was built for a Brazilian accounting firm. This is the public edition: no client data, no identifiers and no document templates.

Function names and inline documentation are in Portuguese because the domain is Brazilian accounting.

**Live demo:** [open the portal](https://script.google.com/macros/s/AKfycbwswcC9jH91-_CXEDRWr-SN4ekYECVFh924L-dVy3-W3J5xnM6UaAXhsvaBriqlOZvS/exec?authuser=0). It asks for a Google sign-in. The instance holds no real data, and any visitor can change what is there.

*[Versão em português](README.md)*

## Flow

1. **Intake.** Files arrive in a Drive folder. The pipeline registers each one, infers company, period and document type from the file name and content, and discards superseded versions of the same document.
2. **Extraction.** Each document goes to the model as text, image or PDF, whichever works for that file. The JSON response is reconciled against a fixed chart of summary categories.
3. **Calculation.** Vertical and horizontal analysis, plus a catalog of 23 indicators (liquidity, leverage, margins, EBITDA) defined as declarative formulas. Companies in the same economic group are also consolidated.
4. **Report.** The report starts from a Google Docs template with markers for values, tables, charts and LLM-written analysis. Whoever maintains the template never touches code.

Operation happens through a web portal served by the script itself, or the spreadsheet menu.

## Engineering decisions

**Working inside the 6-minute Apps Script limit.** Batch extraction and reports with dozens of LLM-written sections do not fit in one execution. Long stages are queues: each run processes what it can before a deadline, puts the rest back and schedules a trigger to continue. `LockService` prevents concurrent extractions, and rows left in `PROCESSANDO` by an interrupted run are re-queued on the next one.

**Parallelism and cost.** Requests go out in batches through `UrlFetchApp.fetchAll`, and one failing document does not fail the batch. The model is chosen by estimated document size: a cheaper one for short text, a stronger one for long documents and PDFs sent as files.

**Not trusting LLM output.** The prompt demands strict JSON, and the response still goes through repair (markdown fences, expressions such as `100 + 200` in numeric fields, trailing commas) before being rejected. Account names are reconciled with canonical categories. Prompts and responses are logged to a `DebugIA` sheet for auditing.

**Indicators from formulas, not from the LLM.** Report figures come from formulas declared in code, such as `safeDivide({{lucro_liquido}}, {{receita_liquida}}) * 100`, evaluated by a purpose-built recursive descent parser ([`formula_parser.gs`](src/formula_parser.gs)) instead of `eval` or `new Function`. A differential test checks the parser against native JavaScript on 6,900 expressions generated from the catalog. The LLM is only called when a formula lacks data, and only for the indicators left without a value; with a complete income statement and trial balance, no call is made.

**A report non-programmers can change.** The template uses a small marker language: `{{periodo(-1)}}`, tables whose columns are declared in the header row, charts (`~~(h: empresa(-1)|empresa; v: EBITDA)~~`) and blocks where the LLM writes the section's analysis. Reference (in Portuguese): [`docs/marcadores.md`](docs/marcadores.md).

**Surface exposed to the browser.** In Apps Script, every global function without a trailing underscore can be called by whoever opens the web app, through `google.script.run`. Functions that read the API key, call the model, read Drive files by ID or write straight to the data sheets are private; document deletion only accepts IDs present in the registry; and a [test](test/public_api.test.js) fails if one of them becomes exposed again or if the portal calls a function that does not exist.

**Spreadsheet as database.** Every row keeps the ID of its source file. Reprocessing a document replaces the rows for that company and period instead of duplicating them, and deleting a document removes everything derived from it. Schema: [`docs/planilha.md`](docs/planilha.md).

## Tests

```
npm test
```

No dependencies: tests run on Node's built-in runner (Node 20+). The [harness](test/harness.js) loads the `.gs` files into an isolated context sharing one global scope, as Apps Script does, and replaces Google services with in-memory fakes. The 73 tests cover the logic that does not depend on a spreadsheet: file name and document header parsing, Brazilian number formats, the OpenAI client (JSON repair, batching, errors), the formula parser and indicator catalog, marker syntax and the report queue.

## Known limitations

- No integration tests against Sheets, Docs and Drive. The suite covers pure logic only.
- Queues live in script properties and are read and rewritten without a lock. Two concurrent runs can lose an item.
- Some functions read columns of the `Processamento` sheet by position rather than by header name.
- Apart from the sensitive functions, helpers are still callable from the web app client. Only entry points should be exposed.
- A spreadsheet as a database has a ceiling. With more companies and history, the next step is a relational database and a service outside Apps Script.

This repository is the first version of the project. The second one was rewritten in Python (FastAPI) with a relational database and a React front end.

## Author

Filipe Dias Brandão · [github.com/FIlIpeDiBr](https://github.com/FIlIpeDiBr)

Published as a portfolio piece. All rights reserved.
