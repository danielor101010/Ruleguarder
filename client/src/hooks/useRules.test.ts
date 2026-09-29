import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../api";
import { rule, RULE_TYPES } from "../test/fixtures";
import { useRules } from "./useRules";

afterEach(() => {
  vi.restoreAllMocks();
});

async function loaded() {
  const hook = renderHook(() => useRules());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe("useRules", () => {
  it("loads rules and rule types", async () => {
    vi.spyOn(api, "rules").mockResolvedValue([rule({ id: 1 })]);
    vi.spyOn(api, "ruleTypes").mockResolvedValue(RULE_TYPES);
    const { result } = await loaded();
    expect(result.current.rules).toHaveLength(1);
    expect(result.current.types).toEqual(RULE_TYPES);
    expect(result.current.error).toBeNull();
  });

  it("reports a network failure while loading", async () => {
    vi.spyOn(api, "rules").mockRejectedValue(new TypeError("Failed to fetch"));
    vi.spyOn(api, "ruleTypes").mockResolvedValue(RULE_TYPES);
    const { result } = await loaded();
    expect(result.current.error).toMatch(/^Network error/);
  });

  it("creates a rule and refreshes; validation errors are re-thrown to the form", async () => {
    const rules = vi.spyOn(api, "rules").mockResolvedValue([]);
    vi.spyOn(api, "ruleTypes").mockResolvedValue(RULE_TYPES);
    const create = vi.spyOn(api, "createRule").mockResolvedValue(rule({ id: 5 }));
    const { result } = await loaded();

    rules.mockResolvedValue([rule({ id: 5 })]);
    await act(() => result.current.createRule({ name: "R", type: "forbidden_text", params: { pattern: "x" } }));
    expect(create).toHaveBeenCalledOnce();
    expect(result.current.rules.map((r) => r.id)).toEqual([5]);

    create.mockRejectedValue(new ApiError(422, "Invalid regular expression"));
    await expect(result.current.createRule({ name: "R", type: "forbidden_text", params: {} })).rejects.toThrow(
      "Invalid regular expression",
    );
  });

  it("toggles and deletes, reporting failures through error", async () => {
    const r = rule({ id: 2, enabled: true });
    vi.spyOn(api, "rules").mockResolvedValue([r]);
    vi.spyOn(api, "ruleTypes").mockResolvedValue(RULE_TYPES);
    const update = vi.spyOn(api, "updateRule").mockResolvedValue({ ...r, enabled: false });
    const del = vi.spyOn(api, "deleteRule").mockRejectedValue(new ApiError(404, "Rule not found"));
    const { result } = await loaded();

    await act(() => result.current.toggleRule(r));
    expect(update).toHaveBeenCalledWith(2, { enabled: false });

    await act(() => result.current.deleteRule(r));
    expect(del).toHaveBeenCalledWith(2);
    expect(result.current.error).toBe("Rule not found");
    act(() => result.current.dismissError());
    expect(result.current.error).toBeNull();
  });
});
