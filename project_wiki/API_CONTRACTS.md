# API Contracts

Base path `/api`. JSON unless noted. Interactive docs: http://localhost:8000/docs.
Sources of truth: `server/app/schemas.py` (Pydantic) ↔ `client/src/types.ts` (TypeScript). Keep them in sync.

Errors: `{"detail": "<message>"}` with the HTTP status below. Unexpected server errors keep this shape too: `500 {"detail": "Internal server error"}`.

---

## Health
| Method | Path | Response |
|---|---|---|
| GET | `/api/health` | `{"status": "ok"}` |

## Rules
| Method | Path | Body | Response | Errors |
|---|---|---|---|---|
| GET | `/api/rules/types` | – | `RuleType[]` | |
| GET | `/api/rules` | – | `Rule[]` | |
| POST | `/api/rules` | `RuleCreate` | `201 Rule` | 422 invalid type/params |
| PATCH | `/api/rules/{id}` | `RuleUpdate` | `Rule` | 404, 422 (also for an explicit `null`: leave a field out to keep it) |
| DELETE | `/api/rules/{id}` | – | `204` | 404 |

## Documents & checks
| Method | Path | Body | Response | Errors |
|---|---|---|---|---|
| GET | `/api/documents` | – | `DocumentSummary[]` (newest first) | |
| POST | `/api/documents` | multipart `file` (.docx) | `201 Document` | 400 not .docx / unreadable, 413 > `MAX_UPLOAD_MB` |
| GET | `/api/documents/{id}` | – | `Document` | 404 |
| DELETE | `/api/documents/{id}` | – | `204` (also deletes the file and its reports) | 404 |
| POST | `/api/documents/{id}/check` | `CheckRequest` (optional) | `Report` (possibly partial, see `failed_rules`) | 400 no rules, 404, 502 only when **no** rule could be checked |
| GET | `/api/documents/{id}/report` | – | latest completed `Report` | 404 never checked |

A rule that can't be checked (AI unavailable or out of quota, stored params no longer valid, a user regex over its 2 s budget, a checker bug) does not fail the check: it is listed in `summary.failed_rules`, and every other rule's result is returned and stored (ADR-015). When every rule failed, the run is stored as `failed`, the response is `502 "No rule could be checked. <reasons>"`, and `GET …/report` keeps returning the previous completed report.

`POST …/check` is synchronous: an LLM check can take up to about `LLM_TIMEOUT_SECONDS` × requests. nginx allows 600 s.

---

## Models

```ts
type Severity = "low" | "medium" | "high";   // legacy input "info" | "warning" | "error" is accepted and mapped

interface RuleCreate {
  name: string;               // 1..200
  description?: string;
  type: string;               // key from /api/rules/types
  params: Record<string, unknown>;   // validated against the type's params schema
  severity?: Severity;        // default "high"
  enabled?: boolean;          // default true
}
type RuleUpdate = Partial<Pick<RuleCreate, "name" | "description" | "params" | "severity" | "enabled">>;
interface Rule extends Required<RuleCreate> { id: number; created_at: string }

interface RuleType {
  key: string; label: string; description: string;
  params_schema: { properties: Record<string, ParamSchema>; required?: string[] };  // Pydantic JSON schema
}

interface Run   { start: number; end: number; text: string; font: string | null; size_pt: number | null;
                  bold: boolean | null; italic: boolean | null }
interface Block { id: number; kind: "paragraph" | "heading" | "table_cell"; text: string; style: string | null;
                  heading_level: number | null;   // 0 = Title
                  heading_context: string | null; label: string;
                  paragraph_index: number | null; table_index: number | null; row: number | null; col: number | null;
                  runs: Run[] }

interface DocumentSummary { id: number; filename: string; size_bytes: number; uploaded_at: string }
interface Document extends DocumentSummary { blocks: Block[] }

interface CheckRequest { rule_ids?: number[] | null }   // null/omitted => all enabled rules

interface Violation {
  id: string;                 // "<rule_id>-<n>", unique within a report
  rule_id: number; rule_name: string; severity: Severity;
  message: string;
  block_id: number | null;    // null => whole document
  start: number | null;       // null (with block_id set) => whole block flagged
  end: number | null;
  excerpt: string;            // text around the span
  location: string;           // e.g. 'Paragraph 4, under "Performance"'
}

interface Report {
  check_id: number; checked_at: string;
  document: Document;
  violations: Violation[];    // sorted: document-level first, then by block and offset
  summary: {
    total: number; by_severity: Partial<Record<Severity, number>>;
    rules_checked: number;         // rules that ran successfully
    failed_rules: FailedRule[];    // [] in reports stored before this field existed
  };
}
interface FailedRule { rule_id: number; rule_name: string; error: string }   // error is shown to the user
```

## Rule types and params
| key | Checked by | params |
|---|---|---|
| `llm` | LLM | `instruction: string` (min 3) |
| `forbidden_text` | code | `pattern: string`, `is_regex: bool = false`, `case_sensitive: bool = false` |
| `required_text` | code | same as above; a violation is document-level |
| `max_sentence_words` | code | `max_words: int > 0` |
| `max_paragraph_words` | code | `max_words: int > 0` |
| `allowed_fonts` | code | `fonts: string[]` (min 1) |
| `font_size_range` | code | `min_pt: float = 0`, `max_pt: float = 200` (min ≤ max) |
| `pii` | code | `categories: ("ssn" \| "phone" \| "email" \| "credit_card")[]` (default all) |
| `acronym_definitions` | code | `min_length: int = 2`, `max_length: int = 6`, `ignore: string[]` |
| `cross_references` | code | `kinds: ("section" \| "figure" \| "table")[]` (default all) |

## Internal LLM contract
`LlmProvider.find_violations(rules: LlmRule[], blocks: LlmBlock[]) -> LlmViolation[]`, where `LlmViolation = {rule_id, block_id | None, quote, explanation}`. See ADR-004 for how quotes become offsets.

---

## Rule templates & sample rules — `feature/rule-templates`
Status: **implemented** (2026-09-29). Refinements made during implementation:
- `pii`: SSN is US and dashed only; credit cards need a known card prefix as well as Luhn; each span is reported under one category (email > card > SSN > phone); masking keeps the last 4 (SSN, card) or last 2 (phone) digits. **Excerpts are not masked** (ADR-011).
- `acronym_definitions`: `max_length` ≤ 20 and `min_length` ≤ `max_length`; the acronym needs ≥ 2 letters; headings, runs of 2+ all-caps words (markings) and Roman numerals are skipped; the full name must plausibly expand the acronym.
- `cross_references`: "Figure N" starts a caption only when followed by `:`, `.`, a dash or end of text; "Fig" without a dot is accepted; "Section N of <Capitalised>" is treated as external; lists/ranges are checked number by number (range endpoints only).
- `POST /samples`: `skipped` = names already present (exact, case-sensitive). The markings sample uses `case_sensitive: true`.
- JSON schema for list params: `{"type":"array","items":{"enum":[...],"type":"string"}}`.
- Both static routes are registered before `/{rule_id}` (otherwise FastAPI answers 405).

### New deterministic rule types
| key | params | Finding |
|---|---|---|
| `pii` | `categories: ("ssn" \| "phone" \| "email" \| "credit_card")[]` (default: all four, min 1) | One per match, at the exact span. The message names the category and **masks** the value (e.g. `Credit card number (•••• 1111)`, `Email address (j•••@example.com)`) |
| `acronym_definitions` | `min_length: int = 2`, `max_length: int = 6`, `ignore: string[]` (default common tokens, e.g. `["OK","PDF","USA","UK","EU","ID","TV","AM","PM"]`) | Only the **first occurrence** of each acronym (all-caps token, digits allowed after the first letter) that is not defined there. Defined = written as `Full Name (ABC)` or `ABC (Full Name)` at that first occurrence. One finding per acronym |
| `cross_references` | `kinds: ("section" \| "figure" \| "table")[]` (default all) | One per reference (`Section 3.2`, `see Figure 4`, `Table 2`, case-insensitive; `Sec.`/`Fig.` abbreviations) whose target doesn't exist. Targets: **section** = a heading whose text starts with that number, or whose computed outline number (from heading levels; Title excluded) matches; **figure** = a caption paragraph (style `Caption`, or text starting `Figure N`); **table** = a caption `Table N`, or the N-th table in the document. A caption itself is not a reference |

### New endpoints
| Method | Path | Response |
|---|---|---|
| GET | `/api/rules/templates` | `RuleTemplate[]` |
| POST | `/api/rules/samples` | `201 { created: Rule[], skipped: string[] }`: creates every template with `in_sample_set: true`, skipping names that already exist (idempotent) |

```ts
interface RuleTemplate {
  id: string;                 // stable slug, e.g. "pii-all"
  label: string;
  description: string;
  category: "security" | "privacy" | "style" | "structure" | "ai";
  in_sample_set: boolean;
  rule: RuleCreate;           // ready to POST /api/rules (the UI may let the user edit it first)
}
```
Sample set: PII (all), acronym definitions, cross-references, forbidden classification markings (regex `\b(TOP SECRET|CONFIDENTIAL|RESTRICTED)\b`), max sentence length 40, **and** an AI rule "No performance figures". The AI rule is created **disabled** (`enabled: false`) because running it spends LLM quota.

---

## Dashboard UI — `feature/dashboard-ui`
Status: **implemented** (2026-09-29), see ADR-012. The client treats 404 and 405 on optional endpoints as "not provided".
- **Stack:** Tailwind CSS (Vite plugin); `styles.css` is replaced. English, LTR.
- **Design:** dark slate/navy dashboard shell (`slate-950` → navy gradient). Content surfaces use the wiki's glass tokens (`backdrop-blur-md bg-white/70 border border-white/40 rounded-2xl/3xl`); primary buttons are dark pills (`#0F172A`, `rounded-full`). Accessible contrast and visible focus rings.
- **Layout:** top bar (brand, document name, severity counters). Left sidebar: Rules panel (New rule, **Add from template** picker, **Load Sample Rules** button, enable toggles) and Documents panel (upload, list). Main: **split screen**. Left = document paragraphs with severity highlights (High red, Medium orange, Low yellow). Right = violations list with severity filter chips (with counts) and a rule filter. Clicking a violation smoothly scrolls to the paragraph and **flashes** it (~1.5 s), and it stays marked active.
- **Architecture:** components render only. Data in hooks (`useRules`, `useDocuments`, `useDocumentReport`, `useRuleTemplates`); pure logic in `lib/`.
- **Tests:** Vitest for new hooks/components. Playwright E2E against the running stack, using **non-LLM rules only** (never triggers a Gemini call).
