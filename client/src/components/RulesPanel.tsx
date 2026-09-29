import { useEffect, useState } from "react";
import { api } from "../api";
import type { ParamSchema, Rule, RuleInput, RuleType, Severity } from "../types";

interface Props {
  rules: Rule[];
  onChange: () => void;
}

export default function RulesPanel({ rules, onChange }: Props) {
  const [types, setTypes] = useState<RuleType[]>([]);
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.ruleTypes().then(setTypes).catch((e) => setError(e.message));
  }, []);

  const typeLabel = (key: string) => types.find((t) => t.key === key)?.label ?? key;

  async function toggle(rule: Rule) {
    await api.updateRule(rule.id, { enabled: !rule.enabled });
    onChange();
  }

  async function remove(rule: Rule) {
    await api.deleteRule(rule.id);
    onChange();
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Rules</h2>
        <button onClick={() => setEditing("new")} disabled={!types.length}>
          + New rule
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      {editing && (
        <RuleForm
          types={types}
          rule={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChange();
          }}
        />
      )}

      {!rules.length && !editing && <p className="muted">No rules yet. Create one to start checking documents.</p>}
      <ul className="list">
        {rules.map((rule) => (
          <li key={rule.id} className={rule.enabled ? "" : "disabled"}>
            <label className="rule-toggle" title={rule.enabled ? "Enabled" : "Disabled"}>
              <input type="checkbox" checked={rule.enabled} onChange={() => toggle(rule)} />
            </label>
            <div className="grow">
              <div className="rule-name" dir="auto">
                <span className={`dot sev-${rule.severity}`} /> {rule.name}
              </div>
              <div className="muted small" dir="auto">
                {typeLabel(rule.type)}
                {rule.type === "llm" && typeof rule.params.instruction === "string" && ` · ${rule.params.instruction}`}
              </div>
            </div>
            <button className="link" onClick={() => setEditing(rule)}>
              Edit
            </button>
            <button className="link danger" onClick={() => remove(rule)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function defaultsFor(type: RuleType | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(type?.params_schema.properties ?? {})) {
    out[name] = schema.default ?? (schema.type === "boolean" ? false : schema.type === "array" ? [] : "");
  }
  return out;
}

function RuleForm({
  types,
  rule,
  onCancel,
  onSaved,
}: {
  types: RuleType[];
  rule: Rule | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [typeKey, setTypeKey] = useState(rule?.type ?? types[0]?.key ?? "");
  const type = types.find((t) => t.key === typeKey);
  const [name, setName] = useState(rule?.name ?? "");
  const [severity, setSeverity] = useState<Severity>(rule?.severity ?? "error");
  const [params, setParams] = useState<Record<string, unknown>>(rule?.params ?? defaultsFor(type));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function changeType(key: string) {
    setTypeKey(key);
    setParams(defaultsFor(types.find((t) => t.key === key)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (rule) {
        await api.updateRule(rule.id, { name, severity, params });
      } else {
        const input: RuleInput = { name, description: "", type: typeKey, params, severity, enabled: true };
        await api.createRule(input);
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card rule-form" onSubmit={submit}>
      <label>
        Type
        <select value={typeKey} onChange={(e) => changeType(e.target.value)} disabled={!!rule}>
          {types.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      {type && <p className="muted small">{type.description}</p>}

      <label>
        Name
        <input dir="auto" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>

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

      <label>
        Severity
        <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
      </label>

      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
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
      <label className="checkbox">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
    );
  }

  let input: React.ReactNode;
  if (schema.type === "array") {
    input = (
      <input
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
        type="number"
        step={schema.type === "integer" ? 1 : "any"}
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        required={required}
      />
    );
  } else if (schema.format === "textarea") {
    input = (
      <textarea dir="auto" rows={4} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} required={required} />
    );
  } else {
    input = <input dir="auto" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} required={required} />;
  }

  return (
    <label>
      {label}
      {input}
      {schema.description && <span className="muted small">{schema.description}</span>}
    </label>
  );
}
