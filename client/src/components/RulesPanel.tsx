import { useState } from "react";
import type { SamplesState, TemplatesStatus } from "../hooks/useRuleTemplates";
import { cx } from "../lib/severity";
import { draftFromTemplate, usesAiQuota } from "../lib/templates";
import type { Rule, RuleCreate, RuleTemplate, RuleType, RuleUpdate } from "../types";
import RuleForm from "./RuleForm";
import TemplatePicker from "./TemplatePicker";
import { AiQuotaBadge, Button, ErrorNote, GlassPanel, SeverityDot } from "./ui";

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

  /** A new key per opening, so the form state resets when another template or rule is picked. */
  function open(next: Editing) {
    setEditing(next);
    setFormKey((k) => k + 1);
  }

  const typeLabel = (key: string) => types.find((t) => t.key === key)?.label ?? key;
  const templatesAvailable = templates.status !== "unavailable";

  return (
    <GlassPanel className="flex flex-col gap-3 p-5" aria-labelledby="rules-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="rules-heading" className="text-base font-semibold text-slate-900">
          Rules
        </h2>
        <Button size="sm" onClick={() => open({ kind: "new", initial: null, source: null })} disabled={!types.length}>
          + New rule
        </Button>
      </div>

      <div className="flex flex-wrap items-start gap-2">
        <TemplatePicker
          templates={templates.templates}
          status={templates.status}
          error={templates.error}
          onRetry={templates.onRetry}
          onPick={(t) => open({ kind: "new", initial: draftFromTemplate(t), source: t.label })}
        />
        {templatesAvailable && (
          <Button variant="secondary" size="sm" onClick={samples.onLoad} disabled={samples.loading}>
            {samples.loading ? "Loading samples…" : "Load Sample Rules"}
          </Button>
        )}
      </div>
      {!templatesAvailable && (
        <p className="text-xs text-slate-600">Rule templates and sample rules are not available on this server.</p>
      )}
      {samples.message && (
        <p role="status" className="flex items-center justify-between rounded-2xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
          Sample rules: {samples.message}
          <button type="button" className="rounded-full px-1.5 hover:bg-emerald-100" aria-label="Dismiss" onClick={samples.onDismiss}>
            ×
          </button>
        </p>
      )}
      {samples.error && <ErrorNote onDismiss={samples.onDismiss}>{samples.error}</ErrorNote>}
      {error && <ErrorNote onDismiss={onDismissError}>{error}</ErrorNote>}

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

      {loading && <p className="text-sm text-slate-600">Loading rules…</p>}
      {!loading && !rules.length && !editing && (
        <p className="text-sm text-slate-600">No rules yet. Create one, pick a template, or load the sample rules.</p>
      )}
      <ul className="flex flex-col gap-1" aria-label="Rules list">
        {rules.map((rule) => (
          <li key={rule.id} className="flex items-start gap-3 rounded-2xl px-2 py-2 hover:bg-white/60">
            <input
              type="checkbox"
              role="switch"
              className="mt-0.5 size-4 shrink-0 accent-slate-900"
              checked={rule.enabled}
              onChange={() => onToggle(rule)}
              aria-label={`Enable ${rule.name}`}
            />
            <div className="min-w-0 flex-1">
              <div
                className={cx(
                  "flex items-center gap-2 text-sm font-medium",
                  rule.enabled ? "text-slate-900" : "text-slate-500",
                )}
              >
                <SeverityDot severity={rule.severity} />
                <span className="line-clamp-2 break-words" dir="auto" title={rule.name}>
                  {rule.name}
                </span>
                {!rule.enabled && <span className="shrink-0 text-xs font-normal text-slate-600">(off)</span>}
              </div>
              <div className="truncate text-xs text-slate-600" dir="auto">
                {typeLabel(rule.type)}
                {usesAiQuota(rule) && typeof rule.params.instruction === "string" && ` · ${rule.params.instruction}`}
              </div>
              <div className="mt-1 flex items-center gap-1">
                {usesAiQuota(rule) && <AiQuotaBadge />}
                <span className="flex-1" />
                <Button variant="ghost" size="sm" onClick={() => open({ kind: "edit", rule })} aria-label={`Edit ${rule.name}`}>
                  Edit
                </Button>
                <Button variant="danger" size="sm" onClick={() => onDelete(rule)} aria-label={`Delete ${rule.name}`}>
                  Delete
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </GlassPanel>
  );
}
