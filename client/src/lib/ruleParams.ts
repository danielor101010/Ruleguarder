import type { RuleType } from "../types";

/** Initial form values for a rule type's params: the schema default, else an empty value of the right kind. */
export function defaultParams(type: RuleType | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(type?.params_schema.properties ?? {})) {
    out[name] = schema.default ?? (schema.type === "boolean" ? false : schema.type === "array" ? [] : "");
  }
  return out;
}
