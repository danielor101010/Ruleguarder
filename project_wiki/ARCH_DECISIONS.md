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
