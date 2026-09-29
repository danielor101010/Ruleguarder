import { describe, expect, it } from "vitest";
import { SEVERITIES } from "../types";
import { SEVERITY_CLASSES } from "./severity";

const HUES = /\b(?:bg|text|decoration|border|ring|shadow)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-/;

describe("SEVERITY_CLASSES", () => {
  it("uses no coloured hues (monochrome UI, ADR-017)", () => {
    for (const s of SEVERITIES) {
      for (const classes of Object.values(SEVERITY_CLASSES[s])) expect(classes).not.toMatch(HUES);
    }
  });

  it("tells severities apart without colour: a distinct underline style per level", () => {
    const style = (s: (typeof SEVERITIES)[number]) => SEVERITY_CLASSES[s].mark.match(/decoration-(solid|dashed|dotted)/)?.[1];
    expect(style("high")).toBe("solid");
    expect(style("medium")).toBe("dashed");
    expect(style("low")).toBe("dotted");
  });

  it("gives each severity a distinct highlight shade and label weight", () => {
    expect(new Set(SEVERITIES.map((s) => SEVERITY_CLASSES[s].mark)).size).toBe(SEVERITIES.length);
    expect(new Set(SEVERITIES.map((s) => SEVERITY_CLASSES[s].text)).size).toBe(SEVERITIES.length);
  });
});
