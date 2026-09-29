import { describe, expect, it } from "vitest";
import { violation } from "../test/fixtures";
import {
  ALL_SEVERITIES,
  documentLevelFirst,
  filterViolations,
  ruleOptions,
  toggleSeverity,
} from "./violations";

const A = violation({ id: "1-0", rule_id: 1, rule_name: "Beta", block_id: 2 }, "high");
const B = violation({ id: "2-0", rule_id: 2, rule_name: "Alpha", block_id: 1 }, "low");
const DOC_LEVEL = violation({ id: "3-0", rule_id: 3, rule_name: "Gamma", block_id: null }, "medium");
const A2 = violation({ id: "1-1", rule_id: 1, rule_name: "Beta", block_id: 3 }, "medium");

describe("violations", () => {
  it("puts document-level violations first and keeps the rest in order", () => {
    expect(documentLevelFirst([A, B, DOC_LEVEL, A2]).map((v) => v.id)).toEqual(["3-0", "1-0", "2-0", "1-1"]);
  });

  it("filters by severity and rule", () => {
    const all = [A, B, DOC_LEVEL, A2];
    expect(filterViolations(all, { severities: ALL_SEVERITIES, ruleId: null })).toHaveLength(4);
    expect(filterViolations(all, { severities: new Set(["high", "medium"]), ruleId: null }).map((v) => v.id)).toEqual([
      "1-0",
      "3-0",
      "1-1",
    ]);
    expect(filterViolations(all, { severities: ALL_SEVERITIES, ruleId: 1 }).map((v) => v.id)).toEqual(["1-0", "1-1"]);
    expect(filterViolations(all, { severities: new Set(), ruleId: null })).toEqual([]);
  });

  it("lists rules with counts, sorted by name", () => {
    expect(ruleOptions([A, B, DOC_LEVEL, A2])).toEqual([
      { ruleId: 2, ruleName: "Alpha", count: 1 },
      { ruleId: 1, ruleName: "Beta", count: 2 },
      { ruleId: 3, ruleName: "Gamma", count: 1 },
    ]);
    expect(ruleOptions([])).toEqual([]);
  });

  it("toggles a severity without mutating the input", () => {
    const all = new Set(ALL_SEVERITIES);
    const next = toggleSeverity(all, "low");
    expect([...next].sort()).toEqual(["high", "medium"]);
    expect(all.has("low")).toBe(true);
    expect(toggleSeverity(next, "low").has("low")).toBe(true);
  });
});
