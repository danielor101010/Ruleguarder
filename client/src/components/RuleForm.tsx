import { useId, useState, type FormEvent, type ReactNode } from "react";
import { errorMessage } from "../lib/errors";
import { defaultParams } from "../lib/ruleParams";
import { usesAiQuota } from "../lib/templates";
import type { ParamSchema, Rule, RuleCreate, RuleType, RuleUpdate, Severity } from "../types";
import { AiQuotaBadge, Button, ErrorNote, inputClass, Modal, Switch } from "./ui";

interface Props {
  types: RuleType[];
  /** Rule being edited; null => create a new rule. */
  rule: Rule | null;
  /** Prefill for a new rule (e.g. from a template). */
  initial?: RuleCreate | null;
  /** Shown as the form's subtitle, e.g. the template name. */
  source?: string | null;
  onCreate: (input: RuleCreate) => Promise<void>;
  onUpdate: (id: number, changes: RuleUpdate) => Promise<void>;
  onDone: () => void;
}

/** Schema-driven rule form in a modal. Render with a `key` per rule/template so its local state resets. */
export default function RuleForm({ types, rule, initial, source, onCreate, onUpdate, onDone }: Props) {
  const start = rule ?? initial ?? null;
  // A blank new rule starts on a deterministic type, never on the quota-spending AI type
  const [typeKey, setTypeKey] = useState(start?.type ?? (types.find((t) => !usesAiQuota({ type: t.key })) ?? types[0])?.key ?? "");
  const type = types.find((t) => t.key === typeKey);
  const [name, setName] = useState(start?.name ?? "");
  const [description, setDescription] = useState(start?.description ?? "");
  const [severity, setSeverity] = useState<Severity>(start?.severity ?? "high");
  const [enabled, setEnabled] = useState(start?.enabled ?? true);
  const [params, setParams] = useState<Record<string, unknown>>(() => ({
    ...defaultParams(type),
    ...(start?.params ?? {}),
  }));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function changeType(key: string) {
    setTypeKey(key);
    setParams(defaultParams(types.find((t) => t.key === key)));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (rule) await onUpdate(rule.id, { name, description, severity, params, enabled });
      else await onCreate({ name, description, type: typeKey, params, severity, enabled });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  const isAi = usesAiQuota({ type: typeKey });
  const formId = useId();

  return (
    <Modal
      title={rule ? "Edit rule" : "New rule"}
      subtitle={source ? `From template: ${source}` : undefined}
      onClose={onDone}
      footer={
        <>
          <span className="flex-1" />
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" form={formId} icon="check" disabled={saving || !type}>
            {saving ? "Saving…" : "Save rule"}
          </Button>
        </>
      }
    >
    <form
      id={formId}
      aria-label={rule ? `Edit rule ${rule.name}` : "New rule"}
      onSubmit={submit}
      className="flex flex-col gap-4"
    >

      <Field label="Type">
        <select className={inputClass} value={typeKey} onChange={(e) => changeType(e.target.value)} disabled={!!rule}>
          {!type && typeKey && <option value={typeKey}>{typeKey} (not supported)</option>}
          {types.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      {type ? (
        <p className="-mt-2 text-xs text-zinc-500">{type.description}</p>
      ) : (
        typeKey && <ErrorNote>This server does not support the rule type “{typeKey}”.</ErrorNote>
      )}
      {isAi && (
        <p className="flex items-baseline gap-2 rounded-2xl bg-zinc-100 px-3 py-2 text-xs text-zinc-600">
          <AiQuotaBadge /> Checked by the AI model; every check spends quota.
        </p>
      )}

      <Field label="Name">
        <input className={inputClass} dir="auto" value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>

      {Object.entries(type?.params_schema.properties ?? {}).map(([key, schema]) => (
        <ParamField
          key={key}
          name={key}
          schema={schema}
          required={type?.params_schema.required?.includes(key) ?? false}
          value={params[key]}
          onChange={(v) => setParams((p) => ({ ...p, [key]: v }))}
        />
      ))}

      <Field label="Severity">
        <select className={inputClass} value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </Field>

      <Field label="Description (optional)">
        <input className={inputClass} dir="auto" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900">
        <span>
          Enabled
          <span className="block text-xs text-zinc-500">Disabled rules are skipped when checking documents.</span>
        </span>
        <Switch checked={enabled} onChange={setEnabled} label="Enabled" />
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
    </form>
    </Modal>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800">
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-zinc-500">{hint}</span>}
    </label>
  );
}

function ParamField({
  name,
  schema,
  required,
  value,
  onChange,
}: {
  name: string;
  schema: ParamSchema;
  required: boolean;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = schema.title ?? name;

  if (schema.type === "boolean") {
    return (
      <div className="flex items-center justify-between gap-3 text-sm text-zinc-800">
        {label}
        <Switch checked={Boolean(value)} onChange={onChange} label={label} size="sm" />
      </div>
    );
  }

  let input: ReactNode;
  if (schema.type === "array") {
    input = (
      <input
        className={inputClass}
        dir="auto"
        value={Array.isArray(value) ? value.join(", ") : ""}
        placeholder="Comma separated"
        onChange={(e) =>
          onChange(
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
        required={required}
      />
    );
  } else if (schema.type === "integer" || schema.type === "number") {
    input = (
      <input
        className={inputClass}
        type="number"
        step={schema.type === "integer" ? 1 : "any"}
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        required={required}
      />
    );
  } else if (schema.format === "textarea") {
    input = (
      <textarea
        className={inputClass}
        dir="auto"
        rows={4}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    );
  } else {
    input = (
      <input
        className={inputClass}
        dir="auto"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    );
  }

  return (
    <Field label={label} hint={schema.description}>
      {input}
    </Field>
  );
}
