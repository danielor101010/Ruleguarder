import { describe, expect, it } from "vitest";
import { formatSize } from "./documents";

describe("formatSize", () => {
  it("uses KB below 1 MB, never 0 KB", () => {
    expect(formatSize(0)).toBe("1 KB");
    expect(formatSize(568 * 1024)).toBe("568 KB");
  });
  it("uses MB with one decimal above 1 MB", () => {
    expect(formatSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });
});
