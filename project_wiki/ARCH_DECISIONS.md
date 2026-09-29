# Architecture Decision Records

Format: context → decision → consequences. Newest last. Status: Accepted / Superseded.

---

## ADR-001 – Tech stack (Accepted, 2026-09-29)
**Context.** We need to read .docx files with structure (paragraphs, headings, tables, fonts), check them against rules, and show violations in a browser.
**Decision.**
- Server: Python 3.12 + FastAPI + Pydantic. Python has the most mature DOCX tooling (`python-docx`).
- DB: PostgreSQL 16 + SQLAlchemy 2.0. Tables are created on startup for now (`create_all`); Alembic comes later.
- Client: React 18 + TypeScript (strict) + Vite.
- Infra: Docker Compose with `db`, `server`, `client` (nginx) and a dev override for hot reload.

**Consequences.** One language for parsing and rules. The schema is not migrated yet, so any schema change needs a DB reset until Alembic is added.

## ADR-002 – Document model: ordered blocks with character offsets (Accepted)
**Context.** Violations must point at an exact place in the document.
**Decision.** The parser flattens the document into ordered **blocks**: body paragraphs, headings, and each paragraph inside a table cell. Each block has `id`, `text`, a human-readable `label` ("Paragraph 4" / "Table 1, row 2, column 3"), `heading_context` (the nearest heading above it) and `runs`. Runs carry `start`/`end` offsets into `text` plus the resolved font and size (run → character style → paragraph style → document defaults). The parsed blocks are stored as JSON on the `documents` row.
**Consequences.** Every rule, deterministic or LLM, reports `(block_id, start, end)`, and the client highlights exactly that span. Headers, footers, footnotes, text boxes and nested tables are not parsed yet.

## ADR-003 – Hybrid rule engine: LLM rules + deterministic rules (Accepted)
**Context.** The main use case is rules written in natural language ("no numeric figures revealing system performance"), which regex can't express. LLMs can't see formatting (fonts, sizes) and cost money per call.
**Decision.** Rule type `llm` holds a plain-language instruction checked by the LLM. Deterministic types (`forbidden_text`, `required_text`, `max_sentence_words`, `max_paragraph_words`, `allowed_fonts`, `font_size_range`) run in code: free, exact and instant. Each type declares a Pydantic params model, and the client renders its form from that JSON schema (`GET /api/rules/types`).
**Consequences.** Adding a deterministic rule type needs no client change.

## ADR-004 – LLM returns verbatim quotes; the server computes offsets (Accepted)
**Context.** LLMs are unreliable at character offsets, and may paraphrase or invent text.
**Decision.** The LLM gets numbered blocks and returns `{rule_id, block_id, quote, explanation}` via structured output. The server finds `quote` in the block text (then in the other blocks of the same chunk), tolerating curly/straight quotes, Hebrew gershayim/geresh, dashes, whitespace and case. If the quote isn't found, the whole block is flagged and the quote is shown in the message. Unknown rule ids and duplicates are dropped. `block_id = -1` means a document-level violation.
**Consequences.** Highlights always point at real text. A hallucinated quote degrades to a paragraph-level flag instead of a wrong highlight.

## ADR-005 – Stored check reports (`check_runs`) (Accepted)
**Decision.** Every check is stored with its status, violations and summary. `GET /api/documents/{id}/report` returns the latest completed one.
**Consequences.** Re-opening a document doesn't spend LLM quota again.

## ADR-006 – nginx in front of the client (Accepted)
**Decision.** The production client is static files served by nginx, which proxies `/api` to the server, so the app has one origin (no CORS, no hardcoded API URL). Dev uses Vite's proxy instead.
**Alternative considered.** FastAPI serving the built files: one container fewer, but it mixes frontend deployment into the API image.

## ADR-007 – LLM provider: Google Gemini (Accepted; supersedes the initial Claude provider)
**Context.** The product owner chose Google AI Studio with a free Gemini API key.
**Decision.** `google-genai` SDK, `models.generate_content` with native structured output (`response_mime_type="application/json"` + Pydantic `response_schema`). Automatic function calling is disabled (no tools are used). The provider sits behind the `LlmProvider` protocol (`app/llm/base.py`), selected by `LLM_PROVIDER`.
**Consequences.**
- ⚠️ **Data:** on the free tier, Google may use submitted content to improve its products. Confidential documents need organisational approval or a paid / Vertex AI project. The provider interface allows a self-hosted model later.
- `gemini-1.5-*` models no longer exist; see ADR-008 for the model choice.

## ADR-008 – Model choice, fallback and quota safety (Accepted, 2026-09-29)
**Context.** Measured on the free tier (2026-09-29): `gemini-3.8-flash` timed out / 503; `gemini-3.7-flash` 503 (overloaded); `gemini-3.5-flash` OK (~14 s for a trivial prompt); `gemini-3.5-flash-lite` OK (~0.6 s); `gemini-3.1-pro-preview` 429 (no free-tier quota). An early retry policy (4 retries × parallel calls) multiplied requests and wasted free-tier quota.
**Decision.**
- Default model `gemini-3.5-flash`.
- Optional `LLM_FALLBACK_MODELS`, empty by default. On 503/504/timeout, go straight to the next model with no retry on the same one.
- Only 429 is retried, `LLM_MAX_RETRIES=1` by default, with exponential backoff.
- `LLM_TIMEOUT_SECONDS=120`, `LLM_MAX_PARALLEL=1`.
- Worst case per LLM call: `(max_retries + 1) × number_of_models` requests. A unit test enforces this.
- Real-LLM tests never run by default (`addopts = -m "not llm"`); opt in with `pytest -m llm`.

**Consequences.** Predictable quota use. A check can fail with "all models unavailable" when Google is overloaded; the error names each model and its status.

## ADR-009 – Quality gates (Accepted, 2026-09-29)
**Context.** The project wiki requires zero lint/type warnings and tests with every change.
**Decision.**
- Server: Ruff (`E,F,W,I,B,UP,SIM,RUF`, line length 120) + Ruff format + **mypy --strict** with the pydantic plugin (`server/pyproject.toml`). Test code relaxes `disallow_untyped_defs/calls` and `warn_return_any`, since fixtures don't need annotations. The `tests` image runs every gate: `ruff check && ruff format --check && mypy && pytest`.
- Client: ESLint 10 flat config (`@eslint/js` recommended + `typescript-eslint` strict + `react-hooks` 7, including React Compiler rules) with `--max-warnings 0`; `tsc --noEmit`; Vitest + Testing Library + jsdom. `npm run check` runs all three.
- Clean architecture: pure logic lives in `client/src/lib/` (`highlight.ts`, `layout.ts`) and data flow in hooks (`hooks/useDocumentReport.ts`); components render only.
- No `setState` inside effects: selection resets happen during render (hook) or through a React `key` (`ReportView`).

**Consequences.** jsdom is pinned to 25 because jsdom 26+ needs Node ≥ 24.15 (local Node is 24.11). One npm deprecation warning remains from a transitive jsdom dependency (`whatwg-encoding`), which is not our code.

## ADR-010 – Severity levels high / medium / low (Accepted, 2026-09-29)
**Context.** The product owner wants High = red, Medium = orange, Low = yellow. The API used error / warning / info.
**Decision.** `Severity = Literal["low", "medium", "high"]` with a Pydantic `BeforeValidator` that maps the legacy names (error→high, warning→medium, info→low). Stored reports are therefore upgraded on read, and `ReportSummary.by_severity` keys are merged. Stored rules are rewritten once at startup by `app/migrations.py::upgrade_legacy_severities` (idempotent). The default severity is `high`.
**Consequences.** Old clients sending legacy names keep working. Colours: high `#dc2626`, medium `#ea580c`, low `#a16207` (yellow-700, chosen for text contrast on light backgrounds).

## ADR-011 – Rule templates and sample rules (Accepted, 2026-09-29)
**Context.** New users start with an empty rule list and have to learn every rule type's params. The product owner asked for an "Add from template" picker, a one-click "Load Sample Rules" button, and three more deterministic checks (PII, acronym definitions, cross-references).
**Decision.**
- Templates live in server code, `app/rules/templates.py` (`RULE_TEMPLATES`, 11 templates, 6 in the sample set), as the single source of truth; the client only renders `GET /api/rules/templates`. Each template carries a complete `RuleCreate`. Template params go through `validate_rule_params` at import, so a broken template fails at startup.
- `POST /api/rules/samples` is idempotent by rule **name**: existing names are skipped, never overwritten, so a user's edits survive a second click. The AI sample rule is created **disabled** (ADR-008, quota).
- The new checkers are precision-first: they need written structure (dashed SSN, separators or "+" in phone numbers, a Luhn-valid card number with a known prefix, an explicit "Full Name (ABC)", a caption or heading target). Section targets include an outline number recomputed from heading levels, because Word's automatic numbering isn't in the text.
- Larger checkers live in their own modules (`pii.py`, `acronyms.py`, `cross_references.py`); `Finding` moved to `app/rules/finding.py` to avoid an import cycle.

**Consequences.**
- Templates change only through a deploy (no admin UI). A renamed sample rule is created again on the next "Load Sample Rules".
- Known false positives / misses:
  - part numbers like "0301-2345-678" are read as phones;
  - undashed SSNs and unseparated phone numbers are missed;
  - "API SDK" written side by side is skipped;
  - "Chapter N" references are not checked;
  - Word SEQ caption fields are not in the parsed text (caption position is used instead).
- ⚠️ **PII masking is cosmetic, not data protection** (found in integration review). The violation **message** is masked (`•••• 1111`), but the **excerpt** and the stored document blocks contain the full value, and both are kept in the DB and shown in the UI. Protecting stored PII would need excerpt masking plus encryption or retention rules for documents: **open decision for the product owner**.

## ADR-012 – Dashboard UI: Tailwind v4 tokens, glass surfaces, hook/lib split (Accepted, 2026-09-29; surfaces superseded by ADR-014)
**Context.** The spec asks for a dark dashboard with glass surfaces, a split-screen report, filters and click-to-locate, and template/sample features built in parallel with their endpoints.
**Decision.**
- Tailwind CSS v4 via `@tailwindcss/vite` (its peer range covers Vite 5; no PostCSS or `tailwind.config.js`). Tokens live in the `styles.css` `@theme`: accent `#0F172A`, `navy-950`, the severity colours (ADR-010), `animate-flash` (1.5 s). Per-severity class sets are literal strings in `lib/severity.ts` so Tailwind's scanner finds them.
- Surfaces: `GlassPanel` = `rounded-3xl border-white/40 bg-white/70 backdrop-blur-md` over a slate-950→navy gradient; primary buttons are dark `rounded-full` pills; a global `:focus-visible` outline; reduced motion is respected. `dir="auto"` stays on all document text.
- Components render only; state/data in hooks (`useRules`, `useDocuments`, `useRuleTemplates`, `useDocumentReport`, `useViolationFilters`, `useViolationFocus`); pure logic in `lib/`.
- Flash = a keyed overlay element remounted on each click (restarts the animation); `data-active` / `data-flash` / `aria-current` are the stable test hooks.
- Optional endpoints: 404 **and** 405 mean "not provided" (FastAPI answers 405 when a static path collides with `/{rule_id}`); the UI hides the feature instead of erroring.
- E2E: Playwright (`mcr.microsoft.com/playwright:v1.63.0-noble`) on the compose network (`docker-compose.e2e.yml`); the .docx is generated at test time; non-LLM rules only, with a guard that fails if any enabled `llm` rule exists before a check.

**Consequences.** No custom CSS classes to maintain; a new severity needs a token and a `SEVERITY_CLASSES` entry. Array params (e.g. `pii.categories`) are entered as comma-separated text: no multi-select yet.

## ADR-013 – Parallel subagents with worktree isolation (Accepted, 2026-09-29)
**Context.** The product owner asked to run the next tasks with subagents.
**Decision.**
- Spec first: the lead writes the contract into `API_CONTRACTS.md` before starting the agents.
- Each agent works in its own git worktree and branch, with its own Docker compose project and ports, and a `.env` copied from `.env.example` (placeholder key, so no LLM calls are possible).
- Agents do not edit the wiki, TODO or README; they return wiki notes in their report.
- The lead verifies each branch independently (fresh DB, all gates), merges into an integration branch, runs every gate together in a separate worktree, reviews screenshots, and writes the wiki.

**Consequences.** Integration found issues neither agent could see alone: a Playwright locator built from an unescaped label, and the PII masking overstatement. Both agents' worktrees started at the initial commit instead of the intended base; both noticed and branched from the right commit, so the lead should check the base on every hand-back.

## ADR-014 – Opaque dark dashboard, dialogs for rules, no chips (Accepted, 2026-09-29; supersedes the surface part of ADR-012)
**Context.** Product-owner review of the ADR-012 UI:
- translucent white panels (`bg-white/70`) over navy rendered as muddy grey with weak contrast;
- the layout left the main area mostly empty;
- Edit/Delete were plain coloured text and pill buttons didn't read as clickable;
- clicking a rule did nothing;
- follow-ups: thick coloured side borders on cards and blue rings around paragraphs looked bad, and pill "chips" (e.g. "AI · uses quota") are not wanted.

**Decision.**
- **Surfaces:** opaque dark slate (`slate-950` app, `slate-900` panels, `slate-800` borders and rows). The document is a **white page** inside its panel, for reading comfort. No translucent white.
- **Affordances:**
  - indigo primary buttons (`indigo-500`), bordered secondary buttons, icon buttons with tooltips;
  - every interactive element has a hover state;
  - on/off **switches** instead of checkboxes;
  - delete is two-step (Delete → Confirm / Keep).
- **Rules:**
  - every rule row is a button that opens a **details dialog**: full instruction or settings, severity, enable switch, Edit, Delete;
  - create/edit and the template picker are dialogs too;
  - the `Modal` is accessible: focus moves in, Tab is trapped, Escape/backdrop close it, focus returns to the opener.
- **No decoration borders:**
  - violation cards have no coloured side border; severity is a dot + label;
  - the selected card and paragraph use a soft indigo tint;
  - the flash is a background fade with no ring.
- **No chips:** AI and severity markers are plain text + icon/dot; the top-bar counters are plain; the severity filter is one segmented control.
- **Empty state:** drag-and-drop upload zone + recent documents. On phones the main area comes before the sidebar.

**Consequences.** ⚠️ This departs from `project_wiki/claude.md` §4 (glassmorphism, `bg-white/70` panels, dark `#0F172A` pill buttons), based on the product owner's direct feedback. `claude.md` is the owner's rules file and was **not** edited; the owner should update §4 or confirm the exception.

## ADR-015 – Failure isolation: partial reports instead of failed checks (Accepted, 2026-09-29)
**Context.** A code review (2026-09-29) found that one failing piece sank the whole check:
- A Gemini outage (common on the free tier) returned 502 and discarded every deterministic result.
- A bare 500 came from any of: a stored rule whose params no longer validate, an `llm` rule without `instruction`, an AI quote containing a character whose lower case is longer (`İ`), or a malformed .docx.
- A user regex with catastrophic backtracking could block a worker thread with no limit.

**Decision.**
- `run_rules` isolates every rule:
  - Failures go to `summary.failed_rules` (`{rule_id, rule_name, error}`); the rest of the report is still returned and stored.
  - The engine receives a provider **factory**, called only when there are AI rules, so a missing key or an unknown provider fails the AI rules alone.
  - Unexpected exceptions are logged and shown as "Internal error while checking this rule".
- Stored params are validated again at check time. An invalid rule gets a message asking to edit and save it.
- The check fails (502, run stored as `failed`) only when no rule could run, so the last good report stays the latest one.
- User regexes (`forbidden_text`, `required_text`) run on the `regex` package with a 2 s budget per rule for the whole document (`REGEX_TIMEOUT_SECONDS`).
- Upload and delete:
  - An upload is parsed from memory before the file is written. Any parser exception becomes a 400, and the file is removed if the DB insert fails.
  - Delete commits before removing the file.
- Other API safeguards:
  - `RuleUpdate` rejects explicit `null`s (422).
  - "Load Sample Rules" takes a Postgres advisory lock, so two quick clicks can't create duplicates.
  - A global handler keeps the `{"detail"}` shape for 500s.
- When one LLM chunk fails, chunks not yet started are cancelled (saves quota).
- Client:
  - The report view lists the failed rules ("this report is incomplete") and never shows "No violations found ✓" in that case.
  - A check result that arrives after another document was selected is dropped.
  - A root `ErrorBoundary` replaces a blank page with a message and a reload button.

**Consequences.**
- A report can now be partial, and the UI says so explicitly.
- Older clients ignore `failed_rules`, so they may show a partial report as complete: deploy the client together with the server.
- New runtime dependency: `regex` (plus `types-regex` for mypy).
- Router behaviour is now unit-tested in-process (`tests/test_api.py`: TestClient + in-memory SQLite + fake provider).

**Still open (design, not bugs):**
- Check orchestration still lives in the router, not a service layer (needed before background jobs).
- The engine takes the ORM `Rule`.
- `check_llm_rules` reads settings itself.
- No client-side cancel or timeout for a running check (nginx ends it at 600 s → 504).

## ADR-016 – Offline evaluation set for AI rules (Accepted, 2026-09-29)
**Context.** Whether the AI rules find every violation was only spot-checked. Prompt, model or effort changes need a number to compare against.
**Decision.**
- `server/eval/`: 10 labelled documents (English + Hebrew, one with a table, one with no violations) and two AI rules: performance figures and internal architecture details.
- The documents are built as real .docx files at run time and parsed by the production parser; the AI check runs through the production `check_llm_rules`.
- Labels are verbatim quotes:
  - **expected**: 30; they count for recall and precision;
  - **traps**: 20; must not be flagged (years, versions, section/page/figure numbers, counts, prices, vague "performs well");
  - **optional**: 3 borderline cases; they count neither way.
- Matching: same block, overlapping character span. An unlocated finding (quote not found) matches its whole block and is reported separately.
- Metrics per rule and total: **recall** (share of expected violations found), **precision** (share of judged findings that are correct), plus a list of misses and false positives. Traps are marked.
- **Quota safety:**
  - `python -m eval` only prints the plan and the exact call count (10 calls; 20 worst case with retries);
  - it calls the LLM only with `--run` plus confirmation (`--yes` when not interactive);
  - it is never part of `pytest`: the harness tests use a fake provider.
- Results are written to `server/eval/results/` (git-ignored); baselines are copied into this wiki.

**Consequences.** Every prompt or model change is judged against the recorded baseline. Adding a case means adding a document and its labels; a label that doesn't occur in its document fails the tests.

## ADR-018 – Background checks with progress and cancel (Accepted, 2026-09-29)
(ADR-017 is used by the monochrome UI work on `feature/monochrome-ui`.)
**Context.** A check was one blocking HTTP request; long documents with AI rules kept the page waiting with no feedback, and a reload lost the result.
**Decision.**
- `CheckRunner` (`app/checks.py`), one per process: a small thread pool (`CHECK_WORKERS`, default 2) runs `run_rules` in the background. All state is in `check_runs`: `status` (queued → running → completed / failed / cancelled), `progress_done` / `progress_total`, `step`, `finished_at`. Clients poll `GET /api/checks/{id}` (every 1 s in the UI), and a reloaded page reconnects via `GET /api/documents/{id}/checks/latest`.
- Progress: one step for all built-in rules and one per AI request; `Progress` protocol (`rules/progress.py`) with `begin/advance/cancelled`.
- Cancel: the row is marked `cancelled` at once and an in-memory flag is set. The engine checks the flag between steps and raises `CheckCancelled`; an AI request already in flight finishes, but its result is discarded.
- AI requests are now submitted **lazily**, at most `LLM_MAX_PARALLEL` in flight. With a pre-filled pool, the worker started the next queued request before a cancel (or a failure) could stop it. A test caught this: 3 requests instead of 1.
- One active check per document (a lock around find-or-create). A second start returns the running check.
- Startup: `add_missing_columns` (`create_all` doesn't alter existing tables) and `fail_interrupted_checks` (checks left queued/running by a restart become `failed`).
- The synchronous `POST /documents/{id}/check` stays for tests and scripts. Both paths share `finish_run` (with no rule checked → `failed`, else `completed`).

**Consequences.** Single-process design: the cancel flag and worker pool live in memory, so several server replicas would need a shared queue (e.g. a DB-polled job table or Redis). Progress costs one small UPDATE per step.

## ADR-019 – Parser coverage: every text-bearing part of a .docx (Accepted, 2026-09-29)
**Context.** Only body paragraphs and top-level tables were read, so violations in headers, footers, footnotes, text boxes, nested tables, hyperlinks or field results were never found.
**Decision.**
- `Block.part`: `body | header | footer | footnote | endnote | textbox` (default `body`, so stored documents still load).
- Order: body (with text boxes right after the paragraph that holds them), then headers/footers per section, then footnotes, then endnotes. First-occurrence rules (acronyms) therefore see the body first.
- **Headers/footers:** default, first-page and even-page variants per section. Linked ones are skipped, and parts are de-duplicated by identity. Labels like "First-page header (section 2)".
- **Footnotes/endnotes:** read from their XML parts (python-docx 1.2 has no API); separator notes are skipped. Labels "Footnote 3", numbered in part order (Word's display order in practice).
- **Text boxes:** `w:txbxContent`, skipping the VML copy under `mc:Fallback` (Word stores each box twice).
- **Nested tables:** walked recursively. Their cells keep the outer cell's position (that's where the UI draws them) and get a label naming both levels.
- **Run text** includes runs inside `w:hyperlink`, `w:fldSimple` (e.g. SEQ caption numbers), content controls, smart tags and insertions. This fixes the ADR-011 limitation on caption numbers.
- The UI shows Header / Footer / Footnotes / Endnotes as labelled regions of the white page, and text boxes as framed blocks, so click-to-locate works in every part.

**Consequences.** Comments, tracked deletions and chart/SmartArt text are still not read. Footnote numbers assume the part order matches the reference order.
