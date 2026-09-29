import { cx, SEVERITY_CLASSES, SEVERITY_LABEL } from "../lib/severity";
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
        className="grid grid-cols-3 gap-1 rounded-xl border border-slate-700 bg-slate-950 p-1"
        role="group"
        aria-label="Filter by severity"
      >
        {SEVERITIES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={severities.has(s)}
            onClick={() => onToggleSeverity(s)}
            className={cx(
              "inline-flex items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200",
              SEVERITY_CLASSES[s].segment,
            )}
          >
            <SeverityDot severity={s} />
            {SEVERITY_LABEL[s]}
            <span className="tabular-nums">{counts[s] ?? 0}</span>
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs font-medium text-slate-400">
        Rule
        <select
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 hover:border-slate-600"
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
        <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-800 px-3 py-2 text-sm text-slate-300">
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
                  "flex w-full flex-col gap-1.5 rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                  active
                    ? "border-indigo-400/60 bg-indigo-500/15"
                    : "border-slate-700/80 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800",
                )}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={v.severity} />
                  <strong className="font-semibold text-white" dir="auto">
                    {v.rule_name}
                  </strong>
                  {isDocumentLevel(v) && (
                    <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[0.7rem] font-semibold text-slate-100">
                      Whole document
                    </span>
                  )}
                </span>
                <span className="text-slate-200" dir="auto">
                  {v.message}
                </span>
                {v.excerpt && (
                  <span className="rounded-lg bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-400" dir="auto">
                    {v.excerpt}
                  </span>
                )}
                {!isDocumentLevel(v) && (
                  <span className="text-xs text-slate-500" dir="auto">
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
