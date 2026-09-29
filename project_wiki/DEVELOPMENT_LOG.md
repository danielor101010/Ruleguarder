# Development Log

Newest first. Branch chain so far (nothing merged into `dev` / `main` yet):

```
dev → feature/project-scaffold → feature/gemini-integration → feature/e2e-tests → fix/gemini-overload-fallback → feature/quality-gates → refactor/severity-levels
   ├→ feature/rule-templates  (subagent 1) ─┐
   └→ feature/dashboard-ui    (subagent 2) ─┴→ feature/templates-dashboard-integration
```

---

## 2026-09-29 – `feature/monochrome-ui` (follow-up)
- Owner feedback: too bright; wants a small coloured dot per level and colour in the document highlights (ADR-017 amendment).
- Grey app background and off-white panels. 6 px severity dots (red / orange / yellow) in labels, top-bar counts and the filter. Coloured highlight tints with the underline styles kept; the active highlight deepens its tint.
- **Tests:** client 103 passed. The severity test now checks that colour appears only in dots and highlights, and that the active highlight differs from the normal one.

## 2026-09-29 – `feature/monochrome-ui`
- Redesign on the product owner's request: no colours and no dots (ADR-017).
- Light monochrome theme (zinc greys, white panels, black pill buttons). Severity is shown by text weight, highlight shade and underline style (solid / dashed / dotted). The active highlight inverts to black.
- Removed: severity dots (`SeverityDot`), the sparkles icon, the ✓, the coloured logo tile, the header count pills, and all red/orange/yellow/indigo/emerald/violet/amber classes. `IconButton` lost its `tone` prop. New `StatusNote`; error and warning notes share one neutral `Note`.
- Verified in the real app (Vite against the running API, screenshots at 1440 px and 390 px). No check was run, so no LLM calls were made.
- **Tests:** client 103 passed (+4: `lib/severity.test.ts` for no hues and a distinct underline style and shade per severity; the active highlight inverts). ESLint 0 warnings, `tsc` clean.

## 2026-09-29 – `feature/llm-eval-set` (M2, lead)
- Evaluation harness for AI rules (ADR-016): 10 labelled documents (en/he), 30 expected violations, 20 traps, 3 optional; scoring by span overlap; recall/precision per rule; misses and false positives listed.
- `python -m eval` prints the plan (10 API calls); `--run --yes` calls the LLM. Added `count_llm_calls()` to `llm_check`.
- **Tests:** server 203 passed (+21: every label occurs in its document, dataset shape, scoring incl. overlap, optional, unlocated, trap hits, totals, and the CLI never creates a provider in plan mode). ruff, format, mypy --strict clean.
- **Baseline: not run yet.** It needs the product owner's OK (10 API calls).

## 2026-09-29 – `feature/readme` (lead)
- README rewritten as a concise product README: features, architecture, getting started, configuration, data-privacy note, usage, testing, project structure. History and decisions stay in `project_wiki/`.
- M1 (delete confirmation pop-up) cancelled by the product owner.
- Branches pushed to `origin`; `dev` merged into `main`.

## 2026-09-29 – `fix/check-robustness`
Fixes from a code review of business logic, separation and fallbacks. See ADR-015.
- **Partial reports:** an AI outage, invalid stored params, a checker bug or a slow regex fail only that rule (`summary.failed_rules`). The check returns 502 only when no rule could run.
- **Crashes fixed:**
  - `find_span` IndexError on characters whose lower case is longer (`İ`, `ß`): case folding now keeps an index map;
  - malformed .docx → 400 instead of 500, and no orphan upload file;
  - `PATCH` with `null` → 422 instead of an IntegrityError 500;
  - catastrophic user regex → stopped after 2 s (`regex` package).
- **Smaller:**
  - JSON body for 500s;
  - Postgres advisory lock on `/samples`;
  - delete commits before removing the file;
  - queued LLM chunks cancelled after a failure.
- **Client:**
  - "incomplete report" warning;
  - a stale check result is dropped when the selection changed (race);
  - root `ErrorBoundary`.
- **Verification** (isolated stack with Postgres):
  - server: ruff ✅, format ✅, mypy --strict ✅, **182 passed** (+28, incl. new in-process API tests);
  - client: eslint 0 warnings ✅, tsc ✅, **99 passed** (+6), build ✅;
  - Playwright: 5 passed, 1 skipped (expected);
  - live check through nginx with the AI provider disabled: 200, forbidden-text result present, AI rule listed as failed.

## 2026-09-29 – Product owner check
- Real AI rules verified by the product owner on `gemini-3.5-flash`: working.
- `claude.md` §4 stays as is (owner's decision); the app follows ADR-014.

## 2026-09-29 – `fix/dashboard-ux` (lead)
**Feedback (product owner, with screenshots):** the layout and colours look bad, buttons don't look clickable, clicking a rule does nothing ("I need to see the rule in a pop-up"), coloured card side borders and blue paragraph rings look bad, no chips.
**Changes** (see ADR-014):
- opaque dark UI with the document on a white page;
- rule details dialog; create/edit and template picker as dialogs;
- indigo primary, bordered secondary and icon buttons; switches; two-step delete;
- soft tints instead of borders and rings; plain text instead of chips; segmented severity filter;
- upload drop zone + recent documents; phone order: main area first.

**Tests:**
- client: **93 passed** (+7: rule details dialog incl. full instruction, settings, edit/toggle/delete from the dialog, delete confirmation, Escape + focus return, file-size formatting); ESLint 0 warnings; build ✅
- Playwright on a throwaway stack: **5 passed, 1 skipped** (expected)

**Notes:**
- A11y fix found by tests: the details dialog had two buttons named "Close"; the footer one was removed.
- A Playwright run first failed 3 tests because demo data left AI rules enabled; the E2E quota guard refused to check (working as intended).
- Screenshots were reviewed at 1600 px and 390 px. The user's app on :8080 was rebuilt.

## 2026-09-29 – `feature/templates-dashboard-integration` (lead)
- Merged `feature/rule-templates` and `feature/dashboard-ui` (no conflicts).
- **Verification:** templates branch re-run by the lead on a fresh DB (154 passed). Integrated stack in a separate worktree with a placeholder key:
  - server: ruff ✅, format ✅, mypy --strict ✅, **154 passed**
  - client: eslint 0 warnings ✅, tsc ✅, **86 passed**, build ✅
  - Playwright: **5 passed, 1 skipped** (the skip is the "endpoints missing" fallback test, correct now that the endpoints exist)
- **Bugs found in integration:**
  - The Playwright template test built a RegExp from an unescaped label ("No personal data (PII)"), so it never matched once the real endpoints existed. Fixed with `escapeRegExp`. A first attempt had broken escaping; ESLint caught it, and it was fixed in a follow-up commit.
  - PII masking is cosmetic (full values remain in excerpts and stored documents); recorded in ADR-011 as an open decision.
- **Demo check** (sample rules, placeholder key, AI rule off): a test .docx produced 9 violations (5 high, 2 medium, 2 low), all correctly located and masked in messages. Screenshots were reviewed at 1440 px and 390 px.
- Housekeeping: `*.tsbuildinfo` untracked and ignored; `.claude/worktrees/` ignored; agent worktrees, temporary stacks and images removed. The main app on :8080 was rebuilt to this version; the user's 2 rules were kept and upgraded to the new severity names.

## 2026-09-29 – `feature/dashboard-ui` (subagent 2)
- Tailwind v4 dashboard: dark slate/navy shell, glass panels, dark pill buttons, focus rings; stacks below `lg`. See ADR-012.
- Split screen: document with High/Medium/Low highlights | violations with severity chips (counts) and a rule filter; document-level violations first. A click smooth-scrolls, flashes for 1.5 s and keeps the paragraph active; clicking a highlight selects its card.
- Rules sidebar: "Add from template", "Load Sample Rules" ("N added, M already present"), "AI · uses quota" badge; new blank rules default to a non-AI type; template features hide on 404/405.
- **Tests:** client 86 (+54); Playwright E2E in Docker (`docker-compose.e2e.yml`).

## 2026-09-29 – `feature/rule-templates` (subagent 1)
- New deterministic rule types:
  - `pii` (email, credit card with Luhn + prefix, US SSN, phone; masked messages);
  - `acronym_definitions`;
  - `cross_references` (section/figure/table, computed outline numbers, captions, lists/ranges).
- `RULE_TEMPLATES` (11, 6 in the sample set); `GET /api/rules/templates`, `POST /api/rules/samples` (idempotent by name, AI sample disabled).
- **Tests:** server 154 (+96, incl. many negative PII cases: dates, versions, "50 km", IPs, ISBN).

## 2026-09-29 – `refactor/severity-levels`
- error / warning / info → **high / medium / low** across API, DB, client and CSS (red / orange / yellow). See ADR-010.
- Legacy values accepted on input and upgraded on read; stored rules upgraded at startup (idempotent, verified against Postgres).
- **Tests:** server 58 passed (+8: legacy mapping, rejection of unknown values, default, summary key merge, SQLite migration incl. idempotency); client 32 passed.

## 2026-09-29 – `feature/quality-gates`
- **Server:** Ruff + strict mypy added; 8 lint and 31 type findings fixed. The rule registry is now typed per params model. `zip(strict=True)` in LLM result merging. Explicit `bool` in style resolution.
- **Client:** ESLint 10 + `tsc --noEmit` + Vitest. 9 lint findings fixed:
  - `setState` in effects (App, ReportView) → `useDocumentReport` hook + keyed `ReportView`
  - non-null assertions → typed `SpanViolation`
  - `void` generic in the API client → `requestNoContent`
  - a dynamic heading tag flagged by the React Compiler → `createElement`
- Logic extracted to `lib/highlight.ts`, `lib/layout.ts`, `hooks/useDocumentReport.ts`.
- **Tests:** server 50 passed; client 32 passed (highlight segmentation incl. overlaps/clamping, table layout incl. merged cells, API client errors/204/network failure, report hook incl. the 404 → bare-document fallback and failed checks, ReportView highlight/click-to-scroll/counts).

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
Planned work (M1–M4, L1, backlog) lives in `TODO.md` → *Missions*.
- PII data protection: masking is cosmetic (ADR-011). Decide on excerpt masking and document retention/encryption.
