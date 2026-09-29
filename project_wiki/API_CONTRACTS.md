# API Contracts

Base path `/api`. JSON unless noted. Interactive docs: http://localhost:8000/docs.
Sources of truth: `server/app/schemas.py` (Pydantic) ↔ `client/src/types.ts` (TypeScript). Keep them in sync.

Errors: `{"detail": "<message>"}` with the HTTP status below.

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
| PATCH | `/api/rules/{id}` | `RuleUpdate` | `Rule` | 404, 422 |
| DELETE | `/api/rules/{id}` | – | `204` | 404 |

## Documents & checks
| Method | Path | Body | Response | Errors |
|---|---|---|---|---|
| GET | `/api/documents` | – | `DocumentSummary[]` (newest first) | |
| POST | `/api/documents` | multipart `file` (.docx) | `201 Document` | 400 not .docx / unreadable, 413 > `MAX_UPLOAD_MB` |
| GET | `/api/documents/{id}` | – | `Document` | 404 |
| DELETE | `/api/documents/{id}` | – | `204` (also deletes the file and its reports) | 404 |
| POST | `/api/documents/{id}/check` | `CheckRequest` (optional) | `Report` | 400 no rules, 404, 502 LLM failure |
| GET | `/api/documents/{id}/report` | – | latest completed `Report` | 404 never checked |

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
  summary: { total: number; by_severity: Partial<Record<Severity, number>>; rules_checked: number };
}
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

## Internal LLM contract
`LlmProvider.find_violations(rules: LlmRule[], blocks: LlmBlock[]) -> LlmViolation[]`, where `LlmViolation = {rule_id, block_id | None, quote, explanation}`. See ADR-004 for how quotes become offsets.
