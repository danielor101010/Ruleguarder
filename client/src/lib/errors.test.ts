import { describe, expect, it } from "vitest";
import { errorMessage } from "./errors";

describe("errorMessage", () => {
  it("explains network failures", () => {
    expect(errorMessage(new TypeError("Failed to fetch"))).toMatch(/^Network error/);
  });

  it("keeps other error messages and stringifies non-errors", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("plain")).toBe("plain");
  });
});
