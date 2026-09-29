import type { Severity } from "../types";

export const SEVERITY_LABEL: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low" };

/**
 * Tailwind classes per severity, monochrome (ADR-017): severity is carried by the text label,
 * grey intensity and underline style (solid / dashed / dotted), never by hue.
 * `mark` / `block` sit on the white document page; `text` is the plain label.
 * Full class strings on purpose, so Tailwind's scanner finds them.
 */
export const SEVERITY_CLASSES: Record<Severity, { mark: string; block: string; text: string }> = {
  high: {
    mark: "bg-zinc-300 decoration-zinc-900 decoration-solid",
    block: "bg-zinc-200",
    text: "font-bold text-zinc-900",
  },
  medium: {
    mark: "bg-zinc-200 decoration-zinc-700 decoration-dashed",
    block: "bg-zinc-100",
    text: "font-semibold text-zinc-700",
  },
  low: {
    mark: "bg-zinc-100 decoration-zinc-500 decoration-dotted",
    block: "bg-zinc-50 shadow-[inset_0_0_0_1px_var(--color-zinc-200)]",
    text: "font-medium text-zinc-500",
  },
};

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
