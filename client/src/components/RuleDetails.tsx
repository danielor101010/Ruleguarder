import { usesAiQuota } from "../lib/templates";
import type { Rule, RuleType } from "../types";
import { AiQuotaBadge, Button, DeleteButton, Modal, SeverityBadge, Switch } from "./ui";

interface Props {
  rule: Rule;
  type: RuleType | undefined;
  onClose: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

/** Read-only view of a rule, opened by clicking it in the rules list. */
export default function RuleDetails({ rule, type, onClose, onEdit, onToggle, onDelete }: Props) {
  const isAi = usesAiQuota(rule);
  const instruction = typeof rule.params.instruction === "string" ? rule.params.instruction : null;
  const params = Object.entries(rule.params).filter(([key]) => !(isAi && key === "instruction"));

  return (
    <Modal
      title={rule.name}
      subtitle={type?.label ?? rule.type}
      onClose={onClose}
      footer={
        <>
          <DeleteButton
            name={rule.name}
            onConfirm={() => {
              onDelete();
              onClose();
            }}
          />
          <span className="flex-1" />
          <Button icon="pencil" onClick={onEdit}>
            Edit rule
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <SeverityBadge severity={rule.severity} />
          {isAi && <AiQuotaBadge />}
          <span className="flex-1" />
          <span className="flex items-center gap-2 text-sm text-zinc-600">
            {rule.enabled ? "Enabled" : "Disabled"}
            <Switch checked={rule.enabled} onChange={onToggle} label={`Enable ${rule.name}`} />
          </span>
        </div>

        {instruction !== null && (
          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wider text-zinc-500 uppercase">Rule</h3>
            <blockquote
              className="rounded-2xl bg-zinc-100 px-4 py-3 text-[0.95rem] leading-relaxed whitespace-pre-wrap text-zinc-900"
              dir="auto"
            >
              {instruction}
            </blockquote>
          </section>
        )}

        {params.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wider text-zinc-500 uppercase">Settings</h3>
            <dl className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
              {params.map(([key, value]) => (
                <div key={key} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-4 py-2.5 text-sm">
                  <dt className="text-zinc-500">{type?.params_schema.properties[key]?.title ?? key}</dt>
                  <dd className="font-medium break-words text-zinc-900" dir="auto">
                    {formatValue(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {rule.description && (
          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wider text-zinc-500 uppercase">Description</h3>
            <p className="text-sm text-zinc-700" dir="auto">
              {rule.description}
            </p>
          </section>
        )}

        {type?.description && (
          <p className="rounded-2xl bg-zinc-100 px-4 py-3 text-sm text-zinc-600">
            <span className="font-semibold text-zinc-900">How this rule type works: </span>
            {type.description}
          </p>
        )}

        <p className="text-xs text-zinc-400">Created {new Date(rule.created_at).toLocaleString()}</p>
      </div>
    </Modal>
  );
}

function formatValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}
