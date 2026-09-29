import type {
  Block,
  CheckStatus,
  DocumentFull,
  DocumentSummary,
  Report,
  Rule,
  RuleTemplate,
  RuleType,
  Severity,
  Violation,
} from "../types";

export function block(overrides: Partial<Block> & Pick<Block, "id" | "text">): Block {
  return {
    kind: "paragraph",
    style: "Normal",
    heading_level: null,
    heading_context: null,
    label: `Paragraph ${overrides.id + 1}`,
    paragraph_index: overrides.id + 1,
    table_index: null,
    row: null,
    col: null,
    runs: [],
    ...overrides,
  };
}

export function violation(
  overrides: Partial<Violation> & Pick<Violation, "id">,
  severity: Severity = "high",
): Violation {
  return {
    rule_id: 1,
    rule_name: "Rule",
    severity,
    message: "Broken",
    block_id: 0,
    start: null,
    end: null,
    excerpt: "",
    location: "Paragraph 1",
    ...overrides,
  };
}

export const DOC: DocumentFull = {
  id: 1,
  filename: "spec.docx",
  size_bytes: 2048,
  uploaded_at: "2026-09-29T10:00:00Z",
  blocks: [
    block({ id: 0, text: "Performance", kind: "heading", heading_level: 1 }),
    block({ id: 1, text: "The detection range is 50 km.", heading_context: "Performance" }),
    block({ id: 2, text: "Parameter", table_index: 1, row: 1, col: 1, label: "Table 1, row 1, column 1" }),
    block({ id: 3, text: "2 seconds", table_index: 1, row: 1, col: 2, label: "Table 1, row 1, column 2" }),
  ],
};

export function rule(overrides: Partial<Rule> & Pick<Rule, "id">): Rule {
  return {
    name: `Rule ${overrides.id}`,
    description: "",
    type: "forbidden_text",
    params: { pattern: "secret", is_regex: false, case_sensitive: false },
    severity: "high",
    enabled: true,
    created_at: "2026-09-29T09:00:00Z",
    ...overrides,
  };
}

export const RULE_TYPES: RuleType[] = [
  {
    key: "forbidden_text",
    label: "Forbidden text",
    description: "Flags every occurrence of a phrase.",
    params_schema: {
      properties: {
        pattern: { type: "string", title: "Pattern" },
        is_regex: { type: "boolean", title: "Is Regex", default: false },
        case_sensitive: { type: "boolean", title: "Case Sensitive", default: false },
      },
      required: ["pattern"],
    },
  },
  {
    key: "max_sentence_words",
    label: "Max sentence length",
    description: "Flags long sentences.",
    params_schema: { properties: { max_words: { type: "integer", title: "Max Words" } }, required: ["max_words"] },
  },
  {
    key: "llm",
    label: "AI rule",
    description: "Checked by the LLM.",
    params_schema: {
      properties: { instruction: { type: "string", title: "Instruction", format: "textarea" } },
      required: ["instruction"],
    },
  },
];

export function template(overrides: Partial<RuleTemplate> & Pick<RuleTemplate, "id">): RuleTemplate {
  return {
    label: `Template ${overrides.id}`,
    description: "A template",
    category: "security",
    in_sample_set: true,
    rule: {
      name: "No classification markings",
      type: "forbidden_text",
      params: { pattern: "\\b(TOP SECRET|CONFIDENTIAL)\\b", is_regex: true, case_sensitive: true },
      severity: "medium",
      enabled: true,
    },
    ...overrides,
  };
}

export function summary(id: number, filename = `doc-${id}.docx`): DocumentSummary {
  return { id, filename, size_bytes: 4096, uploaded_at: "2026-09-29T10:00:00Z" };
}

export function report(violations: Violation[]): Report {
  return {
    check_id: 9,
    checked_at: "2026-09-29T10:05:00Z",
    document: DOC,
    violations,
    summary: { total: violations.length, by_severity: {}, rules_checked: 1 },
  };
}

export function checkStatus(overrides: Partial<CheckStatus> = {}): CheckStatus {
  return {
    check_id: 50,
    document_id: 1,
    status: "running",
    progress_done: 1,
    progress_total: 4,
    step: "AI rules: part 1 of 3",
    error: null,
    created_at: "2026-09-29T10:04:00Z",
    finished_at: null,
    ...overrides,
  };
}
