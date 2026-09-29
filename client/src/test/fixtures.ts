import type { Block, DocumentFull, Report, Severity, Violation } from "../types";

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
  severity: Severity = "error",
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

export function report(violations: Violation[]): Report {
  return {
    check_id: 9,
    checked_at: "2026-09-29T10:05:00Z",
    document: DOC,
    violations,
    summary: { total: violations.length, by_severity: {}, rules_checked: 1 },
  };
}
