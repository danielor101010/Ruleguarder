import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../api";
import { checkStatus, DOC, report, violation } from "../test/fixtures";
import { POLL_MS, useDocumentReport } from "./useDocumentReport";

const notFound = () => new ApiError(404, "not found");

beforeEach(() => {
  // Default: document checked once, no check running
  vi.spyOn(api, "latestReport").mockResolvedValue(report([]));
  vi.spyOn(api, "latestCheck").mockResolvedValue(checkStatus({ check_id: 9, status: "completed" }));
  vi.spyOn(api, "document").mockResolvedValue(DOC);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Run pending timers (polls) and let their promises settle. */
async function poll() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_MS);
  });
}

describe("useDocumentReport", () => {
  it("does nothing without a selection", () => {
    const { result } = renderHook(() => useDocumentReport(null));
    expect(result.current.document).toBeNull();
    expect(api.latestReport).not.toHaveBeenCalled();
  });

  it("loads the latest report", async () => {
    const v = violation({ id: "1-0", block_id: 1, start: 23, end: 28 });
    vi.mocked(api.latestReport).mockResolvedValue(report([v]));
    const { result } = renderHook(() => useDocumentReport(1));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.document).toEqual(DOC));
    expect(result.current.violations).toEqual([v]);
    expect(result.current.failedRules).toEqual([]); // older servers send no failed_rules
    expect(result.current.checking).toBe(false);
  });

  it("falls back to the bare document when it was never checked", async () => {
    vi.mocked(api.latestReport).mockRejectedValue(notFound());
    vi.mocked(api.latestCheck).mockRejectedValue(notFound());
    const { result } = renderHook(() => useDocumentReport(1));
    await waitFor(() => expect(result.current.document).toEqual(DOC));
    expect(result.current.violations).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("reports other load errors", async () => {
    vi.mocked(api.latestReport).mockRejectedValue(new ApiError(500, "boom"));
    const { result } = renderHook(() => useDocumentReport(1));
    await waitFor(() => expect(result.current.error).toBe("boom"));
  });

  it("runs a background check: progress, then the new report", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useDocumentReport(1));
    await waitFor(() => expect(result.current.document).toEqual(DOC));

    vi.spyOn(api, "startCheck").mockResolvedValue(checkStatus({ status: "queued", progress_done: 0, progress_total: 0 }));
    const getCheck = vi
      .spyOn(api, "getCheck")
      .mockResolvedValueOnce(checkStatus({ progress_done: 2, step: "AI rules: part 1 of 3" }))
      .mockResolvedValueOnce(checkStatus({ status: "completed", progress_done: 4, progress_total: 4 }));
    await act(() => result.current.runCheck());
    expect(result.current.checking).toBe(true);
    expect(result.current.progress?.status).toBe("queued");

    await poll();
    expect(result.current.progress?.progress_done).toBe(2);
    expect(result.current.progress?.step).toBe("AI rules: part 1 of 3");

    const v = violation({ id: "2-0" });
    vi.mocked(api.latestReport).mockResolvedValue(report([v]));
    await poll();
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.violations).toEqual([v]);
    expect(result.current.progress).toBeNull();
    expect(getCheck).toHaveBeenCalledTimes(2);
  });

  it("shows why a check failed and keeps the old report", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const v = violation({ id: "1-0" });
    vi.mocked(api.latestReport).mockResolvedValue(report([v]));
    const { result } = renderHook(() => useDocumentReport(1));
    await waitFor(() => expect(result.current.violations).toEqual([v]));

    vi.spyOn(api, "startCheck").mockResolvedValue(checkStatus({ status: "queued" }));
    vi.spyOn(api, "getCheck").mockResolvedValue(
      checkStatus({ status: "failed", error: "No rule could be checked. All Gemini models are unavailable right now" }),
    );
    await act(() => result.current.runCheck());
    await poll();
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.error).toMatch(/unavailable/);
    expect(result.current.violations).toEqual([v]);
  });

  it("cancels a running check", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useDocumentReport(1));
    await waitFor(() => expect(result.current.document).toEqual(DOC));
    vi.spyOn(api, "startCheck").mockResolvedValue(checkStatus({ check_id: 51 }));
    vi.spyOn(api, "getCheck").mockResolvedValue(checkStatus({ check_id: 51 }));
    await act(() => result.current.runCheck());

    const cancel = vi.spyOn(api, "cancelCheck").mockResolvedValue(checkStatus({ check_id: 51, status: "cancelled" }));
    await act(() => result.current.cancelCheck());
    expect(cancel).toHaveBeenCalledWith(51);
    expect(result.current.checking).toBe(false);
    expect(result.current.notice).toBe("Check cancelled.");
  });

  it("reconnects to a check that is still running after a reload", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.latestCheck).mockResolvedValue(checkStatus({ check_id: 60, progress_done: 3 }));
    vi.spyOn(api, "getCheck").mockResolvedValue(checkStatus({ check_id: 60, progress_done: 4 }));
    const { result } = renderHook(() => useDocumentReport(1));
    await waitFor(() => expect(result.current.checking).toBe(true));
    expect(result.current.progress?.check_id).toBe(60);
    await poll();
    expect(api.getCheck).toHaveBeenCalledWith(60);
    expect(result.current.progress?.progress_done).toBe(4);
  });

  it("says when the newest check failed after the report shown", async () => {
    vi.mocked(api.latestCheck).mockResolvedValue(checkStatus({ check_id: 99, status: "failed", error: "quota" }));
    const { result } = renderHook(() => useDocumentReport(1));
    await waitFor(() => expect(result.current.error).toBe("The last check failed: quota"));
    expect(result.current.checking).toBe(false);
  });

  it("stops polling and ignores results after another document is selected", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const other = { ...DOC, id: 2, filename: "other.docx" };
    vi.mocked(api.latestReport).mockImplementation((id) =>
      Promise.resolve(id === 1 ? report([]) : { ...report([]), document: other }),
    );
    vi.mocked(api.latestCheck).mockImplementation((id) =>
      id === 1 ? Promise.resolve(checkStatus({ check_id: 70 })) : Promise.reject(notFound()),
    );
    const getCheck = vi.spyOn(api, "getCheck").mockResolvedValue(checkStatus({ check_id: 70 }));
    const { result, rerender } = renderHook(({ id }) => useDocumentReport(id), { initialProps: { id: 1 as number | null } });
    await waitFor(() => expect(result.current.checking).toBe(true));

    rerender({ id: 2 });
    await waitFor(() => expect(result.current.document?.id).toBe(2));
    const calls = getCheck.mock.calls.length;
    await poll();
    await poll();
    expect(getCheck.mock.calls.length).toBe(calls);
    expect(result.current.checking).toBe(false);
  });

  it("resets when the selection changes", async () => {
    const { result, rerender } = renderHook(({ id }) => useDocumentReport(id), { initialProps: { id: 1 as number | null } });
    await waitFor(() => expect(result.current.document).not.toBeNull());
    rerender({ id: null });
    expect(result.current.document).toBeNull();
  });
});
