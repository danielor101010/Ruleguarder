import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../api";
import { DOC, summary } from "../test/fixtures";
import { useDocuments } from "./useDocuments";

afterEach(() => {
  vi.restoreAllMocks();
});

async function loaded() {
  const hook = renderHook(() => useDocuments());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

const file = () => new File(["x"], "spec.docx");

describe("useDocuments", () => {
  it("lists documents", async () => {
    vi.spyOn(api, "documents").mockResolvedValue([summary(1), summary(2)]);
    const { result } = await loaded();
    expect(result.current.documents.map((d) => d.id)).toEqual([1, 2]);
  });

  it("uploads, refreshes and returns the new document", async () => {
    const list = vi.spyOn(api, "documents").mockResolvedValue([]);
    vi.spyOn(api, "uploadDocument").mockResolvedValue(DOC);
    const { result } = await loaded();
    list.mockResolvedValue([summary(1, "spec.docx")]);

    let uploaded: unknown;
    await act(async () => {
      uploaded = await result.current.upload(file());
    });
    expect(uploaded).toEqual(DOC);
    expect(result.current.documents).toHaveLength(1);
    expect(result.current.uploading).toBe(false);
  });

  it("reports an upload error (e.g. not a .docx) and returns null", async () => {
    vi.spyOn(api, "documents").mockResolvedValue([]);
    vi.spyOn(api, "uploadDocument").mockRejectedValue(new ApiError(400, "Only .docx files are supported"));
    const { result } = await loaded();
    let uploaded: unknown;
    await act(async () => {
      uploaded = await result.current.upload(file());
    });
    expect(uploaded).toBeNull();
    expect(result.current.error).toBe("Only .docx files are supported");
  });

  it("deletes a document, and reports a network failure", async () => {
    vi.spyOn(api, "documents").mockResolvedValue([summary(1)]);
    const del = vi.spyOn(api, "deleteDocument").mockResolvedValue(undefined);
    const { result } = await loaded();

    let ok: unknown;
    await act(async () => {
      ok = await result.current.remove(1);
    });
    expect(ok).toBe(true);
    expect(del).toHaveBeenCalledWith(1);

    del.mockRejectedValue(new TypeError("Failed to fetch"));
    await act(async () => {
      ok = await result.current.remove(1);
    });
    expect(ok).toBe(false);
    expect(result.current.error).toMatch(/^Network error/);
  });
});
