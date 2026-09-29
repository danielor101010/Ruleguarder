import { useMemo } from "react";
import { useViolationFilters } from "../hooks/useViolationFilters";
import { useViolationFocus } from "../hooks/useViolationFocus";
import { violationsByBlock } from "../lib/highlight";
import type { DocumentFull, FailedRule, Violation } from "../types";
import DocumentPane from "./DocumentPane";
import { Button, Icon, Panel, WarningNote } from "./ui";
import ViolationsPanel from "./ViolationsPanel";

interface Props {
  document: DocumentFull;
  violations: Violation[] | null; // null => not checked yet
  /** Rules the check could not run; shown so an incomplete report never looks clean. */
  failedRules?: FailedRule[];
  checking: boolean;
  checkedAt: string | null;
  /** Enabled rules of type `llm`: a check will spend AI quota. */
  aiRulesEnabled: number;
  onCheck: () => void;
}

const NO_VIOLATIONS: Violation[] = [];
const NO_FAILED_RULES: FailedRule[] = [];

/** Split screen: document with highlights (left) and the violations list (right). Key it per document/report. */
export default function ReportView({
  document,
  violations,
  failedRules = NO_FAILED_RULES,
  checking,
  checkedAt,
  aiRulesEnabled,
  onCheck,
}: Props) {
  const filters = useViolationFilters(violations ?? NO_VIOLATIONS);
  const focus = useViolationFocus();
  const byBlock = useMemo(() => violationsByBlock(filters.visible), [filters.visible]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Panel className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-white" dir="auto" title={document.filename}>
            {document.filename}
          </h2>
          <p className="text-xs text-slate-400">
            {checkedAt ? `Checked ${new Date(checkedAt).toLocaleString()}` : "Not checked yet"}
          </p>
        </div>
        {aiRulesEnabled > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-slate-400" title="AI rules are checked by the AI model">
            <Icon name="sparkles" className="size-3.5 text-violet-300" />
            {aiRulesEnabled} AI {aiRulesEnabled === 1 ? "rule" : "rules"} enabled · each check uses AI quota
          </span>
        )}
        <Button icon="play" onClick={onCheck} disabled={checking}>
          {checking ? "Checking…" : violations ? "Re-check" : "Check document"}
        </Button>
      </Panel>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel as="article" aria-label="Document" className="min-h-0 bg-slate-800/40 p-3 sm:p-5 lg:overflow-y-auto">
          {/* The document is shown as a white page for readability */}
          <div className="mx-auto max-w-3xl rounded-lg bg-white px-5 py-8 text-slate-900 shadow-xl sm:px-10">
          <DocumentPane
            blocks={document.blocks}
            byBlock={byBlock}
            activeId={focus.activeId}
            flash={focus.flash}
            onPick={focus.selectFromDocument}
            registerBlock={focus.registerBlock}
          />
          </div>
        </Panel>

        <Panel as="aside" aria-labelledby="violations-heading" className="flex min-h-0 flex-col gap-3 p-4 lg:overflow-y-auto">
          <h3 id="violations-heading" className="flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-200 uppercase">
            Violations
            {violations && <span className="text-sm font-normal tracking-normal text-slate-400 normal-case">{violations.length} total</span>}
          </h3>
          {checking && (
            <p role="status" className="text-sm text-slate-400">
              Checking the document… AI rules can take a minute on long documents.
            </p>
          )}
          {!checking && violations === null && (
            <p className="text-sm text-slate-400">Not checked yet. Click “Check document”.</p>
          )}
          {!checking && violations && failedRules.length > 0 && (
            <WarningNote>
              <p className="font-medium">
                {failedRules.length} {failedRules.length === 1 ? "rule" : "rules"} could not be checked, so this report is
                incomplete:
              </p>
              <ul aria-label="Rules not checked" className="mt-1 list-disc space-y-0.5 pl-4">
                {failedRules.map((f) => (
                  <li key={f.rule_id}>
                    <span dir="auto" className="font-medium">
                      {f.rule_name}
                    </span>
                    : {f.error}
                  </li>
                ))}
              </ul>
            </WarningNote>
          )}
          {!checking && violations?.length === 0 &&
            (failedRules.length > 0 ? (
              <p className="text-sm text-slate-400">No violations found by the rules that ran.</p>
            ) : (
              <p role="status" className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-200 ring-1 ring-emerald-500/30">
                No violations found ✓
              </p>
            ))}
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
        </Panel>
      </div>
    </div>
  );
}
