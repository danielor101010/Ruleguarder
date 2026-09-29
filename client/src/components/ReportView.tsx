import { useMemo } from "react";
import { useViolationFilters } from "../hooks/useViolationFilters";
import { useViolationFocus } from "../hooks/useViolationFocus";
import { violationsByBlock } from "../lib/highlight";
import type { DocumentFull, Violation } from "../types";
import DocumentPane from "./DocumentPane";
import { AiQuotaBadge, Button, GlassPanel } from "./ui";
import ViolationsPanel from "./ViolationsPanel";

interface Props {
  document: DocumentFull;
  violations: Violation[] | null; // null => not checked yet
  checking: boolean;
  checkedAt: string | null;
  /** Enabled rules of type `llm`: a check will spend AI quota. */
  aiRulesEnabled: number;
  onCheck: () => void;
}

const NO_VIOLATIONS: Violation[] = [];

/** Split screen: document with highlights (left) and the violations list (right). Key it per document/report. */
export default function ReportView({ document, violations, checking, checkedAt, aiRulesEnabled, onCheck }: Props) {
  const filters = useViolationFilters(violations ?? NO_VIOLATIONS);
  const focus = useViolationFocus();
  const byBlock = useMemo(() => violationsByBlock(filters.visible), [filters.visible]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <GlassPanel className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-slate-900" dir="auto" title={document.filename}>
            {document.filename}
          </h2>
          <p className="text-xs text-slate-600">
            {checkedAt ? `Checked ${new Date(checkedAt).toLocaleString()}` : "Not checked yet"}
          </p>
        </div>
        {aiRulesEnabled > 0 && (
          <span className="flex items-center gap-2 text-xs text-slate-700">
            <AiQuotaBadge />
            {aiRulesEnabled} AI {aiRulesEnabled === 1 ? "rule" : "rules"} enabled
          </span>
        )}
        <Button onClick={onCheck} disabled={checking}>
          {checking ? "Checking…" : violations ? "Re-check" : "Check document"}
        </Button>
      </GlassPanel>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <GlassPanel as="article" aria-label="Document" className="min-h-0 p-6 lg:overflow-y-auto">
          <DocumentPane
            blocks={document.blocks}
            byBlock={byBlock}
            activeId={focus.activeId}
            flash={focus.flash}
            onPick={focus.selectFromDocument}
            registerBlock={focus.registerBlock}
          />
        </GlassPanel>

        <GlassPanel as="aside" aria-labelledby="violations-heading" className="flex min-h-0 flex-col gap-3 p-5 lg:overflow-y-auto">
          <h3 id="violations-heading" className="text-base font-semibold text-slate-900">
            Violations
            {violations && <span className="ml-2 text-sm font-normal text-slate-600">{violations.length} total</span>}
          </h3>
          {checking && (
            <p role="status" className="text-sm text-slate-600">
              Checking the document… AI rules can take a minute on long documents.
            </p>
          )}
          {!checking && violations === null && (
            <p className="text-sm text-slate-600">Not checked yet. Click “Check document”.</p>
          )}
          {!checking && violations?.length === 0 && (
            <p role="status" className="rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 ring-1 ring-emerald-200">
              No violations found ✓
            </p>
          )}
          {violations && violations.length > 0 && (
            <ViolationsPanel
              violations={filters.visible}
              total={violations.length}
              severities={filters.severities}
              counts={filters.counts}
              onToggleSeverity={filters.toggleSeverity}
              rules={filters.rules}
              ruleId={filters.ruleId}
              onRuleChange={filters.setRuleId}
              isFiltered={filters.isFiltered}
              onClearFilters={filters.clear}
              activeId={focus.activeId}
              onPick={focus.selectFromList}
              registerItem={focus.registerItem}
            />
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
