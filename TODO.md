# Ruleguarder – work tracker

Legend: `[x]` done · `[~]` in progress · `[ ]` not started · `[!]` needs you

Branching: one feature branch per task, never commit directly to `dev` / `main`.

| Branch | Based on | Status |
|---|---|---|
| `feature/project-scaffold` | `dev` | ✅ committed |
| `feature/gemini-integration` | `feature/project-scaffold` | ✅ committed |
| `feature/e2e-tests` | `feature/gemini-integration` | ✅ committed |
| `fix/gemini-overload-fallback` | `feature/e2e-tests` | ✅ committed |
| `feature/quality-gates` | `fix/gemini-overload-fallback` | ✅ committed |
| `refactor/severity-levels` | `feature/quality-gates` | ✅ committed (+ spec for next two) |
| `feature/rule-templates` | `refactor/severity-levels` | 🤖 subagent 1 working (server) |
| `feature/dashboard-ui` | `refactor/severity-levels` | 🤖 subagent 2 working (client, parallel) |
| integration | both of the above | ⬜ lead: merge, run all gates, wiki |

## ✅ Phase 1 – Scaffold (`feature/project-scaffold`)
- [x] Stack: FastAPI + python-docx + PostgreSQL + React/Vite/TS + Docker (nginx)
- [x] DOCX parser: paragraphs, headings, tables, fonts, sizes, positions
- [x] Rule engine: LLM rules + deterministic rules (forbidden/required text, length, fonts, sizes)
- [x] LLM checker: chunking, parallel calls, quote → exact offsets
- [x] API: rules CRUD, rule types, documents, check, stored reports
- [x] Client: rules panel (schema-driven form), upload, document view with highlights, violations list
- [x] docker-compose (prod + dev override), `.env.example`

## ✅ Phase 2a – Gemini (`feature/gemini-integration`)
- [x] Replace Anthropic SDK with `google-genai`
- [x] Native structured output: `response_mime_type="application/json"` + Pydantic `response_schema`
- [x] Retry with backoff on 429 / 5xx (free-tier quotas), clear errors for blocked / truncated answers
- [x] `GEMINI_API_KEY` + `LLM_*` settings in `.env.example`
- [x] Default model `gemini-3.8-flash` (1.5 models are no longer available) → changed to `gemini-3.5-flash` in `fix/gemini-overload-fallback`

## ✅ Phase 2b – Tests (`feature/e2e-tests`)
- [x] `tests` service in docker-compose (`docker compose --profile test run --rm tests`)
- [x] Unit tests: parser, rules, LLM pipeline (fake provider), Gemini provider (mocked SDK)
- [x] E2E: full flow through the running API with a generated sample .docx
- [x] Fixed bug found by tests: table cells were dropped (merged-cell dedup used reused `id()`s)
- [x] DB port no longer published in prod (clashed with a local Postgres); dev uses 5433
- [x] Full stack verified: http://localhost:8080 → nginx → API → Postgres
- [x] Real Gemini E2E passed (found 50 km, 3 m, 2 seconds) – but took 154 s due to 503s

## ✅ Fix – Gemini overload & quota (`fix/gemini-overload-fallback`)
- [x] Default `gemini-3.5-flash`; optional fallback models; 503/504/timeout → next model
- [x] Only 429 retried, `LLM_MAX_RETRIES=1`, `LLM_MAX_PARALLEL=1`, `LLM_TIMEOUT_SECONDS=120`
- [x] Real-LLM tests opt-in only (`pytest -m llm`); bounded request count unit-tested
- [x] Project wiki created (`project_wiki/`)
- [!] Rerun real-LLM E2E on `gemini-3.5-flash` – only with your OK (spends quota)

## ✅ Quality gates (`feature/quality-gates`)
- [x] Ruff + strict mypy (server), zero findings; `tests` image runs every gate
- [x] ESLint 10 (0 warnings) + tsc + Vitest (client), 32 tests; logic extracted to lib/ and hooks/

## ✅ Severity levels (`refactor/severity-levels`)
- [x] error/warning/info → high/medium/low (API, DB, client, colours red/orange/yellow)
- [x] Legacy values mapped on read; stored rules upgraded at startup (idempotent)
- [x] Spec for rule templates + dashboard written to `project_wiki/API_CONTRACTS.md`

## 🤖 Phase 3 – Dashboard UI (`feature/dashboard-ui`, subagent 2) — in progress
_Status checked 2026-09-29: code written, not committed yet; its own Docker stack (`rg-ui`) is running for testing._
- [~] Tailwind; glassmorphism panels on slate/navy shell, dark pill buttons, LTR (package.json, styles.css, vite config changed)
- [~] Split screen: `DocumentPane` (left) + `ViolationsPanel` (right), `TopBar`, shared `ui.tsx` primitives
- [~] Rules sidebar: `RuleForm` split out, `TemplatePicker`, "Load Sample Rules"
- [~] Hooks: `useDocuments` (+ test), `useDocumentReport` updated
- [~] Vitest: new tests for App, RulesPanel, DocumentsPanel, useDocuments; existing tests adapted
- [ ] Playwright E2E (non-LLM rules only)
- [ ] Commits + final report

## 🤖 Phase 4 – Rule templates (`feature/rule-templates`, subagent 1) — in progress
_Status checked 2026-09-29: 1 commit (`refactor: move Finding into its own module`), rest written but not committed._
- [~] PII (SSN, phone, email, credit card + Luhn) → `rules/pii.py` + `test_pii.py`
- [~] Acronyms & definitions → `rules/acronyms.py` + `test_acronyms.py`
- [~] Broken cross-references → `rules/cross_references.py` + `test_cross_references.py`
- [~] Templates + sample set → `rules/templates.py` + `test_templates.py`; endpoints in `routers/rules.py`
- [~] E2E tests for `/api/rules/templates` and `/api/rules/samples`
- [ ] Gates (ruff, mypy, pytest) + final report

## ⬜ Integration (lead)
- [ ] Review both branches, merge, run every gate together (server + client + Playwright)
- [ ] Wiki: ADR-011 (templates), ADR-012 (UI), dev log, API contract corrections

## Later
- [ ] Decide on data sensitivity: free-tier Gemini may use submitted content (see `.env.example`)
- [ ] Evaluation set: documents with known violations → measure LLM recall, tune prompt
- [ ] Background jobs with progress for long documents
- [ ] Headers, footers, footnotes, text boxes, nested tables in the parser
- [ ] Export report (DOCX with Word comments / PDF)
- [ ] Mark a violation as false positive / accepted
- [ ] Auth / users, Alembic migrations
