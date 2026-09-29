# Development Log

Newest first. Branch chain so far (nothing merged into `dev` / `main` yet):

```
dev → feature/project-scaffold → feature/gemini-integration → feature/e2e-tests → fix/gemini-overload-fallback
```

---

## 2026-09-29 – `fix/gemini-overload-fallback`
**Problem.** The real-Gemini E2E test took 154 s. Logs showed `gemini-3.8-flash` answering 503 "high demand" repeatedly, and each 503 took up to ~40 s to arrive. The retry policy (4 retries, 2 parallel calls) multiplied requests. About 21 real requests were spent during diagnosis, without asking the product owner first. That was a process mistake, now prevented by the changes below.
**Changes.**
- Default model `gemini-3.5-flash` (verified working on the free tier).
- Model fallback chain (`LLM_FALLBACK_MODELS`, empty by default): 503/504/timeout go to the next model immediately.
- Only 429 is retried; `LLM_MAX_RETRIES=1`, `LLM_MAX_PARALLEL=1`, `LLM_TIMEOUT_SECONDS=120`.
- Automatic function calling disabled, which removes the SDK warning logged on every call.
- Real-LLM tests are opt-in only (`pytest -m llm`).
- Unit tests for fallback, timeout, rate limiting, bounded request count, error messages.

**Tests.** 50 passed, 1 deselected (real LLM).
**Process rule adopted.** No real LLM API calls without the product owner's explicit OK.

## 2026-09-29 – Real-Gemini E2E run (on `feature/e2e-tests`)
- `test_llm_rule_finds_performance_figures` **passed** against real Gemini: it found "50 km", "3 m", and "2 seconds" inside a table cell. It took 154 s because of 503 retries; fixed above.

## 2026-09-29 – `feature/e2e-tests`
- pytest suite: parser, deterministic rules, LLM pipeline (fake provider), Gemini provider (mocked SDK).
- E2E tests through the running API using a generated sample .docx (`tests/sample_doc.py`).
- `tests` compose service (profile `test`), built from a `test` stage in `server/Dockerfile`.
- **Bug fixed:** the parser silently dropped table cells. Merged-cell dedup used `id()` of short-lived lxml proxies, so ids were reused; it now keeps the element objects themselves. A regression test was added for merged cells.
- The DB port is no longer published in prod (it clashed with a local Postgres); dev publishes 5433.
- Full stack verified: http://localhost:8080 → nginx → API → Postgres.

## 2026-09-29 – `feature/gemini-integration`
- Replaced the Anthropic SDK with `google-genai`; structured output with a Pydantic schema.
- `GEMINI_API_KEY` + `LLM_*` settings; free-tier data-use warning in `.env.example`.
- `.gitattributes` forces LF (the Windows checkout converted to CRLF).

## 2026-09-29 – `feature/project-scaffold`
- DOCX parser, rule registry (deterministic + LLM), LLM chunking and quote locator, rule engine.
- API: rules CRUD, rule types, documents upload/list/get/delete, check, latest report.
- React client: rules panel (schema-driven form), documents panel, report view with highlights and a violations list.
- Docker Compose (prod + dev), `.env.example`.

---

## Open items
- Real-LLM E2E rerun on `gemini-3.5-flash` (needs product-owner OK, since it spends quota).
- Quality gates required by the wiki rules: Ruff + mypy (server), ESLint + Vitest (client), zero warnings.
- UI redesign: the wiki's design system (glassmorphism, Tailwind) vs the earlier request (slate / dark navy dashboard). Needs a decision.
- Severity rename to High / Medium / Low.
- Rule templates: PII regex, acronym definitions, cross-references.
