import { useState } from "react";
import type { SamplesState, TemplatesStatus } from "../hooks/useRuleTemplates";
import { cx } from "../lib/severity";
import { draftFromTemplate, usesAiQuota } from "../lib/templates";
import type { Rule, RuleCreate, RuleTemplate, RuleType, RuleUpdate } from "../types";
import RuleDetails from "./RuleDetails";
import RuleForm from "./RuleForm";
import TemplatePicker from "./TemplatePicker";
import { AiQuotaBadge, Button, ErrorNote, Icon, IconButton, Panel, PanelHeader, SeverityDot, Switch } from "./ui";

export interface TemplatesView {
  templates: RuleTemplate[];
  status: TemplatesStatus;
  error: string | null;
  onRetry: () => void;
}

export interface SamplesView extends SamplesState {
  onLoad: () => void;
  onDismiss: () => void;
}

interface Props {
  rules: Rule[];
  types: RuleType[];
  loading: boolean;
  error: string | null;
  onDismissError: () => void;
  onCreate: (input: RuleCreate) => Promise<void>;
  onUpdate: (id: number, changes: RuleUpdate) => Promise<void>;
  onToggle: (rule: Rule) => void;
  onDelete: (rule: Rule) => void;
  templates: TemplatesView;
  samples: SamplesView;
}

type Editing =
  | { kind: "new"; initial: RuleCreate | null; source: string | null }
  | { kind: "edit"; rule: Rule };

export default function RulesPanel({
  rules,
  types,
  loading,
  error,
  onDismissError,
  onCreate,
  onUpdate,
  onToggle,
  onDelete,
  templates,
  samples,
}: Props) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [viewingId, setViewingId] = useState<number | null>(null);

  /** A new key per opening, so the form state resets when another template or rule is picked. */
  function open(next: Editing) {
    setViewingId(null);
    setEditing(next);
    setFormKey((k) => k + 1);
  }

  const typeOf = (key: string) => types.find((t) => t.key === key);
  const templatesAvailable = templates.status !== "unavailable";
  // Look the rule up on every render, so the dialog reflects toggles and edits
  const viewing = rules.find((r) => r.id === viewingId) ?? null;
  const enabledCount = rules.filter((r) => r.enabled).length;

  return (
    <Panel className="flex flex-col gap-4 p-4" aria-labelledby="rules-heading">
      <PanelHeader id="rules-heading" title="Rules" count={rules.length}>
        <Button size="sm" icon="plus" onClick={() => open({ kind: "new", initial: null, source: null })} disabled={!types.length}>
          New rule
        </Button>
      </PanelHeader>

      <div className="flex flex-wrap items-start gap-2">
        <TemplatePicker
          templates={templates.templates}
          status={templates.status}
          error={templates.error}
          onRetry={templates.onRetry}
          onPick={(t) => open({ kind: "new", initial: draftFromTemplate(t), source: t.label })}
        />
        {templatesAvailable && (
          <Button variant="secondary" size="sm" icon="download" onClick={samples.onLoad} disabled={samples.loading}>
            {samples.loading ? "Loading samples…" : "Load Sample Rules"}
          </Button>
        )}
      </div>
      {!templatesAvailable && (
        <p className="text-xs text-slate-400">Rule templates and sample rules are not available on this server.</p>
      )}
      {samples.message && (
        <p role="status" className="flex items-center justify-between gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 ring-1 ring-emerald-500/30">
          Sample rules: {samples.message}
          <IconButton icon="x" label="Dismiss" onClick={samples.onDismiss} className="-my-1 size-6" />
        </p>
      )}
      {samples.error && <ErrorNote onDismiss={samples.onDismiss}>{samples.error}</ErrorNote>}
      {error && <ErrorNote onDismiss={onDismissError}>{error}</ErrorNote>}

      {loading && <p className="text-sm text-slate-400">Loading rules…</p>}
      {!loading && !rules.length && (
        <div className="rounded-xl border border-dashed border-slate-700 px-4 py-6 text-center text-sm text-slate-400">
          No rules yet.
          <br />
          Create one, pick a template, or load the sample rules.
        </div>
      )}
      {rules.length > 0 && (
        <p className="-mb-2 text-xs text-slate-400">
          {enabledCount} of {rules.length} enabled · click a rule to see it
        </p>
      )}
      <ul className="flex flex-col gap-2" aria-label="Rules list">
        {rules.map((rule) => {
          const ai = usesAiQuota(rule);
          const instruction = ai && typeof rule.params.instruction === "string" ? rule.params.instruction : null;
          return (
            <li
              key={rule.id}
              className={cx(
                "group flex items-center gap-3 rounded-xl border bg-slate-800/50 pr-3 transition-colors hover:border-slate-500 hover:bg-slate-800",
                rule.enabled ? "border-slate-700" : "border-slate-800 opacity-70",
              )}
            >
              <button
                type="button"
                aria-haspopup="dialog"
                aria-label={`Open rule ${rule.name}`}
                className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl py-3 pl-3 text-left"
                onClick={() => setViewingId(rule.id)}
              >
                <span className="flex items-center gap-2">
                  <SeverityDot severity={rule.severity} />
                  <span className="truncate text-sm font-semibold text-white" dir="auto" title={rule.name}>
                    {rule.name}
                  </span>
                </span>
                <span className="line-clamp-2 text-xs text-slate-400" dir="auto">
                  {instruction ?? typeOf(rule.type)?.label ?? rule.type}
                </span>
                {ai && (
                  <span className="mt-0.5">
                    <AiQuotaBadge />
                  </span>
                )}
              </button>
              <Switch checked={rule.enabled} onChange={() => onToggle(rule)} label={`Enable ${rule.name}`} size="sm" />
              <Icon name="chevron" className="size-4 shrink-0 text-slate-500 group-hover:text-slate-300" />
            </li>
          );
        })}
      </ul>

      {viewing && (
        <RuleDetails
          rule={viewing}
          type={typeOf(viewing.type)}
          onClose={() => setViewingId(null)}
          onEdit={() => open({ kind: "edit", rule: viewing })}
          onToggle={() => onToggle(viewing)}
          onDelete={() => onDelete(viewing)}
        />
      )}

      {editing && (
        <RuleForm
          key={formKey}
          types={types}
          rule={editing.kind === "edit" ? editing.rule : null}
          initial={editing.kind === "new" ? editing.initial : null}
          source={editing.kind === "new" ? editing.source : null}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onDone={() => setEditing(null)}
        />
      )}
    </Panel>
  );
}
