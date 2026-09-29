import { describe, expect, it } from "vitest";
import { template } from "../test/fixtures";
import type { RuleTemplate } from "../types";
import { draftFromTemplate, groupTemplates, sampleResultMessage, usesAiQuota } from "./templates";

describe("templates", () => {
  it("groups templates by category in a fixed order and drops empty groups", () => {
    const groups = groupTemplates([
      template({ id: "ai-1", category: "ai" }),
      template({ id: "pii", category: "privacy" }),
      template({ id: "sec", category: "security" }),
      template({ id: "pii-2", category: "privacy" }),
    ]);
    expect(groups.map((g) => [g.label, g.templates.map((t) => t.id)])).toEqual([
      ["Security", ["sec"]],
      ["Privacy", ["pii", "pii-2"]],
      ["AI", ["ai-1"]],
    ]);
  });

  it("puts unknown categories in an Other group", () => {
    const odd = { ...template({ id: "x" }), category: "legal" } as unknown as RuleTemplate;
    expect(groupTemplates([odd]).map((g) => g.label)).toEqual(["Other"]);
  });

  it("copies the template rule so editing the draft never mutates the template", () => {
    const t = template({ id: "fonts", rule: { name: "Fonts", type: "allowed_fonts", params: { fonts: ["Arial"] } } });
    const draft = draftFromTemplate(t);
    expect(draft).toEqual(t.rule);
    (draft.params.fonts as string[]).push("Calibri");
    expect(t.rule.params.fonts).toEqual(["Arial"]);
  });

  it("formats the sample-load result", () => {
    expect(sampleResultMessage({ created: [], skipped: ["A", "B"] })).toBe("0 added, 2 already present");
  });

  it("flags llm rules as using AI quota", () => {
    expect(usesAiQuota({ type: "llm" })).toBe(true);
    expect(usesAiQuota({ type: "forbidden_text" })).toBe(false);
  });
});
