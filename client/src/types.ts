export type Severity = "low" | "medium" | "high";

export const SEVERITIES: readonly Severity[] = ["high", "medium", "low"];

export interface Run {
  start: number;
  end: number;
  text: string;
  font: string | null;
  size_pt: number | null;
  bold: boolean | null;
  italic: boolean | null;
}

export interface Block {
  id: number;
  kind: "paragraph" | "heading" | "table_cell";
  text: string;
  style: string | null;
  heading_level: number | null;
  heading_context: string | null;
  label: string;
  paragraph_index: number | null;
  table_index: number | null;
  row: number | null;
  col: number | null;
  runs: Run[];
}

export interface DocumentSummary {
  id: number;
  filename: string;
  size_bytes: number;
  uploaded_at: string;
}

export interface DocumentFull extends DocumentSummary {
  blocks: Block[];
}

export interface Rule {
  id: number;
  name: string;
  description: string;
  type: string;
  params: Record<string, unknown>;
  severity: Severity;
  enabled: boolean;
  created_at: string;
}

export type RuleInput = Omit<Rule, "id" | "created_at">;

/** POST /api/rules body. Optional fields get server defaults (severity "high", enabled true). */
export interface RuleCreate {
  name: string;
  description?: string;
  type: string;
  params: Record<string, unknown>;
  severity?: Severity;
  enabled?: boolean;
}

export type RuleUpdate = Partial<Pick<RuleCreate, "name" | "description" | "params" | "severity" | "enabled">>;

export type RuleTemplateCategory = "security" | "privacy" | "style" | "structure" | "ai";

export interface RuleTemplate {
  /** Stable slug, e.g. "pii-all" */
  id: string;
  label: string;
  description: string;
  category: RuleTemplateCategory;
  in_sample_set: boolean;
  /** Ready to POST /api/rules; the UI lets the user edit it first. */
  rule: RuleCreate;
}

/** POST /api/rules/samples response; `skipped` lists names that already existed. */
export interface SampleRulesResult {
  created: Rule[];
  skipped: string[];
}

/** Subset of JSON Schema that pydantic produces for rule params. */
export interface ParamSchema {
  type?: "string" | "integer" | "number" | "boolean" | "array";
  title?: string;
  description?: string;
  default?: unknown;
  format?: string;
  items?: { type?: string };
}

export interface RuleType {
  key: string;
  label: string;
  description: string;
  params_schema: {
    properties: Record<string, ParamSchema>;
    required?: string[];
  };
}

export interface Violation {
  id: string;
  rule_id: number;
  rule_name: string;
  severity: Severity;
  message: string;
  block_id: number | null;
  start: number | null;
  end: number | null;
  excerpt: string;
  location: string;
}

export interface Report {
  check_id: number;
  checked_at: string;
  document: DocumentFull;
  violations: Violation[];
  summary: { total: number; by_severity: Partial<Record<Severity, number>>; rules_checked: number };
}
