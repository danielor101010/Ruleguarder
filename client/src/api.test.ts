import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";

function mockFetch(status: number, body?: unknown, statusText = "") {
  const fn = vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), { status, statusText }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api", () => {
  it("returns parsed JSON on success", async () => {
    const fetch = mockFetch(200, [{ id: 1 }]);
    await expect(api.rules()).resolves.toEqual([{ id: 1 }]);
    expect(fetch).toHaveBeenCalledWith("/api/rules", undefined);
  });

  it("sends JSON bodies", async () => {
    const fetch = mockFetch(200, {});
    await api.check(5);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/documents/5/check");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("uses the server's detail message for errors", async () => {
    mockFetch(422, { detail: "Invalid regular expression" });
    const err = await api.rules().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, message: "Invalid regular expression" });
  });

  it("stringifies structured error details", async () => {
    mockFetch(422, { detail: [{ loc: ["body", "name"], msg: "required" }] });
    await expect(api.rules()).rejects.toThrow(/required/);
  });

  it("falls back to status text for non-JSON errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 502, statusText: "Bad Gateway" })));
    await expect(api.rules()).rejects.toMatchObject({ status: 502, message: "Bad Gateway" });
  });

  it("handles 204 No Content on delete", async () => {
    mockFetch(204);
    await expect(api.deleteRule(3)).resolves.toBeUndefined();
  });

  it("propagates network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(api.documents()).rejects.toThrow("Failed to fetch");
  });
});
