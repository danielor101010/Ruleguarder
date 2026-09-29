import { describe, expect, it } from "vitest";
import { violation } from "../test/fixtures";
import { countBySeverity, segmentText, violationsByBlock, worstSeverity } from "./highlight";

const TEXT = "The detection range is 50 km.";

describe("segmentText", () => {
  it("returns the whole text when there are no violations", () => {
    expect(segmentText(TEXT, [])).toEqual([{ text: TEXT, violations: [] }]);
  });

  it("splits around a single span", () => {
    const v = violation({ id: "a", start: 23, end: 28 });
    const segs = segmentText(TEXT, [v]);
    expect(segs.map((s) => s.text)).toEqual(["The detection range is ", "50 km", "."]);
    expect(segs[1].violations).toEqual([v]);
  });

  it("handles overlapping spans", () => {
    const a = violation({ id: "a", start: 4, end: 19 }); // "detection range"
    const b = violation({ id: "b", start: 14, end: 28 }); // "range is 50 km"
    const segs = segmentText(TEXT, [a, b]);
    const overlap = segs.find((s) => s.text === "range");
    expect(overlap?.violations.map((v) => v.id)).toEqual(["a", "b"]);
    expect(segs.map((s) => s.text).join("")).toBe(TEXT);
  });

  it("ignores violations without a span and clamps out-of-range offsets", () => {
    const whole = violation({ id: "w" });
    const outOfRange = violation({ id: "o", start: 25, end: 999 });
    const segs = segmentText(TEXT, [whole, outOfRange]);
    expect(segs.map((s) => s.text)).toEqual(["The detection range is 50", " km."]);
    expect(segs[1].violations.map((v) => v.id)).toEqual(["o"]);
  });

  it("handles empty text", () => {
    expect(segmentText("", [violation({ id: "a", start: 0, end: 3 })])).toEqual([]);
  });
});

describe("worstSeverity / countBySeverity", () => {
  const list = [violation({ id: "1" }, "info"), violation({ id: "2" }, "error"), violation({ id: "3" }, "warning")];

  it("picks the most severe", () => {
    expect(worstSeverity(list)).toBe("error");
    expect(worstSeverity([])).toBe("info");
  });

  it("counts per severity", () => {
    expect(countBySeverity(list)).toEqual({ info: 1, error: 1, warning: 1 });
  });
});

describe("violationsByBlock", () => {
  it("groups by block and skips document-level violations", () => {
    const map = violationsByBlock([
      violation({ id: "1", block_id: 2 }),
      violation({ id: "2", block_id: null }),
      violation({ id: "3", block_id: 2 }),
    ]);
    expect([...map.keys()]).toEqual([2]);
    expect(map.get(2)?.map((v) => v.id)).toEqual(["1", "3"]);
  });
});
