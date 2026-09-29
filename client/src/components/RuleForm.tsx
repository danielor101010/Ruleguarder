import { useState, type FormEvent, type ReactNode } from "react";
import { errorMessage } from "../lib/errors";
import { defaultParams } from "../lib/ruleParams";
import { usesAiQuota } from "../lib/templates";
import type { ParamSchema, Rule, RuleCreate, RuleType, RuleUpdate, Severity } from "../types";
import { AiQuotaBadge, Button, ErrorNote, inputClass } from "./ui";

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

/** Schema-driven rule form. Render with a `key` per rule/template so its local state resets. */
export default function RuleForm({ types, rule, initial, source, onCreate, onUpdate, onDone }: Props) {
  const start = rule ?? initial ?? null;
  const [typeKey, setTypeKey] = useState(start?.type ?? types[0]?.key ?? "");
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

  return (
    <form
      aria-label={rule ? `Edit rule ${rule.name}` : "New rule"}
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4"
    >
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{rule ? "Edit rule" : "New rule"}</h3>
        {source && <p className="text-xs text-slate-600">From template: {source}</p>}
      </div>

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
        <p className="-mt-1 text-xs text-slate-600">{type.description}</p>
      ) : (
        typeKey && <ErrorNote>This server does not support the rule type “{typeKey}”.</ErrorNote>
      )}
      {isAi && (
        <p className="flex items-center gap-2 text-xs text-violet-900">
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

      <label className="flex items-center gap-2 text-sm text-slate-800">
        <input type="checkbox" className="size-4 accent-slate-900" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enabled
      </label>

      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving || !type}>
          {saving ? "Saving…" : "Save rule"}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-slate-800">
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-slate-600">{hint}</span>}
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
      <label className="flex items-center gap-2 text-sm text-slate-800">
        <input type="checkbox" className="size-4 accent-slate-900" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
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
