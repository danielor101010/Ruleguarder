import { cx, SEVERITY_LABEL } from "../lib/severity";
import { isDocumentLevel, type RuleOption } from "../lib/violations";
import { SEVERITIES, type Severity, type Violation } from "../types";
import { Button, SeverityBadge, SeverityDot } from "./ui";

interface Props {
  /** Already filtered, document-level first. */
  violations: Violation[];
  total: number;
  severities: ReadonlySet<Severity>;
  counts: Partial<Record<Severity, number>>;
  onToggleSeverity: (s: Severity) => void;
  rules: RuleOption[];
  ruleId: number | null;
  onRuleChange: (ruleId: number | null) => void;
  isFiltered: boolean;
  onClearFilters: () => void;
  activeId: string | null;
  onPick: (v: Violation) => void;
  registerItem: (id: string) => (el: HTMLElement | null) => void;
}

export default function ViolationsPanel({
  violations,
  total,
  severities,
  counts,
  onToggleSeverity,
  rules,
  ruleId,
  onRuleChange,
  isFiltered,
  onClearFilters,
  activeId,
  onPick,
  registerItem,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div
        className="grid grid-cols-3 gap-1 rounded-full bg-zinc-200/70 p-1"
        role="group"
        aria-label="Filter by severity"
      >
        {SEVERITIES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={severities.has(s)}
            onClick={() => onToggleSeverity(s)}
            className="inline-flex items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-semibold text-zinc-400 transition-colors hover:text-zinc-900 aria-pressed:bg-white aria-pressed:text-zinc-900 aria-pressed:shadow-sm"
          >
            <SeverityDot severity={s} />
            {SEVERITY_LABEL[s]}
            <span className="tabular-nums">{counts[s] ?? 0}</span>
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs font-medium text-zinc-500">
        Rule
        <select
          className="min-w-0 flex-1 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 hover:border-zinc-400"
          value={ruleId ?? ""}
          onChange={(e) => onRuleChange(e.target.value === "" ? null : Number(e.target.value))}
          aria-label="Filter by rule"
        >
          <option value="">All rules ({total})</option>
          {rules.map((r) => (
            <option key={r.ruleId} value={r.ruleId}>
              {r.ruleName} ({r.count})
            </option>
          ))}
        </select>
      </label>

      {violations.length === 0 && isFiltered && (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-zinc-100 px-3 py-2 text-sm text-zinc-700">
          No violations match the filters.
          <Button variant="secondary" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        </div>
      )}

      <ul className="flex flex-col gap-2" aria-label="Violations list">
        {violations.map((v) => {
          const active = v.id === activeId;
          return (
            <li key={v.id}>
              <button
                ref={registerItem(v.id)}
                type="button"
                aria-current={active ? "true" : undefined}
                data-active={active || undefined}
                onClick={() => onPick(v)}
                className={cx(
                  "flex w-full flex-col gap-1.5 rounded-2xl border px-4 py-3 text-left text-sm transition-colors",
                  active ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white hover:border-zinc-400",
                )}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={v.severity} />
                  <strong className="font-semibold text-zinc-900" dir="auto">
                    {v.rule_name}
                  </strong>
                  {isDocumentLevel(v) && (
                    <span className="text-xs text-zinc-500">· Whole document</span>
                  )}
                </span>
                <span className="text-zinc-700" dir="auto">
                  {v.message}
                </span>
                {v.excerpt && (
                  <span className="rounded-xl bg-zinc-100 px-2.5 py-1.5 text-xs text-zinc-600" dir="auto">
                    {v.excerpt}
                  </span>
                )}
                {!isDocumentLevel(v) && (
                  <span className="text-xs text-zinc-400" dir="auto">
                    {v.location}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
