# Ruleguarder – work tracker

Legend: `[x]` done · `[~]` in progress · `[ ]` not started · `[!]` blocked / needs you

## Phase 1 – Scaffold ✅ (code complete, waiting on a real run)

### Plan & tech stack
- [x] Choose stack: FastAPI + python-docx + PostgreSQL + React/Vite/TS + Docker
- [x] Pivot: rules are checked by an LLM (Claude), with deterministic checks kept for formatting
- [x] Architecture + tech stack in README

### Server (`server/`)
- [x] Settings from env (`app/config.py`)
- [x] DB setup + models: `Rule`, `Document`, `CheckRun` (`app/db.py`, `app/models.py`)
- [x] API schemas (`app/schemas.py`)
- [x] DOCX parser: paragraphs, headings, tables, fonts, sizes, positions (`app/docx_parser.py`)
- [x] Deterministic rule types: forbidden/required text, sentence/paragraph length, fonts, font size
- [x] LLM provider interface + Claude implementation (`app/llm/`)
- [x] LLM checker: chunking, parallel calls, quote → exact offsets (Hebrew-aware)
- [x] "AI rule (plain language)" rule type
- [x] Rule engine combining LLM + deterministic checks
- [x] API routes: rules CRUD, rule types, documents upload/list/get/delete, check, latest report
- [x] `main.py` (CORS, health, table creation)
- [x] Python syntax check passes
- [x] Quote locator tested on the Hebrew example (״ vs ", extra whitespace, missing quote)

### Client (`client/`)
- [x] Vite + React + TS setup, API client, types
- [x] Rules panel: create/edit/toggle/delete, form generated from rule-type schema
- [x] Documents panel: upload .docx, list, delete
- [x] Report view: highlighted violations (RTL via `dir="auto"`), violations list, click to jump
- [x] `tsc` + `vite build` pass
- [x] nginx prod image, `/api` proxied to server

### Infra
- [x] `docker-compose.yml` (db, server, client) – config validated
- [x] `docker-compose.dev.yml` (hot reload) – config validated
- [x] `.env.example`, `.gitignore`
- [!] `docker compose up --build` – **not run yet: Docker Desktop was not running**
- [!] End-to-end test with a real Hebrew .docx + real API key

## Phase 2 – Verify & harden (next)
- [ ] Start Docker Desktop, build, run end-to-end with a sample Hebrew document
- [ ] Unit tests: parser (sample .docx fixtures), deterministic rules, quote locator
- [ ] Evaluation set: sample documents with known violations → measure how many the LLM catches (recall)
- [ ] Tune the LLM prompt/effort from the eval results
- [ ] Decide on data sensitivity: cloud LLM vs self-hosted model (provider interface is ready)

## Phase 3 – Product features
- [ ] Run checks as background jobs with progress (long documents)
- [ ] Rule sets (group rules, choose a set per check)
- [ ] Headers, footers, footnotes, text boxes, nested tables in the parser
- [ ] Export report (DOCX with Word comments at each violation / PDF)
- [ ] Mark a violation as "false positive / accepted"
- [ ] Hebrew UI (i18n + full RTL layout)
- [ ] Auth / users, Alembic migrations
