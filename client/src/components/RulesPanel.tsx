import { useState } from "react";
import type { SamplesState, TemplatesStatus } from "../hooks/useRuleTemplates";
import { cx } from "../lib/severity";
import { draftFromTemplate, usesAiQuota } from "../lib/templates";
import type { Rule, RuleCreate, RuleTemplate, RuleType, RuleUpdate } from "../types";
import RuleDetails from "./RuleDetails";
import RuleForm from "./RuleForm";
import TemplatePicker from "./TemplatePicker";
import { AiQuotaBadge, Button, ErrorNote, Icon, Panel, PanelHeader, SeverityBadge, StatusNote, Switch } from "./ui";

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
        <p className="text-xs text-zinc-500">Rule templates and sample rules are not available on this server.</p>
      )}
      {samples.message && (
        <StatusNote onDismiss={samples.onDismiss}>Sample rules: {samples.message}</StatusNote>
      )}
      {samples.error && <ErrorNote onDismiss={samples.onDismiss}>{samples.error}</ErrorNote>}
      {error && <ErrorNote onDismiss={onDismissError}>{error}</ErrorNote>}

      {loading && <p className="text-sm text-zinc-500">Loading rules…</p>}
      {!loading && !rules.length && (
        <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500">
          No rules yet.
          <br />
          Create one, pick a template, or load the sample rules.
        </div>
      )}
      {rules.length > 0 && (
        <p className="-mb-2 text-xs text-zinc-500">
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
                "group flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white pr-3 transition-colors hover:border-zinc-400",
                !rule.enabled && "opacity-60",
              )}
            >
              <button
                type="button"
                aria-haspopup="dialog"
                aria-label={`Open rule ${rule.name}`}
                className="flex min-w-0 flex-1 flex-col gap-1 rounded-2xl py-3 pl-4 text-left"
                onClick={() => setViewingId(rule.id)}
              >
                <span className="truncate text-sm font-semibold text-zinc-900" dir="auto" title={rule.name}>
                  {rule.name}
                </span>
                <span className="line-clamp-2 text-xs text-zinc-500" dir="auto">
                  {instruction ?? typeOf(rule.type)?.label ?? rule.type}
                </span>
                <span className="mt-0.5 flex flex-wrap items-baseline gap-x-3">
                  <SeverityBadge severity={rule.severity} />
                  {ai && <AiQuotaBadge />}
                </span>
              </button>
              <Switch checked={rule.enabled} onChange={() => onToggle(rule)} label={`Enable ${rule.name}`} size="sm" />
              <Icon name="chevron" className="size-4 shrink-0 text-zinc-400 group-hover:text-zinc-900" />
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
