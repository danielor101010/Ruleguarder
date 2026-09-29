import { useId, useState } from "react";
import type { TemplatesStatus } from "../hooks/useRuleTemplates";
import { groupTemplates, usesAiQuota } from "../lib/templates";
import type { RuleTemplate } from "../types";
import { AiQuotaBadge, Button, ErrorNote } from "./ui";

interface Props {
  templates: RuleTemplate[];
  status: TemplatesStatus;
  error: string | null;
  onRetry: () => void;
  onPick: (template: RuleTemplate) => void;
}

/** "Add from template" disclosure. Renders nothing when the server has no template endpoint. */
export default function TemplatePicker({ templates, status, error, onRetry, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const listId = useId();

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
    <div onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <Button
        variant="secondary"
        size="sm"
        aria-expanded={open}
        aria-controls={listId}
        disabled={status === "loading" || templates.length === 0}
        onClick={() => setOpen((o) => !o)}
      >
        {status === "loading" ? "Loading templates…" : "Add from template"}
      </Button>
      {open && (
        <div
          id={listId}
          role="group"
          aria-label="Rule templates"
          className="mt-2 flex max-h-80 flex-col gap-3 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3"
        >
          {groups.map((group) => (
            <div key={group.category}>
              <h4 className="mb-1 text-[0.7rem] font-semibold tracking-wider text-slate-600 uppercase">{group.label}</h4>
              <ul className="flex flex-col gap-1">
                {group.templates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="w-full rounded-xl px-3 py-2 text-left hover:bg-slate-100"
                      onClick={() => {
                        setOpen(false);
                        onPick(t);
                      }}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                        {t.label}
                        {usesAiQuota(t.rule) && <AiQuotaBadge />}
                      </span>
                      <span className="block text-xs text-slate-600">{t.description}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
