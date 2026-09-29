import { useCallback, useMemo, useState } from "react";
import { countBySeverity } from "../lib/highlight";
import {
  ALL_SEVERITIES,
  documentLevelFirst,
  filterViolations,
  ruleOptions,
  toggleSeverity as toggle,
} from "../lib/violations";
import type { Severity, Violation } from "../types";

/**
 * Severity chips + rule filter over a report's violations.
 * Chip counts reflect the rule filter, so they always match what a chip would show.
 * Reset by giving the owning component a new `key` per report.
 */
export function useViolationFilters(violations: readonly Violation[]) {
  const [severities, setSeverities] = useState<ReadonlySet<Severity>>(ALL_SEVERITIES);
  const [ruleId, setRuleId] = useState<number | null>(null);

  const rules = useMemo(() => ruleOptions(violations), [violations]);
  // A stale rule filter (rule no longer in this report) behaves like "all rules"
  const effectiveRuleId = ruleId !== null && rules.some((r) => r.ruleId === ruleId) ? ruleId : null;

  const counts = useMemo(
    () => countBySeverity(filterViolations(violations, { severities: ALL_SEVERITIES, ruleId: effectiveRuleId })),
    [violations, effectiveRuleId],
  );
  const visible = useMemo(
    () => documentLevelFirst(filterViolations(violations, { severities, ruleId: effectiveRuleId })),
    [violations, severities, effectiveRuleId],
  );

  const toggleSeverity = useCallback((s: Severity) => setSeverities((current) => toggle(current, s)), []);
  const clear = useCallback(() => {
    setSeverities(ALL_SEVERITIES);
    setRuleId(null);
  }, []);

  const isFiltered = effectiveRuleId !== null || severities.size !== ALL_SEVERITIES.size;

  return { severities, toggleSeverity, ruleId: effectiveRuleId, setRuleId, rules, counts, visible, isFiltered, clear };
}
