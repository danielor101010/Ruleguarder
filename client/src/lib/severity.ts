import type { Severity } from "../types";

export const SEVERITY_LABEL: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low" };

/**
 * Tailwind classes per severity: High red, Medium orange, Low yellow (ADR-010).
 * Full class strings on purpose, so Tailwind's scanner finds them.
 */
export const SEVERITY_CLASSES: Record<
  Severity,
  { mark: string; block: string; dot: string; chip: string; card: string; counter: string }
> = {
  high: {
    mark: "bg-red-200/90 decoration-red-600",
    block: "border-l-4 border-red-600 bg-red-50",
    dot: "bg-sev-high",
    chip: "border-red-300 bg-red-50 text-red-800 aria-pressed:bg-red-600 aria-pressed:border-red-600 aria-pressed:text-white",
    card: "border-l-red-600",
    counter: "bg-red-500/20 text-red-100 ring-red-400/40",
  },
  medium: {
    mark: "bg-orange-200/90 decoration-orange-600",
    block: "border-l-4 border-orange-500 bg-orange-50",
    dot: "bg-sev-medium",
    chip: "border-orange-300 bg-orange-50 text-orange-800 aria-pressed:bg-orange-600 aria-pressed:border-orange-600 aria-pressed:text-white",
    card: "border-l-orange-500",
    counter: "bg-orange-500/20 text-orange-100 ring-orange-400/40",
  },
  low: {
    mark: "bg-yellow-200 decoration-yellow-600",
    block: "border-l-4 border-yellow-500 bg-yellow-50",
    dot: "bg-yellow-500",
    chip: "border-yellow-300 bg-yellow-50 text-yellow-900 aria-pressed:bg-yellow-400 aria-pressed:border-yellow-500 aria-pressed:text-slate-950",
    card: "border-l-yellow-500",
    counter: "bg-yellow-400/20 text-yellow-100 ring-yellow-300/40",
  },
};

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
