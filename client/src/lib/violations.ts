import { SEVERITIES, type Severity, type Violation } from "../types";

export interface ViolationFilter {
  /** Severities to show; all three by default. */
  severities: ReadonlySet<Severity>;
  /** Show only this rule's violations; null => every rule. */
  ruleId: number | null;
}

export const ALL_SEVERITIES: ReadonlySet<Severity> = new Set(SEVERITIES);

export interface RuleOption {
  ruleId: number;
  ruleName: string;
  count: number;
}

export function isDocumentLevel(v: Violation): boolean {
  return v.block_id === null;
}

/** Document-level violations (block_id null) first; otherwise keep the server's order (block, then offset). */
export function documentLevelFirst(violations: readonly Violation[]): Violation[] {
  return [...violations.filter(isDocumentLevel), ...violations.filter((v) => !isDocumentLevel(v))];
}

export function filterViolations(violations: readonly Violation[], filter: ViolationFilter): Violation[] {
  return violations.filter(
    (v) => filter.severities.has(v.severity) && (filter.ruleId === null || v.rule_id === filter.ruleId),
  );
}

/** One option per rule that has violations, sorted by name, for the rule filter. */
export function ruleOptions(violations: readonly Violation[]): RuleOption[] {
  const byRule = new Map<number, RuleOption>();
  for (const v of violations) {
    const option = byRule.get(v.rule_id);
    if (option) option.count++;
    else byRule.set(v.rule_id, { ruleId: v.rule_id, ruleName: v.rule_name, count: 1 });
  }
  return [...byRule.values()].sort((a, b) => a.ruleName.localeCompare(b.ruleName) || a.ruleId - b.ruleId);
}

export function toggleSeverity(selected: ReadonlySet<Severity>, severity: Severity): Set<Severity> {
  const next = new Set(selected);
  if (next.has(severity)) next.delete(severity);
  else next.add(severity);
  return next;
}
