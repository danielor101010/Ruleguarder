import { useState } from "react";
import type { TemplatesStatus } from "../hooks/useRuleTemplates";
import { groupTemplates, usesAiQuota } from "../lib/templates";
import type { RuleTemplate } from "../types";
import { AiQuotaBadge, Button, ErrorNote, Icon, Modal, SeverityBadge } from "./ui";

interface Props {
  templates: RuleTemplate[];
  status: TemplatesStatus;
  error: string | null;
  onRetry: () => void;
  onPick: (template: RuleTemplate) => void;
}

/** "Add from template" button + picker dialog. Renders nothing when the server has no template endpoint. */
export default function TemplatePicker({ templates, status, error, onRetry, onPick }: Props) {
  const [open, setOpen] = useState(false);

  if (status === "unavailable") return null;
  if (status === "error") {
    return (
      <ErrorNote>
        Could not load rule templates: {error}{" "}
        <button type="button" className="font-semibold underline" onClick={onRetry}>
          Retry
        </button>
      </ErrorNote>
    );
  }

  const groups = groupTemplates(templates);

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon="template"
        aria-haspopup="dialog"
        disabled={status === "loading" || templates.length === 0}
        onClick={() => setOpen(true)}
      >
        {status === "loading" ? "Loading templates…" : "Add from template"}
      </Button>
      {open && (
        <Modal title="Add a rule from a template" subtitle="Pick a template, review it, then save." size="lg" onClose={() => setOpen(false)}>
          <div role="group" aria-label="Rule templates" className="flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.category}>
                <h3 className="mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">{group.label}</h3>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {group.templates.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        className="group flex h-full w-full flex-col gap-2 rounded-xl border border-slate-700 bg-slate-800/60 p-4 text-left transition-colors hover:border-indigo-400 hover:bg-slate-800"
                        onClick={() => {
                          setOpen(false);
                          onPick(t);
                        }}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-white">{t.label}</span>
                          <Icon name="plus" className="size-4 shrink-0 text-slate-500 group-hover:text-indigo-300" />
                        </span>
                        <span className="text-sm text-slate-300">{t.description}</span>
                        <span className="mt-auto flex flex-wrap gap-2 pt-1">
                          <SeverityBadge severity={t.rule.severity ?? "high"} />
                          {usesAiQuota(t.rule) && <AiQuotaBadge />}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
