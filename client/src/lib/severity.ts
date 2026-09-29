import type { Severity } from "../types";

export const SEVERITY_LABEL: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low" };

/**
 * Tailwind classes per severity: High red, Medium orange, Low yellow (ADR-010).
 * `mark` / `block` sit on the white document page; the rest sit on the dark dashboard.
 * Full class strings on purpose, so Tailwind's scanner finds them.
 */
export const SEVERITY_CLASSES: Record<
  Severity,
  { mark: string; block: string; dot: string; text: string; segment: string }
> = {
  high: {
    mark: "bg-red-200/90 decoration-red-600",
    block: "bg-red-50 shadow-[inset_3px_0_0_0_var(--color-red-500)]",
    dot: "bg-sev-high",
    text: "text-red-300",
    segment: "aria-pressed:bg-red-500/20 aria-pressed:text-red-100",
  },
  medium: {
    mark: "bg-orange-200/90 decoration-orange-600",
    block: "bg-orange-50 shadow-[inset_3px_0_0_0_var(--color-orange-500)]",
    dot: "bg-sev-medium",
    text: "text-orange-300",
    segment: "aria-pressed:bg-orange-500/20 aria-pressed:text-orange-100",
  },
  low: {
    mark: "bg-yellow-200 decoration-yellow-600",
    block: "bg-yellow-50 shadow-[inset_3px_0_0_0_var(--color-yellow-500)]",
    dot: "bg-yellow-500",
    text: "text-yellow-300",
    segment: "aria-pressed:bg-yellow-400/20 aria-pressed:text-yellow-100",
  },
};

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
