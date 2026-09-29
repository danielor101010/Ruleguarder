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
| `feature/rule-templates` | `refactor/severity-levels` | ✅ done, verified (154 tests) |
| `feature/dashboard-ui` | `refactor/severity-levels` | ✅ done (subagent 2) |
| `feature/templates-dashboard-integration` | both of the above | ✅ merged + verified |
| `fix/dashboard-ux` | `feature/templates-dashboard-integration` | ✅ UI redesign from your feedback |
| `fix/check-robustness` | `fix/dashboard-ux` | ✅ bug fixes from the code review, verified (current branch) |

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
- [x] Real LLM checked by you on `gemini-3.5-flash`: works

## ✅ Quality gates (`feature/quality-gates`)
- [x] Ruff + strict mypy (server), zero findings; `tests` image runs every gate
- [x] ESLint 10 (0 warnings) + tsc + Vitest (client), 32 tests; logic extracted to lib/ and hooks/

## ✅ Severity levels (`refactor/severity-levels`)
- [x] error/warning/info → high/medium/low (API, DB, client, colours red/orange/yellow)
- [x] Legacy values mapped on read; stored rules upgraded at startup (idempotent)
- [x] Spec for rule templates + dashboard written to `project_wiki/API_CONTRACTS.md`

## ✅ Phase 3 – Dashboard UI (`feature/dashboard-ui`, subagent 2)
- [x] Tailwind v4; glass panels on slate/navy shell, dark pill buttons, focus rings, LTR, responsive
- [x] Split screen: document (left, High red / Medium orange / Low yellow) · violations (right) with severity chips + rule filter
- [x] Click violation → smooth scroll + 1.5 s flash + stays active; click highlight → selects card
- [x] "Add from template" picker, "Load Sample Rules", "AI · uses quota" badge
- [x] Vitest 86 tests; Playwright E2E (non-LLM rules only)

## ✅ Phase 4 – Rule templates (`feature/rule-templates`, subagent 1) — done, verified by lead
_6 commits; lead re-ran all gates on a fresh DB: ruff ✅ format ✅ mypy --strict ✅ **154 passed** (+96)._
- [x] PII: email, credit card (Luhn + card prefix), SSN (US, dashed), phone (international / North American / national) – values masked in messages; negative tests for dates, versions, "50 km", IPs, ISBN…
- [x] Acronyms: first use must be "Full Name (ABC)" or "ABC (Full Name)"; skips headings, Roman numerals, ALL-CAPS markings
- [x] Cross-references: Section / Figure / Table incl. outline numbers computed from heading levels, captions, lists and ranges
- [x] 11 templates (6 in the sample set); `GET /api/rules/templates`, `POST /api/rules/samples` (idempotent, AI sample disabled)
- [!] Known limitations to review: part numbers like "0301-2345-678" read as phones; "API SDK" side by side skipped; "Chapter N" not checked

## ✅ Integration (`feature/templates-dashboard-integration`, lead)
- [x] Merged both branches; all gates on the integrated stack: server 154 ✅ · client 86 ✅ · Playwright 5 passed / 1 skipped (expected) ✅
- [x] Fixed Playwright locator bug found in integration
- [x] Reviewed screenshots; demo doc → 9 violations, correctly located
- [x] Wiki: ADR-011/012/013, dev log, API contracts, prompt playbook; README
- [x] Your app on :8080 updated to this version (your rules kept)

## ✅ UI fix (`fix/dashboard-ux`)
- [x] Opaque dark dashboard, document as a white page (no muddy translucent panels)
- [x] Click a rule → details pop-up (full rule, severity, on/off, edit, delete)
- [x] Clear buttons: indigo primary, bordered secondary, icon buttons, switches, delete confirmation
- [x] No coloured side borders, no blue rings, no chips
- [x] Upload drop zone + recent documents; phone layout puts the main area first
- [x] Tests: client 93 ✅, Playwright 5 passed / 1 skipped ✅

## ✅ Fix – check robustness (`fix/check-robustness`, ADR-015)
- [x] Partial reports: a failing rule (AI outage, invalid stored params, checker bug, slow regex) no longer sinks the check
- [x] Crash fixes: quote locating (`İ`/`ß`), malformed .docx (400, no orphan file), PATCH null (422), regex timeout
- [x] JSON 500s, sample-rules lock, delete ordering, LLM chunk cancel; client race, incomplete-report warning, ErrorBoundary
- [x] Tests: server 182 ✅, client 99 ✅, Playwright 5 passed / 1 skipped ✅
- [ ] Refactor: move check orchestration out of the router into a service layer (do it at the start of M3)
- [ ] Client cancel/timeout for a running check (fits M3's progress bar)

## Decisions for you (open)
- [x] `claude.md` §4: left as is (your call); ADR-014 records the dark design
- [x] Real AI rules: checked by you on `gemini-3.5-flash`, working
- [!] **Merge plan:** 8 stacked branches, none merged into `dev`. Suggested: one PR `fix/dashboard-ux` → `dev`
- [!] **Data sensitivity:** Gemini free tier may use submitted content (see `.env.example`); paid key for sensitive documents?
- [!] **PII storage:** masking is cosmetic; full values stay in excerpts and stored documents (ADR-011). Mask excerpts? Retention/encryption for uploads?
- [!] **Known limits of the new checks:** part numbers like "0301-2345-678" read as phones; "API SDK" side by side skipped; "Chapter N" not checked

---

# Missions (written 2026-09-29, not started)
Order set by you. Each mission gets its own branch, tests, and wiki update per `project_wiki/claude.md`.

## ~~M1 – Delete confirmation pop-up~~: cancelled by you (the inline Delete → Confirm / Keep stays)

## M2 – Accuracy test set for the AI rules — `feature/llm-eval-set` — 🟡 built; baseline waits for your OK
Measure how many real violations the AI catches (recall) and how many it invents (false positives), then tune the prompt.
- [x] 10 sample .docx files (English + Hebrew) with **known, labelled** violations: performance figures, architecture/data-flow details, plus traps that must NOT be flagged (e.g. "approximately fast", years, page numbers)
- [x] Labels: expected / optional / trap quotes per document (`server/eval/dataset.py`)
- [x] Eval script: runs the AI rules and matches found quotes to labels → recall, precision, per-rule table, list of misses
- [x] Opt-in only, never in the default test run; prints the number of API calls **before** running and asks for confirmation
- [ ] Baseline report saved in the wiki; then prompt/effort tuning, with each change compared against the baseline
- **Done when:** a baseline recall/precision is recorded and each prompt change has before/after numbers. ⚠️ Spends quota: run count agreed with you first

## M3 – Background checks with a progress bar — `feature/background-checks`
Long documents keep the page waiting today (one blocking request).
- [ ] `POST /documents/{id}/check` returns at once with a check id; the check runs in the background
- [ ] `check_runs` gets `status` (queued / running / completed / failed / cancelled) and progress (`done_chunks` / `total_chunks`, current step)
- [ ] `GET /checks/{id}` for status; the client polls (or uses server-sent events) and shows a progress bar: "Checking… chunk 3 of 7 (AI rules)"
- [ ] Cancel button; a failed check shows its error; the page can be reloaded mid-check and reconnects to the running check
- [ ] Only one running check per document at a time
- **Done when:** unit tests cover the state transitions, E2E covers progress → result (non-AI rules, with a slow fake), and the API contract + ADR are updated

## M4 – Read more of the document — `feature/parser-coverage`
Parts of a .docx are currently ignored, so violations there are never found.
- [ ] Headers and footers (per section, deduplicated), labelled e.g. "Header (section 1)"
- [ ] Footnotes and endnotes, labelled "Footnote 3"
- [ ] Text boxes and shapes
- [ ] Tables nested inside tables
- [ ] Hyperlink text and field results (e.g. SEQ caption numbers), which fixes the cross-reference caption limitation
- [ ] The document view shows these parts in their own sections so highlights still point at the right place
- **Done when:** a fixture .docx containing every part type is parsed with correct labels and offsets, rules find violations in each part, and the E2E click-to-locate works for a header and a footnote

## Low priority
- [ ] **L1 – Redesign the design** — `feature/visual-redesign`: a fuller visual pass (typography, spacing, colour system, polish), after M1–M4. Scope to be agreed with you first (references / screenshots of what you like)

## Backlog (not prioritised)
- [ ] Mark a violation as "not a problem" (false positive / accepted), so it stops showing on re-check
- [ ] Export the report (Word file with comments at each violation, or PDF)

## Not needed for now (your call)
- [ ] Pick rule options from a list (multi-select) instead of comma-separated text
- [ ] User logins, database migrations (Alembic)
