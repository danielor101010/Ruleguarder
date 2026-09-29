import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../api";
import { DOC, report, violation } from "../test/fixtures";
import type { Report } from "../types";
import { useDocumentReport } from "./useDocumentReport";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDocumentReport", () => {
  it("does nothing without a selection", () => {
    const spy = vi.spyOn(api, "latestReport");
    const { result } = renderHook(() => useDocumentReport(null));
    expect(result.current.document).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("loads the latest report", async () => {
    const v = violation({ id: "1-0", block_id: 1, start: 23, end: 28 });
    vi.spyOn(api, "latestReport").mockResolvedValue(report([v]));
    const { result } = renderHook(() => useDocumentReport(1));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.document).toEqual(DOC));
    expect(result.current.violations).toEqual([v]);
    expect(result.current.failedRules).toEqual([]); // older servers send no failed_rules
    expect(result.current.loading).toBe(false);
  });

  it("falls back to the bare document when it was never checked", async () => {
    vi.spyOn(api, "latestReport").mockRejectedValue(new ApiError(404, "not checked"));
    vi.spyOn(api, "document").mockResolvedValue(DOC);
    const { result } = renderHook(() => useDocumentReport(1));
    await waitFor(() => expect(result.current.document).toEqual(DOC));
    expect(result.current.violations).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("reports other load errors", async () => {
    vi.spyOn(api, "latestReport").mockRejectedValue(new ApiError(500, "boom"));
    const { result } = renderHook(() => useDocumentReport(1));
    await waitFor(() => expect(result.current.error).toBe("boom"));
  });

  it("runs a check and keeps the document when the check fails", async () => {
    vi.spyOn(api, "latestReport").mockRejectedValue(new ApiError(404, "not checked"));
    vi.spyOn(api, "document").mockResolvedValue(DOC);
    const check = vi.spyOn(api, "check").mockRejectedValueOnce(new ApiError(502, "All Gemini models are unavailable"));
    const { result } = renderHook(() => useDocumentReport(1));
    await waitFor(() => expect(result.current.document).toEqual(DOC));

    await act(() => result.current.runCheck());
    expect(result.current.error).toMatch(/unavailable/);
    expect(result.current.document).toEqual(DOC);
    expect(result.current.checking).toBe(false);

    check.mockResolvedValueOnce(report([]));
    await act(() => result.current.runCheck());
    expect(result.current.violations).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("exposes the rules a check could not run", async () => {
    vi.spyOn(api, "latestReport").mockResolvedValue(report([]));
    const failed = [{ rule_id: 4, rule_name: "No figures", error: "All Gemini models are unavailable right now" }];
    const partial = report([violation({ id: "2-0" })]);
    vi.spyOn(api, "check").mockResolvedValue({ ...partial, summary: { ...partial.summary, failed_rules: failed } });
    const { result } = renderHook(() => useDocumentReport(1));
    await waitFor(() => expect(result.current.document).toEqual(DOC));

    await act(() => result.current.runCheck());
    expect(result.current.failedRules).toEqual(failed);
    expect(result.current.violations).toHaveLength(1);
  });

  it("drops a check result that arrives after another document was selected", async () => {
    const other = { ...DOC, id: 2, filename: "other.docx" };
    vi.spyOn(api, "latestReport").mockImplementation((id) =>
      Promise.resolve(id === 1 ? report([]) : { ...report([]), document: other }),
    );
    let finish: (r: Report) => void = () => undefined;
    vi.spyOn(api, "check").mockReturnValue(new Promise<Report>((resolve) => (finish = resolve)));
    const { result, rerender } = renderHook(({ id }) => useDocumentReport(id), { initialProps: { id: 1 as number | null } });
    await waitFor(() => expect(result.current.document?.id).toBe(1));

    let checking: Promise<void> = Promise.resolve();
    act(() => {
      checking = result.current.runCheck();
    });
    expect(result.current.checking).toBe(true);
    rerender({ id: 2 });
    await waitFor(() => expect(result.current.document?.id).toBe(2));

    await act(async () => {
      finish(report([violation({ id: "1-0" })]));
      await checking;
    });
    expect(result.current.document?.id).toBe(2);
    expect(result.current.violations).toEqual([]);
    expect(result.current.checking).toBe(false);
  });

  it("resets when the selection changes", async () => {
    vi.spyOn(api, "latestReport").mockResolvedValue(report([]));
    const { result, rerender } = renderHook(({ id }) => useDocumentReport(id), { initialProps: { id: 1 as number | null } });
    await waitFor(() => expect(result.current.document).not.toBeNull());
    rerender({ id: null });
    expect(result.current.document).toBeNull();
  });
});
