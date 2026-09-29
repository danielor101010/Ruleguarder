# Ruleguarder

Upload a Word document (.docx), define rules in plain language, and let an LLM find every
place in the document that breaks them. Each violation is shown with its exact location:
highlighted in the document, with paragraph / table cell and the nearest heading.

> Example: rule *"The document must not contain numeric figures that reveal the system's
> performance"*. The document says *"טווח הגילוי המירבי הוא 50 ק״מ"*, so that phrase is highlighted
> and listed as a violation at *Paragraph 12, under "ביצועי המערכת"*.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Server | Python 3.12, FastAPI | Best DOCX tooling is in Python; typed API with auto docs at `/docs` |
| DOCX parsing | python-docx | Paragraphs, headings, tables, runs, fonts and sizes, all in document order |
| LLM | Google Gemini (`gemini-3.5-flash` by default, optional fallback models) via the `google-genai` SDK with native structured output, behind a provider interface | Understands rules written in natural language; the provider can be swapped (e.g. for a self-hosted model) |
| DB | PostgreSQL 16 + SQLAlchemy 2 | Rules, documents (parsed structure), stored check reports |
| Client | React 18 + TypeScript + Vite | Document viewer with highlights; RTL handled with `dir="auto"` |
| Infra | Docker Compose: `db`, `server`, `client` (nginx) | nginx serves the built client and proxies `/api`, so the app has one origin |

## How a check works

```
.docx ──► parser ──► blocks [{id, text, label, heading, runs(font,size,offsets)}]  (stored in DB)
                         │
 rules ──────────────────┤
   • "llm" rules ──► document split into chunks ──► LLM (parallel) ──► {rule, block, verbatim quote, explanation}
   │                                                                       │
   │                                   server finds the quote in the block text ──► exact char offsets
   • deterministic rules (fonts, sizes, forbidden words, length) ──► exact offsets
                         │
                         ▼
             violations + summary ──► stored as a CheckRun ──► client highlights them in the document
```

The LLM never gives offsets directly; it quotes the text, and the server locates the quote.
The matching tolerates Hebrew ״/׳ vs `"`/`'`, dashes and whitespace differences. If a quote
can't be found, the whole paragraph is flagged instead of highlighting the wrong text.

## Rule types

| Type | Checked by | Params |
|---|---|---|
| `llm`: AI rule (plain language) | LLM | `instruction` |
| `forbidden_text` / `required_text` | code | `pattern`, `is_regex`, `case_sensitive` |
| `max_sentence_words` / `max_paragraph_words` | code | `max_words` |
| `allowed_fonts` | code | `fonts` |
| `font_size_range` | code | `min_pt`, `max_pt` |

The client builds the rule form from each type's JSON schema (`GET /api/rules/types`), so a
new rule type needs no client changes.

## Running

```bash
cp .env.example .env          # then set GEMINI_API_KEY and POSTGRES_PASSWORD

# production-like
docker compose up --build     # app: http://localhost:8080   API docs: http://localhost:8000/docs

# development (hot reload)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build   # app: http://localhost:5173
```

## Tests

```bash
docker compose --profile test run --rm tests     # server: ruff, ruff format, mypy --strict, pytest (unit + E2E)
cd client && npm run check                       # client: eslint (0 warnings), tsc, vitest
```

- Unit tests: parser, rule types, LLM pipeline (fake provider), Gemini provider (mocked SDK)
- E2E: upload a generated sample .docx, create rules, run a check, verify the exact highlighted text
- The real-Gemini E2E test spends API quota, so it is **opt-in**:
  `docker compose --profile test run --rm tests pytest -m llm`

## API

| Method | Path | |
|---|---|---|
| GET | `/api/rules/types` | Rule types + params JSON schema |
| GET / POST | `/api/rules` | List / create rules |
| PATCH / DELETE | `/api/rules/{id}` | Update / delete a rule |
| GET / POST | `/api/documents` | List / upload (.docx, multipart `file`) |
| GET / DELETE | `/api/documents/{id}` | Parsed document / delete |
| POST | `/api/documents/{id}/check` | Run enabled rules (or `{"rule_ids": [...]}`) and store the report |
| GET | `/api/documents/{id}/report` | Latest stored report |

## Project layout

```
server/app/
  main.py              FastAPI app, CORS, health
  config.py            settings from env
  models.py            Rule, Document, CheckRun
  docx_parser.py       .docx -> blocks with positions and formatting
  llm/                 provider interface + Gemini implementation
  rules/registry.py    rule types (params schema + checker)
  rules/llm_check.py   chunking, LLM calls, quote -> offsets
  rules/engine.py      runs all rules, builds violations
  routers/             rules + documents endpoints
client/src/
  App.tsx, api.ts, types.ts
  components/RulesPanel.tsx      rules CRUD, form generated from schema
  components/DocumentsPanel.tsx  upload / list
  components/ReportView.tsx      document with highlights + violations list
```

See [TODO.md](TODO.md) for progress and [project_wiki/](project_wiki/) for architecture decisions, the development log and API contracts.
