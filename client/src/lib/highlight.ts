import type { Severity, Violation } from "../types";

export const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, error: 2 };

/** A violation that points at a character range inside its block. */
export type SpanViolation = Violation & { start: number; end: number };

export interface Segment {
  text: string;
  violations: SpanViolation[];
}

export function hasSpan(v: Violation): v is SpanViolation {
  return v.start !== null && v.end !== null;
}

export function worstSeverity(violations: readonly Violation[]): Severity {
  return violations.reduce<Severity>(
    (worst, v) => (SEVERITY_RANK[v.severity] > SEVERITY_RANK[worst] ? v.severity : worst),
    "info",
  );
}

/**
 * Split text at every violation boundary so overlapping violations render correctly.
 * Each segment lists the violations that fully cover it. Offsets are clamped to the text.
 */
export function segmentText(text: string, violations: readonly Violation[]): Segment[] {
  const spans = violations.filter(hasSpan);
  const clamp = (n: number) => Math.max(0, Math.min(text.length, n));
  const cuts = new Set<number>([0, text.length]);
  for (const v of spans) {
    cuts.add(clamp(v.start));
    cuts.add(clamp(v.end));
  }
  const points = [...cuts].sort((a, b) => a - b);

  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    if (a === b) continue;
    segments.push({
      text: text.slice(a, b),
      violations: spans.filter((v) => clamp(v.start) <= a && clamp(v.end) >= b),
    });
  }
  return segments;
}

/** Group violations by block; document-level ones (block_id null) are skipped. */
export function violationsByBlock(violations: readonly Violation[]): Map<number, Violation[]> {
  const map = new Map<number, Violation[]>();
  for (const v of violations) {
    if (v.block_id === null) continue;
    const list = map.get(v.block_id);
    if (list) list.push(v);
    else map.set(v.block_id, [v]);
  }
  return map;
}

export function countBySeverity(violations: readonly Violation[]): Partial<Record<Severity, number>> {
  const counts: Partial<Record<Severity, number>> = {};
  for (const v of violations) counts[v.severity] = (counts[v.severity] ?? 0) + 1;
  return counts;
}
