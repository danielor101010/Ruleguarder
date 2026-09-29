import type { RuleCreate, RuleTemplate, RuleTemplateCategory, SampleRulesResult } from "../types";

export const CATEGORY_LABEL: Record<RuleTemplateCategory, string> = {
  security: "Security",
  privacy: "Privacy",
  style: "Style",
  structure: "Structure",
  ai: "AI",
};

const CATEGORY_ORDER: readonly RuleTemplateCategory[] = ["security", "privacy", "style", "structure", "ai"];

export interface TemplateGroup {
  category: RuleTemplateCategory | "other";
  label: string;
  templates: RuleTemplate[];
}

/** Templates grouped by category in a fixed order; empty groups are dropped. Unknown categories go last. */
export function groupTemplates(templates: readonly RuleTemplate[]): TemplateGroup[] {
  const groups: TemplateGroup[] = CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    templates: templates.filter((t) => t.category === category),
  }));
  groups.push({ category: "other", label: "Other", templates: templates.filter((t) => !CATEGORY_ORDER.includes(t.category)) });
  return groups.filter((g) => g.templates.length > 0);
}

/** A copy of the template's rule to prefill the new-rule form (the template itself is never mutated). */
export function draftFromTemplate(template: RuleTemplate): RuleCreate {
  const { rule } = template;
  return { ...rule, params: structuredClone(rule.params) };
}

export function sampleResultMessage(result: SampleRulesResult): string {
  return `${result.created.length} added, ${result.skipped.length} already present`;
}

/** Rules of this type are checked by the LLM and spend AI quota. */
export const LLM_RULE_TYPE = "llm";

export function usesAiQuota(rule: { type: string }): boolean {
  return rule.type === LLM_RULE_TYPE;
}
