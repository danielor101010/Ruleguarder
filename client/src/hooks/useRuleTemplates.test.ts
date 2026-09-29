import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../api";
import { rule, template } from "../test/fixtures";
import { SAMPLES_UNAVAILABLE, useRuleTemplates } from "./useRuleTemplates";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useRuleTemplates", () => {
  it("loads the templates", async () => {
    const templates = [template({ id: "pii-all" })];
    vi.spyOn(api, "ruleTemplates").mockResolvedValue(templates);
    const { result } = renderHook(() => useRuleTemplates(vi.fn()));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.templates).toEqual(templates);
  });

  it.each([404, 405])("marks templates unavailable when the endpoint is missing (%i)", async (status) => {
    vi.spyOn(api, "ruleTemplates").mockRejectedValue(new ApiError(status, "Not Found"));
    const { result } = renderHook(() => useRuleTemplates(vi.fn()));
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.error).toBeNull();
    expect(result.current.templates).toEqual([]);
  });

  it("reports a network failure and can retry", async () => {
    const spy = vi.spyOn(api, "ruleTemplates").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useRuleTemplates(vi.fn()));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toMatch(/^Network error/);

    spy.mockResolvedValueOnce([template({ id: "x" })]);
    act(() => result.current.retry());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("loads the sample rules, reports the counts and refreshes the rules", async () => {
    vi.spyOn(api, "ruleTemplates").mockResolvedValue([]);
    vi.spyOn(api, "loadSampleRules").mockResolvedValue({
      created: [rule({ id: 1 }), rule({ id: 2 }), rule({ id: 3 })],
      skipped: ["PII", "Acronyms"],
    });
    const onRulesChanged = vi.fn();
    const { result } = renderHook(() => useRuleTemplates(onRulesChanged));

    await act(() => result.current.loadSamples());
    expect(result.current.samples).toEqual({ loading: false, message: "3 added, 2 already present", error: null });
    expect(onRulesChanged).toHaveBeenCalledOnce();

    act(() => result.current.dismissSamples());
    expect(result.current.samples.message).toBeNull();
  });

  it("explains a missing samples endpoint and does not refresh", async () => {
    vi.spyOn(api, "ruleTemplates").mockResolvedValue([]);
    vi.spyOn(api, "loadSampleRules").mockRejectedValue(new ApiError(404, "Not Found"));
    const onRulesChanged = vi.fn();
    const { result } = renderHook(() => useRuleTemplates(onRulesChanged));
    await act(() => result.current.loadSamples());
    expect(result.current.samples.error).toBe(SAMPLES_UNAVAILABLE);
    expect(onRulesChanged).not.toHaveBeenCalled();
  });

  it("reports other sample-load failures", async () => {
    vi.spyOn(api, "ruleTemplates").mockResolvedValue([]);
    vi.spyOn(api, "loadSampleRules").mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useRuleTemplates(vi.fn()));
    await act(() => result.current.loadSamples());
    expect(result.current.samples.error).toMatch(/^Network error/);
    expect(result.current.samples.loading).toBe(false);
  });
});
