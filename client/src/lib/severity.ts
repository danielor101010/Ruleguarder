import type { Severity } from "../types";

export const SEVERITY_LABEL: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low" };

/**
 * Tailwind classes per severity (ADR-017). The dashboard chrome is monochrome; colour appears only in
 * the small `dot` next to a label and in the document highlights (High red, Medium orange, Low yellow).
 * Highlights also differ by underline style (solid / dashed / dotted), so they read without colour.
 * `mark` / `active` / `block` sit on the white document page; `text` is the plain grey label.
 * Full class strings on purpose, so Tailwind's scanner finds them.
 */
export const SEVERITY_CLASSES: Record<Severity, { mark: string; active: string; block: string; text: string; dot: string }> = {
  high: {
    mark: "bg-red-100 decoration-red-500 decoration-solid",
    active: "bg-red-200 decoration-red-600 decoration-solid",
    block: "bg-red-50",
    text: "font-bold text-zinc-900",
    dot: "bg-red-500",
  },
  medium: {
    mark: "bg-orange-100 decoration-orange-400 decoration-dashed",
    active: "bg-orange-200 decoration-orange-600 decoration-dashed",
    block: "bg-orange-50",
    text: "font-semibold text-zinc-700",
    dot: "bg-orange-400",
  },
  low: {
    mark: "bg-yellow-100 decoration-yellow-500 decoration-dotted",
    active: "bg-yellow-200 decoration-yellow-600 decoration-dotted",
    block: "bg-yellow-50",
    text: "font-medium text-zinc-500",
    dot: "bg-yellow-400",
  },
};

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
